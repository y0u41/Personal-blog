import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PostDetail as PostDetailModel } from '@blog/shared';
import { getErrorMessage } from '../api/client';
import { deletePost, getPost } from '../api/posts';
import CommentSection from '../components/CommentSection';
import MarkdownView from '../components/MarkdownView';
import PostActions from '../components/PostActions';
import { formatDate } from '../lib/format';
import { useAuthStore } from '../store/auth';
import { toast } from '../store/toast';

export default function PostDetail() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [post, setPost] = useState<PostDetailModel | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    getPost(slug)
      .then(setPost)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [slug]);

  const onDelete = useCallback(async () => {
    if (!post || !window.confirm('确定删除这篇文章吗？此操作不可恢复。')) {
      return;
    }
    try {
      await deletePost(post.id);
      toast.success('已删除');
      navigate('/');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [post, navigate]);

  if (loading) {
    return <div className="py-20 text-center text-slate-400">加载中…</div>;
  }
  if (error || !post) {
    return (
      <div className="py-20 text-center text-slate-400">
        {error || '文章不存在'}
        <div className="mt-4">
          <Link to="/" className="text-indigo-600 hover:underline">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  // 与后端一致：管理员可管任意文章，作者仅可管自己的；读者无发文/编辑权限
  const canManage =
    user != null &&
    (user.role === 'admin' ||
      (user.role === 'author' && post.authorId === user.id));

  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="flex flex-wrap items-center gap-2 text-3xl font-bold text-slate-800">
            {post.isPinned && (
              <span className="rounded bg-rose-50 px-2 py-0.5 text-sm font-medium text-rose-600">
                置顶
              </span>
            )}
            {post.title}
          </h1>
          {canManage && (
            <div className="flex shrink-0 gap-2 text-sm">
              <Link
                to={`/write/${post.id}`}
                className="rounded-md border border-slate-200 px-3 py-1 hover:bg-slate-100"
              >
                编辑
              </Link>
              <button
                onClick={onDelete}
                className="rounded-md border border-red-200 px-3 py-1 text-red-600 hover:bg-red-50"
              >
                删除
              </button>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
          <span>{post.author?.displayName || post.author?.username}</span>
          <span>{formatDate(post.publishedAt ?? post.createdAt)}</span>
          <span>👁 {post.views}</span>
          {post.category && (
            <Link to={`/category/${encodeURIComponent(post.category.slug)}`} className="text-indigo-600">
              {post.category.name}
            </Link>
          )}
        </div>
        {post.postTags && post.postTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {post.postTags.map((pt) => (
              <Link
                key={pt.tag.id}
                to={`/tag/${encodeURIComponent(pt.tag.slug)}`}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
              >
                #{pt.tag.name}
              </Link>
            ))}
          </div>
        )}
      </header>

      {post.coverImage && (
        <img src={post.coverImage} alt={post.title} className="mb-6 w-full rounded-xl object-cover" />
      )}

      <MarkdownView content={post.content ?? ''} />

      <PostActions
        postId={post.id}
        initial={{
          liked: post.liked,
          favorited: post.favorited,
          likeCount: post.likeCount,
          favoriteCount: post.favoriteCount,
        }}
      />

      {/* 上下篇：只在已发布文章之间导航 */}
      {(post.prev || post.next) && (
        <nav className="grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2">
          <div>
            {post.prev && (
              <Link
                to={`/post/${encodeURIComponent(post.prev.slug)}`}
                className="block rounded-lg border border-slate-200 bg-white p-3 text-sm transition hover:border-indigo-300"
              >
                <span className="text-xs text-slate-400">← 上一篇</span>
                <div className="mt-1 line-clamp-1 text-slate-700">{post.prev.title}</div>
              </Link>
            )}
          </div>
          <div>
            {post.next && (
              <Link
                to={`/post/${encodeURIComponent(post.next.slug)}`}
                className="block rounded-lg border border-slate-200 bg-white p-3 text-sm transition hover:border-indigo-300 sm:text-right"
              >
                <span className="text-xs text-slate-400">下一篇 →</span>
                <div className="mt-1 line-clamp-1 text-slate-700">{post.next.title}</div>
              </Link>
            )}
          </div>
        </nav>
      )}

      {post.related.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-600">相关文章</h2>
          <ul className="space-y-2">
            {post.related.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/post/${encodeURIComponent(r.slug)}`}
                  className="flex items-baseline justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition hover:border-indigo-300"
                >
                  <span className="line-clamp-1 text-slate-700">{r.title}</span>
                  <span className="shrink-0 text-xs text-slate-400">👁 {r.views}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CommentSection slug={post.slug} />
    </article>
  );
}
