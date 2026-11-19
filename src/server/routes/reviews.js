import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { AppError } from '../errors.js';
import { isValidReviewId } from '../store/reviews.js';
import { isRecognizableChange, pasteSourceLabel, summarizeDiff } from '../review/diff.js';
import { readJson } from './settings.js';

const REVIEW_STATUSES = new Set(['running', 'succeeded', 'failed']);

/**
 * 审核记录接口：创建、列表、详情、重试、删除。路由负责输入校验与状态置 running，
 * 状态推进（running → succeeded / failed）只由队列执行。
 * @param {{
 *   store: ReturnType<typeof import('../store/reviews.js').createReviewStore>,
 *   queue: ReturnType<typeof import('../review/queue.js').createReviewQueue>,
 *   platform: ReturnType<typeof import('../platform/index.js').createPlatformClient>,
 *   settingsStore: ReturnType<typeof import('../store/settings.js').createSettingsStore>,
 *   now?: () => string,
 *   createId?: () => string,
 * }} options
 */
export function createReviewRoutes({ store, queue, platform, settingsStore, now = () => new Date().toISOString(), createId = randomUUID }) {
  const app = new Hono();

  app.get('/', async (c) => {
    const statusParam = c.req.query('status');
    const status = statusParam === undefined || statusParam === '' ? null : statusParam;
    if (status !== null && !REVIEW_STATUSES.has(status)) {
      throw new AppError(400, 'INVALID_INPUT', 'status 需为 running、succeeded 或 failed');
    }
    const limit = parseIntegerQuery(c.req.query('limit'), 50, 1, 200, 'limit');
    const offset = parseIntegerQuery(c.req.query('offset'), 0, 0, Number.MAX_SAFE_INTEGER, 'offset');

    const records = await store.listAll();
    const filtered = status ? records.filter((record) => record.status === status) : records;
    filtered.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    const items = filtered.slice(offset, offset + limit).map(toListItem);
    return c.json({ total: filtered.length, items });
  });

  app.post('/', async (c) => {
    const body = await readJson(c);
    const mode = body.mode;

    if (mode !== 'paste' && mode !== 'mr-link') {
      throw new AppError(400, 'INVALID_INPUT', 'mode 需为 paste 或 mr-link');
    }

    let source;
    let diffText;
    let changeSummary;
    let credential;

    if (mode === 'paste') {
      const raw = typeof body.diffText === 'string' ? body.diffText : '';
      if (!raw.trim()) throw new AppError(400, 'INVALID_INPUT', '请粘贴合并请求的变更内容');
      if (!isRecognizableChange(raw)) {
        throw new AppError(400, 'INVALID_INPUT', '未能从内容中识别出代码变更，请粘贴 diff 或代码片段');
      }
      diffText = raw;
      changeSummary = summarizeDiff(raw);
      source = {
        type: 'paste',
        url: null,
        platform: null,
        repository: null,
        number: null,
        label: pasteSourceLabel(raw),
      };
    } else {
      const url = typeof body.url === 'string' ? body.url.trim() : '';
      if (!url) throw new AppError(400, 'INVALID_INPUT', '请填写合并请求链接');

      credential = await settingsStore.read();
      if (!credential?.token) {
        throw new AppError(400, 'CREDENTIAL_MISSING', '请先在平台设置中完成访问凭证配置');
      }

      const link = platform.parseLink(url);
      platform.assertSupported(link, credential);
      const fetched = await platform.fetchChange({ link, settings: credential });

      diffText = fetched.diffText;
      changeSummary = fetched.changeSummary;
      source = {
        type: 'mr-link',
        url: link.url,
        platform: link.platform,
        repository: link.repository,
        number: link.number,
        label: `${link.repository} #${link.number}`,
      };
    }

    const createdAt = now();
    const record = {
      id: createId(),
      status: 'running',
      source,
      createdAt,
      startedAt: null,
      finishedAt: null,
      attempts: 1,
      changeSummary,
      conclusion: null,
      findings: [],
      failure: null,
    };

    await store.create(record, diffText);
    queue.push({ reviewId: record.id, attempt: record.attempts });

    return c.json(toReviewDetail(record), 202);
  });

  app.get('/:reviewId', async (c) => {
    const record = await store.read(c.req.param('reviewId'));
    if (!record) throw new AppError(404, 'NOT_FOUND', '记录不存在或已删除');
    return c.json(toReviewDetail(record));
  });

  app.post('/:reviewId/retry', async (c) => {
    const id = c.req.param('reviewId');
    if (!isValidReviewId(id)) throw new AppError(404, 'NOT_FOUND', '记录不存在或已删除');

    const updated = await store.update(id, (record) => {
      if (record.status === 'running') {
        throw new AppError(409, 'CONFLICT', '审核进行中，请等待结果');
      }
      record.attempts += 1;
      record.status = 'running';
      record.startedAt = null;
      record.finishedAt = null;
      record.conclusion = null;
      record.findings = [];
      record.failure = null;
      return record;
    });

    if (!updated) throw new AppError(404, 'NOT_FOUND', '记录不存在或已删除');
    queue.push({ reviewId: updated.id, attempt: updated.attempts });
    return c.json(toReviewDetail(updated), 202);
  });

  app.delete('/:reviewId', async (c) => {
    const removed = await store.remove(c.req.param('reviewId'));
    if (!removed) throw new AppError(404, 'NOT_FOUND', '记录不存在或已删除');
    return c.body(null, 204);
  });

  return app;
}

/**
 * 记录详情投影：只输出技术契约 5.1 声明的字段，不泄漏内部字段。
 * @param {object} record
 */
export function toReviewDetail(record) {
  const source = record.source ?? {};
  return {
    id: record.id,
    status: record.status,
    source: {
      type: source.type,
      url: source.url ?? null,
      platform: source.platform ?? null,
      repository: source.repository ?? null,
      number: source.number ?? null,
    },
    createdAt: record.createdAt,
    startedAt: record.startedAt ?? null,
    finishedAt: record.finishedAt ?? null,
    attempts: record.attempts,
    changeSummary: {
      filesChanged: record.changeSummary?.filesChanged ?? 0,
      additions: record.changeSummary?.additions ?? 0,
      deletions: record.changeSummary?.deletions ?? 0,
    },
    conclusion: record.status === 'succeeded' ? (record.conclusion ?? null) : null,
    findings: record.status === 'succeeded' ? (record.findings ?? []) : [],
    failure: record.status === 'failed' ? (record.failure ?? null) : null,
  };
}

/**
 * 列表投影：摘要字段，不返回 findings 与 diff。
 * @param {object} record
 */
export function toListItem(record) {
  const source = record.source ?? {};
  const succeeded = record.status === 'succeeded';
  return {
    id: record.id,
    status: record.status,
    sourceType: source.type,
    sourceLabel: source.label ?? (source.type === 'mr-link' ? `${source.repository ?? ''} #${source.number ?? ''}`.trim() : '粘贴的变更'),
    createdAt: record.createdAt,
    issueCount: succeeded ? (record.conclusion?.totalIssues ?? 0) : null,
    highSeverityCount: succeeded ? (record.conclusion?.highSeverityCount ?? 0) : null,
  };
}

function parseIntegerQuery(raw, fallback, min, max, field) {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== String(raw).trim()) {
    throw new AppError(400, 'INVALID_INPUT', `${field} 必须是整数`);
  }
  if (parsed < min || parsed > max) {
    throw new AppError(400, 'INVALID_INPUT', `${field} 需在 ${min} 到 ${max} 之间`);
  }
  return parsed;
}