import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Paginated, Post } from '@blog/shared';
import { changePassword } from '../api/auth';
import { getErrorMessage } from '../api/client';
import { deletePost, setPostPinned } from '../api/posts';
import { getMe, getMyPosts, updateMe } from '../api/users';
import { formatDate, STATUS_LABEL } from '../lib/format';
import { useAuthStore } from '../store/auth';
import { toast } from '../store/toast';

export default function Profile() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);
  const clear = useAuthStore((s) => s.logout);

  const [profile, setProfile] = useState({ displayName: '', avatar: '', bio: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwd, setPwd] = useState({ oldPassword: '', newPassword: '' });
  const [savingPwd, setSavingPwd] = useState(false);
  const [mine, setMine] = useState<Paginated<Post> | null>(null);

  useEffect(() => {
    getMe()
      .then((u) => setProfile({ displayName: u.displayName, avatar: u.avatar ?? '', bio: u.bio ?? '' }))
      .catch((err) => toast.error(getErrorMessage(err)));
    reloadMine();
  }, []);

  const reloadMine = () => {
    getMyPosts({ page: 1, pageSize: 50 })
      .then(setMine)
      .catch((err) => toast.error(getErrorMessage(err)));
  };

  const onSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await updateMe({
        displayName: profile.displayName || undefined,
        avatar: profile.avatar || undefined,
        bio: profile.bio || undefined,
      });
      if (token) {
        setAuth(token, updated);
      }
      toast.success('资料已更新');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const onChangePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPwd(true);
    try {
      await changePassword(pwd);
      toast.success('密码已更新，请重新登录');
      clear();
      navigate('/login');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingPwd(false);
    }
  };

  const onDelete = async (post: Post) => {
    if (!window.confirm(`确定删除《${post.title}》吗？`)) {
      return;
    }
    try {
      await deletePost(post.id);
      toast.success('已删除');
      reloadMine();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const onTogglePin = async (post: Post) => {
    try {
      const updated = await setPostPinned(post.id, !post.isPinned);
      // 用接口返回的整条记录替换本地那一行，isPinned / pinnedAt 以后端为准
      setMine((prev) =>
        prev
          ? { ...prev, items: prev.items.map((p) => (p.id === post.id ? updated : p)) }
          : prev,
      );
      toast.success(updated.isPinned ? '已置顶' : '已取消置顶');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold text-slate-800">个人中心</h1>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-700">资料</h2>
        <div className="mb-4 flex items-center gap-3 text-sm text-slate-500">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-indigo-100 text-lg font-semibold text-indigo-700">
            {(user?.displayName || user?.username || '?').slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div className="font-medium text-slate-700">{user?.username}</div>
            <div className="text-xs">{user?.role}</div>
          </div>
        </div>
        <form onSubmit={onSaveProfile} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-slate-600">昵称</label>
              <input
                value={profile.displayName}
                onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">头像 URL</label>
              <input
                value={profile.avatar}
                onChange={(e) => setProfile({ ...profile, avatar: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">简介</label>
            <textarea
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              rows={2}
              className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <button
            disabled={savingProfile}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {savingProfile ? '保存中…' : '保存资料'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-700">我的文章</h2>
        {user?.role === 'reader' && (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
            你当前的角色是「读者」，暂不能发表文章。需要写作权限时，请联系管理员将你提升为「作者」。
          </p>
        )}
        {mine && mine.items.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {mine.items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    p.status === 'published'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
                {p.status === 'published' ? (
                  <button
                    onClick={() => onTogglePin(p)}
                    title={p.isPinned ? '取消置顶' : '置顶到列表最前'}
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                      p.isPinned
                        ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    }`}
                  >
                    {p.isPinned ? '已置顶' : '置顶'}
                  </button>
                ) : (
                  <span className="shrink-0 text-[11px] text-slate-300" title="仅已发布文章可置顶">
                    置顶
                  </span>
                )}
                <Link
                  to={`/post/${encodeURIComponent(p.slug)}`}
                  className="min-w-0 flex-1 truncate text-sm text-slate-700 hover:text-indigo-600"
                >
                  {p.title}
                </Link>
                <span className="hidden text-xs text-slate-400 sm:inline">{formatDate(p.createdAt)}</span>
                <Link to={`/write/${p.id}`} className="text-xs text-indigo-600 hover:underline">
                  编辑
                </Link>
                <button onClick={() => onDelete(p)} className="text-xs text-red-500 hover:underline">
                  删除
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">
            {user?.role === 'reader' ? (
              '还没有文章。'
            ) : (
              <>
                还没有文章，去
                <Link to="/write" className="mx-1 text-indigo-600 hover:underline">
                  写一篇
                </Link>
                吧。
              </>
            )}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-700">我的收藏</h2>
            <p className="mt-1 text-sm text-slate-400">查看你在阅读时收藏的文章。</p>
          </div>
          <Link
            to="/me/favorites"
            className="shrink-0 rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            去查看
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-700">修改密码</h2>
        <form onSubmit={onChangePwd} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="password"
              required
              placeholder="原密码"
              value={pwd.oldPassword}
              onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <input
              type="password"
              required
              placeholder="新密码（至少 8 位）"
              value={pwd.newPassword}
              onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <button
            disabled={savingPwd}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-60"
          >
            {savingPwd ? '提交中…' : '更新密码'}
          </button>
        </form>
      </section>
    </div>
  );
}
