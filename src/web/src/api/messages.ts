import { ApiError } from './errors';

/**
 * 错误码到用户可见文案的映射（technical-contract 第 7 节）。
 * 服务端 `message` 已面向用户，优先展示；仅在缺失时回落到本表。
 */
export const ERROR_HINTS: Record<string, string> = {
  INVALID_INPUT: '请求内容有误，请检查并补充必填字段',
  INVALID_LINK: '无法从链接中解析出仓库与合并请求编号，请检查链接',
  UNSUPPORTED_HOST: '链接与平台设置中的实例地址或平台类型不匹配，请检查配置',
  CREDENTIAL_MISSING: '请先在平台设置中完成访问凭证配置',
  PLATFORM_UNAUTHORIZED: '平台凭证无效或无权访问该合并请求',
  PLATFORM_NOT_FOUND: '合并请求不存在或无权访问',
  PLATFORM_UNAVAILABLE: '平台暂时不可用，请稍后重试',
  AI_NOT_CONFIGURED: '审核服务未配置，请联系部署者',
  AI_UNAVAILABLE: '审核服务暂时不可用，可重新发起审核',
  REVIEW_RESULT_INVALID: '审核结果无法解析，可重新发起审核',
  REVIEW_TOO_LARGE: '变更内容超出单次可处理范围，请拆分后重新发起',
  INTERRUPTED: '审核中断，可重新发起',
  NOT_FOUND: '记录不存在或已删除',
  CONFLICT: '审核进行中，请等待本次结果',
  INTERNAL: '操作失败，请重试',
  NETWORK: '无法连接服务端，请确认服务已启动后重试',
};

export interface ErrorInfo {
  code: string | null;
  status: number | null;
  message: string;
}

/** 把任意异常归一化为可在界面展示的错误信息。 */
export function describeError(error: unknown): ErrorInfo {
  if (error instanceof ApiError) {
    const fallback = ERROR_HINTS[error.code] ?? '操作失败，请重试';
    return {
      code: error.code,
      status: error.status,
      message: error.message.trim() || fallback,
    };
  }
  if (error instanceof Error) {
    return { code: null, status: null, message: error.message.trim() || '操作失败，请重试' };
  }
  return { code: null, status: null, message: '操作失败，请重试' };
}

/** 是否为「平台凭证未配置」，该分支需要引导用户前往平台设置。 */
export function isCredentialMissing(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'CREDENTIAL_MISSING';
}