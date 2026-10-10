// 前后端共享的 API 响应类型（对应后端 BigInt→string 序列化后的结构）。
// 仅类型声明，不含运行时代码。
import type { CommentStatus, PageMeta, PostStatus, RankType, UserRole } from "./types";

export interface PublicUser {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  avatar: string | null;
  bio: string | null;
  role: UserRole;
  status?: number;
}

// ---------------- 管理端：用户 ----------------

/** 管理端用户列表项（比公开用户多出邮箱、状态、注册时间与文章数） */
export interface AdminUser extends PublicUser {
  email: string;
  status: number;
  createdAt: string;
  postCount: number;
}

export interface UserListQuery {
  page?: number;
  pageSize?: number;
  role?: UserRole;
  keyword?: string;
}

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  _count?: { posts: number };
}

// 前端由扁平列表 + parentId 组装出的树节点
export interface CategoryNode extends Category {
  children: CategoryNode[];
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  _count?: { postTags: number };
}

export interface PostTagJoin {
  tag: Tag;
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content?: string;
  coverImage: string | null;
  authorId: string;
  categoryId: string | null;
  status: PostStatus;
  views: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  /** 置顶时间，null 表示未置顶（列表与详情都会返回） */
  pinnedAt: string | null;
  /** 由 pinnedAt 派生，方便前端直接判断；后端保证与 pinnedAt 一致 */
  isPinned: boolean;
  /** 点赞数 / 收藏数 / 已过审评论数（由 Prisma 的 _count 摊平而来） */
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
  author: PublicUser;
  category: Category | null;
  postTags?: PostTagJoin[];
}

/** 登录用户在一篇文章上的互动状态；未登录时 liked / favorited 恒为 false */
export interface InteractionState {
  liked: boolean;
  favorited: boolean;
  likeCount: number;
  favoriteCount: number;
}

/** 上下篇导航用的精简文章信息 */
export interface PostNavItem {
  id: string;
  title: string;
  slug: string;
}

/** 文章详情：在列表字段之上补充互动状态、上下篇与相关文章 */
export interface PostDetail extends Post {
  liked: boolean;
  favorited: boolean;
  /** 更新的一篇 */
  prev: PostNavItem | null;
  /** 更早的一篇 */
  next: PostNavItem | null;
  related: Post[];
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface PostListQuery {
  page?: number;
  pageSize?: number;
  categoryId?: number | string;
  /** 按标签 slug 过滤（标签归档页用） */
  tagSlug?: string;
  keyword?: string;
  /** 归档筛选：按发布年份 / 月份（月份需与年份同时给出，1-12） */
  year?: number;
  month?: number;
}

// ---------------- 归档（对标博客园的「随笔档案」） ----------------

/** 某年某月的发文量 */
export interface ArchiveMonth {
  year: number;
  month: number;
  count: number;
}

/** 某一天的发文量（年度热力图用） */
export interface ArchiveDay {
  /** YYYY-MM-DD */
  date: string;
  count: number;
}

export interface ArchiveOverview {
  total: number;
  /** 有文章的年份及篇数，倒序 */
  years: { year: number; count: number }[];
  /** 有文章的月份及篇数，倒序 */
  months: ArchiveMonth[];
}

// ---------------- 排行榜（网页阅读 / 评论 / 推荐 总榜） ----------------

export interface RankListQuery {
  type?: RankType;
  page?: number;
  pageSize?: number;
}

export interface CreatePostPayload {
  title: string;
  content: string;
  summary?: string;
  coverImage?: string;
  /** 编辑时传 null 表示「清空分类」；创建时 null 等同未分类 */
  categoryId?: number | null;
  tagIds?: number[];
  status?: PostStatus;
}

// ---------------- 评论 ----------------

export interface CommentAuthor {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string | null;
  parentId: string | null;
  authorName: string | null;
  content: string;
  status: CommentStatus;
  createdAt: string;
  user: CommentAuthor | null;
  /** 仅管理端列表返回 */
  post?: { id: string; title: string; slug: string };
}

/** 后端已组装好的评论树节点 */
export interface CommentTreeNode extends Comment {
  children: CommentTreeNode[];
}

export interface CommentTreeResult {
  items: CommentTreeNode[];
  total: number;
}

export interface CreateCommentPayload {
  content: string;
  parentId?: number;
  /** 游客评论必填；登录用户忽略 */
  authorName?: string;
}

export interface CommentListQuery {
  page?: number;
  pageSize?: number;
  status?: CommentStatus;
}

// ---------------- 上传 ----------------

export interface UploadResult {
  url: string;
  filename: string;
  size: number;
  mime: string;
}
