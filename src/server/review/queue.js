import { isReviewError } from '../errors.js';

const DEFAULT_FAILURE = { code: 'INTERNAL', message: '审核执行失败，请重新发起' };

function sleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 串行审核队列（并发 1）：唯一负责记录状态迁移 running → succeeded / failed。
 * 状态写入前先读记录，校验仍在进行且为本轮任务，避免覆盖已删除记录或新一轮结果。
 * @param {{
 *   store: ReturnType<typeof import('../store/reviews.js').createReviewStore>,
 *   engine: { review: (input: { diffText: string, record: object }) => Promise<Array<object>> },
 *   stepDelayMs?: number,
 *   now?: () => string,
 *   logger?: Pick<Console, 'warn' | 'error'>,
 * }} options
 */
export function createReviewQueue({ store, engine, stepDelayMs = 0, now = () => new Date().toISOString(), logger = console }) {
  /** @type {Array<{ reviewId: string, attempt: number }>} */
  const pending = [];
  let draining = false;

  async function runJob({ reviewId, attempt }) {
    const started = await store.update(reviewId, (record) => {
      if (record.status !== 'running' || record.attempts !== attempt) return null;
      record.startedAt = now();
      return record;
    });
    if (!started) return;

    await sleep(stepDelayMs);

    let outcome;
    try {
      const diffText = await store.readDiff(reviewId);
      if (diffText === null) return;
      const findings = await engine.review({ diffText, record: started });
      outcome = { ok: true, findings: Array.isArray(findings) ? findings : [] };
    } catch (error) {
      const failure = isReviewError(error)
        ? { code: error.code, message: error.message }
        : { ...DEFAULT_FAILURE };
      if (!isReviewError(error)) logger.error('[queue] 审核执行出现未预期异常', error);
      outcome = { ok: false, failure };
    }

    await sleep(stepDelayMs);

    await store.update(reviewId, (record) => {
      if (record.status !== 'running' || record.attempts !== attempt) return null;
      record.finishedAt = now();
      if (outcome.ok) {
        const findings = outcome.findings;
        record.status = 'succeeded';
        record.findings = findings;
        record.conclusion = {
          totalIssues: findings.length,
          highSeverityCount: findings.filter((finding) => finding.severity === 'high').length,
        };
        record.failure = null;
      } else {
        record.status = 'failed';
        record.findings = [];
        record.conclusion = null;
        record.failure = outcome.failure;
      }
      return record;
    });
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (pending.length > 0) {
        const job = pending.shift();
        if (!job) break;
        try {
          await runJob(job);
        } catch (error) {
          logger.error('[queue] 任务处理失败', error);
        }
      }
    } finally {
      draining = false;
    }
  }

  return {
    /**
     * 入队一次审核。同一记录的多个任务按入队顺序串行执行。
     * @param {{ reviewId: string, attempt: number }} job
     */
    push(job) {
      pending.push(job);
      void drain();
    },

    /** 等待当前队列清空（供验收脚本内嵌使用）。 */
    async idle() {
      while (draining || pending.length > 0) {
        await sleep(20);
      }
    },

    get size() {
      return pending.length + (draining ? 1 : 0);
    },
  };
}

