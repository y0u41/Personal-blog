// 跨前后端共享的领域类型与枚举（仅类型/常量，不含运行时代码）。

// UserRole：同时提供运行时数组（供 class-validator 的 @IsIn 使用）与类型
export const UserRole = ["admin", "author", "reader"] as const;
export type UserRole = (typeof UserRole)[number];

// 能发表文章的角色（作者/管理员），用于前端入口显隐与后端路由门禁
export const AUTHOR_ROLES: readonly UserRole[] = ["admin", "author"];

// PostStatus：同时提供运行时数组（供 class-validator 的 @IsEnum 使用）与类型
export const PostStatus = ["draft", "published", "archived"] as const;
export type PostStatus = (typeof PostStatus)[number];

// CommentStatus：同时提供运行时数组（供 class-validator 的 @IsIn 使用）与类型
export const CommentStatus = ["pending", "approved", "spam"] as const;
export type CommentStatus = (typeof CommentStatus)[number];

// 排行榜维度：阅读 / 评论 / 推荐（点赞）。
// 用 const 数组 + 类型，供 class-validator 的 @IsIn 使用（与 UserRole 同一套写法）。
export const RankType = ["views", "comments", "likes"] as const;
export type RankType = (typeof RankType)[number];

// 统一响应体
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
}

// 分页元信息
export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  items: T[];
  meta: PageMeta;
}
