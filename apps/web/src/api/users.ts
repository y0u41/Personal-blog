import type {
  AdminUser,
  Paginated,
  Post,
  PublicUser,
  UserListQuery,
  UserRole,
} from '@blog/shared';
import { api } from './client';

export interface UpdateProfilePayload {
  displayName?: string;
  avatar?: string;
  bio?: string;
}

export interface MyPostsQuery {
  page?: number;
  pageSize?: number;
  status?: string;
}

export async function getMe(): Promise<PublicUser> {
  const { data } = await api.get<PublicUser>('/users/me');
  return data;
}

export async function updateMe(payload: UpdateProfilePayload): Promise<PublicUser> {
  const { data } = await api.patch<PublicUser>('/users/me', payload);
  return data;
}

export async function getMyPosts(query: MyPostsQuery = {}): Promise<Paginated<Post>> {
  const { data } = await api.get<Paginated<Post>>('/users/me/posts', { params: query });
  return data;
}

export interface FavoritesQuery {
  page?: number;
  pageSize?: number;
}

/** 我的收藏（需登录） */
export async function getMyFavorites(
  query: FavoritesQuery = {},
): Promise<Paginated<Post>> {
  const { data } = await api.get<Paginated<Post>>('/users/me/favorites', {
    params: query,
  });
  return data;
}

// ---------------- 管理端（仅 admin） ----------------

export async function listUsers(query: UserListQuery = {}): Promise<Paginated<AdminUser>> {
  const { data } = await api.get<Paginated<AdminUser>>('/users', { params: query });
  return data;
}

/** 提升作者 / 调整角色 */
export async function updateUserRole(id: string, role: UserRole): Promise<AdminUser> {
  const { data } = await api.patch<AdminUser>(`/users/${id}/role`, { role });
  return data;
}

/** 启用（1）/ 停用（0）账号 */
export async function updateUserStatus(
  id: string,
  status: 0 | 1,
): Promise<AdminUser> {
  const { data } = await api.patch<AdminUser>(`/users/${id}/status`, { status });
  return data;
}
