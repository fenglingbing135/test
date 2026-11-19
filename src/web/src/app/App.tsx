import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { App as AntdApp, Space } from 'antd';
import { deleteReview, fetchPlatformSettings } from '../api/client';
import { describeError } from '../api/messages';
import type { PlatformSettings, ReviewDetail, ReviewListItem } from '../api/types';
import { ReviewList } from '../components/ReviewList';
import { StatusTag } from '../components/StatusTag';
import { useReviewList } from '../hooks/useReviewList';
import { History } from '../pages/History';
import { NewReview } from '../pages/NewReview';
import { ReviewDetail as ReviewDetailPage } from '../pages/ReviewDetail';
import { Settings } from '../pages/Settings';
import { formatDateTime } from '../utils/format';
import { AppShell } from './AppShell';
import { navigate, pathForNav, pathForReview, parsePath } from './router';
import type { NavKey } from './router';
import { usePathname } from './usePathname';

/**
 * 应用入口：路由分发、记录列表与平台凭证配置的共享状态。
 * 顶部上下文栏展示当前记录来源与状态；列表与详情都以服务端返回为准。
 */
export function App() {
  const { message } = AntdApp.useApp();
  const pathname = usePathname();
  const route = parsePath(pathname);
  const list = useReviewList();

  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const reloadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const next = await fetchPlatformSettings();
      setSettings(next);
      setSettingsError(null);
    } catch (caught) {
      setSettingsError(describeError(caught).message);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  const activeNav: NavKey = route.name === 'settings' ? 'settings' : route.name === 'history' ? 'history' : 'new';
  const selectedId = route.name === 'history' ? route.reviewId : null;
  const selectedItem: ReviewListItem | null =
    selectedId && list.items ? list.items.find((item) => item.id === selectedId) ?? null : null;

  const handleNavigate = (key: NavKey) => navigate(pathForNav(key));

  const handleCreated = (review: ReviewDetail) => {
    navigate(pathForReview(review.id));
    void list.refresh();
  };

  const handleDelete = async (reviewId: string) => {
    try {
      await deleteReview(reviewId);
      list.removeLocal(reviewId);
      message.success('已删除该审核记录');
      if (selectedId === reviewId) navigate('/history', { replace: true });
      void list.refresh();
    } catch (caught) {
      message.error(describeError(caught).message);
    }
  };

  const context = (
    <div className="app-context">
      <div className="app-context__main">
        <span className="app-context__eyebrow">
          {activeNav === 'new' ? '新建审核' : activeNav === 'settings' ? '平台设置' : '审核记录'}
        </span>
        <span className="app-context__title">
          {activeNav === 'new'
            ? '粘贴变更或填写 MR 链接发起审核'
            : activeNav === 'settings'
              ? '平台凭证配置'
              : selectedItem
                ? selectedItem.sourceLabel
                : '从左侧选择一条记录查看结果'}
        </span>
      </div>
      <Space size={10} className="app-context__side">
        {selectedItem ? (
          <>
            <span className="app-context__meta">发起于 {formatDateTime(selectedItem.createdAt)}</span>
            <StatusTag status={selectedItem.status} />
          </>
        ) : (
          <span className="app-context__meta">
            {activeNav === 'settings' ? '凭证仅保存在本机' : '审核状态以服务端为准，进行中自动刷新'}
          </span>
        )}
      </Space>
    </div>
  );

  let content: ReactNode;
  if (route.name === 'settings') {
    content = (
      <Settings
        settings={settings}
        loading={settingsLoading}
        error={settingsError}
        onReload={reloadSettings}
        onUpdated={setSettings}
      />
    );
  } else if (route.name === 'new') {
    content = (
      <NewReview
        settings={settings}
        settingsLoading={settingsLoading}
        onCreated={handleCreated}
        onOpenSettings={() => navigate('/settings')}
      />
    );
  } else if (route.reviewId) {
    content = (
      <ReviewDetailPage reviewId={route.reviewId} onRecordChanged={() => void list.refresh()} />
    );
  } else {
    content = (
      <History
        items={list.items}
        total={list.total}
        loading={list.loading}
        error={list.error}
        onCreate={() => navigate('/')}
        onOpen={(reviewId) => navigate(pathForReview(reviewId))}
        onReload={list.refresh}
      />
    );
  }

  const master =
    route.name === 'settings' ? undefined : (
      <ReviewList
        items={list.items}
        total={list.total}
        loading={list.loading}
        error={list.error}
        selectedId={selectedId}
        onSelect={(reviewId) => navigate(pathForReview(reviewId))}
        onCreate={() => navigate('/')}
        onDelete={handleDelete}
        onReload={list.refresh}
      />
    );

  return (
    <AppShell activeNav={activeNav} onNavigate={handleNavigate} context={context} master={master}>
      {content}
    </AppShell>
  );
}