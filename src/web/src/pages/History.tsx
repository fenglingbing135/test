import { ArrowRightOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import type { ReviewListItem } from '../api/types';
import { EmptyState } from '../components/EmptyState';
import { InlineError } from '../components/InlineError';
import { StatusTag } from '../components/StatusTag';
import { formatDateTime } from '../utils/format';

interface HistoryProps {
  items: ReviewListItem[] | null;
  total: number;
  loading: boolean;
  error: string | null;
  onCreate: () => void;
  onOpen: (reviewId: string) => void;
  onReload: () => void | Promise<void>;
}

/**
 * 审核历史总览（右侧详情区的默认视图）：
 * 记录数量按状态汇总，并给出最近记录的快捷入口；明细在左侧列表与记录详情中查看。
 */
export function History({ items, total, loading, error, onCreate, onOpen, onReload }: HistoryProps) {
  const running = (items ?? []).filter((item) => item.status === 'running').length;
  const succeeded = (items ?? []).filter((item) => item.status === 'succeeded').length;
  const failed = (items ?? []).filter((item) => item.status === 'failed').length;
  const recent = (items ?? []).slice(0, 5);

  if (loading) {
    return (
      <div className="panel page-panel">
        <div className="page-panel__body">
          <Skeleton active title paragraph={{ rows: 6 }} />
        </div>
      </div>
    );
  }

  if (error && items === null) {
    return (
      <div className="panel page-panel">
        <div className="page-panel__body">
          <InlineError
            title="审核历史加载失败"
            message={error}
            action={
              <Button size="small" icon={<ReloadOutlined />} onClick={() => void onReload()}>
                重新加载
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="panel page-panel">
      <header className="page-panel__head">
        <h1 className="page-panel__title">审核历史</h1>
        <p className="page-panel__desc">从左侧选择一条记录查看完整结果；删除后记录不再出现在列表中。</p>
      </header>

      <div className="page-panel__body">
        {total === 0 ? (
          <EmptyState
            title="暂无审核记录"
            description="发起一次审核后，记录会出现在这里，可随时回看或删除。"
            action={
              <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
                新建审核
              </Button>
            }
          />
        ) : (
          <>
            <div className="stat-row">
              <div className="stat-card">
                <span className="stat-card__value">{total}</span>
                <span className="stat-card__label">记录总数</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__value">{running}</span>
                <span className="stat-card__label">审核中</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__value">{succeeded}</span>
                <span className="stat-card__label">审核成功</span>
              </div>
              <div className="stat-card stat-card--alert">
                <span className="stat-card__value">{failed}</span>
                <span className="stat-card__label">审核失败</span>
              </div>
            </div>

            <section className="recent">
              <div className="section-head">
                <h2 className="section-head__title">最近审核</h2>
                <span className="section-head__hint">按发起时间倒序</span>
              </div>
              <div className="recent__list">
                {recent.map((item) => (
                  <button key={item.id} type="button" className="recent__item" onClick={() => onOpen(item.id)}>
                    <span className="recent__main">
                      <span className="recent__label" title={item.sourceLabel}>
                        {item.sourceLabel}
                      </span>
                      <span className="recent__meta">
                        {item.sourceType === 'mr-link' ? 'MR 链接' : '粘贴'} · {formatDateTime(item.createdAt)} ·{' '}
                        {issueText(item)}
                      </span>
                    </span>
                    <StatusTag status={item.status} />
                    <ArrowRightOutlined className="recent__arrow" />
                  </button>
                ))}
              </div>
              <p className="recent__hint">记录列表展示在左侧，可切换查看不同审核。</p>
            </section>
          </>
        )}
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