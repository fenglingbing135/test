import type { ReactNode } from 'react';
import { HistoryOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import type { NavKey } from './router';

const NAV_ITEMS: MenuProps['items'] = [
  { key: 'new', icon: <PlusOutlined />, label: '新建审核' },
  { key: 'history', icon: <HistoryOutlined />, label: '审核历史' },
  { key: 'settings', icon: <SettingOutlined />, label: '平台设置' },
];

interface AppShellProps {
  activeNav: NavKey;
  onNavigate: (key: NavKey) => void;
  /** 顶部上下文栏：当前记录来源与状态。 */
  context: ReactNode;
  /** 左侧记录列表；不传时主工作区占满宽度（平台设置）。 */
  master?: ReactNode;
  children: ReactNode;
}

/** 应用壳：左侧深色导航 + 顶部上下文栏 + 主工作区（列表 / 详情分栏）。 */
export function AppShell({ activeNav, onNavigate, context, master, children }: AppShellProps) {
  return (
    <Layout className="app-shell">
      <Layout.Sider width={224} className="app-sider" theme="dark" breakpoint="lg" collapsedWidth={0}>
        <div className="app-brand">
          <span className="app-brand__mark">AI</span>
          <span className="app-brand__text">
            <span className="app-brand__name">AI 审核工作台</span>
            <span className="app-brand__desc">合并请求代码审核</span>
          </span>
        </div>

        <nav className="app-nav" aria-label="主导航">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[activeNav]}
            items={NAV_ITEMS}
            onClick={({ key }) => onNavigate(key as NavKey)}
          />
        </nav>

        <div className="app-sider__foot">单用户 · 本机运行</div>
      </Layout.Sider>

      <Layout>
        <Layout.Header className="app-header">{context}</Layout.Header>
        <Layout.Content className="app-content">
          {master ? (
            <div className="workspace">
              <aside className="workspace__master">{master}</aside>
              <section className="workspace__detail">{children}</section>
            </div>
          ) : (
            <div className="workspace__single">{children}</div>
          )}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}