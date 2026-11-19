import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * 平台凭证存储：`<DATA_DIR>/settings.json`，写入时权限 0600。
 * 唯一权威在服务端，读取接口永不回传令牌原文。
 * @param {{ dataDir: string }} options
 */
export function createSettingsStore({ dataDir }) {
  const filePath = path.join(dataDir, 'settings.json');

  return {
    /**
     * @returns {Promise<{ platform: 'github' | 'gitlab', baseUrl: string, token: string, updatedAt: string } | null>}
     */
    async read() {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.token !== 'string') return null;
        return {
          platform: parsed.platform === 'gitlab' ? 'gitlab' : 'github',
          baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
          token: parsed.token,
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
        };
      } catch (error) {
        if (error && error.code === 'ENOENT') return null;
        if (error instanceof SyntaxError) {
          console.warn('[settings] settings.json 无法解析，按未配置凭证处理');
          return null;
        }
        throw error;
      }
    },

    /**
     * 原子写入凭证文件，并把权限收紧到 0600。
     * @param {{ platform: string, baseUrl: string, token: string, updatedAt: string }} settings
     */
    async write(settings) {
      await fs.mkdir(dataDir, { recursive: true });
      const tmpPath = path.join(dataDir, `.settings.${randomUUID()}.tmp`);
      const payload = `${JSON.stringify(settings, null, 2)}\n`;
      try {
        await fs.writeFile(tmpPath, payload, { mode: 0o600 });
        await fs.chmod(tmpPath, 0o600);
        await fs.rename(tmpPath, filePath);
      } catch (error) {
        await fs.rm(tmpPath, { force: true }).catch(() => {});
        throw error;
      }
      await fs.chmod(filePath, 0o600).catch(() => {});
    },

    /** 清除凭证配置（幂等）。 */
    async clear() {
      await fs.rm(filePath, { force: true });
    },
  };
}

/**
 * 接口可见的平台设置视图：令牌只保留末 4 位掩码。
 * @param {{ platform: string, baseUrl: string, token: string, updatedAt: string } | null} settings
 */
export function toPlatformSettingsView(settings) {
  if (!settings) {
    return { configured: false, platform: null, baseUrl: null, tokenHint: null, updatedAt: null };
  }
  return {
    configured: true,
    platform: settings.platform,
    baseUrl: settings.baseUrl,
    tokenHint: maskToken(settings.token),
    updatedAt: settings.updatedAt ?? null,
  };
}

export function maskToken(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  if (token.length < 4) return '****';
  return `****${token.slice(-4)}`;
}