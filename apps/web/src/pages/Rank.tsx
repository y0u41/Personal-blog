import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Paginated, Post, RankType } from '@blog/shared';
import { getErrorMessage } from '../api/client';
import { getRank } from '../api/posts';
import Pagination from '../components/Pagination';
import { formatDate } from '../lib/format';
import { toast } from '../store/toast';

const PAGE_SIZE = 20;

const TABS: { key: RankType; label: string; hint: string }[] = [
  { key: 'views', label: '阅读榜', hint: '按累计浏览量排序' },
  { key: 'comments', label: '评论榜', hint: '按已过审评论数排序' },
  { key: 'likes', label: '推荐榜', hint: '按点赞数排序' },
];

function metricOf(post: Post, type: RankType): { value: number; unit: string } {
  if (type === 'comments') return { value: post.commentCount ?? 0, unit: '评论' };
  if (type === 'likes') return { value: post.likeCount ?? 0, unit: '推荐' };
  return { value: post.views ?? 0, unit: '阅读' };
}

export default function Rank() {
  const [params, setParams] = useSearchParams();
  const rawType = params.get('type') as RankType | null;
  const type: RankType = TABS.some((t) => t.key === rawType) ? (rawType as RankType) : 'views';
  const page = Number(params.get('page') ?? '1') || 1;

  const [data, setData] = useState<Paginated<Post> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getRank({ type, page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [type, page]);

  const switchType = (next: RankType) => {
    const p = new URLSearchParams(params);
    p.set('type', next);
    p.delete('page');
    setParams(p);
  };

  const active = TABS.find((t) => t.key === type) ?? TABS[0];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">排行榜</h1>
        <p className="mt-1 text-sm text-slate-400">
          共 {data?.meta.total ?? 0} 篇已发布文章 · {active.hint}
        </p>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchType(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              t.key === type
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {data.items.map((p, i) => {
              const metric = metricOf(p, type);
              const rankNo = (data.meta.page - 1) * data.meta.pageSize + i + 1;
              return (
                <li key={p.id} className="flex items-center gap-3 p-4">
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-semibold ${
                      rankNo <= 3 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {rankNo}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {p.isPinned && (
                        <span className="shrink-0 rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-600">
                          置顶
                        </span>
                      )}
                      <Link
                        to={`/post/${encodeURIComponent(p.slug)}`}
                        className="truncate font-medium text-slate-800 hover:text-indigo-600"
                      >
                        {p.title}
                      </Link>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                      <span>{p.author?.displayName || p.author?.username}</span>
                      <span>{formatDate(p.publishedAt ?? p.createdAt)}</span>
                      {p.category && <span>{p.category.name}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-indigo-600">{metric.value}</div>
                    <div className="text-[11px] text-slate-400">{metric.unit}</div>
                  </div>
                </li>
              );
            })}
          </ol>
          <Pagination
            page={data.meta.page}
            pageSize={data.meta.pageSize}
            total={data.meta.total}
            onChange={(p) => {
              const next = new URLSearchParams(params);
              next.set('page', String(p));
              setParams(next);
            }}
          />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center text-slate-400">
          暂无文章
        </div>
      )}
    </div>
  );
}
