import { useCallback, useEffect, useState } from 'react';
import type { Category } from '@blog/shared';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../../api/categories';
import { getErrorMessage } from '../../api/client';
import { buildCategoryTree, flattenCategoryTree } from '../../lib/category-tree';
import { toast } from '../../store/toast';

export default function AdminCategories() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [draft, setDraft] = useState({ name: '', parentId: '', description: '', sortOrder: '0' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listCategories());
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const options = flattenCategoryTree(buildCategoryTree(items));
  const nameOf = (id: string | null) => items.find((c) => c.id === id)?.name ?? '—';

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) {
      toast.error('请填写分类名称');
      return;
    }
    try {
      await createCategory({
        name: draft.name.trim(),
        parentId: draft.parentId ? Number(draft.parentId) : undefined,
        description: draft.description.trim() || undefined,
        sortOrder: Number(draft.sortOrder) || 0,
      });
      setDraft({ name: '', parentId: '', description: '', sortOrder: '0' });
      toast.success('分类已创建');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const rename = async (c: Category, name: string) => {
    if (!name.trim() || name === c.name) {
      return;
    }
    setBusyId(c.id);
    try {
      await updateCategory(c.id, { name: name.trim() });
      setItems((list) => list.map((x) => (x.id === c.id ? { ...x, name: name.trim() } : x)));
      toast.success('已重命名');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  const changeSort = async (c: Category, sortOrder: number) => {
    setBusyId(c.id);
    try {
      await updateCategory(c.id, { sortOrder });
      setItems((list) => list.map((x) => (x.id === c.id ? { ...x, sortOrder } : x)));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  const onDelete = async (c: Category) => {
    const used = c._count?.posts ?? 0;
    const extra = used > 0 ? `该分类下有 ${used} 篇文章，删除后这些文章将变为「未分类」。` : '';
    if (!window.confirm(`确定删除分类「${c.name}」？${extra}`)) {
      return;
    }
    setBusyId(c.id);
    try {
      await deleteCategory(c.id);
      toast.success('已删除');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-700">分类管理</h2>

      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">名称</label>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-40 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">父分类</label>
          <select
            value={draft.parentId}
            onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}
            className="w-40 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
          >
            <option value="">（顶级）</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">描述</label>
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="w-48 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">排序</label>
          <input
            type="number"
            value={draft.sortOrder}
            onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
            className="w-20 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
        </div>
        <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          新增
        </button>
      </form>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">加载中…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">还没有分类</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-3 font-medium">名称</th>
              <th className="py-2 pr-3 font-medium">slug</th>
              <th className="py-2 pr-3 font-medium">父分类</th>
              <th className="py-2 pr-3 font-medium">文章</th>
              <th className="py-2 pr-3 font-medium">排序</th>
              <th className="py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((c) => (
              <tr key={c.id}>
                <td className="py-2 pr-3">
                  <input
                    defaultValue={c.name}
                    disabled={busyId === c.id}
                    onBlur={(e) => void rename(c, e.target.value)}
                    className="w-36 rounded border border-transparent px-1 py-0.5 text-sm hover:border-slate-200 focus:border-indigo-400 focus:outline-none disabled:opacity-60"
                  />
                </td>
                <td className="py-2 pr-3 text-xs text-slate-400">{c.slug}</td>
                <td className="py-2 pr-3 text-slate-500">{nameOf(c.parentId)}</td>
                <td className="py-2 pr-3 text-slate-500">{c._count?.posts ?? 0}</td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    defaultValue={c.sortOrder}
                    disabled={busyId === c.id}
                    onBlur={(e) => void changeSort(c, Number(e.target.value) || 0)}
                    className="w-16 rounded border border-slate-200 px-1 py-0.5 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-60"
                  />
                </td>
                <td className="py-2">
                  <button
                    disabled={busyId === c.id}
                    onClick={() => void onDelete(c)}
                    className="text-xs text-red-500 hover:underline disabled:opacity-50"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
