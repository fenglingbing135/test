import { requestPlatform } from './request.js';

/**
 * GitLab（含自建实例）适配器：读取合并请求变更列表，按文件拼接为统一 diff 文本。
 * @param {{ link: { repository: string, number: number }, settings: { baseUrl: string, token: string }, timeoutMs?: number, fetchImpl?: typeof fetch }} input
 * @returns {Promise<{ diffText: string, changeSummary: { filesChanged: number, additions: number, deletions: number } }>}
 */
export async function fetchGitlabChange({ link, settings, timeoutMs = 20000, fetchImpl = fetch }) {
  const apiBase = githubLikeApiBase(settings.baseUrl);
  const projectId = encodeURIComponent(link.repository);
  const url = `${apiBase}/projects/${projectId}/merge_requests/${link.number}/changes`;

  const response = await requestPlatform(url, {
    headers: { 'private-token': settings.token, accept: 'application/json' },
    timeoutMs,
    fetchImpl,
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const changes = Array.isArray(payload?.changes) ? payload.changes : [];
  const chunks = [];
  let additions = 0;
  let deletions = 0;

  for (const change of changes) {
    const oldPath = typeof change?.old_path === 'string' ? change.old_path : '(unknown)';
    const newPath = typeof change?.new_path === 'string' ? change.new_path : oldPath;
    const diffBody = typeof change?.diff === 'string' ? change.diff : '';
    chunks.push(`diff --git a/${oldPath} b/${newPath}\n--- a/${oldPath}\n+++ b/${newPath}\n${diffBody}`);

    for (const line of diffBody.split(/\r?\n/)) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions += 1;
      else if (line.startsWith('-') && !line.startsWith('---')) deletions += 1;
    }
  }

  return {
    diffText: chunks.join('\n'),
    changeSummary: {
      filesChanged: changes.length,
      additions: numberOr(payload?.additions, additions),
      deletions: numberOr(payload?.deletions, deletions),
    },
  };
}

function githubLikeApiBase(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (/\/api\/v4$/.test(trimmed)) return trimmed;
  return `${trimmed}/api/v4`;
}

function numberOr(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}