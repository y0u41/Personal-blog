import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ArchiveOverview, Post, Tag } from '@blog/shared';
import { getArchive, getHotPosts } from '../api/posts';
import { listTags } from '../api/tags';

const ARCHIVE_PREVIEW = 6;

/**
 * 首页 / 标签页 / 分类页共用的侧栏：热门文章 + 随笔档案 + 标签云。
 * 各区块各自独立降级——任一接口失败只隐藏该区块，不影响主内容。
 */
export default function Sidebar() {
  const [hot, setHot] = useState<Post[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [archive, setArchive] = useState<ArchiveOverview | null>(null);

  useEffect(() => {
    getHotPosts(5)
      .then(setHot)
      .catch(() => undefined);
    listTags()
      .then(setTags)
      .catch(() => undefined);
    getArchive()
      .then(setArchive)
      .catch(() => undefined);
  }, []);

  // 后端已按「已发布」过滤计数，0 篇的标签不展示，避免侧栏被空标签淹没
  const visibleTags = tags.filter((t) => (t._count?.postTags ?? 0) > 0);
  // 随笔档案只展示最近的若干个月，全量入口交给 /archive 页
  const recentMonths = (archive?.months ?? []).slice(0, ARCHIVE_PREVIEW);

  if (hot.length === 0 && visibleTags.length === 0 && recentMonths.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {hot.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">热门文章</h3>
          <ol className="space-y-2">
            {hot.map((p, i) => (
              <li key={p.id} className="flex gap-2 text-sm leading-snug">
                <span
                  className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-[10px] font-semibold ${
                    i < 3 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {i + 1}
                </span>
                <Link
                  to={`/post/${encodeURIComponent(p.slug)}`}
                  className="line-clamp-2 text-slate-600 hover:text-indigo-600"
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ol>
          <Link to="/rank" className="mt-2 inline-block text-xs text-indigo-600 hover:underline">
            更多榜单 →
          </Link>
        </section>
      )}

      {recentMonths.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">随笔档案</h3>
          <ul className="space-y-1 text-sm">
            {recentMonths.map((m) => (
              <li key={`${m.year}-${m.month}`}>
                <Link
                  to={`/archive?year=${m.year}&month=${m.month}`}
                  className="flex items-center justify-between text-slate-600 hover:text-indigo-600"
                >
                  <span>
                    {m.year} 年 {m.month} 月
                  </span>
                  <span className="text-xs text-slate-400">{m.count}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/archive" className="mt-2 inline-block text-xs text-indigo-600 hover:underline">
            全部归档 →
          </Link>
        </section>
      )}

      {visibleTags.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">标签</h3>
          <div className="flex flex-wrap gap-2">
            {visibleTags.map((t) => (
              <Link
                key={t.id}
                to={`/tag/${encodeURIComponent(t.slug)}`}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600"
              >
                {t.name}
                <span className="ml-1 text-[10px] text-slate-400">
                  {t._count?.postTags}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
