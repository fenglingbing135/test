import { requestPlatform } from './request.js';
import { summarizeDiff } from '../review/diff.js';

/**
 * GitHub（含自建实例）适配器：读取合并请求元数据后按 diff 媒体类型获取补丁文本。
 * @param {{ link: { repository: string, number: number, host: string }, settings: { baseUrl: string, token: string }, timeoutMs?: number, fetchImpl?: typeof fetch }} input
 * @returns {Promise<{ diffText: string, changeSummary: { filesChanged: number, additions: number, deletions: number } }>}
 */
export async function fetchGithubChange({ link, settings, timeoutMs = 20000, fetchImpl = fetch }) {
  const apiBase = githubApiBase(settings.baseUrl);
  const pullUrl = `${apiBase}/repos/${link.repository}/pulls/${link.number}`;
  const authHeaders = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${settings.token}`,
    'x-github-api-version': '2022-11-28',
  };

  const metaResponse = await requestPlatform(pullUrl, { headers: authHeaders, timeoutMs, fetchImpl });
  let meta = {};
  try {
    meta = await metaResponse.json();
  } catch {
    meta = {};
  }

  const diffResponse = await requestPlatform(pullUrl, {
    headers: { ...authHeaders, accept: 'application/vnd.github.v3.diff' },
    timeoutMs,
    fetchImpl,
  });
  const diffText = await diffResponse.text();
  const parsed = summarizeDiff(diffText);

  return {
    diffText,
    changeSummary: {
      filesChanged: numberOr(meta.changed_files, parsed.filesChanged),
      additions: numberOr(meta.additions, parsed.additions),
      deletions: numberOr(meta.deletions, parsed.deletions),
    },
  };
}

function githubApiBase(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  let host = '';
  try {
    host = new URL(trimmed).host.toLowerCase();
  } catch {
    host = '';
  }
  if (host === 'github.com' || host === 'www.github.com') return 'https://api.github.com';
  if (/\/api\/v3$/.test(trimmed)) return trimmed;
  return `${trimmed}/api/v3`;
}

function numberOr(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}