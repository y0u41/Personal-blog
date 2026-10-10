# 多阶段构建：Node 构建静态资源 → Nginx 托管并反代 /api 与 /uploads

# ---------- 构建阶段 ----------
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @blog/shared build \
 && pnpm --filter @blog/web build

# ---------- 运行阶段 ----------
FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
# 安全响应头片段（nginx.conf 用 include 引入；放在 conf.d 之外避免被自动 include）
COPY apps/web/nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
