import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { ErrorCode } from '@blog/shared';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { parseId } from '../common/utils/parse-id';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { toPublicUser } from '../common/mappers/user.mapper';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 32;
const REFRESH_COOKIE = 'refresh_token';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // 注册并自动登录（签发 token 对）
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.USER_EXISTS,
        message: '用户名或邮箱已存在',
      });
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        displayName: dto.displayName ?? dto.username,
        role: 'reader',
        status: 1,
      },
    });
    return this.issueTokens(user);
  }

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || user.status !== 1) {
      return null;
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.username, dto.password);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: '用户名或密码错误',
      });
    }
    return this.issueTokens(user);
  }

  // 用 refresh token 换取新的 token 对（旋转：旧 token 立即吊销）
  async refresh(refreshTokenRaw: string) {
    const tokenHash = sha256Hex(refreshTokenRaw);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.revoked || record.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'refresh token 无效或已过期',
      });
    }
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revoked: 1 },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
    });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException({
        code: ErrorCode.USER_DISABLED,
        message: '用户不可用',
      });
    }
    return this.issueTokens(user);
  }

  async logout(refreshTokenRaw: string) {
    const tokenHash = sha256Hex(refreshTokenRaw);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: 0 },
      data: { revoked: 1 },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const id = parseId(userId, '用户 id');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }
    const ok = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!ok) {
      throw new ForbiddenException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: '原密码错误',
      });
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    // 改密后吊销该用户全部 refresh token，强制重新登录
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revoked: 0 },
      data: { revoked: 1 },
    });
  }

  getRefreshCookieName(): string {
    return REFRESH_COOKIE;
  }

  private async issueTokens(user: User) {
    const payload = { sub: user.id.toString(), username: user.username, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = await this.createRefreshToken(user.id);
    return {
      accessToken,
      refreshToken,
      user: toPublicUser(user),
    };
  }

  private async createRefreshToken(userId: bigint): Promise<string> {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + this.parseExpiry());
    await this.prisma.refreshToken.create({
      data: { tokenHash, userId, expiresAt },
    });
    return token;
  }

  private parseExpiry(): number {
    const value = this.config.get<string>('JWT_REFRESH_EXPIRES') ?? '7d';
    const m = /^(\d+)([dhm])$/.exec(value);
    if (!m) {
      return 7 * 24 * 60 * 60 * 1000;
    }
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const ms = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : 60_000;
    return n * ms;
  }
}
