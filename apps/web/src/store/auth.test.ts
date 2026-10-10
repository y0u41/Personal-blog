import { beforeEach, describe, expect, it } from 'vitest';
import type { PublicUser } from '@blog/shared';
import { currentRole, hasRole, isLoggedIn, useAuthStore } from './auth';

function user(role: PublicUser['role']): PublicUser {
  return {
    id: '1',
    username: 'u',
    displayName: 'U',
    avatar: null,
    bio: null,
    role,
  };
}

describe('auth store 角色助手', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null, initialized: false });
  });

  it('未登录时 isLoggedIn 为 false 且角色为 null', () => {
    expect(isLoggedIn()).toBe(false);
    expect(currentRole()).toBeNull();
    expect(hasRole('reader', 'author', 'admin')).toBe(false);
  });

  it('登录后按角色判断入口权限', () => {
    useAuthStore.getState().setAuth('token', user('reader'));

    expect(isLoggedIn()).toBe(true);
    expect(currentRole()).toBe('reader');
    // 读者不能发文
    expect(hasRole('author', 'admin')).toBe(false);
    expect(hasRole('reader')).toBe(true);
  });

  it('作者可写文但不能进管理后台', () => {
    useAuthStore.getState().setAuth('token', user('author'));
    expect(hasRole('author', 'admin')).toBe(true);
    expect(hasRole('admin')).toBe(false);
  });

  it('管理员两项都满足', () => {
    useAuthStore.getState().setAuth('token', user('admin'));
    expect(hasRole('author', 'admin')).toBe(true);
    expect(hasRole('admin')).toBe(true);
  });

  it('登出后清空登录态', () => {
    useAuthStore.getState().setAuth('token', user('admin'));
    useAuthStore.getState().logout();
    expect(isLoggedIn()).toBe(false);
    expect(currentRole()).toBeNull();
  });
});
