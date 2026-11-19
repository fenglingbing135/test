import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import './app/global.css';
import { App } from './app/App';
import { appTheme } from './app/theme';

const container = document.getElementById('root');
if (!container) throw new Error('缺少根节点 #root');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={appTheme}>
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);