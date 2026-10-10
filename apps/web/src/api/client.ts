import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, PublicUser } from '@blog/shared';
import { useAuthStore } from '../store/auth';
import { hasSessionHint } from '../lib/session-hint';

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  withCredentials: true, // 携带 refresh Cookie
});

// 单飞刷新：并发 401 只触发一次 /auth/refresh
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await axios.post<{ accessToken: string; user: PublicUser }>(
      '/api/auth/refresh',
      null,
      { withCredentials: true },
    );
    useAuthStore.getState().setAuth(res.data.accessToken, res.data.user);
    return res.data.accessToken;
  } catch {
    return null;
  }
}

// 启动时的会话恢复只做一次。
let sessionRestored = false;

/**
 * 保证「会话恢复尝试」已经完成后再放行业务请求。
 *
 * 为什么必须等：access token 只在内存里，刷新页面后要先用 refresh Cookie 换新的。
 * 如果详情请求先于这一步发出，后端会按匿名访客处理，于是 `liked` / `favorited`
 * 这类身份相关字段返回 false —— 用户看到的是「刷新后我的点赞没了」（数据其实还在）。
 *
 * 未登录访客靠 localStorage 提示走快速路径，不额外发一次注定 401 的请求。
 */
async function ensureSessionRestored(): Promise<void> {
  if (sessionRestored) {
    return;
  }
  if (useAuthStore.getState().token) {
    sessionRestored = true;
    return;
  }
  if (!hasSessionHint()) {
    sessionRestored = true;
    return;
  }
  refreshPromise = refreshPromise ?? refreshAccessToken();
  await refreshPromise;
  refreshPromise = null;
  sessionRestored = true;
}

// 请求拦截：先确保会话已恢复，再自动注入 Bearer token
api.interceptors.request.use(async (config) => {
  await ensureSessionRestored();
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const AUTH_WHITELIST = ['/auth/refresh', '/auth/login', '/auth/register'];

// 响应拦截：401 先静默刷新一次并重放原请求，失败则登出
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';
    const isAuthWhitelisted = AUTH_WHITELIST.some((p) => url.includes(p));

    if (status === 401 && original && !original._retry && !isAuthWhitelisted) {
      original._retry = true;
      refreshPromise = refreshPromise ?? refreshAccessToken();
      const token = await refreshPromise;
      refreshPromise = null;
      if (token) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);

// 启动时尝试用 refresh Cookie 恢复会话（页面刷新后仍保持登录）
export async function bootstrapSession(): Promise<void> {
  const store = useAuthStore.getState();
  await ensureSessionRestored();
  store.setInitialized(true);
}

// 业务错误码 → 中文文案（后端 message 已本地化，此处兜底网络/未知错误）
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiResponse<unknown> | undefined;
    if (data?.message) {
      return data.message;
    }
    if (error.code === 'ECONNABORTED') {
      return '请求超时，请稍后重试';
    }
    if (!error.response) {
      return '网络异常，请检查连接';
    }
    if (error.response.status >= 500) {
      return '服务器开小差了，请稍后重试';
    }
  }
  return '操作失败，请稍后重试';
}
