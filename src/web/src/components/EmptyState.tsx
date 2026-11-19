import type { ReactNode } from 'react';
import { Empty } from 'antd';

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

/** 空态：列表无记录、筛选无结果等场景的统一展示。 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div className="empty-state__text">
            <div className="empty-state__title">{title}</div>
            {description ? <div className="empty-state__desc">{description}</div> : null}
          </div>
        }
      />
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}