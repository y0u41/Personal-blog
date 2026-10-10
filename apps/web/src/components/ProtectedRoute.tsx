import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { UserRole } from '@blog/shared';
import { useAuthStore } from '../store/auth';
import Forbidden from './Forbidden';

interface Props {
  children: ReactNode;
  /** 允许访问的角色白名单；不传表示「登录即可」 */
  roles?: UserRole[];
}

// 未登录访问受保护页面时重定向到 /login?redirect=<原路径>；
// 已登录但角色不在白名单内时展示 403 页面（而不是跳走，避免用户困惑）。
export default function ProtectedRoute({ children, roles }: Props) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const location = useLocation();

  if (!initialized) {
    return (
      <div className="grid place-items-center py-24 text-slate-400">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
      </div>
    );
  }

  if (!token) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  if (roles && roles.length > 0 && (!user || !roles.includes(user.role))) {
    return <Forbidden />;
  }

  return <>{children}</>;
}
