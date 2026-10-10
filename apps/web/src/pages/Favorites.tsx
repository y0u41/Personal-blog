import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Paginated, Post } from '@blog/shared';
import { getErrorMessage } from '../api/client';
import { getMyFavorites } from '../api/users';
import Pagination from '../components/Pagination';
import PostCard from '../components/PostCard';
import { toast } from '../store/toast';

const PAGE_SIZE = 10;

export default function Favorites() {
  const [data, setData] = useState<Paginated<Post> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getMyFavorites({ page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          我的收藏
          <span className="ml-2 text-sm font-normal text-slate-400">
            共 {data?.meta.total ?? 0} 篇
          </span>
        </h1>
        <Link to="/me" className="text-sm text-indigo-600 hover:underline">
          返回个人中心
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
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
            onChange={setPage}
          />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center text-slate-400">
          还没有收藏任何文章
          <div className="mt-3">
            <Link to="/" className="text-indigo-600 hover:underline">
              去首页逛逛
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
