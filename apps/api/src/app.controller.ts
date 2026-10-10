import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

// 健康检查不参与限流，避免探针被误伤
@SkipThrottle()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // 存活探针：不依赖数据库，且对外部公开（全局 JwtAuthGuard 放行）
  @Public()
  @Get('healthz')
  healthz() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  // 就绪探针：检查数据库连通性，失败返回 degraded 而非崩溃；公开
  @Public()
  @Get('readyz')
  async readyz() {
    const dbOk = await this.appService.checkDb();
    return { status: dbOk ? 'ok' : 'degraded', database: dbOk, ts: new Date().toISOString() };
  }
}
