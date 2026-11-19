/** 时间与规模摘要的展示格式化，仅做展示层派生，不改变服务端数据。 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDate(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `2026-11-19 16:12` */
export function formatDateTime(iso: string | null): string {
  const date = toDate(iso);
  if (!date) return '—';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

/** `2026-11-19 16:12:30` */
export function formatDateTimeFull(iso: string | null): string {
  const date = toDate(iso);
  if (!date) return '—';
  return `${formatDateTime(iso)}:${pad(date.getSeconds())}`;
}

/** `3 个文件 · +42 −7` */
export function formatChangeSummary(summary: { filesChanged: number; additions: number; deletions: number }): string {
  return `${summary.filesChanged} 个文件 · +${summary.additions} −${summary.deletions}`;
}

/** 合并请求或粘贴来源的标题文案。 */
export function formatSourceTitle(source: {
  type: 'paste' | 'mr-link';
  repository: string | null;
  number: number | null;
}): string {
  if (source.type === 'mr-link') {
    const repository = source.repository ?? '未知仓库';
    return source.number === null ? repository : `${repository} #${source.number}`;
  }
  return '粘贴的变更';
}