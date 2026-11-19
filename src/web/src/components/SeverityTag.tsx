import { Tag } from 'antd';
import type { Severity } from '../api/types';

const SEVERITY_META: Record<Severity, { label: string; name: string; fg: string; bg: string; border: string }> = {
  high: { label: '高', name: '高严重级', fg: '#b42318', bg: '#fef3f2', border: '#fecdca' },
  medium: { label: '中', name: '中严重级', fg: '#b54708', bg: '#fffaeb', border: '#fedf89' },
  low: { label: '低', name: '低严重级', fg: '#175cd3', bg: '#eff8ff', border: '#b2ddff' },
};

/** 严重级别标识：界面统一展示中文「高 / 中 / 低」。 */
export function SeverityTag({ severity }: { severity: Severity }) {
  const meta = SEVERITY_META[severity];
  return (
    <Tag
      className="severity-tag"
      style={{ color: meta.fg, background: meta.bg, borderColor: meta.border, marginInlineEnd: 0, fontWeight: 600 }}
    >
      {meta.label}
    </Tag>
  );
}

export function severityName(severity: Severity): string {
  return SEVERITY_META[severity].name;
}