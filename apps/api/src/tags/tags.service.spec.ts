import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from './tags.service';

const TAG = {
  id: 1n,
  name: 'TypeScript',
  slug: 'typescript',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function makeService() {
  const prisma = {
    tag: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(TAG),
      update: jest.fn().mockResolvedValue(TAG),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new TagsService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('TagsService 列表', () => {
  it('按名称升序，且只统计已发布文章数（不暴露草稿数量）', async () => {
    const { service, prisma } = makeService();

    await service.findAll();

    expect(prisma.tag.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { postTags: { where: { post: { status: 'published' } } } },
        },
      },
    });
  });
});

describe('TagsService 按 slug 查询', () => {
  it('标签不存在时抛 404', async () => {
    const { service, prisma } = makeService();
    prisma.tag.findUnique.mockResolvedValue(null);

    await expect(service.findBySlug('ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('存在时返回标签（同样只统计已发布文章）', async () => {
    const { service, prisma } = makeService();
    prisma.tag.findUnique.mockResolvedValue({ ...TAG, _count: { postTags: 2 } });

    const tag = await service.findBySlug('typescript');

    expect(prisma.tag.findUnique).toHaveBeenCalledWith({
      where: { slug: 'typescript' },
      include: {
        _count: {
          select: { postTags: { where: { post: { status: 'published' } } } },
        },
      },
    });
    expect(tag._count.postTags).toBe(2);
  });
});

describe('TagsService 新建标签', () => {
  it('显式 slug 已占用时抛 409', async () => {
    const { service, prisma } = makeService();
    prisma.tag.findUnique.mockResolvedValue({ id: 9n, slug: 'typescript' });

    await expect(
      service.create({ name: 'TypeScript', slug: 'typescript' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.tag.create).not.toHaveBeenCalled();
  });

  it('未指定 slug 时由名称生成，冲突则追加序号', async () => {
    const { service, prisma } = makeService();
    prisma.tag.findUnique
      .mockResolvedValueOnce({ id: 9n, slug: 'nestjs' })
      .mockResolvedValueOnce(null);

    await service.create({ name: 'NestJS' });

    expect(prisma.tag.create).toHaveBeenCalledWith({
      data: { name: 'NestJS', slug: 'nestjs-2' },
    });
  });
});

describe('TagsService 更新标签', () => {
  it('标签不存在时抛 404', async () => {
    const { service, prisma } = makeService();
    prisma.tag.findUnique.mockResolvedValue(null);

    await expect(service.update('404', { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('改 slug 且新 slug 已被占用时抛 409', async () => {
    const { service, prisma } = makeService();
    prisma.tag.findUnique
      .mockResolvedValueOnce({ ...TAG, slug: 'old' })
      .mockResolvedValueOnce({ id: 2n, slug: 'taken' });

    await expect(service.update('1', { slug: 'taken' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('slug 未变化时不触发唯一性检查', async () => {
    const { service, prisma } = makeService();
    prisma.tag.findUnique.mockResolvedValue({ ...TAG, slug: 'typescript' });

    await service.update('1', { slug: 'typescript' });

    expect(prisma.tag.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.tag.update).toHaveBeenCalledTimes(1);
  });
});

describe('TagsService 删除标签', () => {
  it('标签不存在时抛 404', async () => {
    const { service, prisma } = makeService();
    prisma.tag.findUnique.mockResolvedValue(null);

    await expect(service.remove('404')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tag.delete).not.toHaveBeenCalled();
  });

  it('存在时执行删除（关联由外键级联清除）', async () => {
    const { service, prisma } = makeService();
    prisma.tag.findUnique.mockResolvedValue(TAG);

    await expect(service.remove('1')).resolves.toEqual({ message: '已删除' });
    expect(prisma.tag.delete).toHaveBeenCalledWith({ where: { id: 1n } });
  });
});
