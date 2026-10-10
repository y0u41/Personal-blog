import type { AuthResult } from '@blog/shared';
import { api } from './client';

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface ChangePasswordPayload {
  oldPassword: string;
  newPassword: string;
}

export async function register(payload: RegisterPayload): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>('/auth/register', payload);
  return data;
}

export async function login(payload: LoginPayload): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>('/auth/login', payload);
  return data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await api.post('/auth/password', payload);
}
