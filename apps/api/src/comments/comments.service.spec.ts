import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommentsService, Viewer } from './comments.service';

const PUBLISHED_POST = { id: 100n, authorId: 5n, status: 'published' as const };
const DRAFT_POST = { id: 100n, authorId: 5n, status: 'draft' as const };

const OWNER: Viewer = { id: '5', role: 'author' };
const ADMIN: Viewer = { id: '1', role: 'admin' };
const STRANGER: Viewer = { id: '9', role: 'reader' };

/** 造一行评论聚合结果，字段与 Service 内部 CommentRow 对齐 */
function row(over: Record<string, unknown> = {}) {
  return {
    id: 1n,
    postId: 100n,
    userId: 7n,
    parentId: null as bigint | null,
    authorName: '张三',
    content: '写得好',
    status: 'approved' as const,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    user: { id: 7n, username: 'zhangsan', displayName: '张三', avatar: null },
    ...over,
  };
}

function makeService() {
  const prisma = {
    post: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    comment: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new CommentsService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('CommentsService 公开评论树', () => {
  it('文章不存在时抛 404', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(null);

    await expect(service.listByPostSlug('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('未发布文章对游客按 404 处理，不暴露文章存在性', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(DRAFT_POST);

    await expect(service.listByPostSlug('draft-post')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('未发布文章对其作者本人可见', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(DRAFT_POST);
    prisma.comment.findMany.mockResolvedValue([]);

    await expect(service.listByPostSlug('draft-post', OWNER)).resolves.toEqual({
      items: [],
      total: 0,
    });
  });

  it('只查询已过审评论', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);

    await service.listByPostSlug('hello');

    expect(prisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postId: 100n, status: 'approved' } }),
    );
  });

  it('两级回复挂到父节点下，而非平铺', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);
    prisma.comment.findMany.mockResolvedValue([
      row({ id: 1n, parentId: null }),
      row({ id: 2n, parentId: 1n }),
    ]);

    const { items, total } = await service.listByPostSlug('hello');

    expect(total).toBe(2);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('1');
    expect(items[0].children).toHaveLength(1);
    expect(items[0].children[0].id).toBe('2');
  });

  it('父评论不在结果集（如未过审）时，回复上浮为根节点而不丢失', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);
    // 父评论 id=1 未出现在已过审集合里
    prisma.comment.findMany.mockResolvedValue([row({ id: 2n, parentId: 1n })]);

    const { items, total } = await service.listByPostSlug('hello');

    expect(total).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('2');
  });

  it('BigInt 主键在响应中全部序列化为字符串', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);
    prisma.comment.findMany.mockResolvedValue([
      row({ id: 9007199254740993n, postId: 100n, userId: 7n, parentId: null }),
    ]);

    const { items } = await service.listByPostSlug('hello');

    expect(items[0].id).toBe('9007199254740993');
    expect(items[0].postId).toBe('100');
    expect(items[0].userId).toBe('7');
    expect(items[0].user?.id).toBe('7');
  });
});

