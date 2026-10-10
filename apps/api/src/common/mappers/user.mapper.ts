import { User } from '@prisma/client';
import { UserRole } from '@blog/shared';

// 统一把 Prisma User 实体映射为对外公开的用户信息（剔除 passwordHash 等敏感字段）。
export function toPublicUser(user: User) {
  return {
    id: user.id.toString(),
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role as UserRole,
    status: user.status,
    avatar: user.avatar,
    bio: user.bio,
  };
}

/** 管理端列表所需的行结构（比公开用户多出邮箱/状态/注册时间/文章数） */
export interface AdminUserRow {
  id: bigint;
  username: string;
  email: string;
  displayName: string;
  avatar: string | null;
  bio: string | null;
  role: string;
  status: number;
  createdAt: Date;
  _count: { posts: number };
}

// 管理端用户信息：仅管理员可见，因此保留邮箱与账号状态
export function toAdminUser(row: AdminUserRow) {
  return {
    id: row.id.toString(),
    username: row.username,
    email: row.email,
    displayName: row.displayName,
    role: row.role as UserRole,
    status: row.status,
    avatar: row.avatar,
    bio: row.bio,
    createdAt: row.createdAt.toISOString(),
    postCount: row._count.posts,
  };
}
