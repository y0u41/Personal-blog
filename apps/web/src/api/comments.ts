import type {
  Comment,
  CommentListQuery,
  CommentStatus,
  CommentTreeResult,
  CreateCommentPayload,
  Paginated,
} from '@blog/shared';
import { api } from './client';

// 公开：某文章下已过审评论（服务端已组装为树）
export async function listComments(slug: string): Promise<CommentTreeResult> {
  const { data } = await api.get<CommentTreeResult>(
    `/posts/${encodeURIComponent(slug)}/comments`,
  );
  return data;
}

// 公开（可选登录）：发表评论。游客需带 authorName；返回体含 status 用于提示是否待审核
export async function createComment(
  slug: string,
  payload: CreateCommentPayload,
): Promise<Comment> {
  const { data } = await api.post<Comment>(
    `/posts/${encodeURIComponent(slug)}/comments`,
    payload,
  );
  return data;
}

export async function deleteComment(id: string): Promise<void> {
  await api.delete(`/comments/${id}`);
}

// ---------------- 管理端（仅 admin）----------------

export async function listAllComments(
  query: CommentListQuery = {},
): Promise<Paginated<Comment>> {
  const { data } = await api.get<Paginated<Comment>>('/comments', { params: query });
  return data;
}

export async function updateCommentStatus(
  id: string,
  status: CommentStatus,
): Promise<Comment> {
  const { data } = await api.patch<Comment>(`/comments/${id}`, { status });
  return data;
}
