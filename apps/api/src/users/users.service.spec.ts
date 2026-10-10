import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

interface MockUserRow {
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

const TARGET: MockUserRow = {
  id: 2n,
  username: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice',
  avatar: null,
  bio: null,
  role: 'reader',
  status: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  _count: { posts: 0 },
};

function makeService() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: { updateMany: jest.fn() },
  };
  const service = new UsersService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('UsersService 管理端', () => {
  describe('updateRole（提升作者）', () => {
    it('禁止管理员修改自己的角色，避免丢掉唯一管理员', async () => {
      const { service, prisma } = makeService();
      await expect(service.updateRole('1', '1', 'reader')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('目标用户不存在时返回 404', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.updateRole('1', '2', 'author')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('把 reader 提升为 author，并返回管理端字段', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValue({ ...TARGET });
      prisma.user.update.mockResolvedValue({ ...TARGET, role: 'author' });

      const updated = await service.updateRole('1', '2', 'author');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 2n },
        data: { role: 'author' },
        select: expect.anything(),
      });
      expect(updated).toMatchObject({
        id: '2',
        username: 'alice',
        email: 'alice@example.com',
        role: 'author',
        status: 1,
        postCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('越界的目标 id 直接 400，不会打到数据库', async () => {
      const { service, prisma } = makeService();
      await expect(service.updateRole('1', '99999999999999999999999', 'author')).rejects.toThrow(
        /超出取值范围|不合法/,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus（启用/停用）', () => {
    it('禁止修改自己的账号状态', async () => {
      const { service } = makeService();
      await expect(service.updateStatus('1', '1', 0)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('停用他人账号时吊销其全部 refresh token', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValue({ ...TARGET });
      prisma.user.update.mockResolvedValue({ ...TARGET, status: 0 });

      await service.updateStatus('1', '2', 0);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 2n, revoked: 0 },
        data: { revoked: 1 },
      });
    });

    it('启用账号时不动 refresh token', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValue({ ...TARGET, status: 0 });
      prisma.user.update.mockResolvedValue({ ...TARGET, status: 1 });

      await service.updateStatus('1', '2', 1);

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('adminList', () => {
    it('关键字同时匹配用户名/昵称/邮箱，并按角色过滤', async () => {
      const { service, prisma } = makeService();
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([{ ...TARGET }]);

      const res = await service.adminList({ page: 1, pageSize: 20, role: 'reader', keyword: 'ali' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            role: 'reader',
            OR: [
              { username: { contains: 'ali' } },
              { displayName: { contains: 'ali' } },
              { email: { contains: 'ali' } },
            ],
          },
        }),
      );
      expect(res.meta).toEqual({ total: 1, page: 1, pageSize: 20 });
      expect(res.items[0]).toMatchObject({ id: '2', role: 'reader' });
    });

    it('无筛选条件时不构造多余的 where 子句', async () => {
      const { service, prisma } = makeService();
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      await service.adminList({});

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });
});
