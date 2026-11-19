/**
 * 表单即时校验（input validation）：与服务端 technical-contract 5.3 第 1 步同义，
 * 仅用于提交前的即时反馈；服务端仍会完整校验，前端不据此判定审核结果。
 */

const GITHUB_LINK = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/;
const GITLAB_LINK = /^\/(.+?)\/-\/merge_requests\/(\d+)(?:\/.*)?$/;
const GITLAB_LINK_SHORT = /^\/(.+?)\/merge_requests\/(\d+)(?:\/.*)?$/;

const CODE_FEATURE = /[;{}=#]|\/\/|</;
const DIFF_MARKER = /^(?:diff --git |@@ |\+\+\+ |--- )/m;

export interface ParsedMergeRequestLink {
  platform: 'github' | 'gitlab';
  host: string;
  repository: string;
  number: number;
}

/** 判断文本能否被识别为代码变更；空白或纯文本视为不可识别。 */
export function isRecognizableChange(text: string): boolean {
  if (!text.trim()) return false;
  if (DIFF_MARKER.test(text)) return true;
  return text.split(/\r?\n/).some((line) => line.trim() !== '' && CODE_FEATURE.test(line));
}

/** 解析合并请求链接；无法解析时返回 null（服务端会返回 INVALID_LINK）。 */
export function parseMergeRequestLink(raw: string): ParsedMergeRequestLink | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const githubMatch = GITHUB_LINK.exec(url.pathname);
  if (githubMatch) {
    return {
      platform: 'github',
      host: url.host.toLowerCase(),
      repository: `${githubMatch[1]}/${githubMatch[2]}`,
      number: Number(githubMatch[3]),
    };
  }

  const gitlabMatch = GITLAB_LINK.exec(url.pathname) ?? GITLAB_LINK_SHORT.exec(url.pathname);
  if (gitlabMatch) {
    return {
      platform: 'gitlab',
      host: url.host.toLowerCase(),
      repository: gitlabMatch[1].replace(/^\/+|\/+$/g, ''),
      number: Number(gitlabMatch[2]),
    };
  }

  return null;
}

/** 实例地址校验：http/https 绝对地址，不带查询参数、锚点与账号信息，路径只能是空或 api 后缀。 */
export function validateBaseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return '请填写实例地址，例如 https://github.com';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return '实例地址必须是 http 或 https 绝对地址';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '实例地址必须是 http 或 https 绝对地址';
  if (url.username || url.password) return '实例地址不能包含账号信息';
  if (url.search || url.hash) return '实例地址不能包含查询参数或锚点';
  const pathname = url.pathname.replace(/\/+$/, '').replace(/\/(?:api\/v4|api)$/, '');
  if (pathname !== '') return '实例地址只能包含协议、主机与端口，不能带路径';
  return null;
}

/** 平台默认实例地址，仅作为输入提示。 */
export function defaultBaseUrl(platform: 'github' | 'gitlab'): string {
  return platform === 'github' ? 'https://github.com' : 'https://gitlab.com';
}