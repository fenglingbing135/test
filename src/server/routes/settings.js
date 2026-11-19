import { Hono } from 'hono';
import { AppError } from '../errors.js';
import { toPlatformSettingsView } from '../store/settings.js';

/**
 * 平台凭证接口：读取（令牌脱敏）、保存、清除。
 * @param {{ settingsStore: ReturnType<typeof import('../store/settings.js').createSettingsStore>, now?: () => string }} options
 */
export function createSettingsRoutes({ settingsStore, now = () => new Date().toISOString() }) {
  const app = new Hono();

  app.get('/platform', async (c) => {
    const settings = await settingsStore.read();
    return c.json(toPlatformSettingsView(settings));
  });

  app.put('/platform', async (c) => {
    const body = await readJson(c);
    const platform = body.platform;
    if (platform !== 'github' && platform !== 'gitlab') {
      throw new AppError(400, 'INVALID_INPUT', 'platform 需为 github 或 gitlab');
    }

    const baseUrlRaw = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
    if (!baseUrlRaw) throw new AppError(400, 'INVALID_INPUT', 'baseUrl 为必填项，请填写实例地址');
    const baseUrl = normalizeBaseUrl(baseUrlRaw);

    const existing = await settingsStore.read();
    let token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      if (existing?.token) token = existing.token;
      else throw new AppError(400, 'INVALID_INPUT', '首次配置必须填写访问令牌');
    }

    const saved = { platform, baseUrl, token, updatedAt: now() };
    await settingsStore.write(saved);
    return c.json(toPlatformSettingsView(saved));
  });

  app.delete('/platform', async (c) => {
    await settingsStore.clear();
    return c.body(null, 204);
  });

  return app;
}

/**
 * baseUrl 规范化：只接受协议、主机与端口；去除末尾 `/` 与 `/api`、`/api/v4` 后缀。
 * @param {string} raw
 */
export function normalizeBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, 'INVALID_INPUT', 'baseUrl 必须是 http 或 https 绝对地址');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError(400, 'INVALID_INPUT', 'baseUrl 必须是 http 或 https 绝对地址');
  }
  if (url.username || url.password) {
    throw new AppError(400, 'INVALID_INPUT', 'baseUrl 不能包含账号信息');
  }
  if (url.search || url.hash) {
    throw new AppError(400, 'INVALID_INPUT', 'baseUrl 不能包含查询参数或锚点');
  }

  const pathname = url.pathname.replace(/\/+$/, '').replace(/\/(?:api\/v4|api)$/, '');
  if (pathname !== '') {
    throw new AppError(400, 'INVALID_INPUT', 'baseUrl 只能包含协议、主机与端口，不能带路径');
  }
  return `${url.protocol}//${url.host}`;
}

export async function readJson(c) {
  try {
    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid body');
    return body;
  } catch {
    throw new AppError(400, 'INVALID_INPUT', '请求体必须是合法的 JSON 对象');
  }
}