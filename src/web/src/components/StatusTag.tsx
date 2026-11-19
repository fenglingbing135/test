import type { ReactNode } from 'react';
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import type { ReviewStatus } from '../api/types';

const STATUS_META: Record<ReviewStatus, { label: string; color: string; icon: ReactNode }> = {
  running: { label: '审核中', color: 'processing', icon: <LoadingOutlined spin /> },
  succeeded: { label: '审核成功', color: 'success', icon: <CheckCircleFilled /> },
  failed: { label: '审核失败', color: 'error', icon: <CloseCircleFilled /> },
};

/** 审核状态标识：进行中 / 成功 / 失败三态在列表、详情与顶部上下文栏统一展示。 */
export function StatusTag({ status }: { status: ReviewStatus }) {
  const meta = STATUS_META[status];
  return (
    <Tag className="status-tag" color={meta.color} icon={meta.icon}>
      {meta.label}
    </Tag>
  );
}