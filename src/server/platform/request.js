import { AppError } from '../errors.js';

/**
 * 平台请求封装：统一超时与错误码映射（技术契约第 7 节）。
 * 401/403 → PLATFORM_UNAUTHORIZED；404 → PLATFORM_NOT_FOUND；其余网络、超时、5xx → PLATFORM_UNAVAILABLE。
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, timeoutMs?: number, fetchImpl?: typeof fetch }} options
 * @returns {Promise<Response>}
 */
export async function requestPlatform(url, { method = 'GET', headers = {}, timeoutMs = 20000, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: { 'user-agent': 'ai-review-workbench', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? '请求超时' : '网络错误';
    throw new AppError(502, 'PLATFORM_UNAVAILABLE', `平台暂时不可用，稍后重试（${reason}）`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new AppError(502, 'PLATFORM_UNAUTHORIZED', '平台凭证无效或无权访问该合并请求');
  }
  if (response.status === 404) {
    throw new AppError(502, 'PLATFORM_NOT_FOUND', '合并请求不存在或无权访问');
  }
  if (!response.ok) {
    throw new AppError(502, 'PLATFORM_UNAVAILABLE', `平台暂时不可用，稍后重试（平台返回 ${response.status}）`);
  }

  return response;
}