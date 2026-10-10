import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from './posts.service';

const DRAFT = {
  id: 10n,
  title: '草稿',
  slug: 'draft',
  summary: null,
  content: 'x',
  coverImage: null,
  authorId: 5n,
  categoryId: null,
  status: 'draft' as const,
  views: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: null,
};

const PUBLISHED = {
  ...DRAFT,
  id: 20n,
  title: '已发布',
  slug: 'published',
  status: 'published' as const,
  publishedAt: new Date('2026-01-01T00:00:00Z'),
};

function makeService() {
  const prisma = {
    // raw 查询在归档聚合与排行榜排序里用到（标签模板调用，可用 jest.fn 直接桩掉）
    $queryRaw: jest.fn().mockResolvedValue([]),
    post: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn(),
    },
    category: { findUnique: jest.fn() },
    tag: { findMany: jest.fn() },
    postTag: { createMany: jest.fn(), deleteMany: jest.fn() },
    postLike: {
      count: jest.fn().mockResolvedValue(0),
      upsert: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    postFavorite: {
      count: jest.fn().mockResolvedValue(0),
      upsert: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const service = new PostsService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('PostsService 可见性与权限', () => {
  describe('findOne', () => {
    it('未发布的文章对匿名访客返回 403', async () => {
      const { service, prisma } = makeService();
      prisma.post.findFirst.mockResolvedValue(DRAFT);
      await expect(service.findOne('draft')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('草稿对作者本人可见', async () => {
      const { service, prisma } = makeService();
      prisma.post.findFirst.mockResolvedValue(DRAFT);
      prisma.post.update.mockResolvedValue({ ...DRAFT, views: 1 });
      await expect(service.findOne('draft', '5', 'author')).resolves.toMatchObject({ id: 10n });
    });

    it('草稿对管理员可见', async () => {
      const { service, prisma } = makeService();
      prisma.post.findFirst.mockResolvedValue(DRAFT);
      prisma.post.update.mockResolvedValue({ ...DRAFT, views: 1 });
      await expect(service.findOne('draft', '99', 'admin')).resolves.toBeTruthy();
    });

    it('数字 slug 与 id 同时参与匹配（不再把纯数字 slug 误判为 id）', async () => {
      const { service, prisma } = makeService();
      prisma.post.findFirst.mockResolvedValue({ ...DRAFT, status: 'published' });
      prisma.post.update.mockResolvedValue({ ...DRAFT, views: 1 });

      await service.findOne('12345');

      expect(prisma.post.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ slug: '12345' }, { id: 12345n }] },
        }),
      );
    });

    it('越界的纯数字只按 slug 查询（避免超出 bigint 范围）', async () => {
      const { service, prisma } = makeService();
      prisma.post.findFirst.mockResolvedValue(null);

      await expect(service.findOne('99999999999999999999999')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.post.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { OR: [{ slug: '99999999999999999999999' }] } }),
      );
    });

    it('详情把互动状态与计数摊平，并带上上下篇与相关文章', async () => {
      const { service, prisma } = makeService();
      prisma.post.findFirst.mockResolvedValue({
        ...PUBLISHED,
        postTags: [{ tagId: 3n }],
        _count: { likes: 7, favorites: 2 },
      });
      prisma.postLike.count
        .mockResolvedValueOnce(7) // 全站点赞数
        .mockResolvedValueOnce(1); // 我点过赞
      prisma.postFavorite.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
      // findFirst 的第 2、3 次调用是上下篇查询
      prisma.post.findFirst
        .mockResolvedValueOnce({
          ...PUBLISHED,
          postTags: [{ tagId: 3n }],
          _count: { likes: 7, favorites: 2 },
        })
        .mockResolvedValueOnce({ id: 21n, title: '更新的一篇', slug: 'newer' })
        .mockResolvedValueOnce({ id: 19n, title: '更早的一篇', slug: 'older' });
      prisma.post.findMany.mockResolvedValue([
        { ...PUBLISHED, id: 30n, _count: { likes: 1, favorites: 0 } },
      ]);

      const detail = await service.findOne('published', '5');

      expect(detail).toMatchObject({
        likeCount: 7,
        favoriteCount: 2,
        liked: true,
        favorited: false,
        prev: { id: '21', title: '更新的一篇', slug: 'newer' },
        next: { id: '19', title: '更早的一篇', slug: 'older' },
      });
      expect(detail.related).toHaveLength(1);
      expect(detail.related[0]).toMatchObject({ id: 30n, likeCount: 1 });
    });

    it('草稿不参与上下篇导航（publishedAt 为空）', async () => {
      const { service, prisma } = makeService();
      prisma.post.findFirst.mockResolvedValue(DRAFT);
      prisma.post.update.mockResolvedValue({ ...DRAFT, views: 1 });

      const detail = await service.findOne('draft', '5', 'author');

      expect(detail.prev).toBeNull();
      expect(detail.next).toBeNull();
      expect(detail.related).toEqual([]);
    });

    it('已发布但 published_at 为空的历史数据，退化为用 created_at 比较（不会永远翻不了页）', async () => {
      const { service, prisma } = makeService();
      const legacy = { ...PUBLISHED, id: 40n, slug: 'legacy', publishedAt: null };
      prisma.post.findFirst.mockResolvedValueOnce(legacy);
      prisma.post.update.mockResolvedValue({ ...legacy, views: 1 });

      await service.findOne('legacy');

      // 第 1 次是详情查询，第 2/3 次分别是「上一篇」「下一篇」
      const prevCall = prisma.post.findFirst.mock.calls[1][0];
      const nextCall = prisma.post.findFirst.mock.calls[2][0];
      expect(prevCall.where.publishedAt).toBeUndefined();
      expect(prevCall.where.OR).toContainEqual({
        publishedAt: null,
        createdAt: { gt: legacy.createdAt },
      });
      expect(nextCall.where.OR).toContainEqual({
        publishedAt: null,
        createdAt: { lt: legacy.createdAt },
      });
    });
  });

  describe('findAll 标签筛选', () => {
    it('tagSlug 转为 postTags.some 过滤，且只取已发布', async () => {
      const { service, prisma } = makeService();
      prisma.post.count.mockResolvedValue(1);
      prisma.post.findMany.mockResolvedValue([
        { ...PUBLISHED, _count: { likes: 3, favorites: 1 } },
      ]);

      const result = await service.findAll({ tagSlug: 'react' });

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'published',
            postTags: { some: { tag: { slug: 'react' } } },
          },
        }),
      );
      expect(result.items[0]).toMatchObject({ likeCount: 3, favoriteCount: 1 });
    });
  });

  describe('update 权限', () => {
    it('非作者且非管理员 → 403', async () => {
      const { service, prisma } = makeService();
      prisma.post.findUnique.mockResolvedValue(DRAFT);
      await expect(
        service.update('10', { title: 'x' }, '77', 'author'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('管理员可改他人文章，返回结构含标签与互动计数', async () => {
      const { service, prisma } = makeService();
      prisma.post.findUnique
        .mockResolvedValueOnce(DRAFT) // 存在性校验
        .mockResolvedValueOnce({
          ...DRAFT,
          title: '新标题',
          _count: { likes: 0, favorites: 0 },
        });
      prisma.post.update.mockResolvedValue({ ...DRAFT, title: '新标题' });

      await expect(
        service.update('10', { title: '新标题' }, '99', 'admin'),
      ).resolves.toMatchObject({ title: '新标题', likeCount: 0, favoriteCount: 0 });
    });
  });

  describe('create 的关联校验（此前会以 500 冒泡）', () => {
    it('不存在的分类 → 400 分类不存在', async () => {
      const { service, prisma } = makeService();
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ title: 't', content: 'c', categoryId: 123 }, '5'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('不存在的标签 → 400 标签不存在', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findMany.mockResolvedValue([{ id: 1n }]);
      await expect(
        service.create({ title: 't', content: 'c', tagIds: [1, 2] }, '5'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('重复的 tagIds 先去重，只写一条关联（避免唯一约束 P2002 → 500）', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findMany.mockResolvedValue([{ id: 7n }]);
      prisma.post.create.mockResolvedValue({ ...DRAFT, id: 11n });
      prisma.post.findUnique.mockResolvedValue({ ...DRAFT, id: 11n });
      prisma.postTag.createMany.mockResolvedValue({ count: 1 });

      await service.create({ title: 't', content: 'c', tagIds: [7, 7, 7] }, '5');

      expect(prisma.tag.findMany).toHaveBeenCalledWith({
        where: { id: { in: [7n] } },
        select: { id: true },
      });
      expect(prisma.postTag.createMany).toHaveBeenCalledWith({
        data: [{ postId: 11n, tagId: 7n }],
      });
    });
  });

  it('remove：读者写别人的文章 → 403', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(DRAFT);
    await expect(service.remove('10', 'reader', '77')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('PostsService 点赞 / 收藏', () => {
  function publishedEnv() {
    const env = makeService();
    // resolvePublishedPostId 走 post.findUnique
    env.prisma.post.findUnique.mockResolvedValue({ status: 'published' });
    return env;
  }

  it('点赞用 upsert，重复点赞不产生唯一约束错误', async () => {
    const { service, prisma } = publishedEnv();
    prisma.postLike.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const state = await service.like('20', '5');

    expect(prisma.postLike.upsert).toHaveBeenCalledWith({
      where: { postId_userId: { postId: 20n, userId: 5n } },
      update: {},
      create: { postId: 20n, userId: 5n },
    });
    expect(state).toMatchObject({ liked: true, likeCount: 1 });
  });

  it('取消点赞用 deleteMany，未点赞时也返回 200 语义', async () => {
    const { service, prisma } = publishedEnv();

    const state = await service.unlike('20', '5');

    expect(prisma.postLike.deleteMany).toHaveBeenCalledWith({
      where: { postId: 20n, userId: 5n },
    });
    expect(state).toMatchObject({ liked: false, likeCount: 0 });
  });

  it('收藏走 postFavorite，与点赞计数互不干扰', async () => {
    const { service, prisma } = publishedEnv();
    prisma.postFavorite.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const state = await service.favorite('20', '5');

    expect(prisma.postFavorite.upsert).toHaveBeenCalled();
    expect(state).toMatchObject({ favorited: true, favoriteCount: 1, liked: false });
  });

  it('对未发布文章点赞按「不存在」处理（404，不泄露草稿存在性）', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue({ status: 'draft' });

    await expect(service.like('10', '5')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.postLike.upsert).not.toHaveBeenCalled();
  });

  it('文章彻底不存在 → 404', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(null);

    await expect(service.favorite('999', '5')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PostsService 热门文章', () => {
  it('只取已发布，按浏览量倒序，并摊平计数', async () => {
    const { service, prisma } = makeService();
    prisma.post.findMany.mockResolvedValue([
      { ...PUBLISHED, views: 100, _count: { likes: 9, favorites: 4 } },
    ]);

    const items = await service.findHot(5);

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'published' },
        orderBy: [{ views: 'desc' }, { publishedAt: 'desc' }],
        take: 5,
      }),
    );
    expect(items[0]).toMatchObject({ views: 100, likeCount: 9, favoriteCount: 4 });
  });
});

describe('PostsService 列表排序与归档筛选', () => {
  it('公开列表置顶优先，再按发布时间倒序，最后用 id 兜底', async () => {
    const { service, prisma } = makeService();

    await service.findAll({});

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ pinnedAt: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('按月筛选转成 publishedAt 左闭右开区间', async () => {
    const { service, prisma } = makeService();

    await service.findAll({ year: 2026, month: 10 });

    const { where } = prisma.post.findMany.mock.calls[0][0];
    expect(where.publishedAt.gte).toEqual(new Date(Date.UTC(2026, 9, 1)));
    expect(where.publishedAt.lt).toEqual(new Date(Date.UTC(2026, 10, 1)));
  });

  it('12 月的右端点跨到次年 1 月', async () => {
    const { service, prisma } = makeService();

    await service.findAll({ year: 2026, month: 12 });

    const { where } = prisma.post.findMany.mock.calls[0][0];
    expect(where.publishedAt.gte).toEqual(new Date(Date.UTC(2026, 11, 1)));
    expect(where.publishedAt.lt).toEqual(new Date(Date.UTC(2027, 0, 1)));
  });

  it('只给月份不给年份 → 400（否则区间无从确定，静默忽略会返回假数据）', async () => {
    const { service, prisma } = makeService();

    await expect(service.findAll({ month: 10 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });
});

describe('PostsService 归档', () => {
  it('归档总览把 BigInt 计数转成数字，年份汇总与月份自洽', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValue([
      { y: 2026, m: 10, c: 3n },
      { y: 2026, m: 9, c: 1n },
      { y: 2025, m: 12, c: 2n },
    ]);

    const result = await service.findArchive();

    expect(result.total).toBe(6);
    expect(result.months[0]).toEqual({ year: 2026, month: 10, count: 3 });
    expect(result.years).toEqual([
      { year: 2026, count: 4 },
      { year: 2025, count: 2 },
    ]);
    expect(typeof result.months[0].count).toBe('number');
  });

  it('热力图把结果规整成 YYYY-MM-DD（按 UTC 取，避免跨时区偏一天）', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValue([
      { d: new Date('2026-10-10T00:00:00Z'), c: 2n },
      { d: '2026-10-11T00:00:00.000Z', c: 1n },
    ]);

    const result = await service.findArchiveDays(2026);

    expect(result.year).toBe(2026);
    expect(result.days).toEqual([
      { date: '2026-10-10', count: 2 },
      { date: '2026-10-11', count: 1 },
    ]);
  });

  it('不传年份时用当前 UTC 年份作为区间', async () => {
    const { service, prisma } = makeService();

    await service.findArchiveDays();

    const params = prisma.$queryRaw.mock.calls[0].slice(1);
    expect(params).toContain(`${new Date().getUTCFullYear()}-01-01`);
  });
});

describe('PostsService 排行榜', () => {
  it('按聚合排序取主键后回表，并按排序结果重排（不被数据库返回顺序影响）', async () => {
    const { service, prisma } = makeService();
    prisma.post.count.mockResolvedValue(3);
    prisma.$queryRaw.mockResolvedValue([{ id: 30n }, { id: 20n }]);
    // 回表顺序故意与排序结果相反
    prisma.post.findMany.mockResolvedValue([
      { ...PUBLISHED, id: 20n, _count: { likes: 0, favorites: 0, comments: 0 } },
      { ...PUBLISHED, id: 30n, _count: { likes: 5, favorites: 1, comments: 2 } },
    ]);

    const result = await service.findRank({ type: 'likes', page: 1, pageSize: 2 });

    expect(result.meta).toEqual({ total: 3, page: 1, pageSize: 2 });
    expect(result.items.map((i) => i.id)).toEqual([30n, 20n]);
    expect(result.items[0]).toMatchObject({ likeCount: 5, commentCount: 2 });
  });

  it('空结果不触发回表查询（少一次无谓的 IN 查询）', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.findRank({ page: 5, pageSize: 20 });

    expect(result.items).toEqual([]);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });
});

describe('PostsService 置顶', () => {
  const pinnedRow = {
    ...PUBLISHED,
    pinnedAt: new Date('2026-10-10T12:00:00Z'),
    _count: { likes: 0, favorites: 0, comments: 0 },
  };

  it('作者置顶成功，写入 pinnedAt 并返回 isPinned = true', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique
      .mockResolvedValueOnce({ id: 20n, status: 'published', authorId: 5n })
      .mockResolvedValueOnce(pinnedRow);

    const result = await service.setPinned('20', true, '5', 'author');

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 20n },
      data: { pinnedAt: expect.any(Date) },
    });
    expect(result).toMatchObject({ isPinned: true });
  });

  it('取消置顶写 null，返回 isPinned = false', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique
      .mockResolvedValueOnce({ id: 20n, status: 'published', authorId: 5n })
      .mockResolvedValueOnce({ ...pinnedRow, pinnedAt: null });

    const result = await service.setPinned('20', false, '5', 'author');

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 20n },
      data: { pinnedAt: null },
    });
    expect(result).toMatchObject({ isPinned: false, pinnedAt: null });
  });

  it('非作者且非管理员 → 403，且不写库', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue({ id: 20n, status: 'published', authorId: 5n });

    await expect(service.setPinned('20', true, '77', 'author')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('草稿不可置顶 → 400', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue({ id: 10n, status: 'draft', authorId: 5n });

    await expect(service.setPinned('10', true, '5', 'author')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('文章不存在 → 404', async () => {
    const { service } = makeService();

    await expect(service.setPinned('999', true, '5', 'author')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('文章转为草稿时自动解除置顶（维持「置顶必已发布」不变量）', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique
      .mockResolvedValueOnce({ ...PUBLISHED, pinnedAt: new Date() })
      .mockResolvedValueOnce({ ...PUBLISHED, status: 'draft', pinnedAt: null });
    prisma.post.update.mockResolvedValue({ ...PUBLISHED, status: 'draft' });

    await service.update('20', { status: 'draft' }, '5', 'author');

    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pinnedAt: null }) }),
    );
  });
});
