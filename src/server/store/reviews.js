import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const REVIEW_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isValidReviewId(value) {
  return typeof value === 'string' && REVIEW_ID_PATTERN.test(value);
}

async function writeFileAtomic(targetPath, data) {
  const dir = path.dirname(targetPath);
  const tmpPath = path.join(dir, `.${path.basename(targetPath)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tmpPath, data);
    await fs.rename(tmpPath, targetPath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function removeQuietly(targetPath) {
  await fs.rm(targetPath, { force: true }).catch(() => {});
}

/**
 * 审核记录存储：每个记录一个目录（`data/reviews/<reviewId>/`），
 * 内含 `record.json` 与 `diff.patch`；写入先落临时文件再原子重命名，
 * 同一记录的写操作按记录串行，避免并发更新互相覆盖。
 * @param {{ dataDir: string }} options
 */
export function createReviewStore({ dataDir }) {
  const reviewsDir = path.join(dataDir, 'reviews');
  /** @type {Map<string, Promise<void>>} */
  const locks = new Map();

  const recordPath = (id) => path.join(reviewsDir, id, 'record.json');
  const diffPath = (id) => path.join(reviewsDir, id, 'diff.patch');
  const reviewDir = (id) => path.join(reviewsDir, id);

  function withLock(id, task) {
    const previous = locks.get(id) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.then(
      () => {},
      () => {},
    );
    locks.set(id, settled);
    settled.then(() => {
      if (locks.get(id) === settled) locks.delete(id);
    });
    return run;
  }

  async function readRecordFile(id) {
    try {
      const raw = await fs.readFile(recordPath(id), 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      if (error instanceof SyntaxError) {
        console.warn(`[reviews] 记录 ${id} 的 record.json 无法解析，按不存在处理`);
        return null;
      }
      throw error;
    }
  }

  return {
    reviewsDir,

    async init() {
      await fs.mkdir(reviewsDir, { recursive: true });
    },

    /**
     * 创建记录目录并写入元数据与变更内容。
     * @param {object} record
     * @param {string} diffText
     */
    async create(record, diffText) {
      const id = record.id;
      await fs.mkdir(reviewDir(id), { recursive: true });
      await writeFileAtomic(diffPath(id), diffText);
      await writeFileAtomic(recordPath(id), `${JSON.stringify(record, null, 2)}\n`);
      return record;
    },

    /**
     * @param {string} id
     * @returns {Promise<object | null>}
     */
    async read(id) {
      if (!isValidReviewId(id)) return null;
      return readRecordFile(id);
    },

    /**
     * @param {string} id
     * @returns {Promise<string | null>}
     */
    async readDiff(id) {
      if (!isValidReviewId(id)) return null;
      try {
        return await fs.readFile(diffPath(id), 'utf8');
      } catch (error) {
        if (error && error.code === 'ENOENT') return null;
        throw error;
      }
    },

    /**
     * 列出全部记录的元数据（不读取 diff.patch）。
     * @returns {Promise<object[]>}
     */
    async listAll() {
      let entries = [];
      try {
        entries = await fs.readdir(reviewsDir, { withFileTypes: true });
      } catch (error) {
        if (error && error.code === 'ENOENT') return [];
        throw error;
      }
      const records = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || !isValidReviewId(entry.name)) continue;
        const record = await readRecordFile(entry.name);
        if (record) records.push(record);
      }
      return records;
    },

    /**
     * 在同一记录的写锁内读取、修改并原子写回。
     * 变更函数返回 `null` 表示放弃写入；记录已不存在时返回 `null`，不重建目录。
     * @param {string} id
     * @param {(record: object) => object | null} mutate
     * @returns {Promise<object | null>}
     */
    async update(id, mutate) {
      if (!isValidReviewId(id)) return null;
      return withLock(id, async () => {
        const record = await readRecordFile(id);
        if (!record) return null;
        const next = mutate(record);
        if (!next) return null;
        try {
          await writeFileAtomic(recordPath(id), `${JSON.stringify(next, null, 2)}\n`);
        } catch (error) {
          if (error && error.code === 'ENOENT') return null;
          throw error;
        }
        return next;
      });
    },

    /**
     * 删除记录目录（含 diff）。目录不存在时返回 false。
     * @param {string} id
     * @returns {Promise<boolean>}
     */
    async remove(id) {
      if (!isValidReviewId(id)) return false;
      return withLock(id, async () => {
        const record = await readRecordFile(id);
        if (!record) {
          await removeQuietly(reviewDir(id));
          return false;
        }
        await fs.rm(reviewDir(id), { recursive: true, force: true });
        return true;
      });
    },

    /**
     * 启动恢复：遗留的 running 记录标记为 failed(INTERRUPTED)，避免永久进行中。
     * @param {string} interruptedAt ISO 时间
     * @returns {Promise<string[]>} 被修复的记录 ID
     */
    async recoverInterrupted(interruptedAt = new Date().toISOString()) {
      const records = await this.listAll();
      const recovered = [];
      for (const record of records) {
        if (record.status !== 'running') continue;
        const updated = await this.update(record.id, (current) => {
          if (current.status !== 'running') return null;
          current.status = 'failed';
          current.finishedAt = interruptedAt;
          current.conclusion = null;
          current.findings = [];
          current.failure = {
            code: 'INTERRUPTED',
            message: '服务重启导致审核中断，可重新发起',
          };
          return current;
        });
        if (updated) recovered.push(updated.id);
      }
      return recovered;
    },
  };
}

