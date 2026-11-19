import { AppError } from '../errors.js';
import { fetchGithubChange } from './github.js';
import { fetchGitlabChange } from './gitlab.js';
import { fetchStubChange } from './stub.js';

const GITHUB_LINK = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/;
const GITLAB_LINK = /^\/(.+?)\/-\/merge_requests\/(\d+)(?:\/.*)?$/;
const GITLAB_LINK_SHORT = /^\/(.+?)\/merge_requests\/(\d+)(?:\/.*)?$/;

/**
 * 平台适配器注册表：按凭证平台类型选择实现，统一链接解析与错误码。
 * `PLATFORM_FETCH_MODE=stub` 只切换拉取实现，接口签名一致。
 * @param {{ fetchMode?: 'live' | 'stub', timeoutMs?: number, fetchImpl?: typeof fetch }} [options]
 */
export function createPlatformClient({ fetchMode = 'live', timeoutMs = 20000, fetchImpl = fetch } = {}) {
  return {
    fetchMode,

    /**
     * 解析合并请求链接为平台、仓库路径与合并请求编号。
     * @param {string} rawUrl
     */
    parseLink(rawUrl) {
      return parseMergeRequestLink(rawUrl);
    },

    /**
     * 校验链接主机与已配置实例地址、平台类型是否一致，不一致不隐式访问其它主机。
     * @param {{ platform: string, host: string }} link
     * @param {{ platform: string, baseUrl: string }} settings
     */
    assertSupported(link, settings) {
      let baseHost;
      try {
        baseHost = new URL(settings.baseUrl).host.toLowerCase();
      } catch {
        throw new AppError(400, 'INVALID_INPUT', '平台设置中的实例地址无效，请重新配置');
      }
      if (String(link.host ?? '').toLowerCase() !== baseHost) {
        throw new AppError(400, 'UNSUPPORTED_HOST', '链接与已配置的实例地址不匹配，请检查平台配置');
      }
      if (settings.platform !== link.platform) {
        throw new AppError(400, 'UNSUPPORTED_HOST', '链接类型与已配置的平台不匹配，请检查平台配置');
      }
    },

    /**
     * 同步拉取变更内容；失败直接抛错，由路由返回错误码，不创建记录。
     * @param {{ link: ReturnType<typeof parseMergeRequestLink>, settings: { platform: string, baseUrl: string, token: string } }} input
     * @returns {Promise<{ diffText: string, changeSummary: { filesChanged: number, additions: number, deletions: number } }>}
     */
    async fetchChange({ link, settings }) {
      if (fetchMode === 'stub') return fetchStubChange({ link });
      if (link.platform === 'gitlab') {
        return fetchGitlabChange({ link, settings, timeoutMs, fetchImpl });
      }
      return fetchGithubChange({ link, settings, timeoutMs, fetchImpl });
    },
  };
}

/**
 * @param {string} rawUrl
 * @returns {{ platform: 'github' | 'gitlab', repository: string, number: number, url: string, host: string }}
 */
export function parseMergeRequestLink(rawUrl) {
  const raw = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!raw) throw new AppError(400, 'INVALID_LINK', '请填写合并请求链接');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, 'INVALID_LINK', '合并请求链接格式不正确，请检查链接');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError(400, 'INVALID_LINK', '合并请求链接需为 http 或 https 地址');
  }

  const pathname = url.pathname;
  const githubMatch = GITHUB_LINK.exec(pathname);
  if (githubMatch) {
    return {
      platform: 'github',
      repository: `${githubMatch[1]}/${githubMatch[2]}`,
      number: Number(githubMatch[3]),
      url: `${url.origin}${pathname}`,
      host: url.host,
    };
  }

  const gitlabMatch = GITLAB_LINK.exec(pathname) ?? GITLAB_LINK_SHORT.exec(pathname);
  if (gitlabMatch) {
    return {
      platform: 'gitlab',
      repository: gitlabMatch[1].replace(/^\/+|\/+$/g, ''),
      number: Number(gitlabMatch[2]),
      url: `${url.origin}${pathname}`,
      host: url.host,
    };
  }

  throw new AppError(400, 'INVALID_LINK', '无法从链接中解析出仓库与合并请求编号，请检查链接');
}