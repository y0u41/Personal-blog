import { create } from 'zustand';
import type { PublicUser, UserRole } from '@blog/shared';
import { markSessionHint } from '../lib/session-hint';

interface AuthState {
  token: string | null;
  user: PublicUser | null;
  // 是否已完成启动时的会话恢复（refresh）尝试；false 时守卫应显示加载态
  initialized: boolean;
  setAuth: (token: string, user: PublicUser) => void;
  setInitialized: (v: boolean) => void;
  logout: () => void;
}

// 仅存放登录态与当前用户；访问令牌只留内存（不落 localStorage），
// 刷新页面通过 refresh Cookie 重新换取。服务端数据不进全局状态。
export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  initialized: false,
  // 登录成功时置「存在会话」提示，下次启动需要等会话恢复完成再发请求
  setAuth: (token, user) => {
    markSessionHint(true);
    set({ token, user });
  },
  setInitialized: (v) => set({ initialized: v }),
  // 登出时清掉提示，下次启动可直接走匿名快速路径
  logout: () => {
    markSessionHint(false);
    set({ token: null, user: null });
  },
}));

export const isLoggedIn = (): boolean => useAuthStore.getState().token != null;

/** 当前用户角色（未登录返回 null） */
export const currentRole = (): UserRole | null =>
  useAuthStore.getState().user?.role ?? null;

/** 当前用户是否属于给定角色之一。用于入口显隐，真正的权限仍由后端裁决。 */
export const hasRole = (...roles: UserRole[]): boolean => {
  const role = currentRole();
  return role != null && roles.includes(role);
};
