import { AppError } from '../errors.js';

/**
 * 确定性平台拉取实现，仅在 `PLATFORM_FETCH_MODE=stub` 时启用（验收使用）。
 * 按链接中的仓库路径返回固定 diff，或按标记返回对应失败：
 * - `unauthorized` / `forbidden` → PLATFORM_UNAUTHORIZED
 * - `not-found` / `missing` → PLATFORM_NOT_FOUND
 * - `network` / `timeout` / `unavailable` / `offline` → PLATFORM_UNAVAILABLE
 * @param {{ link: { url: string, repository: string, platform: string, number: number } }} input
 */
export async function fetchStubChange({ link }) {
  const marker = `${link.repository} ${link.url}`.toLowerCase();

  if (marker.includes('unauthorized') || marker.includes('forbidden')) {
    throw new AppError(502, 'PLATFORM_UNAUTHORIZED', '平台凭证无效或无权访问该合并请求');
  }
  if (marker.includes('not-found') || marker.includes('missing')) {
    throw new AppError(502, 'PLATFORM_NOT_FOUND', '合并请求不存在或无权访问');
  }
  if (
    marker.includes('network') ||
    marker.includes('timeout') ||
    marker.includes('unavailable') ||
    marker.includes('offline')
  ) {
    throw new AppError(502, 'PLATFORM_UNAVAILABLE', '平台暂时不可用，稍后重试');
  }

  const diffText = [
    'diff --git a/src/api/userClient.js b/src/api/userClient.js',
    '--- a/src/api/userClient.js',
    '+++ b/src/api/userClient.js',
    '@@ -12,6 +12,14 @@ export async function loadUser(id) {',
    '   const response = await fetch(`/api/users/${id}`);',
    '-  return response.json();',
    '+  if (!response.ok) {',
    '+    throw new Error(`loadUser failed: ${response.status}`);',
    '+  }',
    '+  const payload = await response.json();',
    '+  return payload.data ?? null;',
    ' }',
    '+',
    '+export function normalizeUser(user) {',
    '+  return { id: user.id, name: user.name ?? "未命名用户" };',
    '+}',
    'diff --git a/src/pages/UserPage.tsx b/src/pages/UserPage.tsx',
    '--- a/src/pages/UserPage.tsx',
    '+++ b/src/pages/UserPage.tsx',
    '@@ -20,4 +20,8 @@ export function UserPage() {',
    '   const { id } = useParams();',
    '-  const user = useUser(id);',
    '+  const user = useUser(id);',
    '+  if (!user) {',
    '+    return <Empty description="未找到用户" />;',
    '+  }',
    '   return <UserCard user={user} />;',
    ' }',
    '',
  ].join('\n');

  const additions = 11;
  const deletions = 2;

  return {
    diffText,
    changeSummary: { filesChanged: 2, additions, deletions },
  };
}