describe('CommentsService 发表评论', () => {
  it('内容为空白时抛 400', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);

    await expect(
      service.createByPostSlug('hello', { content: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('游客未填昵称时抛 400', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);

    await expect(
      service.createByPostSlug('hello', { content: '路过' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('游客昵称少于 2 字时抛 400', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);

    await expect(
      service.createByPostSlug('hello', { content: '路过', authorName: '李' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('游客评论落为待审核，且不绑定 userId', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);
    prisma.comment.create.mockResolvedValue(row({ userId: null, status: 'pending' }));

    await service.createByPostSlug('hello', { content: '路过', authorName: '李四' });

    expect(prisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: null,
          authorName: '李四',
          status: 'pending',
        }),
      }),
    );
  });

  it('登录用户评论时写入 userId，并快照昵称', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);
    prisma.user.findUnique.mockResolvedValue({
      id: 7n,
      username: 'zhangsan',
      displayName: '张三',
      role: 'reader',
      status: 1,
    });
    prisma.comment.create.mockResolvedValue(row());

    await service.createByPostSlug('hello', { content: '不错' }, STRANGER);

    expect(prisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 7n, authorName: '张三' }),
      }),
    );
  });

  it('管理员评论自动过审（避免自己审核自己）', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);
    prisma.user.findUnique.mockResolvedValue({
      id: 1n,
      username: 'admin',
      displayName: '管理员',
      role: 'admin',
      status: 1,
    });
    prisma.comment.create.mockResolvedValue(row({ status: 'approved' }));

    await service.createByPostSlug('hello', { content: '同意' }, ADMIN);

    expect(prisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'approved' }),
      }),
    );
  });

  it('本文作者评论同样自动过审', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);
    prisma.user.findUnique.mockResolvedValue({
      id: 5n, // 与 PUBLISHED_POST.authorId 一致
      username: 'yu',
      displayName: 'Yu',
      role: 'author',
      status: 1,
    });
    prisma.comment.create.mockResolvedValue(row({ status: 'approved' }));

    await service.createByPostSlug('hello', { content: '补充一点' }, OWNER);

    expect(prisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'approved' }),
      }),
    );
  });

  it('账号被停用时拒绝评论（403）', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);
    prisma.user.findUnique.mockResolvedValue({
      id: 7n,
      username: 'zhangsan',
      displayName: '张三',
      role: 'reader',
      status: 0,
    });

    await expect(
      service.createByPostSlug('hello', { content: '不错' }, STRANGER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('用户已不存在时同样按 403 拒绝', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.createByPostSlug('hello', { content: '不错' }, STRANGER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('回复跨文章的评论时抛 400', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);
    prisma.comment.findUnique.mockResolvedValue({ id: 55n, postId: 999n });

    await expect(
      service.createByPostSlug('hello', { content: '顶', authorName: '王五', parentId: 55 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('回复父评论不存在时抛 400', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);
    prisma.comment.findUnique.mockResolvedValue(null);

    await expect(
      service.createByPostSlug('hello', { content: '顶', authorName: '王五', parentId: 55 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('父评论属于同一篇文章时正常写入 parentId', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue(PUBLISHED_POST);
    prisma.comment.findUnique.mockResolvedValue({ id: 55n, postId: 100n });
    prisma.comment.create.mockResolvedValue(row({ parentId: 55n }));

    await service.createByPostSlug('hello', {
      content: '顶',
      authorName: '王五',
      parentId: 55,
    });

    expect(prisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 55n }),
      }),
    );
  });
});

describe('CommentsService 审核状态流转', () => {
  it('评论不存在时抛 404', async () => {
    const { service, prisma } = makeService();
    prisma.comment.findUnique.mockResolvedValue(null);

    await expect(service.updateStatus('404', 'approved')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.comment.update).not.toHaveBeenCalled();
  });

  it('存在时更新状态并返回映射后的评论', async () => {
    const { service, prisma } = makeService();
    prisma.comment.findUnique.mockResolvedValue({ id: 1n });
    prisma.comment.update.mockResolvedValue(row({ status: 'approved' }));

    const out = await service.updateStatus('1', 'approved');

    expect(prisma.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'approved' } }),
    );
    expect(out.id).toBe('1');
    expect(out.status).toBe('approved');
  });
});

describe('CommentsService 删除评论', () => {
  it('评论不存在时抛 404', async () => {
    const { service, prisma } = makeService();
    prisma.comment.findUnique.mockResolvedValue(null);

    await expect(service.remove('404', ADMIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('既非作者也非管理员时抛 403', async () => {
    const { service, prisma } = makeService();
    prisma.comment.findUnique.mockResolvedValue({ id: 1n, userId: 7n });

    await expect(service.remove('1', STRANGER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.comment.delete).not.toHaveBeenCalled();
  });

  it('游客评论（userId 为 null）不能被普通用户删除', async () => {
    const { service, prisma } = makeService();
    prisma.comment.findUnique.mockResolvedValue({ id: 1n, userId: null });

    await expect(service.remove('1', STRANGER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('作者本人可以删除自己的评论', async () => {
    const { service, prisma } = makeService();
    prisma.comment.findUnique.mockResolvedValue({ id: 1n, userId: 7n });

    await expect(service.remove('1', { id: '7', role: 'reader' })).resolves.toEqual({
      message: '已删除',
    });
    expect(prisma.comment.delete).toHaveBeenCalledTimes(1);
  });

  it('管理员可以删除他人评论', async () => {
    const { service, prisma } = makeService();
    prisma.comment.findUnique.mockResolvedValue({ id: 1n, userId: 7n });

    await service.remove('1', ADMIN);

    expect(prisma.comment.delete).toHaveBeenCalledTimes(1);
  });
});

describe('CommentsService 管理端列表', () => {
  it('默认分页 20，按创建时间倒序', async () => {
    const { service, prisma } = makeService();
    prisma.comment.count.mockResolvedValue(0);
    prisma.comment.findMany.mockResolvedValue([]);

    const res = await service.adminList({});

    expect(prisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' }, skip: 0, take: 20 }),
    );
    expect(res.meta).toEqual({ total: 0, page: 1, pageSize: 20 });
  });

  it('按状态过滤时把条件下推到查询', async () => {
    const { service, prisma } = makeService();

    await service.adminList({ status: 'pending', page: 2, pageSize: 10 });

    expect(prisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'pending' }, skip: 10, take: 10 }),
    );
  });
});
