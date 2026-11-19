/** 轻量路由：同源 SPA 由服务端回落到 index.html，这里只解析三条业务路径。 */

export type Route = { name: 'new' } | { name: 'history'; reviewId: string | null } | { name: 'settings' };

export type NavKey = 'new' | 'history' | 'settings';

const HISTORY_PATTERN = /^\/history(?:\/([^/]+))?\/?$/;
const REVIEWS_PATTERN = /^\/reviews\/([^/]+)\/?$/;

export function parsePath(pathname: string): Route {
  if (pathname === '/settings' || pathname === '/settings/') return { name: 'settings' };

  const historyMatch = HISTORY_PATTERN.exec(pathname);
  if (historyMatch) {
    const reviewId = historyMatch[1] ? safeDecode(historyMatch[1]) : null;
    return { name: 'history', reviewId };
  }

  const reviewsMatch = REVIEWS_PATTERN.exec(pathname);
  if (reviewsMatch) return { name: 'history', reviewId: safeDecode(reviewsMatch[1]) };

  return { name: 'new' };
}

export function pathForNav(key: NavKey): string {
  if (key === 'settings') return '/settings';
  if (key === 'history') return '/history';
  return '/';
}

export function pathForReview(reviewId: string): string {
  return `/history/${encodeURIComponent(reviewId)}`;
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === path) return;
  if (options.replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}