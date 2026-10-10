import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { resolve } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exception.filter';
import { BigIntSerializeInterceptor } from './common/interceptors/bigint-serialize.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 生产环境通常跑在 Nginx 反代之后：信任 1 跳代理，使 req.ip 取 X-Forwarded-For
  // 中的真实客户端 IP。否则限流/浏览量防刷会把所有访客聚合成代理容器 IP。
  // 直接对外暴露（无代理）时可用 TRUST_PROXY=0 关闭。
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

  // 统一接口前缀 /api（与前端 baseURL、Vite 代理、Tech_Design 接口清单一致）；
  // 健康检查保留在根路径，便于探针直接访问。
  app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz'] });

  // 安全响应头。关闭 CSP 以兼容 Swagger UI；uploads 允许跨域读取，便于前端开发
  // 时（不同源）直接展示已上传图片（生产同源，无影响）。
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // 上传图片静态托管（生产环境由 Nginx 直接服务或反代到这里）
  const uploadDir = resolve(process.env.UPLOAD_DIR ?? 'uploads');
  app.useStaticAssets(uploadDir, { prefix: '/uploads/' });

  // 全局校验管道：DTO 声明式校验，白名单剔除多余字段
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 全局异常过滤器：统一响应体 { code, message, data }
  app.useGlobalFilters(new AllExceptionsFilter());

  // 全局拦截器：把响应中的 BigInt 转为字符串（Prisma 实体主键为 BigInt）
  app.useGlobalInterceptors(new BigIntSerializeInterceptor());

  // CORS：显式来源，禁用通配符（生产环境 credentials 需要具体来源）
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  // 非生产环境暴露 Swagger 文档
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('个人博客系统 API')
      .setDescription('Blog API (Prisma + MySQL)')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port} (env=${process.env.NODE_ENV})`);
  // eslint-disable-next-line no-console
  console.log(`Static uploads served from ${uploadDir} at /uploads/`);
}

void bootstrap();
