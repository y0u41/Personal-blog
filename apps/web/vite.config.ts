import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// 前端开发服务器：5173，/api 代理到后端 3000
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@blog/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      // 上传图片由后端静态托管，开发期一并代理
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
