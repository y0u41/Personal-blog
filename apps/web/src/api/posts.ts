import type {
  ArchiveDay,
  ArchiveOverview,
  CreatePostPayload,
  InteractionState,
  Paginated,
  Post,
  PostDetail,
  PostListQuery,
  RankListQuery,
} from '@blog/shared';
import { api } from './client';

export async function listPosts(query: PostListQuery = {}): Promise<Paginated<Post>> {
  const { data } = await api.get<Paginated<Post>>('/posts', { params: query });
  return data;
}

export async function getPost(idOrSlug: string): Promise<PostDetail> {
  const { data } = await api.get<PostDetail>(`/posts/${encodeURIComponent(idOrSlug)}`);
  return data;
}

/** 热门文章（按浏览量倒序） */
export async function getHotPosts(limit = 5): Promise<Post[]> {
  const { data } = await api.get<Post[]>('/posts/hot', { params: { limit } });
  return data;
}

/** 归档总览（年月篇数） */
export async function getArchive(): Promise<ArchiveOverview> {
  const { data } = await api.get<ArchiveOverview>('/posts/archive');
  return data;
}

/** 年度热力图：某一年内每天的发文量 */
export async function getArchiveDays(year: number): Promise<{ year: number; days: ArchiveDay[] }> {
  const { data } = await api.get<{ year: number; days: ArchiveDay[] }>('/posts/archive/days', {
    params: { year },
  });
  return data;
}

/** 排行榜（阅读 / 评论 / 推荐 总榜） */
export async function getRank(query: RankListQuery = {}): Promise<Paginated<Post>> {
  const { data } = await api.get<Paginated<Post>>('/posts/rank', { params: query });
  return data;
}

/** 置顶 / 取消置顶（作者或管理员） */
export async function setPostPinned(id: string, pinned: boolean): Promise<Post> {
  const { data } = await api.patch<Post>(`/posts/${id}/pin`, { pinned });
  return data;
}

// ---------------- 互动（需登录） ----------------

export async function likePost(id: string): Promise<InteractionState> {
  const { data } = await api.post<InteractionState>(`/posts/${id}/like`);
  return data;
}

export async function unlikePost(id: string): Promise<InteractionState> {
  const { data } = await api.delete<InteractionState>(`/posts/${id}/like`);
  return data;
}

export async function favoritePost(id: string): Promise<InteractionState> {
  const { data } = await api.post<InteractionState>(`/posts/${id}/favorite`);
  return data;
}

export async function unfavoritePost(id: string): Promise<InteractionState> {
  const { data } = await api.delete<InteractionState>(`/posts/${id}/favorite`);
  return data;
}

export async function createPost(payload: CreatePostPayload): Promise<Post> {
  const { data } = await api.post<Post>('/posts', payload);
  return data;
}

export async function updatePost(
  id: string,
  payload: Partial<CreatePostPayload>,
): Promise<Post> {
  const { data } = await api.patch<Post>(`/posts/${id}`, payload);
  return data;
}

export async function deletePost(id: string): Promise<void> {
  await api.delete(`/posts/${id}`);
}
