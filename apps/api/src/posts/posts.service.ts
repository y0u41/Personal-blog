import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PostStatus } from '@prisma/client';
import { ErrorCode, InteractionState, RankType, UserRole } from '@blog/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { QueryRankDto } from './dto/query-rank.dto';
import { slugify, uniqueSlug } from '../common/utils/slugify';
import { parseId, tryParseId } from '../common/utils/parse-id';
import { toPostWithCounts } from '../common/mappers/post.mapper';

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  bio: true,
  role: true,
} as const;

// 已过审评论的过滤条件：待审/垃圾评论不计入对外计数，避免把审核队列暴露给游客
const APPROVED_COMMENT_COUNT = {
  comments: { where: { status: 'approved' as const } },
} as const;

// 列表 / 详情统一需要的关联与互动计数。抽成常量避免各处 include 写歪导致前端字段缺失。
const POST_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  category: true,
  postTags: { include: { tag: true } },
  _count: {
    select: { likes: true, favorites: true, ...APPROVED_COMMENT_COUNT },
  },
} as const;

// 列表场景不必带 postTags（前端卡片不展示标签，省一次关联查询）
const POST_LIST_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  category: true,
  _count: {
    select: { likes: true, favorites: true, ...APPROVED_COMMENT_COUNT },
  },
} as const;

// 排行榜排序依据。三种维度都走同一条 SQL，只在 ORDER BY 表达式上分叉；
// 表达式取自本白名单，用户输入（type）永远不参与 SQL 拼接，无注入面。
const RANK_ORDER_BY: Record<RankType, Prisma.Sql> = {
  views: Prisma.sql`p.views`,
  likes: Prisma.sql`(SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id)`,
  comments: Prisma.sql`(SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id AND cm.status = 'approved')`,
};

/** 列表统一排序：置顶优先（按置顶先后），其余按发布时间倒序，同时间戳用 id 兜底保证稳定。 */
const POST_LIST_ORDER_BY: Prisma.PostOrderByWithRelationInput[] = [
  { pinnedAt: 'desc' },
  { publishedAt: 'desc' },
  { id: 'desc' },
];

// ---------------- 归档时间辅助 ----------------
// 统一以 UTC 为基准：Prisma 写 MySQL DATETIME 时按 UTC 落地，
// 因此 YEAR()/MONTH()/DATE() 在库里的取值与这里的 UTC 区间边界是同一套口径。

/** 某年某月 1 号 00:00 (UTC) */
function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** 下一个月 1 号 00:00 (UTC)，用作左闭右开的右端点 */
function nextMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

