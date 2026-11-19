import { Segmented } from 'antd';
import type { Severity } from '../api/types';

export type SeverityFilterValue = 'all' | Severity;

interface SeverityFilterProps {
  value: SeverityFilterValue;
  total: number;
  counts: Record<Severity, number>;
  onChange: (value: SeverityFilterValue) => void;
}

/** 严重级别筛选器：选项计数由当前记录的问题清单派生，不改变服务端顺序。 */
export function SeverityFilter({ value, total, counts, onChange }: SeverityFilterProps) {
  const options = [
    { label: `全部 ${total}`, value: 'all' },
    { label: `高 ${counts.high}`, value: 'high' },
    { label: `中 ${counts.medium}`, value: 'medium' },
    { label: `低 ${counts.low}`, value: 'low' },
  ];

  return (
    <Segmented
      className="severity-filter"
      options={options}
      value={value}
      onChange={(next) => onChange(next as SeverityFilterValue)}
    />
  );
}