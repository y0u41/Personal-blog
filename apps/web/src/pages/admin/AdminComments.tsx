import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CommentStatus as STATUSES, type Comment, type CommentStatus } from '@blog/shared';
import { getErrorMessage } from '../../api/client';
import { deleteComment, listAllComments, updateCommentStatus } from '../../api/comments';
import Pagination from '../../components/Pagination';
import { formatDate } from '../../lib/format';
import { toast } from '../../store/toast';

const STATUS_LABEL: Record<CommentStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  spam: '垃圾',
};

const STATUS_CLASS: Record<CommentStatus, string> = {
  pending: 'bg-amber-50 text-amber-600',
  approved: 'bg-emerald-50 text-emerald-600',
  spam: 'bg-slate-100 text-slate-500',
};

const PAGE_SIZE = 20;

export default function AdminComments() {
  const [items, setItems] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | CommentStatus>('pending');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAllComments({
        page,
        pageSize: PAGE_SIZE,
        status: status || undefined,
      });
      setItems(res.items);
      setTotal(res.meta.total);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const setCommentStatus = async (c: Comment, next: CommentStatus) => {
    setBusyId(c.id);
    try {
      const updated = await updateCommentStatus(c.id, next);
      // 当前有状态筛选时，改后不再属于该筛选 → 直接从列表移除
      setItems((list) =>
        status && updated.status !== status
          ? list.filter((x) => x.id !== c.id)
          : list.map((x) => (x.id === c.id ? updated : x)),
      );
      setTotal((t) => (status && updated.status !== status ? Math.max(0, t - 1) : t));
      toast.success(`已标记为「${STATUS_LABEL[next]}」`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  const onDelete = async (c: Comment) => {
    if (!window.confirm('删除该评论及其全部回复？')) {
      return;
    }
    setBusyId(c.id);
    try {
      await deleteComment(c.id);
      setItems((list) => list.filter((x) => x.id !== c.id));
      setTotal((t) => Math.max(0, t - 1));
      toast.success('已删除');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold text-slate-700">评论审核</h2>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | CommentStatus);
            setPage(1);
          }}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
        >
          <option value="">全部状态</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          onClick={() => void load()}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          刷新
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-400">加载中…</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">没有符合条件的评论</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((c) => (
            <li key={c.id} className="py-3">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className={`rounded px-1.5 py-0.5 ${STATUS_CLASS[c.status]}`}>
                  {STATUS_LABEL[c.status]}
                </span>
                <span className="font-medium text-slate-600">
                  {c.user?.displayName || c.authorName || '匿名'}
                </span>
                <span className="text-slate-400">{formatDate(c.createdAt)}</span>
                {c.parentId && <span className="text-slate-400">· 回复</span>}
                {c.post && (
                  <Link
                    to={`/post/${encodeURIComponent(c.post.slug)}`}
                    className="ml-auto truncate text-indigo-600 hover:underline"
                  >
                    《{c.post.title}》
                  </Link>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{c.content}</p>
              <div className="mt-2 flex gap-3 text-xs">
                {c.status !== 'approved' && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => void setCommentStatus(c, 'approved')}
                    className="text-emerald-600 hover:underline disabled:opacity-50"
                  >
                    通过
                  </button>
                )}
                {c.status !== 'pending' && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => void setCommentStatus(c, 'pending')}
                    className="text-amber-600 hover:underline disabled:opacity-50"
                  >
                    待审
                  </button>
                )}
                {c.status !== 'spam' && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => void setCommentStatus(c, 'spam')}
                    className="text-slate-500 hover:underline disabled:opacity-50"
                  >
                    标记垃圾
                  </button>
                )}
                <button
                  disabled={busyId === c.id}
                  onClick={() => void onDelete(c)}
                  className="text-red-500 hover:underline disabled:opacity-50"
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  );
}
