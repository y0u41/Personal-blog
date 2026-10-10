import type { Category } from '@blog/shared';
import { api } from './client';

export async function listCategories(): Promise<Category[]> {
  const { data } = await api.get<Category[]>('/categories');
  return data;
}

// ---------------- 管理端（仅 admin） ----------------

export interface CategoryPayload {
  name?: string;
  slug?: string;
  parentId?: number | null;
  description?: string;
  sortOrder?: number;
}

export async function createCategory(payload: CategoryPayload): Promise<Category> {
  const { data } = await api.post<Category>('/categories', payload);
  return data;
}

export async function updateCategory(
  id: string,
  payload: CategoryPayload,
): Promise<Category> {
  const { data } = await api.patch<Category>(`/categories/${id}`, payload);
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/categories/${id}`);
}
