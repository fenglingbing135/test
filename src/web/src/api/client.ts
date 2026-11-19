import { ApiError, NETWORK_ERROR_CODE } from './errors';
import { ERROR_HINTS } from './messages';
import type {
  CreateReviewInput,
  Platform,
  PlatformSettings,
  PlatformSettingsInput,
  ReviewDetail,
  ReviewListQuery,
  ReviewListResponse,
} from './types';

interface ApiErrorPayload {
  error?: { code?: unknown; message?: unknown };
}

/**
 * 与 `/api` 的类型化调用封装：统一 JSON 解析、错误码提取与提示文案回落。
 * 前端不做本地推断，所有状态以服务端返回为准。
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(NETWORK_ERROR_CODE, ERROR_HINTS[NETWORK_ERROR_CODE]!, 0);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const { code, message } = extractError(payload);
    throw new ApiError(code, message || ERROR_HINTS[code] || `请求失败（HTTP ${response.status}）`, response.status);
  }

  return payload as T;
}

function extractError(payload: unknown): { code: string; message: string } {
  const candidate = payload as ApiErrorPayload | null;
  const code = typeof candidate?.error?.code === 'string' && candidate.error.code ? candidate.error.code : 'INTERNAL';
  const message = typeof candidate?.error?.message === 'string' ? candidate.error.message : '';
  return { code, message };
}

export function fetchPlatformSettings(): Promise<PlatformSettings> {
  return request<PlatformSettings>('/api/settings/platform');
}

export function savePlatformSettings(input: PlatformSettingsInput): Promise<PlatformSettings> {
  return request<PlatformSettings>('/api/settings/platform', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function clearPlatformSettings(): Promise<void> {
  return request<void>('/api/settings/platform', { method: 'DELETE' });
}

export function fetchReviews(query: ReviewListQuery = {}): Promise<ReviewListResponse> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request<ReviewListResponse>(`/api/reviews${suffix}`);
}

export function createReview(input: CreateReviewInput): Promise<ReviewDetail> {
  return request<ReviewDetail>('/api/reviews', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchReview(reviewId: string): Promise<ReviewDetail> {
  return request<ReviewDetail>(`/api/reviews/${encodeURIComponent(reviewId)}`);
}

export function retryReview(reviewId: string): Promise<ReviewDetail> {
  return request<ReviewDetail>(`/api/reviews/${encodeURIComponent(reviewId)}/retry`, { method: 'POST' });
}

export function deleteReview(reviewId: string): Promise<void> {
  return request<void>(`/api/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' });
}

export type { Platform };