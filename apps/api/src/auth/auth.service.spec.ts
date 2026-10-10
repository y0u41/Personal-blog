import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

// 真 bcrypt 每轮 12 次计算，单测里没必要付这个代价；桩掉后行为可控且更快
jest.mock('bcryptjs', () => ({ hash: jest.fn(), compare: jest.fn() }));

const hashMock = bcrypt.hash as jest.Mock;
const compareMock = bcrypt.compare as jest.Mock;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const USER = {
  id: 5n,
  username: 'yu',
  email: 'yu@example.com',
  passwordHash: 'STORED_HASH',
  displayName: 'Yu',
  role: 'reader' as const,
  status: 1,
  avatar: null,
  bio: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function makeService(expires = '7d') {
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(USER),
      update: jest.fn().mockResolvedValue(USER),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') };
  const config = { get: jest.fn().mockReturnValue(expires) };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
  );
  return { service, prisma, jwt, config };
}

describe('AuthService 注册', () => {
  it('用户名或邮箱已存在时抛 409', async () => {
    const { service, prisma } = makeService();
    prisma.user.findFirst.mockResolvedValue(USER);

    await expect(
      service.register({ username: 'yu', email: 'yu@example.com', password: 'Passw0rd!' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('注册时强制最小权限：role=reader、status=1', async () => {
    const { service, prisma } = makeService();
    hashMock.mockResolvedValue('HASHED');

    await service.register({
      username: 'newbie',
      email: 'new@example.com',
      password: 'Passw0rd!',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'reader', status: 1 }),
      }),
    );
  });

  it('落库的是哈希而非明文密码', async () => {
    const { service, prisma } = makeService();
    hashMock.mockResolvedValue('HASHED');

    await service.register({
      username: 'newbie',
      email: 'new@example.com',
      password: 'Passw0rd!',
    });

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.passwordHash).toBe('HASHED');
    expect(JSON.stringify(data)).not.toContain('Passw0rd!');
  });

  it('未提供昵称时回退为用户名', async () => {
    const { service, prisma } = makeService();
    hashMock.mockResolvedValue('HASHED');

    await service.register({
      username: 'newbie',
      email: 'new@example.com',
      password: 'Passw0rd!',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayName: 'newbie' }),
      }),
    );
  });

  it('返回的公开用户信息不含密码哈希', async () => {
    const { service } = makeService();
    hashMock.mockResolvedValue('HASHED');

    const res = await service.register({
      username: 'newbie',
      email: 'new@example.com',
      password: 'Passw0rd!',
    });

    expect(res.accessToken).toBe('access-token');
    expect(res.user).not.toHaveProperty('passwordHash');
    expect(res.user.id).toBe('5');
  });
});

