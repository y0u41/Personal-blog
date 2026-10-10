import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ArchiveDay, ArchiveOverview, Paginated, Post } from '@blog/shared';
import { getErrorMessage } from '../api/client';
import { getArchive, getArchiveDays, listPosts } from '../api/posts';
import ArchiveHeatmap from '../components/ArchiveHeatmap';
import Pagination from '../components/Pagination';
import PostCard from '../components/PostCard';
import { toast } from '../store/toast';

const PAGE_SIZE = 10;

export default function Archive() {
  const [params, setParams] = useSearchParams();
  const yearParam = params.get('year');
  const monthParam = params.get('month');
  const year = yearParam ? Number(yearParam) : null;
  const month = monthParam ? Number(monthParam) : null;
  const page = Number(params.get('page') ?? '1') || 1;

  const [overview, setOverview] = useState<ArchiveOverview | null>(null);
  const [days, setDays] = useState<ArchiveDay[]>([]);
  const [data, setData] = useState<Paginated<Post> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getArchive()
      .then(setOverview)
      .catch((err) => toast.error(getErrorMessage(err)));
  }, []);

  // 没有显式选择年份时，热力图默认落在「最近有文章的年份」——比日历年份更有信息量
  const heatYear = year ?? overview?.years[0]?.year ?? new Date().getFullYear();

  useEffect(() => {
    getArchiveDays(heatYear)
      .then((r) => setDays(r.days))
      .catch(() => setDays([]));
  }, [heatYear]);

  useEffect(() => {
    setLoading(true);
    listPosts({
      page,
      pageSize: PAGE_SIZE,
      ...(year != null ? { year, ...(month != null ? { month } : {}) } : {}),
    })
      .then(setData)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [year, month, page]);

  /** 统一的参数改写入口：除显式传入外一律重置页码，避免筛选后停在越界页 */
  const apply = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v == null || v === '') {
        next.delete(k);
      } else {
        next.set(k, v);
      }
    });
    if (!keepPage) {
      next.delete('page');
    }
    setParams(next);
  };

  const selectYear = (y: number | null) =>
    apply({ year: y != null ? String(y) : null, month: null });
  const selectMonth = (y: number, m: number) => apply({ year: String(y), month: String(m) });

  // 年 → 月 的分组视图，避免在 JSX 里反复过滤
  const monthsByYear = useMemo(() => {
    const map = new Map<number, { month: number; count: number }[]>();
    for (const m of overview?.months ?? []) {
      const list = map.get(m.year) ?? [];
      list.push({ month: m.month, count: m.count });
      map.set(m.year, list);
    }
    return map;
  }, [overview]);

  const filterLabel = year == null ? '全部文章' : month == null ? `${year} 年` : `${year} 年 ${month} 月`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-slate-800">归档</h1>
        <span className="text-sm text-slate-400">共 {overview?.total ?? 0} 篇已发布文章</span>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => selectYear(null)}
            className={`rounded-full px-3 py-1 text-sm ${
              year == null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            全部
          </button>
          {(overview?.years ?? []).map((y) => (
            <button
              key={y.year}
              onClick={() => selectYear(y.year)}
              className={`rounded-full px-3 py-1 text-sm ${
                year === y.year
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {y.year}
              <span className="ml-1 text-xs opacity-70">{y.count}</span>
            </button>
          ))}
        </div>

        {overview && overview.total === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">还没有已发布的文章</p>
        ) : (
          <ArchiveHeatmap
            year={heatYear}
            days={days}
            onSelectMonth={(m) => selectMonth(heatYear, m)}
          />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-600">
              {filterLabel}
              <span className="ml-2 font-normal text-slate-400">{data?.meta.total ?? 0} 篇</span>
            </h2>
            {(year != null || month != null) && (
              <button
                onClick={() => apply({ year: null, month: null })}
                className="text-xs text-indigo-600 hover:underline"
              >
                清除筛选
              </button>
            )}
          </div>

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
                onChange={(p) => apply({ page: String(p) }, true)}
              />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center text-slate-400">
              {year == null ? '暂无文章' : '该时间段没有文章'}
            </div>
          )}
        </div>

        <aside>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">随笔档案</h3>
          {(overview?.years ?? []).length === 0 ? (
            <p className="text-xs text-slate-400">暂无归档</p>
          ) : (
            <div className="space-y-3">
              {(overview?.years ?? []).map((y) => (
                <div key={y.year}>
                  <button
                    onClick={() => selectYear(y.year)}
                    className={`text-xs font-semibold ${
                      year === y.year ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'
                    }`}
                  >
                    {y.year} 年（{y.count}）
                  </button>
                  <ul className="mt-1 space-y-0.5 border-l border-slate-200 pl-3">
                    {(monthsByYear.get(y.year) ?? []).map((m) => (
                      <li key={m.month}>
                        <button
                          onClick={() => selectMonth(y.year, m.month)}
                          className={`text-xs ${
                            year === y.year && month === m.month
                              ? 'font-medium text-indigo-600'
                              : 'text-slate-500 hover:text-indigo-600'
                          }`}
                        >
                          {m.month} 月（{m.count}）
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <Link to="/rank" className="text-xs text-indigo-600 hover:underline">
              查看排行榜 →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
