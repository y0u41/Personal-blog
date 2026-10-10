import { useCallback, useEffect, useState } from 'react';
import type { Tag } from '@blog/shared';
import { createTag, deleteTag, listTags, updateTag } from '../../api/tags';
import { getErrorMessage } from '../../api/client';
import { toast } from '../../store/toast';

export default function AdminTags() {
  const [items, setItems] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listTags());
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('请填写标签名称');
      return;
    }
    try {
      await createTag({ name: name.trim() });
      setName('');
      toast.success('标签已创建');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const rename = async (t: Tag, next: string) => {
    if (!next.trim() || next === t.name) {
      return;
    }
    setBusyId(t.id);
    try {
      await updateTag(t.id, { name: next.trim() });
      setItems((list) => list.map((x) => (x.id === t.id ? { ...x, name: next.trim() } : x)));
      toast.success('已重命名');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  const onDelete = async (t: Tag) => {
    const used = t._count?.postTags ?? 0;
    const extra = used > 0 ? `该标签已用于 ${used} 篇文章，删除后关联将被移除。` : '';
    if (!window.confirm(`确定删除标签「${t.name}」？${extra}`)) {
      return;
    }
    setBusyId(t.id);
    try {
      await deleteTag(t.id);
      setItems((list) => list.filter((x) => x.id !== t.id));
      toast.success('已删除');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-700">标签管理</h2>

      <form onSubmit={onCreate} className="flex items-end gap-2 rounded-lg bg-slate-50 p-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">名称</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-48 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
        </div>
        <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          新增
        </button>
      </form>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">加载中…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">还没有标签</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm"
            >
              <span className="text-slate-400">#</span>
              <input
                defaultValue={t.name}
                disabled={busyId === t.id}
                onBlur={(e) => void rename(t, e.target.value)}
                className="w-24 rounded border border-transparent px-1 text-sm hover:border-slate-200 focus:border-indigo-400 focus:outline-none disabled:opacity-60"
              />
              <span className="text-xs text-slate-400">{t._count?.postTags ?? 0}</span>
              <button
                disabled={busyId === t.id}
                onClick={() => void onDelete(t)}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                title="删除"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