describe('AuthService 登录', () => {
  it('用户不存在时抛 401', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ username: 'ghost', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('账号被停用（status=0）时抛 401', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ ...USER, status: 0 });

    await expect(
      service.login({ username: 'yu', password: 'Passw0rd!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('密码错误时抛 401，且不区分是用户名还是密码错', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(USER);
    compareMock.mockResolvedValue(false);

    await expect(
      service.login({ username: 'yu', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('校验通过时签发 token 对', async () => {
    const { service, prisma, jwt } = makeService();
    prisma.user.findUnique.mockResolvedValue(USER);
    compareMock.mockResolvedValue(true);

    const res = await service.login({ username: 'yu', password: 'Passw0rd!' });

    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: '5', username: 'yu', role: 'reader' }),
    );
    expect(res.accessToken).toBe('access-token');
    expect(typeof res.refreshToken).toBe('string');
  });
});

describe('AuthService refresh token 存储', () => {
  it('只落库 SHA-256 哈希，明文 token 不落库', async () => {
    const { service, prisma } = makeService();
    hashMock.mockResolvedValue('HASHED');
    prisma.user.findUnique.mockResolvedValue(USER);
    compareMock.mockResolvedValue(true);

    const { refreshToken } = await service.login({
      username: 'yu',
      password: 'Passw0rd!',
    });

    const saved = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(saved.tokenHash).toBe(sha256(refreshToken));
    expect(saved.tokenHash).not.toBe(refreshToken);
    expect(saved.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('过期时间按 JWT_REFRESH_EXPIRES 解析（30m → 30 分钟）', async () => {
    const { service, prisma } = makeService('30m');
    hashMock.mockResolvedValue('HASHED');
    prisma.user.findUnique.mockResolvedValue(USER);
    compareMock.mockResolvedValue(true);

    const before = Date.now();
    await service.login({ username: 'yu', password: 'Passw0rd!' });

    const { expiresAt } = prisma.refreshToken.create.mock.calls[0][0].data;
    const delta = expiresAt.getTime() - before;
    expect(delta).toBeGreaterThan(29 * 60 * 1000);
    expect(delta).toBeLessThanOrEqual(30 * 60 * 1000 + 1000);
  });

  it('无法解析的配置回落为 7 天', async () => {
    const { service, prisma } = makeService('not-a-duration');
    hashMock.mockResolvedValue('HASHED');
    prisma.user.findUnique.mockResolvedValue(USER);
    compareMock.mockResolvedValue(true);

    const before = Date.now();
    await service.login({ username: 'yu', password: 'Passw0rd!' });

    const { expiresAt } = prisma.refreshToken.create.mock.calls[0][0].data;
    const days = (expiresAt.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7.01);
  });
});

describe('AuthService refresh 旋转', () => {
  it('未登记的 token 抛 401', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(service.refresh('unknown')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('已吊销的 token 抛 401（防止重放）', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      tokenHash: sha256('t'),
      userId: 5n,
      revoked: 1,
      expiresAt: new Date(Date.now() + 1000),
    });

    await expect(service.refresh('t')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('已过期的 token 抛 401', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      tokenHash: sha256('t'),
      userId: 5n,
      revoked: 0,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.refresh('t')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('有效 token 换取新对，并立即吊销旧 token', async () => {
    const { service, prisma } = makeService();
    const raw = 'valid-token';
    prisma.refreshToken.findUnique.mockResolvedValue({
      tokenHash: sha256(raw),
      userId: 5n,
      revoked: 0,
      expiresAt: new Date(Date.now() + 1000),
    });
    prisma.user.findUnique.mockResolvedValue(USER);

    const res = await service.refresh(raw);

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { tokenHash: sha256(raw) },
      data: { revoked: 1 },
    });
    expect(res.refreshToken).not.toBe(raw);
    expect(res.accessToken).toBe('access-token');
  });

  it('用户被停用后，即使 token 未过期也拒绝刷新', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      tokenHash: sha256('t'),
      userId: 5n,
      revoked: 0,
      expiresAt: new Date(Date.now() + 1000),
    });
    prisma.user.findUnique.mockResolvedValue({ ...USER, status: 0 });

    await expect(service.refresh('t')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService 登出', () => {
  it('按 tokenHash 吊销未吊销的记录（不存在也不报错）', async () => {
    const { service, prisma } = makeService();

    await service.logout('some-token');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256('some-token'), revoked: 0 },
      data: { revoked: 1 },
    });
  });
});

describe('AuthService 修改密码', () => {
  it('用户不存在时抛 401', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.changePassword('5', { oldPassword: 'a', newPassword: 'b' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('原密码错误时抛 403', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(USER);
    compareMock.mockResolvedValue(false);

    await expect(
      service.changePassword('5', { oldPassword: 'wrong', newPassword: 'new' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('成功后更新哈希，并吊销该用户全部 refresh token', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(USER);
    compareMock.mockResolvedValue(true);
    hashMock.mockResolvedValue('NEW_HASH');

    await service.changePassword('5', {
      oldPassword: 'Passw0rd!',
      newPassword: 'NewPassw0rd!',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 5n },
      data: { passwordHash: 'NEW_HASH' },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 5n, revoked: 0 },
      data: { revoked: 1 },
    });
  });
});
