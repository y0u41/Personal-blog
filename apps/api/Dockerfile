# 多阶段构建：先装依赖 + 编译，再把整个工作区拷到运行镜像。
# 说明：pnpm 的 node_modules 由符号链接组织（workspace 内互相引用），整体拷贝最稳妥；
#      因此镜像体积未做极限优化（个人项目可接受）。

# ---------- 构建阶段 ----------
FROM node:20-alpine AS builder
# Prisma 在 alpine（musl）上需要 openssl
RUN apk add --no-cache openssl libc6-compat && corepack enable
WORKDIR /app

# 先拷清单文件，利用 Docker 层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# 再拷源码并构建（shared 必须先构建，api 的类型依赖其产物）
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @blog/shared build \
 && pnpm --filter @blog/api exec prisma generate \
 && pnpm --filter @blog/api build

# ---------- 运行阶段 ----------
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl libc6-compat && corepack enable
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app ./
WORKDIR /app/apps/api
EXPOSE 3000
# 启动前应用迁移（幂等），再启动服务。
# 注意：用显式路径调用 prisma CLI——纯 `sh -c` 不会把 node_modules/.bin 加进 PATH。
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
