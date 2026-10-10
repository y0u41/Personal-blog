// 从 vitest/config 引入 defineConfig：它在 Vite 配置类型上叠加了 `test` 字段，
// 使单测配置与构建配置共用一个文件，避免 alias 等设置两处维护、彼此漂移。
import { defineConfig } from 'vitest/config';
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
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'lcov'],
      // 分母覆盖全部前端源码。页面（pages/）与网络封装（api/）不写组件级单测，
      // 而是交给真实浏览器冒烟脚本覆盖（见 scripts/browser_admin_smoke.mjs），
      // 因此全局数字偏低是**预期**的，不代表这些界面未被验证。
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts'],
      // 门槛只设给真正承担业务逻辑、且本就该由单测兜住的目录。
      // 给全站设一个统一低门槛等于没设；按目录设门槛才能拦住真实回退。
      thresholds: {
        'src/lib/**': { statements: 95, branches: 95, functions: 95, lines: 95 },
        'src/store/**': { statements: 90, branches: 90, functions: 80, lines: 90 },
      },
    },
  },
});
