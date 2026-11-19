import { DeleteOutlined, FileTextOutlined, LinkOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Skeleton } from 'antd';
import type { ReviewListItem } from '../api/types';
import { formatDateTime } from '../utils/format';
import { EmptyState } from './EmptyState';
import { InlineError } from './InlineError';
import { StatusTag } from './StatusTag';

interface ReviewListProps {
  items: ReviewListItem[] | null;
  total: number;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (reviewId: string) => void;
  onCreate: () => void;
  onDelete: (reviewId: string) => void | Promise<void>;
  onReload: () => void | Promise<void>;
}

/**
 * 左侧记录列表（split-master-detail 的主列表）：
 * 首屏骨架、空态引导、加载失败就地重试，以及单条记录删除。
 */
export function ReviewList({
  items,
  total,
  loading,
  error,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onReload,
}: ReviewListProps) {
  return (
    <div className="panel master">
      <div className="master__head">
        <div>
          <div className="master__title">审核记录</div>
          <div className="master__sub">{items ? `共 ${total} 条` : '正在加载'}</div>
        </div>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={onCreate}>
          新建
        </Button>
      </div>

      <div className="master__body">
        {loading ? (
          <div className="master__skeletons" aria-busy="true" aria-label="审核记录加载中">
            {[0, 1, 2, 3].map((key) => (
              <div className="master__skeleton" key={key}>
                <Skeleton active title={false} paragraph={{ rows: 2, width: ['72%', '48%'] }} />
              </div>
            ))}
          </div>
        ) : error && items === null ? (
          <div className="master__notice">
            <InlineError
              title="记录列表加载失败"
              message={error}
              action={
                <Button size="small" icon={<ReloadOutlined />} onClick={() => void onReload()}>
                  重新加载
                </Button>
              }
            />
          </div>
        ) : items && items.length === 0 ? (
          <EmptyState
            title="暂无审核记录"
            description="粘贴变更内容或填写 MR 链接，发起第一次审核。"
            action={
              <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
                新建审核
              </Button>
            }
          />
        ) : (
          <div className="master__items">
            {(items ?? []).map((item) => {
              const selected = item.id === selectedId;
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-current={selected ? 'true' : undefined}
                  className={`review-item${selected ? ' review-item--active' : ''}`}
                  onClick={() => onSelect(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(item.id);
                    }
                  }}
                >
                  <div className="review-item__top">
                    <span className="review-item__icon">
                      {item.sourceType === 'mr-link' ? <LinkOutlined /> : <FileTextOutlined />}
                    </span>
                    <span className="review-item__label" title={item.sourceLabel}>
                      {item.sourceLabel}
                    </span>
                    <StatusTag status={item.status} />
                  </div>
                  <div className="review-item__bottom">
                    <span className="review-item__time">{formatDateTime(item.createdAt)}</span>
                    <span className="review-item__meta">
                      {item.sourceType === 'mr-link' ? 'MR 链接' : '粘贴'} · {issueText(item)}
                    </span>
                    {item.status === 'succeeded' && item.highSeverityCount ? (
                      <span className="review-item__high">高 {item.highSeverityCount}</span>
                    ) : null}
                    <span className="review-item__actions" onClick={(event) => event.stopPropagation()}>
                      <Popconfirm
                        title="删除这条审核记录？"
                        description="删除后不可恢复。"
                        okText="删除"
                        okButtonProps={{ danger: true }}
                        cancelText="取消"
                        onConfirm={() => void onDelete(item.id)}
                      >
                        <Button type="text" size="small" icon={<DeleteOutlined />} aria-label="删除记录" />
                      </Popconfirm>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && items !== null ? (
          <div className="master__notice master__notice--stale">
            <InlineError
              title="列表刷新失败"
              message={error}
              action={
                <Button size="small" icon={<ReloadOutlined />} onClick={() => void onReload()}>
                  重试
                </Button>
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function issueText(item: ReviewListItem): string {
  if (item.status === 'running') return '审核进行中';
  if (item.status === 'failed') return '审核失败';
  if (item.issueCount === null) return '已出结论';
  if (item.issueCount === 0) return '未发现问题';
  return `${item.issueCount} 个问题`;
}