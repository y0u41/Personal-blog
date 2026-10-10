import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PostsModule } from './posts/posts.module';
import { CategoriesModule } from './categories/categories.module';
import { TagsModule } from './tags/tags.module';
import { CommentsModule } from './comments/comments.module';
import { UploadsModule } from './uploads/uploads.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

// 全局兜底限流：每分钟 N 次（按用户 id，未登录按 IP）。各敏感接口另有更严格覆盖。
const DEFAULT_THROTTLE_LIMIT = 300;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // pnpm 以 apps/api 为 cwd 运行，根 .env 在两级之上
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '../../.env',
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): ThrottlerModuleOptions => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: Number(
              config.get<string>('THROTTLE_LIMIT') ?? DEFAULT_THROTTLE_LIMIT,
            ),
          },
        ],
        // 跟踪键：已登录按用户 id，未登录按 IP（避免 NAT 出口用户互相牵连）
        getTracker: (req) => {
          const user = (req as { user?: { id?: string } }).user;
          if (user?.id) {
            return `user:${user.id}`;
          }
          return `ip:${(req as { ip?: string }).ip ?? 'unknown'}`;
        },
        errorMessage: '请求过于频繁，请稍后再试',
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PostsModule,
    CategoriesModule,
    TagsModule,
    CommentsModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 顺序有意义：JwtAuthGuard 先填充 req.user → RolesGuard 校验角色 →
    // ThrottlerGuard 以 req.user 作为限流跟踪键。
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
