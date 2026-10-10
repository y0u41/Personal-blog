import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ErrorCode, UserRole } from '@blog/shared';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
}

// 解析 Authorization: Bearer <token>，校验签名并回填 req.user。
//
// 每次请求都会回查用户表，以数据库中的「实时角色与状态」为准，而不是直接信任
// token 里的快照。原因：管理员提升/降级角色、停用账号后，旧 token 仍可能有效
// （access token 有效期 2h），若只信 token，降级与停用要等最长 2 小时才生效。
// 代价是一次按主键的索引查询，在本项目规模下可接受。
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET 未配置');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const id = /^\d+$/.test(payload.sub) ? BigInt(payload.sub) : null;
    if (id == null) {
      throw this.unavailable();
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, role: true, status: true },
    });
    if (!user || user.status !== 1) {
      throw this.unavailable();
    }
    return { id: user.id.toString(), username: user.username, role: user.role };
  }

  private unavailable(): UnauthorizedException {
    return new UnauthorizedException({
      code: ErrorCode.USER_DISABLED,
      message: '账号不可用，请重新登录',
    });
  }
}
