import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Category, Paginated, Post } from '@blog/shared';
import { listCategories } from '../api/categories';
import { getErrorMessage } from '../api/client';
import { listPosts } from '../api/posts';
import Pagination from '../components/Pagination';
import PostCard from '../components/PostCard';
import Sidebar from '../components/Sidebar';
import { toast } from '../store/toast';

const PAGE_SIZE = 10;

export default function Home() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? '1') || 1;
  const categoryId = params.get('categoryId') ?? '';
  const keyword = params.get('keyword') ?? '';

  const [data, setData] = useState<Paginated<Post> | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    listPosts({
      page,
      pageSize: PAGE_SIZE,
      categoryId: categoryId || undefined,
      keyword: keyword || undefined,
    })
      .then(setData)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [page, categoryId, keyword]);

  const setFilter = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v) {
        next.set(k, v);
      } else {
        next.delete(k);
      }
    });
    if (!('page' in patch)) {
      next.delete('page');
    }
    setParams(next);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
      <div>
        {keyword && (
          <p className="mb-3 text-sm text-slate-500">
            “<span className="font-medium text-slate-700">{keyword}</span>” 的搜索结果
            <button onClick={() => setFilter({ keyword: '' })} className="ml-2 text-indigo-600 hover:underline">
              清除
            </button>
          </p>
        )}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : data && data.items.length > 0 ? (
          <>
            <div className="space-y-3">
              {data.items.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
            <Pagination
              page={data.meta.page}
              pageSize={data.meta.pageSize}
              total={data.meta.total}
              onChange={(p) => setFilter({ page: String(p) })}
            />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center text-slate-400">
            暂无文章
          </div>
        )}
      </div>

      <aside className="space-y-6 lg:pt-1">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">分类</h3>
          <div className="flex flex-wrap gap-2 lg:flex-col">
            <button
              onClick={() => setFilter({ categoryId: '' })}
              className={`rounded-full px-3 py-1 text-sm lg:rounded-md lg:text-left ${
                !categoryId ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              全部
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilter({ categoryId: c.id })}
                className={`rounded-full px-3 py-1 text-sm lg:rounded-md lg:text-left ${
                  categoryId === c.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {c.name}
                {c._count ? <span className="ml-1 text-xs opacity-60">{c._count.posts}</span> : null}
              </button>
            ))}
          </div>
        </section>

        <Sidebar />
      </aside>
    </div>
  );
}
