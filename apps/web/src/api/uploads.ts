import type { UploadResult } from '@blog/shared';
import { api } from './client';

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

/** 前端先校验类型与大小（后端仍会二次校验，不可只依赖前端） */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return '仅支持 jpg / png / webp / gif 图片';
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return '图片大小不能超过 5MB';
  }
  return null;
}

export async function uploadImage(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  // 不手动设置 Content-Type：交由浏览器带上 multipart boundary
  const { data } = await api.post<UploadResult>('/uploads', form);
  return data;
}
