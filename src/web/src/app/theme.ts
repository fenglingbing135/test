import type { ThemeConfig } from 'antd';

const FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif";

/** Modern SaaS 视觉基线：中性浅色工作区、深色左侧导航、单一主色与状态色、细边界、少阴影。 */
export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#2563eb',
    colorInfo: '#2563eb',
    colorSuccess: '#15803d',
    colorWarning: '#b54708',
    colorError: '#dc2626',
    colorTextBase: '#1f2733',
    colorBgLayout: '#f4f5f7',
    colorBgContainer: '#ffffff',
    colorBorderSecondary: '#e7e9ee',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: FONT_FAMILY,
    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      siderBg: '#0f172a',
      bodyBg: '#f4f5f7',
      headerHeight: 60,
      headerPadding: '0 24px',
    },
    Menu: {
      darkItemBg: '#0f172a',
      darkSubMenuItemBg: '#0f172a',
      darkItemColor: '#c3cbdc',
      darkItemHoverColor: '#ffffff',
      darkItemHoverBg: '#182234',
      darkItemSelectedBg: '#1d4ed8',
      darkItemSelectedColor: '#ffffff',
      itemBorderRadius: 8,
    },
    Card: {
      headerFontSize: 15,
    },
    Button: {
      controlHeight: 34,
    },
  },
};