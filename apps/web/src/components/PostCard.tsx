import { Link } from 'react-router-dom';
import type { Post } from '@blog/shared';
import { formatDate } from '../lib/format';

export default function PostCard({ post }: { post: Post }) {
  return (
    <article className="group flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-300 hover:shadow-sm">
      {post.coverImage && (
        <img
          src={post.coverImage}
          alt={post.title}
          className="hidden h-24 w-36 shrink-0 rounded-lg object-cover sm:block"
        />
      )}
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 group-hover:text-indigo-600">
          {post.isPinned && (
            <span className="shrink-0 rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-600">
              置顶
            </span>
          )}
          <Link className="truncate" to={`/post/${encodeURIComponent(post.slug)}`}>
            {post.title}
          </Link>
        </h2>
        {post.summary && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{post.summary}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span>{post.author?.displayName || post.author?.username}</span>
          <span>{formatDate(post.publishedAt ?? post.createdAt)}</span>
          <span>👁 {post.views}</span>
          <span>💬 {post.commentCount ?? 0}</span>
          <span>👍 {post.likeCount ?? 0}</span>
          <span>⭐ {post.favoriteCount ?? 0}</span>
          {post.category && (
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600">{post.category.name}</span>
          )}
        </div>
      </div>
    </article>
  );
}
