import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { CommentStatus, ErrorCode, UserRole } from '@blog/shared';
import { PrismaService } from '../prisma/prisma.service';
import { parseId } from '../common/utils/parse-id';
import { CreateCommentDto } from './dto/create-comment.dto';
import { QueryCommentsDto } from './dto/query-comments.dto';

const COMMENT_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
} as const;

const COMMENT_POST_SELECT = {
  id: true,
  title: true,
  slug: true,
} as const;

/** 访问者身份（来自 JWT，仅含 id/role；昵称等详情按需查库） */
export interface Viewer {
  id: string;
  role: UserRole;
}

export interface PublicCommentAuthor {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

export interface PublicComment {
  id: string;
  postId: string;
  userId: string | null;
  parentId: string | null;
  authorName: string | null;
  content: string;
  status: $Enums.CommentStatus;
  createdAt: Date;
  user: PublicCommentAuthor | null;
  post?: { id: string; title: string; slug: string };
}

export interface CommentTreeNode extends PublicComment {
  children: CommentTreeNode[];
}

interface CommentRow {
  id: bigint;
  postId: bigint;
  userId: bigint | null;
  parentId: bigint | null;
  authorName: string | null;
  content: string;
  status: $Enums.CommentStatus;
  createdAt: Date;
  user?:
    | { id: bigint; username: string; displayName: string; avatar: string | null }
    | null;
  post?: { id: bigint; title: string; slug: string } | null;
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 公开：某文章下已过审评论，服务端组装为树 */
  async listByPostSlug(slug: string, viewer?: Viewer) {
    const post = await this.prisma.post.findUnique({
      where: { slug },
      select: { id: true, authorId: true, status: true },
    });
    if (!post) {
      throw this.postNotFound();
    }
    this.assertPostVisible(post, viewer);

    const rows = await this.prisma.comment.findMany({
      where: { postId: post.id, status: 'approved' },
      include: { user: { select: COMMENT_USER_SELECT } },
      orderBy: { createdAt: 'asc' },
    });

    const nodes = new Map<string, CommentTreeNode>();
    const roots: CommentTreeNode[] = [];
    for (const row of rows) {
      nodes.set(row.id.toString(), { ...this.toPublic(row), children: [] });
    }
    // 组装两级以上回复：父评论不在结果集（如未过审）时该回复上浮为根节点
    for (const row of rows) {
      const node = nodes.get(row.id.toString());
      if (!node) continue;
      const parentKey = row.parentId?.toString();
      const parent = parentKey ? nodes.get(parentKey) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return { items: roots, total: rows.length };
  }

  /** 公开（可选登录）：发表评论。默认待审核；管理员或本文作者自动过审。 */
  async createByPostSlug(slug: string, dto: CreateCommentDto, viewer?: Viewer) {
    const post = await this.prisma.post.findUnique({
      where: { slug },
      select: { id: true, authorId: true, status: true },
    });
    if (!post) {
      throw this.postNotFound();
    }
    this.assertPostVisible(post, viewer);

    const content = dto.content?.trim();
    if (!content) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '评论内容不能为空',
      });
    }

    let userId: bigint | null = null;
    let authorName: string | null = null;
    let autoApprove = false;

