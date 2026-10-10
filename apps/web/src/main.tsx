import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { bootstrapSession } from './api/client';
import { router } from './router';
import './index.css';

// 启动时尝试用 refresh Cookie 恢复登录态（失败则保持未登录，由守卫跳转）
void bootstrapSession();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
