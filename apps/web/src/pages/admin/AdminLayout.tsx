import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/admin/users', label: '用户与权限' },
  { to: '/admin/comments', label: '评论审核' },
  { to: '/admin/categories', label: '分类' },
  { to: '/admin/tags', label: '标签' },
];

// 管理后台外壳：左侧导航 + 右侧内容。角色门禁在路由层（/admin 整棵子树）。
export default function AdminLayout() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-2xl font-bold text-slate-800">管理后台</h1>
      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-40 md:flex-col">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-indigo-600 font-medium text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-5">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
