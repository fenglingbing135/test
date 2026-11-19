/**
 * 统一错误类型：`AppError` 面向 HTTP 接口，`ReviewError` 面向审核执行阶段的记录失败原因。
 */

export class AppError extends Error {
  /**
   * @param {number} status HTTP 状态码
   * @param {string} code 契约错误码
   * @param {string} message 面向用户的提示
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export class ReviewError extends Error {
  /**
   * @param {string} code 契约错误码
   * @param {string} message 面向用户的提示
   */
  constructor(code, message) {
    super(message);
    this.name = 'ReviewError';
    this.code = code;
  }
}

export function isAppError(error) {
  return error instanceof AppError;
}

export function isReviewError(error) {
  return error instanceof ReviewError;
}