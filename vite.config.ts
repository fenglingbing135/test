import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 前端构建配置：开发期把 `/api` 代理到本机服务端 `PORT`，构建产物输出到 `dist/`，
 * 由 `src/server.js` 同源托管。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'PORT');
  const serverPort = env.PORT && env.PORT.trim() !== '' ? env.PORT.trim() : '8787';
  const apiTarget = `http://127.0.0.1:${serverPort}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
    },
  };
});