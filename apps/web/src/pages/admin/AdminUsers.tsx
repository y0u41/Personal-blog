import { useCallback, useEffect, useState } from 'react';
import { UserRole as ROLES, type AdminUser, type UserRole } from '@blog/shared';
import { getErrorMessage } from '../../api/client';
import { listUsers, updateUserRole, updateUserStatus } from '../../api/users';
import Pagination from '../../components/Pagination';
import { formatDate } from '../../lib/format';
import { useAuthStore } from '../../store/auth';
import { toast } from '../../store/toast';

const ROLE_LABEL: Record<UserRole, string> = {
  admin: '管理员',
  author: '作者',
  reader: '读者',
};

const PAGE_SIZE = 20;

export default function AdminUsers() {
  const me = useAuthStore((s) => s.user);
  const [items, setItems] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<'' | UserRole>('');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUsers({
        page,
        pageSize: PAGE_SIZE,
        role: role || undefined,
        keyword: keyword.trim() || undefined,
      });
      setItems(res.items);
      setTotal(res.meta.total);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, role, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = async (user: AdminUser, next: UserRole) => {
    if (next === user.role) {
      return;
    }
    setBusyId(user.id);
    try {
      const updated = await updateUserRole(user.id, next);
      setItems((list) => list.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(`已将「${updated.displayName || updated.username}」设为${ROLE_LABEL[next]}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  const toggleStatus = async (user: AdminUser) => {
    const next = user.status === 1 ? 0 : 1;
    if (next === 0 && !window.confirm(`确定停用「${user.username}」？该账号将无法登录。`)) {
      return;
    }
    setBusyId(user.id);
    try {
      const updated = await updateUserStatus(user.id, next);
      setItems((list) => list.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(next === 0 ? '账号已停用' : '账号已启用');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold text-slate-700">用户与权限</h2>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as '' | UserRole);
            setPage(1);
          }}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
        >
          <option value="">全部角色</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              void load();
            }
          }}
          placeholder="用户名 / 昵称 / 邮箱"
          className="w-44 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <button
          onClick={() => {
            setPage(1);
            void load();
          }}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          查询
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-400">加载中…</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">没有匹配的用户</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">用户</th>
                <th className="py-2 pr-3 font-medium">邮箱</th>
                <th className="py-2 pr-3 font-medium">角色</th>
                <th className="py-2 pr-3 font-medium">状态</th>
                <th className="py-2 pr-3 font-medium">文章</th>
                <th className="py-2 pr-3 font-medium">注册时间</th>
                <th className="py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((u) => {
                const isSelf = me?.id === u.id;
                return (
                  <tr key={u.id} className="align-middle">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-slate-700">{u.displayName || u.username}</div>
                      <div className="text-xs text-slate-400">@{u.username}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500">{u.email}</td>
                    <td className="py-2.5 pr-3">
                      <select
                        value={u.role}
                        disabled={isSelf || busyId === u.id}
                        onChange={(e) => void changeRole(u, e.target.value as UserRole)}
                        className="rounded border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          u.status === 1
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-red-50 text-red-500'
                        }`}
                      >
                        {u.status === 1 ? '正常' : '已停用'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500">{u.postCount}</td>
                    <td className="py-2.5 pr-3 text-xs text-slate-400">{formatDate(u.createdAt)}</td>
                    <td className="py-2.5">
                      {isSelf ? (
                        <span className="text-xs text-slate-400">本人</span>
                      ) : (
                        <button
                          disabled={busyId === u.id}
                          onClick={() => void toggleStatus(u)}
                          className={`text-xs hover:underline disabled:opacity-50 ${
                            u.status === 1 ? 'text-red-500' : 'text-emerald-600'
                          }`}
                        >
                          {u.status === 1 ? '停用' : '启用'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  );
}
