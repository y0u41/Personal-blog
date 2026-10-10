import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import type { UserRole } from '@blog/shared';
import { logout as apiLogout } from '../api/auth';
import { useAuthStore } from '../store/auth';
import { toast } from '../store/toast';
import Toaster from './Toaster';

const ROLE_LABEL: Record<UserRole, string> = {
  admin: '管理员',
  author: '作者',
  reader: '读者',
};

function Header() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const clear = useAuthStore((s) => s.logout);
  const [keyword, setKeyword] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = user?.role === 'admin';
  const canWrite = isAdmin || user?.role === 'author';

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(keyword.trim() ? `/?keyword=${encodeURIComponent(keyword.trim())}` : '/');
  };

  const onLogout = async () => {
    try {
      await apiLogout();
    } catch {
      // 忽略登出接口错误，本地状态照常清理
    }
    clear();
    setMenuOpen(false);
    toast.info('已退出登录');
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
        <Link to="/" className="text-xl font-bold text-indigo-600">
          📝 我的博客
        </Link>

        <form onSubmit={onSearch} className="ml-2 hidden flex-1 sm:block">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索文章标题 / 内容…"
            className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:bg-white"
          />
        </form>

        {/* 归档与排行榜对游客同样开放，不放在登录菜单里 */}
        <nav className="hidden items-center gap-1 text-sm sm:flex">
          <Link to="/archive" className="rounded-md px-2.5 py-1.5 text-slate-600 hover:bg-slate-100">
            归档
          </Link>
          <Link to="/rank" className="rounded-md px-2.5 py-1.5 text-slate-600 hover:bg-slate-100">
            排行榜
          </Link>
        </nav>

        <nav className="ml-auto flex items-center gap-3 text-sm">
          {token && user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-100"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                  {(user.displayName || user.username).slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:inline">{user.displayName || user.username}</span>
                <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 sm:inline">
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-2 w-40 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  {/* 读者没有发文权限，不显示入口（后端同样会拒绝，此处只避免误导） */}
                  {canWrite && (
                    <Link to="/write" onClick={() => setMenuOpen(false)} className="block px-4 py-2 hover:bg-slate-50">
                      写文章
                    </Link>
                  )}
                  <Link to="/me" onClick={() => setMenuOpen(false)} className="block px-4 py-2 hover:bg-slate-50">
                    个人中心
                  </Link>
                  <Link
                    to="/me/favorites"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 hover:bg-slate-50"
                  >
                    我的收藏
                  </Link>
                  {isAdmin && (
                    <Link to="/admin" onClick={() => setMenuOpen(false)} className="block px-4 py-2 hover:bg-slate-50">
                      管理后台
                    </Link>
                  )}
                  <button onClick={onLogout} className="block w-full px-4 py-2 text-left text-red-600 hover:bg-slate-50">
                    退出登录
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link to="/login" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100">
                登录
              </Link>
              <Link
                to="/register"
                className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
              >
                注册
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} 我的博客 · Built with NestJS + React
      </footer>
      <Toaster />
    </div>
  );
}
