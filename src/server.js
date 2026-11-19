import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverConfig } from './server/config.js';
import { AppError } from './server/errors.js';
import { createReviewStore } from './server/store/reviews.js';
import { createSettingsStore } from './server/store/settings.js';
import { createReviewRoutes } from './server/routes/reviews.js';
import { createSettingsRoutes } from './server/routes/settings.js';
import { createReviewQueue } from './server/review/queue.js';
import { createReviewEngine } from './server/review/engine.js';
import { createPlatformClient } from './server/platform/index.js';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * 组装应用：`/api/*` 为 JSON 接口，其余路径托管 `dist/` 内的 SPA。
 * 前端产物尚未构建时，非 `/api` 请求按 404 处理，不因缺少 `dist/` 崩溃。
 * @param {{ config?: ReturnType<typeof serverConfig>, distDir?: string }} [options]
 */
export function createApp({ config = serverConfig(), distDir = path.resolve(process.cwd(), 'dist') } = {}) {
  const settingsStore = createSettingsStore({ dataDir: config.dataDir });
  const store = createReviewStore({ dataDir: config.dataDir });
  const queue = createReviewQueue({
    store,
    engine: createReviewEngine({ mode: config.reviewEngine }),
    stepDelayMs: config.stepDelayMs,
  });
  const platform = createPlatformClient({ fetchMode: config.platformFetchMode, timeoutMs: config.platformTimeoutMs });

  const app = new Hono();

  app.get('/api/health', (c) =>
    c.json({
      status: 'ok',
      reviewEngine: config.reviewEngine,
      platformFetchMode: config.platformFetchMode,
      time: new Date().toISOString(),
    }),
  );
  app.route('/api/settings', createSettingsRoutes({ settingsStore }));
  app.route('/api/reviews', createReviewRoutes({ store, queue, platform, settingsStore }));

  // 非 /api 请求：托管前端构建产物；`dist/` 不存在时按 404 处理。
  app.all('*', async (c) => {
    const pathname = safePathname(c.req.url);
    if (pathname.startsWith('/api')) {
      return c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404);
    }
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      return c.text('Not Found', 404);
    }
    const served = await serveStatic(c, distDir, pathname);
    if (served) return served;
    return c.text('Not Found', 404);
  });

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    console.error('[server] 未预期异常', error);
    return c.json({ error: { code: 'INTERNAL', message: '操作失败，请重试' } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404));

  return { app, config, store, settingsStore, queue };
}

function safePathname(rawUrl) {
  try {
    return decodeURIComponent(new URL(rawUrl).pathname);
  } catch {
    return '/';
  }
}

async function serveStatic(c, distDir, pathname) {
  const indexFile = path.join(distDir, 'index.html');
  const target = pathname === '/' ? null : safeJoin(distDir, pathname);

  if (target) {
    const file = await readFileIfExists(target);
    if (file) {
      const type = CONTENT_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream';
      return c.body(file, 200, { 'content-type': type });
    }
  }

  const indexHtml = await readFileIfExists(indexFile);
  if (indexHtml) return c.html(indexHtml.toString('utf8'));
  return null;
}

function safeJoin(root, pathname) {
  const normalized = path.normalize(pathname).replace(/^([/\\])+/, '');
  const target = path.resolve(root, normalized);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return target;
}

async function readFileIfExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function main() {
  const config = serverConfig();
  const { app, store, settingsStore, queue } = createApp({ config });

  await fs.mkdir(config.dataDir, { recursive: true });
  await store.init();
  await settingsStore.read();
  const recovered = await store.recoverInterrupted();
  if (recovered.length > 0) {
    console.warn(`[server] 已将 ${recovered.length} 条中断的审核记录标记为失败：${recovered.join(', ')}`);
  }

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`[server] AI 审核工作台服务端已启动：http://127.0.0.1:${info.port}`);
    console.log(`[server] 数据目录：${config.dataDir}`);
    console.log(`[server] 审核引擎：${config.reviewEngine}；平台拉取：${config.platformFetchMode}`);
  });

  const shutdown = (signal) => {
    console.log(`[server] 收到 ${signal}，正在停止服务`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
    void queue.idle();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

const isDirectRun = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((error) => {
    console.error('[server] 启动失败', error);
    process.exit(1);
  });
}