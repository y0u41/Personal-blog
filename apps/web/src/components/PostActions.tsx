import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { InteractionState } from '@blog/shared';
import { favoritePost, likePost, unfavoritePost, unlikePost } from '../api/posts';
import { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/auth';
import { toast } from '../store/toast';

interface Props {
  postId: string;
  /** 详情接口返回的初始互动状态 */
  initial: InteractionState;
}

/**
 * 文章页的点赞 / 收藏按钮。
 * 未登录时不做静默失败，而是提示并跳登录（带 redirect 回跳），
 * 因为这两个动作在服务端是必须带身份的。
 */
export default function PostActions({ postId, initial }: Props) {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<InteractionState>(initial);
  const [pending, setPending] = useState<'like' | 'favorite' | null>(null);

  const ensureLoggedIn = (): boolean => {
    if (token) {
      return true;
    }
    toast.info('登录后即可点赞与收藏');
    navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
    return false;
  };

  const run = async (kind: 'like' | 'favorite') => {
    if (pending || !ensureLoggedIn()) {
      return;
    }
    setPending(kind);
    try {
      const next =
        kind === 'like'
          ? state.liked
            ? await unlikePost(postId)
            : await likePost(postId)
          : state.favorited
            ? await unfavoritePost(postId)
            : await favoritePost(postId);
      setState(next);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="my-8 flex items-center justify-center gap-4">
      <button
        onClick={() => run('like')}
        disabled={pending != null}
        aria-pressed={state.liked}
        className={`inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm transition disabled:opacity-60 ${
          state.liked
            ? 'border-indigo-600 bg-indigo-600 text-white'
            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
        }`}
      >
        <span aria-hidden>{state.liked ? '👍' : '👍🏻'}</span>
        <span>{state.liked ? '已赞' : '点赞'}</span>
        <span className="tabular-nums">{state.likeCount}</span>
      </button>

      <button
        onClick={() => run('favorite')}
        disabled={pending != null}
        aria-pressed={state.favorited}
        className={`inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm transition disabled:opacity-60 ${
          state.favorited
            ? 'border-amber-500 bg-amber-500 text-white'
            : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-600'
        }`}
      >
        <span aria-hidden>{state.favorited ? '⭐' : '☆'}</span>
        <span>{state.favorited ? '已收藏' : '收藏'}</span>
        <span className="tabular-nums">{state.favoriteCount}</span>
      </button>
    </div>
  );
}