/** 把 DATE()/字符串结果统一成 YYYY-MM-DD（按 UTC 取，避免跨时区偏移一天） */
function toDateKey(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class PostsService {
  // 进程内浏览量防刷：同一 ip+post 1 小时内只计 1 次（多实例部署需换共享存储）
  private readonly viewLog = new Map<string, number>();
  // 上限保护：超过则先清掉已过期的条目，仍超则整体丢弃重建，
  // 避免被构造大量不同 ip/post 组合打爆内存（Map 无上限即内存泄漏）。
  private static readonly VIEW_LOG_MAX = 50_000;
  private static readonly VIEW_WINDOW_MS = 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePostDto, authorId: string) {
    const slug = await this.generateUniqueSlug(dto.title);
    const status = dto.status ?? ('draft' as PostStatus);
    const categoryId = await this.resolveCategoryId(dto.categoryId);
    const tagIds = await this.resolveTagIds(dto.tagIds);
    const data: Prisma.PostCreateInput = {
      title: dto.title,
      slug,
      summary: dto.summary,
      content: dto.content,
      coverImage: dto.coverImage,
      status,
      publishedAt: status === 'published' ? new Date() : null,
      author: { connect: { id: parseId(authorId, '用户 id') } },
      category:
        categoryId != null ? { connect: { id: categoryId } } : undefined,
    };
    const post = await this.prisma.post.create({ data });
    if (tagIds.length > 0) {
      await this.prisma.postTag.createMany({
        data: tagIds.map((tagId) => ({ postId: post.id, tagId })),
      });
    }
    const created = await this.prisma.post.findUnique({
      where: { id: post.id },
      include: POST_INCLUDE,
    });
    return created ? toPostWithCounts(created) : null;
  }

  async findAll(query: QueryPostsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    // 公开列表只暴露已发布文章（草稿/归档仅作者经 /users/me/posts 可见）
    const where: Prisma.PostWhereInput = { status: 'published' };
    if (query.categoryId != null) {
      where.categoryId = parseId(query.categoryId, '分类 id');
    }
    // 标签归档：按 slug 过滤。与 keyword 同时存在时由 Prisma 在顶层 AND 组合，无需额外包裹。
    if (query.tagSlug) {
      where.postTags = { some: { tag: { slug: query.tagSlug } } };
    }
    if (query.keyword) {
      where.OR = [
        { title: { contains: query.keyword } },
        { summary: { contains: query.keyword } },
        { content: { contains: query.keyword } },
      ];
    }
    // 归档筛选：按发布年月。月份单独出现时无法确定区间，直接 400 而不是静默忽略。
    if (query.month != null && query.year == null) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '按月份筛选时必须同时提供年份',
      });
    }
    if (query.year != null) {
      where.publishedAt = { gte: monthStart(query.year, 1), lt: monthStart(query.year + 1, 1) };
      if (query.month != null) {
        where.publishedAt = {
          gte: monthStart(query.year, query.month),
          lt: nextMonthStart(query.year, query.month),
        };
      }
    }
    const [total, items] = await Promise.all([
      this.prisma.post.count({ where }),
      this.prisma.post.findMany({
        where,
        include: POST_LIST_INCLUDE,
        orderBy: POST_LIST_ORDER_BY,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: items.map(toPostWithCounts), meta: { total, page, pageSize } };
  }

  /**
   * 热门文章：按累计浏览量倒序取前 N 篇。
   * 浏览量已在详情接口按 ip 做 1 小时去重，因此这里不需要额外的反刷逻辑。
   */
  async findHot(limit = 5) {
    const items = await this.prisma.post.findMany({
      where: { status: 'published' },
      include: POST_LIST_INCLUDE,
      orderBy: [{ views: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
    });
    return items.map(toPostWithCounts);
  }

  /**
   * 归档总览：按「年-月」统计已发布文章数（对标博客园的「随笔档案」）。
   * 用 SQL 聚合而不是把全部发布时间捞回来在 Node 里分组——随着文章变多，
   * 前者只回传「月份数」行，后者回传「文章数」行。
   */
  async findArchive() {
    const rows = await this.prisma.$queryRaw<
      Array<{ y: number | bigint; m: number | bigint; c: bigint }>
    >`
      SELECT YEAR(p.published_at) AS y, MONTH(p.published_at) AS m, COUNT(*) AS c
      FROM posts p
      WHERE p.status = 'published' AND p.published_at IS NOT NULL
      GROUP BY y, m
      ORDER BY y DESC, m DESC
    `;
    const months = rows.map((r) => ({
      year: Number(r.y),
      month: Number(r.m),
      count: Number(r.c),
    }));
    // 年份汇总由月份数据归并而来，保证两处数字永远自洽（不会出现年份数 ≠ 其下月份之和）
    const yearMap = new Map<number, number>();
    for (const m of months) {
      yearMap.set(m.year, (yearMap.get(m.year) ?? 0) + m.count);
    }
    const years = [...yearMap.entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.year - a.year);
    const total = months.reduce((sum, m) => sum + m.count, 0);
    return { total, years, months };
  }

  /** 年度热力图：某一年内每天的发文量（只包含有文章的日期）。 */
  async findArchiveDays(year?: number) {
    const y = year ?? new Date().getUTCFullYear();
    // 用字符串字面量传年份边界，避免驱动对 JS Date 参数再做一次时区换算
    const from = `${y}-01-01`;
    const to = `${y + 1}-01-01`;
    const rows = await this.prisma.$queryRaw<
      Array<{ d: Date | string; c: bigint }>
    >`
      SELECT DATE(p.published_at) AS d, COUNT(*) AS c
      FROM posts p
      WHERE p.status = 'published' AND p.published_at IS NOT NULL
        AND p.published_at >= ${from} AND p.published_at < ${to}
      GROUP BY d
      ORDER BY d ASC
    `;
    return {
      year: y,
      days: rows.map((r) => ({ date: toDateKey(r.d), count: Number(r.c) })),
    };
  }

  /**
   * 排行榜：网页阅读 / 评论 / 推荐（点赞）总榜。
   * 分两步——先用聚合排序拿到本页的主键顺序，再用常规 include 查询取完整对象。
   * 这样排序可以精确控制（评论只算已过审），而返回结构与其它列表接口完全一致。
   */
  async findRank(query: QueryRankDto) {
    const type = query.type ?? 'views';
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [total, ordered] = await Promise.all([
      this.prisma.post.count({ where: { status: 'published' } }),
      this.prisma.$queryRaw<Array<{ id: bigint }>>`
        SELECT p.id
        FROM posts p
        WHERE p.status = 'published'
        ORDER BY ${RANK_ORDER_BY[type]} DESC, p.id DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `,
    ]);
    const ids = ordered.map((r) => r.id);
    if (ids.length === 0) {
      return { items: [], meta: { total, page, pageSize } };
    }
    const rows = await this.prisma.post.findMany({
      where: { id: { in: ids } },
      include: POST_LIST_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id.toString(), r]));
    const items = [];
    for (const id of ids) {
      const row = byId.get(id.toString());
      if (row) {
        items.push(toPostWithCounts(row));
      }
    }
    return { items, meta: { total, page, pageSize } };
  }

  async findOne(
    idOrSlug: string,
    viewerId?: string,
    viewerRole?: UserRole,
    ip?: string,
  ) {
    // 同时匹配 slug 与（合法范围内的）数字主键：纯数字 slug 也能正常访问，
    // 越界的纯数字则退化为 slug 查询，返回 404 而非底层异常。
    const numericId = tryParseId(idOrSlug);
    const where: Prisma.PostWhereInput = {
      OR: [{ slug: idOrSlug }, ...(numericId != null ? [{ id: numericId }] : [])],
    };
    const post = await this.prisma.post.findFirst({
      where,
      include: POST_INCLUDE,
    });
    if (!post) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '文章不存在',
      });
    }
    // 非公开文章仅作者本人或管理员可见
    if (post.status !== 'published') {
      const isOwner = viewerId != null && post.authorId.toString() === viewerId;
      const isAdmin = viewerRole === 'admin';
      if (!isOwner && !isAdmin) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: '无权访问该文章',
        });
      }
    }
    this.maybeIncrementViews(post.id, ip);

    // 详情一次性把前端渲染所需的数据都取回：互动状态 + 上下篇 + 相关文章，
    // 避免前端为一个阅读页发 4 个请求。
    const viewer = viewerId != null ? parseId(viewerId, '用户 id') : undefined;
    const [interaction, prev, next, related] = await Promise.all([
      this.interactionState(post.id, viewer),
      this.findAdjacent(post, 'prev'),
      this.findAdjacent(post, 'next'),
      this.findRelated(post),
    ]);
    return {
      ...toPostWithCounts(post),
      liked: interaction.liked,
      favorited: interaction.favorited,
      prev,
      next,
      related,
    };
  }

  async update(
    id: string,
    dto: UpdatePostDto,
    userId: string,
    role: UserRole,
  ) {
    const postId = parseId(id, '文章 id');
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '文章不存在',
      });
    }
    if (post.authorId.toString() !== userId && role !== 'admin') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅作者或管理员可编辑',
      });
    }
    // categoryId 三态：undefined=不改动，null=清空分类，数字=关联/改为该分类
    let category: Prisma.PostUpdateInput['category'];
    if (dto.categoryId === null) {
      category = { disconnect: true };
    } else if (dto.categoryId !== undefined) {
      const categoryId = await this.resolveCategoryId(dto.categoryId);
      category = categoryId != null ? { connect: { id: categoryId } } : undefined;
    }
    const data: Prisma.PostUpdateInput = {
      title: dto.title,
      summary: dto.summary,
      content: dto.content,
      coverImage: dto.coverImage,
      status: dto.status,
      category,
    };
    // 补上发布时间：首次转为 published，或历史数据里 published_at 为空的情况
    // （为空会让文章被排到列表末尾、且无法参与上下篇导航，这里顺手自愈）
    const nextStatus = dto.status ?? post.status;
    if (nextStatus === 'published' && post.publishedAt == null) {
      data.publishedAt = new Date();
    }
    // 维护不变量：置顶只对已发布文章有意义。文章一旦转草稿/归档，顺手解除置顶，
    // 否则它会以 isPinned=true 留在作者的草稿列表里，语义上自相矛盾。
    if (nextStatus !== 'published' && post.pinnedAt != null) {
      data.pinnedAt = null;
    }
    const tagIds = dto.tagIds ? await this.resolveTagIds(dto.tagIds) : undefined;
    await this.prisma.post.update({ where: { id: postId }, data });
    // 标签：全量替换
    if (tagIds) {
      await this.prisma.postTag.deleteMany({ where: { postId } });
      if (tagIds.length > 0) {
        await this.prisma.postTag.createMany({
          data: tagIds.map((tagId) => ({ postId, tagId })),
        });
      }
    }
    // 重新读一次：让创建与更新返回同一套结构（含标签与互动计数）
    const updated = await this.prisma.post.findUnique({
      where: { id: postId },
      include: POST_INCLUDE,
    });
    return updated ? toPostWithCounts(updated) : null;
  }

  async remove(id: string, role: UserRole, userId?: string) {
    const postId = parseId(id, '文章 id');
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '文章不存在',
      });
    }
    if (role !== 'admin' && post.authorId.toString() !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅作者或管理员可删除',
      });
    }
    await this.prisma.post.delete({ where: { id: postId } });
    return { message: '已删除' };
  }

  /**
   * 置顶 / 取消置顶。权限与编辑一致（作者本人或管理员）。
   * 只允许置顶已发布文章：草稿置顶没有意义，且会让「置顶」出现在公开列表之外的地方。
   * 置顶时间每次置顶都刷新，因此多篇置顶按「最近一次置顶」排序。
   */
  async setPinned(id: string, pinned: boolean, userId: string, role: UserRole) {
    const postId = parseId(id, '文章 id');
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true, authorId: true },
    });
    if (!post) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '文章不存在',
      });
    }
    if (post.authorId.toString() !== userId && role !== 'admin') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅作者或管理员可置顶',
      });
    }
    if (pinned && post.status !== 'published') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '仅已发布文章可置顶',
      });
    }
    await this.prisma.post.update({
      where: { id: postId },
      data: { pinnedAt: pinned ? new Date() : null },
    });
    const updated = await this.prisma.post.findUnique({
      where: { id: postId },
      include: POST_INCLUDE,
    });
    return updated ? toPostWithCounts(updated) : null;
  }

  // ---------------- 互动：点赞 / 收藏 ----------------

  /** 点赞（幂等：重复点赞不报错，返回最新状态）。 */
  async like(id: string, userId: string): Promise<InteractionState> {
    const postId = await this.resolvePublishedPostId(id);
    const uid = parseId(userId, '用户 id');
    // upsert 而非 create：并发重复点赞不会因复合主键冲突冒出 P2002 → 500
    await this.prisma.postLike.upsert({
      where: { postId_userId: { postId, userId: uid } },
      update: {},
      create: { postId, userId: uid },
    });
    return this.interactionState(postId, uid);
  }

  /** 取消点赞（幂等：未点赞时也是 200）。 */
  async unlike(id: string, userId: string): Promise<InteractionState> {
    const postId = await this.resolvePublishedPostId(id);
    const uid = parseId(userId, '用户 id');
    // 用 deleteMany：未点赞时影响 0 行；delete 会抛 P2025 被映射成 404
    await this.prisma.postLike.deleteMany({ where: { postId, userId: uid } });
    return this.interactionState(postId, uid);
  }

  /** 收藏（幂等）。 */
  async favorite(id: string, userId: string): Promise<InteractionState> {
    const postId = await this.resolvePublishedPostId(id);
    const uid = parseId(userId, '用户 id');
    await this.prisma.postFavorite.upsert({
      where: { postId_userId: { postId, userId: uid } },
      update: {},
      create: { postId, userId: uid },
    });
    return this.interactionState(postId, uid);
  }

  /** 取消收藏（幂等）。 */
  async unfavorite(id: string, userId: string): Promise<InteractionState> {
    const postId = await this.resolvePublishedPostId(id);
    const uid = parseId(userId, '用户 id');
    await this.prisma.postFavorite.deleteMany({
      where: { postId, userId: uid },
    });
    return this.interactionState(postId, uid);
  }

  /**
   * 当前用户在某篇文章上的互动状态。
   * userId 缺省（未登录）时跳过两次「我的」查询，liked/favorited 恒为 false。
   */
  private async interactionState(
    postId: bigint,
    userId?: bigint,
  ): Promise<InteractionState> {
    const [likeCount, favoriteCount, mine] = await Promise.all([
      this.prisma.postLike.count({ where: { postId } }),
      this.prisma.postFavorite.count({ where: { postId } }),
      userId != null
        ? Promise.all([
            this.prisma.postLike.count({ where: { postId, userId } }),
            this.prisma.postFavorite.count({ where: { postId, userId } }),
          ])
        : Promise.resolve<[number, number]>([0, 0]),
    ]);
    const [myLikes, myFavorites] = mine;
    return {
      liked: myLikes > 0,
      favorited: myFavorites > 0,
      likeCount,
      favoriteCount,
    };
  }

  /**
   * 互动只允许发生在已发布文章上。未发布一律按「不存在」处理，
   * 避免有人拿点赞接口探测他人草稿是否存在。
   */
  private async resolvePublishedPostId(id: string): Promise<bigint> {
    const postId = parseId(id, '文章 id');
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { status: true },
    });
    if (!post || post.status !== 'published') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '文章不存在',
      });
    }
    return postId;
  }

  /**
   * 上下篇：与公开列表保持同一顺序（publishedAt 倒序）。
   * prev = 更新的一篇，next = 更早的一篇；未发布文章不参与导航。
   * 同一时间戳用 id 兜底排序，保证翻页结果稳定、不会来回跳。
   *
   * 兼容 published_at 为空的历史数据：这类文章以 created_at 作为时间锚点，
   * 否则它会永远无法参与导航。正常数据不会走到这个分支。
   */
  private async findAdjacent(
    post: { id: bigint; createdAt: Date; publishedAt: Date | null; status: string },
    direction: 'prev' | 'next',
  ): Promise<{ id: string; title: string; slug: string } | null> {
    if (post.status !== 'published') {
      return null;
    }
    const isPrev = direction === 'prev';
    const anchor = post.publishedAt ?? post.createdAt;
    // 比较条件：正常数据比 published_at；历史数据缺 published_at 时退化为比 created_at
    const timeWhere: Prisma.PostWhereInput =
      post.publishedAt != null
        ? { publishedAt: isPrev ? { gt: anchor } : { lt: anchor } }
        : {
            OR: [
              { publishedAt: isPrev ? { gt: anchor } : { lt: anchor } },
              {
                publishedAt: null,
                createdAt: isPrev ? { gt: post.createdAt } : { lt: post.createdAt },
              },
            ],
          };
    const row = await this.prisma.post.findFirst({
      where: { status: 'published', id: { not: post.id }, ...timeWhere },
      orderBy: isPrev
        ? [{ publishedAt: 'asc' }, { id: 'asc' }]
        : [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, title: true, slug: true },
    });
    return row ? { id: row.id.toString(), title: row.title, slug: row.slug } : null;
  }

  /**
   * 相关文章：与当前文章共享标签的已发布文章，按浏览量倒序取 5 篇。
   * 没有标签时直接返回空数组，避免退化成「全站热门」这种无意义的推荐。
   */
  private async findRelated(post: {
    id: bigint;
    postTags?: { tagId: bigint }[];
  }) {
    const tagIds = (post.postTags ?? []).map((pt) => pt.tagId);
    if (tagIds.length === 0) {
      return [];
    }
    const items = await this.prisma.post.findMany({
      where: {
        status: 'published',
        id: { not: post.id },
        postTags: { some: { tagId: { in: tagIds } } },
      },
      include: POST_LIST_INCLUDE,
      orderBy: [{ views: 'desc' }, { publishedAt: 'desc' }],
      take: 5,
    });
    return items.map(toPostWithCounts);
  }

  /**
   * 校验分类存在性。不存在时直接 400，而不是把外键错误(P2003)留给客户端解释。
   */
  private async resolveCategoryId(
    categoryId: number | null | undefined,
  ): Promise<bigint | null> {
    if (categoryId == null) {
      return null;
    }
    const id = parseId(categoryId, '分类 id');
    const exists = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '分类不存在',
      });
    }
    return id;
  }
  /** 去重 + 校验标签存在性，避免重复 tagIds 触发唯一约束(P2002)变成 500。 */
  private async resolveTagIds(tagIds?: number[]): Promise<bigint[]> {
    if (!tagIds || tagIds.length === 0) {
      return [];
    }
    const unique = [
      ...new Set(tagIds.map((t) => parseId(t, '标签 id').toString())),
    ].map((s) => BigInt(s));
    const found = await this.prisma.tag.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '标签不存在',
      });
    }
    return unique;
  }

  private async generateUniqueSlug(title: string): Promise<string> {
    const base = slugify(title);
    let attempt = 1;
    for (;;) {
      const slug = uniqueSlug(base, attempt);
      const exists = await this.prisma.post.findUnique({ where: { slug } });
      if (!exists) {
        return slug;
      }
      attempt += 1;
      if (attempt > 100) {
        return `${base}-${Date.now()}`;
      }
    }
  }

  private maybeIncrementViews(postId: bigint, ip?: string): void {
    const key = `${ip ?? 'anon'}:${postId.toString()}`;
    const last = this.viewLog.get(key);
    const now = Date.now();
    if (last != null && now - last < PostsService.VIEW_WINDOW_MS) {
      return;
    }
    this.evictViewLogIfNeeded(now);
    this.viewLog.set(key, now);
    void this.prisma.post
      .update({
        where: { id: postId },
        data: { views: { increment: 1 } },
      })
      .catch(() => undefined);
  }

  /** 控制 viewLog 规模：先剔除已过期条目，仍超上限则整体重建。 */
  private evictViewLogIfNeeded(now: number): void {
    if (this.viewLog.size < PostsService.VIEW_LOG_MAX) {
      return;
    }
    for (const [key, ts] of this.viewLog) {
      if (now - ts >= PostsService.VIEW_WINDOW_MS) {
        this.viewLog.delete(key);
      }
    }
    // 极端情况下（短时间内涌入超过上限的活跃 key）直接重建，宁可少记几次浏览
    if (this.viewLog.size >= PostsService.VIEW_LOG_MAX) {
      this.viewLog.clear();
    }
  }
}
