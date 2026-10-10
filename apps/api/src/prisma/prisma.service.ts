import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // 数据库不可用时仍允许服务启动（由 /readyz 暴露降级），不阻断进程
    try {
      await this.$connect();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[prisma] connect failed, DB features unavailable:', (e as Error).message);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
