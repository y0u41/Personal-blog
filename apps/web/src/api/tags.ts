import type { Tag } from '@blog/shared';
import { api } from './client';

export async function listTags(): Promise<Tag[]> {
  const { data } = await api.get<Tag[]>('/tags');
  return data;
}

/** 单个标签（标签归档页用） */
export async function getTag(slug: string): Promise<Tag> {
  const { data } = await api.get<Tag>(`/tags/${encodeURIComponent(slug)}`);
  return data;
}

// ---------------- 管理端（仅 admin） ----------------

export interface TagPayload {
  name?: string;
  slug?: string;
}

export async function createTag(payload: TagPayload): Promise<Tag> {
  const { data } = await api.post<Tag>('/tags', payload);
  return data;
}

export async function updateTag(id: string, payload: TagPayload): Promise<Tag> {
  const { data } = await api.patch<Tag>(`/tags/${id}`, payload);
  return data;
}

export async function deleteTag(id: string): Promise<void> {
  await api.delete(`/tags/${id}`);
}
