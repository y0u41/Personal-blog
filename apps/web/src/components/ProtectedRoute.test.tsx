// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { PublicUser, UserRole } from '@blog/shared';
import ProtectedRoute from './ProtectedRoute';
import { useAuthStore } from '../store/auth';

afterEach(cleanup);

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null, initialized: false });
});

function user(role: UserRole): PublicUser {
  return {
    id: '5',
    username: 'yu',
    displayName: 'Yu',
    avatar: null,
    bio: null,
    role,
  };
}

/** 用来观测「被重定向到了哪里、带了什么查询串」 */
function LoginProbe() {
  const loc = useLocation();
  return <div data-testid="login">{loc.pathname + loc.search}</div>;
}

function renderGuarded(path = '/me', roles?: UserRole[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/me"
          element={
            <ProtectedRoute roles={roles}>
              <div>受保护内容</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute 路由守卫', () => {
  it('会话尚未恢复完成时显示加载态：不渲染内容，也不急着跳登录', () => {
    renderGuarded();

    expect(screen.queryByText('受保护内容')).toBeNull();
    expect(screen.queryByTestId('login')).toBeNull();
  });

  it('已初始化且未登录时重定向到登录页，并带上原路径', () => {
    useAuthStore.setState({ token: null, user: null, initialized: true });

    renderGuarded();

    expect(screen.getByTestId('login').textContent).toBe('/login?redirect=%2Fme');
  });

  it('重定向时保留查询串，避免用户筛选条件丢失', () => {
    useAuthStore.setState({ token: null, user: null, initialized: true });

    renderGuarded('/me?tab=posts');

    expect(screen.getByTestId('login').textContent).toBe(
      '/login?redirect=%2Fme%3Ftab%3Dposts',
    );
  });

  it('已登录且未声明角色白名单时放行（登录即可访问）', () => {
    useAuthStore.setState({ token: 't', user: user('reader'), initialized: true });

    renderGuarded();

    expect(screen.getByText('受保护内容')).toBeTruthy();
  });

  it('角色在白名单内时放行', () => {
    useAuthStore.setState({ token: 't', user: user('admin'), initialized: true });

    renderGuarded('/me', ['admin']);

    expect(screen.getByText('受保护内容')).toBeTruthy();
  });

  it('作者也能进入允许 author 的页面', () => {
    useAuthStore.setState({ token: 't', user: user('author'), initialized: true });

    renderGuarded('/me', ['admin', 'author']);

    expect(screen.getByText('受保护内容')).toBeTruthy();
  });

  it('角色不在白名单内时展示 403 页，而不是跳走（避免用户困惑）', () => {
    useAuthStore.setState({ token: 't', user: user('reader'), initialized: true });

    renderGuarded('/me', ['admin', 'author']);

    expect(screen.getByText('没有访问权限')).toBeTruthy();
    expect(screen.queryByText('受保护内容')).toBeNull();
    expect(screen.queryByTestId('login')).toBeNull();
  });

  it('白名单为空数组时视为不限制角色', () => {
    useAuthStore.setState({ token: 't', user: user('reader'), initialized: true });

    renderGuarded('/me', []);

    expect(screen.getByText('受保护内容')).toBeTruthy();
  });

  it('有 token 但用户信息缺失时不放行（宁可展示 403 也不越权渲染）', () => {
    useAuthStore.setState({ token: 't', user: null, initialized: true });

    renderGuarded('/me', ['admin']);

    expect(screen.queryByText('受保护内容')).toBeNull();
    expect(screen.getByText('没有访问权限')).toBeTruthy();
  });
});
