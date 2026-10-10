import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode, UserRole } from '@blog/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toAdminUser, toPublicUser } from '../common/mappers/user.mapper';
import { toPostWithCounts } from '../common/mappers/post.mapper';
import { parseId } from '../common/utils/parse-id';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryMyPostsDto } from './dto/query-my-posts.dto';
import { QueryFavoritesDto } from './dto/query-favorites.dto';
import { QueryUsersDto } from './dto/query-users.dto';

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  bio: true,
  role: true,
} as const;

// 管理端用户列表字段（含文章数，用于判断该用户是否已有产出）
const ADMIN_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  avatar: true,
  bio: true,
  role: true,
  status: true,
  createdAt: true,
  _count: { select: { posts: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: parseId(id, '用户 id') },
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }
    return user;
  }

  async updateProfile(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    return this.prisma.user.update({
      where: { id: parseId(id, '用户 id') },
      data: dto,
    });
  }

  // 我的文章：含草稿与归档，按创建时间倒序分页
  async findMyPosts(userId: string, query: QueryMyPostsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where: Prisma.PostWhereInput = {
      authorId: parseId(userId, '用户 id'),
    };
    if (query.status) {
      where.status = query.status;
    }
    const [total, items] = await Promise.all([
      this.prisma.post.count({ where }),
      this.prisma.post.findMany({
        where,
        include: {
          author: { select: AUTHOR_SELECT },
          category: true,
          postTags: { include: { tag: true } },
          _count: { select: { likes: true, favorites: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map(toPostWithCounts),
      meta: { total, page, pageSize },
    };
  }

  /**
   * 我的收藏：按收藏时间倒序分页。
   * 文章可能在收藏后被作者删除——关系上有 CASCADE，不会留下悬挂记录，
   * 但为稳妥仍在映射时过滤掉 null。
   */
  async findMyFavorites(userId: string, query: QueryFavoritesDto) {
    const uid = parseId(userId, '用户 id');
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [total, rows] = await Promise.all([
      this.prisma.postFavorite.count({ where: { userId: uid } }),
      this.prisma.postFavorite.findMany({
        where: { userId: uid },
        include: {
          post: {
            include: {
              author: { select: AUTHOR_SELECT },
              category: true,
              _count: { select: { likes: true, favorites: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows
        .filter((row) => row.post != null)
        .map((row) => toPostWithCounts(row.post)),
      meta: { total, page, pageSize },
    };
  }

  // ---------------- 管理端（仅 admin） ----------------

  /** 用户列表：分页 + 按角色筛选 + 关键字（用户名/昵称/邮箱） */
  async adminList(query: QueryUsersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.UserWhereInput = {};
    if (query.role) {
      where.role = query.role;
    }
    if (query.keyword) {
      where.OR = [
        { username: { contains: query.keyword } },
        { displayName: { contains: query.keyword } },
        { email: { contains: query.keyword } },
      ];
    }
    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: ADMIN_USER_SELECT,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: items.map(toAdminUser), meta: { total, page, pageSize } };
  }

  /** 提升/调整他人角色（reader → author → admin）。 */
  async updateRole(actorId: string, targetId: string, role: UserRole) {
    const id = this.assertNotSelf(actorId, targetId, '不能修改自己的角色');
    await this.findById(targetId);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: ADMIN_USER_SELECT,
    });
    return toAdminUser(updated);
  }

  /** 启用/停用他人账号；停用即刻吊销其全部 refresh token 强制下线。 */
  async updateStatus(actorId: string, targetId: string, status: 0 | 1) {
    const id = this.assertNotSelf(actorId, targetId, '不能修改自己的账号状态');
    await this.findById(targetId);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: ADMIN_USER_SELECT,
    });
    if (status === 0) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revoked: 0 },
        data: { revoked: 1 },
      });
    }
    return toAdminUser(updated);
  }

  /** 当前用户自己的公开信息（含实时角色，前端据此显隐入口） */
  async findMe(id: string) {
    return toPublicUser(await this.findById(id));
  }

  /**
   * 管理员只能改「别人」——禁止改自己的角色/状态，否则可能把自己降级成 reader
   * 或停用，导致系统失去唯一管理员而无法恢复。
   */
  private assertNotSelf(actorId: string, targetId: string, message: string): bigint {
    const id = parseId(targetId, '用户 id');
    if (id === parseId(actorId, '用户 id')) {
      throw new ForbiddenException({
        code: ErrorCode.CANNOT_MODIFY_SELF,
        message,
      });
    }
    return id;
  }
}