    if (viewer) {
      const user = await this.prisma.user.findUnique({
        where: { id: parseId(viewer.id, '用户 id') },
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          status: true,
        },
      });
      if (!user || user.status !== 1) {
        throw new ForbiddenException({
          code: ErrorCode.USER_DISABLED,
          message: '账号不可用',
        });
      }
      userId = user.id;
      // 昵称快照：即使将来改昵称或注销，历史评论仍可展示
      authorName = user.displayName || user.username;
      // 管理员或本文作者自行评论直接过审，避免「自己审核自己」
      autoApprove =
        user.role === 'admin' || post.authorId.toString() === user.id.toString();
    } else {
      const name = dto.authorName?.trim();
      if (!name || name.length < 2) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '请填写昵称（2-30 字）',
        });
      }
      authorName = name;
    }

    let parentId: bigint | null = null;
    if (dto.parentId != null) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: parseId(dto.parentId, '父评论 id') },
        select: { id: true, postId: true },
      });
      if (!parent || parent.postId !== post.id) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '要回复的评论不存在',
        });
      }
      parentId = parent.id;
    }

    const created = await this.prisma.comment.create({
      data: {
        postId: post.id,
        userId,
        parentId,
        authorName,
        content,
        status: autoApprove ? 'approved' : 'pending',
      },
      include: { user: { select: COMMENT_USER_SELECT } },
    });
    return this.toPublic(created);
  }

  /** 管理端：全站评论分页（可按状态过滤） */
  async adminList(query: QueryCommentsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CommentWhereInput = {};
    if (query.status) {
      where.status = query.status as $Enums.CommentStatus;
    }
    const [total, items] = await Promise.all([
      this.prisma.comment.count({ where }),
      this.prisma.comment.findMany({
        where,
        include: {
          user: { select: COMMENT_USER_SELECT },
          post: { select: COMMENT_POST_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map((c) => this.toPublic(c)),
      meta: { total, page, pageSize },
    };
  }

  /** 管理端：审核状态流转 */
  async updateStatus(id: string, status: (typeof CommentStatus)[number]) {
    await this.ensureExists(id);
    const updated = await this.prisma.comment.update({
      where: { id: parseId(id, '评论 id') },
      data: { status: status as $Enums.CommentStatus },
      include: {
        user: { select: COMMENT_USER_SELECT },
        post: { select: COMMENT_POST_SELECT },
      },
    });
    return this.toPublic(updated);
  }

  /** 删除：管理员可删任意；登录用户仅可删自己的评论 */
  async remove(id: string, viewer: Viewer) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: parseId(id, '评论 id') },
      select: { id: true, userId: true },
    });
    if (!comment) {
      throw this.commentNotFound();
    }
    const isOwner =
      comment.userId != null && comment.userId.toString() === viewer.id;
    if (viewer.role !== 'admin' && !isOwner) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅评论作者或管理员可删除',
      });
    }
    // 子评论由 DB 外键 ON DELETE CASCADE 一并删除
    await this.prisma.comment.delete({ where: { id: parseId(id, '评论 id') } });
    return { message: '已删除' };
  }

  // ---------------- helpers ----------------

  private assertPostVisible(
    post: { status: $Enums.PostStatus; authorId: bigint },
    viewer?: Viewer,
  ): void {
    if (post.status === 'published') {
      return;
    }
    const isOwner = viewer != null && post.authorId.toString() === viewer.id;
    const isAdmin = viewer?.role === 'admin';
    if (!isOwner && !isAdmin) {
      // 不暴露非公开文章的存在
      throw this.postNotFound();
    }
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.comment.findUnique({
      where: { id: parseId(id, '评论 id') },
      select: { id: true },
    });
    if (!found) {
      throw this.commentNotFound();
    }
  }

  private toPublic(row: CommentRow): PublicComment {
    const out: PublicComment = {
      id: row.id.toString(),
      postId: row.postId.toString(),
      userId: row.userId != null ? row.userId.toString() : null,
      parentId: row.parentId != null ? row.parentId.toString() : null,
      authorName: row.authorName,
      content: row.content,
      status: row.status,
      createdAt: row.createdAt,
      user: row.user
        ? {
            id: row.user.id.toString(),
            username: row.user.username,
            displayName: row.user.displayName,
            avatar: row.user.avatar,
          }
        : null,
    };
    if (row.post) {
      out.post = {
        id: row.post.id.toString(),
        title: row.post.title,
        slug: row.post.slug,
      };
    }
    return out;
  }

  private postNotFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: '文章不存在',
    });
  }

  private commentNotFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.COMMENT_NOT_FOUND,
      message: '评论不存在',
    });
  }
}
