import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

const CATEGORY = {
  id: 1n,
  name: '技术',
  slug: 'tech',
  parentId: null,
  description: null,
  sortOrder: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function makeService() {
  const prisma = {
    category: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(CATEGORY),
      update: jest.fn().mockResolvedValue(CATEGORY),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new CategoriesService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('CategoriesService 列表', () => {
  it('按 sortOrder 升序、id 兜底排序，并带文章计数', async () => {
    const { service, prisma } = makeService();

    await service.findAll();

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { posts: true } } },
    });
  });
});

describe('CategoriesService 新建分类', () => {
  it('显式指定的 slug 已被占用时抛 409', async () => {
    const { service, prisma } = makeService();
    prisma.category.findUnique.mockResolvedValue({ id: 9n, slug: 'tech' });

    await expect(service.create({ name: '技术', slug: 'tech' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('未指定 slug 时由名称生成，冲突则自动追加序号', async () => {
    const { service, prisma } = makeService();
    // 第一次探测发现同名 slug 已存在，第二次探测可用
    prisma.category.findUnique
      .mockResolvedValueOnce({ id: 9n, slug: '技术笔记' })
      .mockResolvedValueOnce(null);

    await service.create({ name: '技术笔记' });

    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: '技术笔记-2' }),
      }),
    );
  });

  it('父分类不存在时抛 400（先于写入校验）', async () => {
    const { service, prisma } = makeService();
    prisma.category.findUnique.mockResolvedValue(null); // slug 可用，但父分类查不到

    await expect(
      service.create({ name: '子分类', parentId: 404 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('未指定 sortOrder 时默认写入 0', async () => {
    const { service, prisma } = makeService();

    await service.create({ name: '随笔' });

    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sortOrder: 0, parentId: null }),
      }),
    );
  });
});

describe('CategoriesService 更新分类', () => {
  it('分类不存在时抛 404', async () => {
    const { service, prisma } = makeService();
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(service.update('404', { name: '新名' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('把父分类指向自身时抛 400（防成环）', async () => {
    const { service, prisma } = makeService();
    prisma.category.findUnique.mockResolvedValue({ ...CATEGORY, id: 3n });

    await expect(service.update('3', { parentId: 3 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('父分类不存在时抛 400', async () => {
    const { service, prisma } = makeService();
    prisma.category.findUnique
      .mockResolvedValueOnce({ ...CATEGORY, id: 3n })
      .mockResolvedValueOnce(null);

    await expect(service.update('3', { parentId: 404 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('改 slug 且新 slug 已被占用时抛 409', async () => {
    const { service, prisma } = makeService();
    prisma.category.findUnique
      .mockResolvedValueOnce({ ...CATEGORY, slug: 'old' })
      .mockResolvedValueOnce({ id: 2n, slug: 'taken' });

    await expect(service.update('1', { slug: 'taken' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('slug 未变化时不触发唯一性检查', async () => {
    const { service, prisma } = makeService();
    prisma.category.findUnique.mockResolvedValue({ ...CATEGORY, slug: 'tech' });

    await service.update('1', { slug: 'tech' });

    expect(prisma.category.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.category.update).toHaveBeenCalledTimes(1);
  });
});

describe('CategoriesService 删除分类', () => {
  it('分类不存在时抛 404', async () => {
    const { service, prisma } = makeService();
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(service.remove('404')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it('存在时执行删除（子分类与文章的外键由 DB 置空）', async () => {
    const { service, prisma } = makeService();
    prisma.category.findUnique.mockResolvedValue(CATEGORY);

    await expect(service.remove('1')).resolves.toEqual({ message: '已删除' });
    expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: 1n } });
  });
});
