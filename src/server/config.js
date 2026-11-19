import path from 'node:path';

const DEFAULT_PORT = 8787;
const DEFAULT_DATA_DIR = './data';

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseNonNegativeInt(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

/**
 * 服务端运行配置。只从服务端环境变量读取，界面上不暴露任何测试入口。
 * @param {NodeJS.ProcessEnv} env
 */
export function serverConfig(env = process.env) {
  const dataDirRaw = String(env.DATA_DIR ?? '').trim();
  const reviewEngine = String(env.REVIEW_ENGINE ?? '').trim().toLowerCase();
  const platformFetchMode = String(env.PLATFORM_FETCH_MODE ?? '').trim().toLowerCase();

  return {
    port: parsePositiveInt(env.PORT, DEFAULT_PORT),
    dataDir: path.resolve(process.cwd(), dataDirRaw || DEFAULT_DATA_DIR),
    /** `stub` 为仅验收使用的确定性实现，默认 `live` 不改变产品行为 */
    reviewEngine: reviewEngine === 'stub' ? 'stub' : 'live',
    /** `stub` 为仅验收使用的确定性拉取实现，默认 `live` 不改变产品行为 */
    platformFetchMode: platformFetchMode === 'stub' ? 'stub' : 'live',
    /** 状态切换之间的停留时间，用于观察进行中状态；未设置为 0（按正常速度执行） */
    stepDelayMs: parseNonNegativeInt(env.REVIEW_STEP_DELAY_MS),
    platformTimeoutMs: parsePositiveInt(env.PLATFORM_TIMEOUT_MS, 20000),
  };
}