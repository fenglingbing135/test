/** 接口调用失败的统一错误表示：保留服务端错误码与 HTTP 状态，供文案映射与分支处理使用。 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** 前端自定义的传输失败码，服务端不会返回该值。 */
export const NETWORK_ERROR_CODE = 'NETWORK';