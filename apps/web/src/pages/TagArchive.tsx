import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Paginated, Post, Tag } from '@blog/shared';
import { getErrorMessage } from '../api/client';
import { listPosts } from '../api/posts';
import { getTag } from '../api/tags';
import Pagination from '../components/Pagination';
import PostCard from '../components/PostCard';
import Sidebar from '../components/Sidebar';
import { toast } from '../store/toast';

const PAGE_SIZE = 10;

export default function TagArchive() {
  const { slug = '' } = useParams();
  const [tag, setTag] = useState<Tag | null>(null);
  const [data, setData] = useState<Paginated<Post> | null>(null);
  const [page, setPage] = useState(1);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPage(1);
    setNotFound(false);
    setTag(null);
    getTag(slug)
      .then(setTag)
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [slug]);

  useEffect(() => {
    if (!tag) {
      return;
    }
    setLoading(true);
    listPosts({ page, pageSize: PAGE_SIZE, tagSlug: tag.slug })
      .then(setData)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [tag, page]);

  if (notFound) {
    return (
      <div className="py-20 text-center text-slate-400">
        标签不存在
        <div className="mt-4">
          <Link to="/" className="text-indigo-600 hover:underline">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
      <div>
        <h1 className="mb-5 text-2xl font-bold text-slate-800">
          标签：{tag?.name}
          <span className="ml-2 text-sm font-normal text-slate-400">
            共 {data?.meta.total ?? 0} 篇
          </span>
        </h1>
        {loading ? (
          <div className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
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
              onChange={setPage}
            />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center text-slate-400">
            该标签下暂无文章
          </div>
        )}
      </div>

      <aside className="lg:pt-1">
        <Sidebar />
      </aside>
    </div>
  );
}
