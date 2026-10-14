import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        // 生产环境强校验：拒绝默认值或过短密钥，防止弱密钥静默进入生产
        if (process.env.NODE_ENV === 'production') {
          if (!secret || secret.length < 32 || secret === 'dev-only-change-me-access') {
            throw new Error(
              'JWT_SECRET 未配置或使用默认值/过短。生产环境必须设置 >=32 字符的随机密钥。',
            );
          }
        }
        return {
          secret,
          signOptions: {
            expiresIn: config.get<string>('JWT_ACCESS_EXPIRES') ?? '2h',
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
