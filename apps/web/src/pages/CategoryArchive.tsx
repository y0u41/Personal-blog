import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Category, Paginated, Post } from '@blog/shared';
import { listCategories } from '../api/categories';
import { getErrorMessage } from '../api/client';
import { listPosts } from '../api/posts';
import Pagination from '../components/Pagination';
import PostCard from '../components/PostCard';
import { toast } from '../store/toast';

const PAGE_SIZE = 10;

export default function CategoryArchive() {
  const { slug = '' } = useParams();
  const [category, setCategory] = useState<Category | null>(null);
  const [data, setData] = useState<Paginated<Post> | null>(null);
  const [page, setPage] = useState(1);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCategories()
      .then((list) => {
        const found = list.find((c) => c.slug === slug) ?? null;
        setCategory(found);
        if (!found) {
          setNotFound(true);
          setLoading(false);
        }
      })
      .catch(() => undefined);
  }, [slug]);

  useEffect(() => {
    if (!category) {
      return;
    }
    setLoading(true);
    listPosts({ page, pageSize: PAGE_SIZE, categoryId: category.id })
      .then(setData)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [category, page]);

  if (notFound) {
    return (
      <div className="py-20 text-center text-slate-400">
        分类不存在
        <div className="mt-4">
          <Link to="/" className="text-indigo-600 hover:underline">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-slate-800">
        分类：{category?.name}
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
          该分类下暂无文章
        </div>
      )}
    </div>
  );
}
