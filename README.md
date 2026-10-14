# 📝 个人博客系统

![License](https://img.shields.io/badge/license-MIT-green) ![NestJS](https://img.shields.io/badge/NestJS-11-E0234E) ![React](https://img.shields.io/badge/React-19-61DAFB) ![Prisma](https://img.shields.io/badge/Prisma-6-2D3748) ![Tests](https://img.shields.io/badge/coverage-53%25-brightgreen)

> 一个功能完备的前后端分离博客平台，含三级权限、评论审核、数据统计 📊

## 这是什么？

一个**生产级**的个人博客系统，不只是能用，而是**好用且安全**。前后端分离架构，Docker Compose 一键部署，配有三层测试体系（单测 + e2e + 浏览器冒烟）。

**适合场景**：
- 📚 学习 NestJS + React 全栈开发
- 🚀 部署个人博客（生产可用）
- 🎯 研究 RBAC 权限、安全防护的最佳实践

## ✨ 功能特性

### 内容管理
- 📝 文章三态（草稿/已发布/已归档）+ Markdown 实时预览
- 📁 多级分类 + 标签多对多
- 📊 随笔归档：档案树 + 年度热力图 + 时间线
- 🏆 排行榜：阅读榜/评论榜/推荐榜
- 📌 文章置顶

### 互动功能
- ❤️ 点赞/收藏（幂等接口）
- 💬 两级评论 + 多级回复 + 三态审核
- 👤 三级角色（admin/author/reader）

### 安全与工程
- 🔐 双 Token 认证 + refresh token 可撤销
- 🛡️ 接口限流 + 图片三重校验
- 🧪 三层测试（单测/e2e/浏览器冒烟）
- 🚀 GitHub Actions CI + 覆盖率门禁

## 🛠️ 技术栈

| 层 | 选型 |
|---|---|
| **后端** | NestJS 11 · Prisma 6 · MySQL 8 |
| **前端** | React 19 · Vite · Tailwind CSS |
| **部署** | Docker Compose · Nginx · GitHub Actions |
| **测试** | Jest · Vitest · 覆盖率 53%+ |

## 📁 目录结构

```
Personal-blog/
├── apps/
│   ├── api/                # NestJS 后端
│   │   ├── prisma/         # 数据库 schema + 迁移
│   │   └── src/            # 业务模块
│   └── web/                # React 前端
│       ├── src/pages/      # 页面
│       └── src/components/ # 组件
├── packages/shared/        # 前后端共享类型
├── docker-compose.yml      # 一键部署
└── .github/workflows/      # CI 流水线
```

## 🚀 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env

# 3. 初始化数据库
pnpm db:push

# 4. 启动开发环境
pnpm dev
```

**Docker 一键部署**：

```bash
docker compose up -d
```

## 🧪 测试

```bash
pnpm test           # 后端单测
pnpm test:web       # 前端测试
pnpm test:coverage  # 覆盖率报告
```

## 📄 许可证

[MIT License](LICENSE) © y0u41

## 架构

pnpm workspace 三包结构，前后端共享同一份类型定义与错误码，避免接口字段与枚举含义在两侧漂移。

```
.
├─ apps/
│  ├─ api/                 NestJS 后端
│  │  ├─ prisma/           schema.prisma · migrations/ · seed.ts
│  │  └─ src/
│  │     ├─ auth/          认证：双 Token、refresh 旋转与撤销
│  │     ├─ users/         用户与个人中心、管理端权限变更
│  │     ├─ posts/         文章、互动、归档、排行榜、置顶
│  │     ├─ categories/    分类
│  │     ├─ tags/          标签
│  │     ├─ comments/      评论与审核
│  │     ├─ uploads/       图片上传与存储
│  │     └─ common/        守卫 · 装饰器 · 过滤器 · 拦截器 · 映射器 · 工具
│  └─ web/                 React 前端
│     ├─ nginx.conf        静态托管 + 反向代理 + SPA 回退
│     └─ src/
│        ├─ api/           接口封装（Axios 实例、token 注入与刷新）
│        ├─ store/         Zustand（认证、Toast）
│        ├─ lib/           纯函数工具（日期、分类树、热力图、会话提示）
│        ├─ components/    通用与业务组件
│        ├─ pages/         页面（含 pages/admin/ 后台四页）
│        └─ router/        路由与角色守卫
├─ packages/shared/        前后端共享类型与错误码
├─ scripts/                端到端回归脚本（Python + Playwright）
├─ schema.sql              数据库结构事实来源
├─ docker-compose.yml      MySQL + API + Web 三服务
└─ .github/workflows/ci.yml
```

### 数据模型

9 张表：`users` · `posts` · `categories` · `tags` · `post_tags` · `comments` ·
`post_likes` · `post_favorites` · `refresh_tokens`，共 4 条渐进式迁移。

约束设计上刻意把一部分不变量交给数据库而不是应用层：
- 点赞 / 收藏用 `(post_id, user_id)` 复合主键，重复插入天然失败，无需应用层判重
- 删用户级联删其文章；删分类则把文章的分类置空（`SET NULL`），不误伤内容
- `refresh_tokens` 落库是「服务端可撤销」的前提，否则无状态 JWT 签发后无法收回

### 规模

| 指标 | 数值 |
|---|---|
| 源码 | 111 个文件 / 8,039 行（后端 3,648 · 前端 4,083 · 共享包 308） |
| 测试与脚本 | 4,918 行 |
| 接口 | 43 个路由处理器 / 9 个控制器 |
| 前端 | 17 个页面 / 14 个通用组件 |

## 快速开始

### 方式一：Docker 一键启动（推荐）

```bash
cp .env.production.example .env      # 按需修改，尤其是 JWT 密钥
docker compose -p blog up -d --build
```

访问 <http://localhost:8080>。

> 必须显式指定 `-p blog`：本项目目录名含中文，compose 无法自动推导项目名。

只想起数据库（本地开发用）：

```bash
docker compose -p blog up -d mysql
```

### 方式二：本地开发

```bash
pnpm install
cp .env.example .env                 # 后端读取仓库根目录的 .env
docker compose -p blog up -d mysql   # 或自备 MySQL 8

pnpm --filter @blog/api prisma:generate
pnpm --filter @blog/api exec prisma migrate deploy   # 应用已有迁移
pnpm --filter @blog/api prisma:seed                  # 建管理员与默认分类/标签

pnpm dev                             # api :3000 + web :5173
```

> 初始化迁移用 `migrate deploy` 而不是 `migrate dev`：后者需要创建影子数据库的权限，
> 普通业务账号通常没有，会直接失败。新增迁移时再按需使用 `migrate dev`。

前端开发服务器在 5173，`/api` 与 `/uploads` 已代理到 3000。

> seed 会创建默认管理员账号（见 `apps/api/prisma/seed.ts`）。
> **任何对外可访问的环境，部署后请立即修改默认密码与 JWT 密钥。**

> **运行环境：Node 20 LTS。** 生产镜像（`node:20-alpine`）、CI 与本地请保持同一条 LTS 线。
> 这里踩过一个很隐蔽的坑：`jsdom@30` 的 `engines` 是 `^22.22.2 || ^24.15.0 || >=26`，
> 其依赖链（`undici@8`）用到了 Node 22 才有的 `webidl.util.markAsUncloneable`。
> 本机 Node 22.22.2 下一切正常，但 CI（Node 20）一加载 jsdom 就抛 `TypeError`；
> 而 pnpm 对 `engines` 只告警不报错，于是现象是「三个组件测试莫名不执行、覆盖率掉到 0」，
> 而不是一条直白的版本错误。因此 `jsdom` 固定在 `^26`（`engines` 为 `>=18`）。
> **升级依赖后，请务必用 Node 20 实跑一次测试再提交**，否则同类问题只会在 CI 上暴露。

### 环境变量

见 `.env.example`（开发）与 `.env.production.example`（部署）。几个容易踩坑的：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | Windows + Docker Desktop 下 `localhost` 可能解析到 IPv6 `::1` 导致连不上，统一写 `127.0.0.1` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | 生产必须替换为强随机长字符串 |
| `CORS_ORIGINS` | 跨域带 Cookie 时必须写具体域名，不能用 `*` |
| `COOKIE_SECURE` | 仅在 HTTPS 部署时为 `true`；HTTP 下设为 `true` 会导致浏览器不回传 refresh Cookie |
| `TRUST_PROXY` | Nginx 前置时保持 `1` 以取到真实客户端 IP；直接对外暴露时应为 `0`，否则客户端可伪造 `X-Forwarded-For` 绕过限流 |

## 测试

### 单元测试与覆盖率

```bash
pnpm -r test        # 跑全部单测
pnpm -r test:cov    # 附带覆盖率（CI 使用，会校验门禁）
```

| 套件 | 用例数 | 覆盖率（分母 = 全部源码） |
|---|---|---|
| 后端 Jest | 166 | 语句 53.23% · 分支 77.74% · 函数 46.60% · 行 54.29% |
| 前端 Vitest | 61 | 全局 5.90% · 分支 73.68% |

**关于覆盖率口径，有两点需要说明清楚：**

1. **分母覆盖全部源码，而不是"已经被测到的文件"。** Jest 默认只统计被测试文件 import 到的模块，
   按默认口径本项目能报出 85% —— 但那是假象：评论、分类、标签、认证四个核心服务当时完全没有单测，
   压根不进分母。改用全量分母后真实值只有 28.76%，补齐测试后才到现在的 53.23%。
   门禁阈值也据此设定（语句 50 / 分支 70 / 函数 45 / 行 50），用于防止覆盖率被悄悄拉低。

2. **前端全局覆盖率只有 5.90%，这是有意的覆盖策略，不是遗漏。** `src/pages/` 近 4,000 行不写组件级
   单测，改由真实浏览器冒烟脚本覆盖（55 项断言，跑遍所有页面路由与关键交互，并断言零 JS 异常）。
   单测集中在承担业务逻辑、且本就该由单测兜住的位置：`src/lib/` 与 `src/store/` 已达约 100%，
   阈值按目录单独设置（lib 95% / store 90%）。给全站设一个统一低门槛等于没设，按目录设才能真正拦住回退。

### 端到端回归

7 套脚本，共约 230 项断言，全部跑在容器内生产构建上（`scripts/`）：

| 脚本 | 覆盖内容 |
|---|---|
| `e2e_smoke.py` | M1–M4 基础链路（注册登录、文章增删改查、权限） |
| `e2e_p0p1.py` | 角色闭环、非法输入返回 4xx |
| `e2e_m5.py` | 评论、上传、登录限流（**会打满配额，须最后执行**） |
| `e2e_m6.py` | 点赞收藏、标签归档、上下篇、相关文章、热门 |
| `e2e_m6b.py` | 归档口径、年月筛选、热力图、三榜排序、置顶权限与不变量 |
| `check_nginx_headers.py` | 安全响应头、真 404、SPA 回退、缓存策略 |
| `browser_admin_smoke.mjs` | Playwright + 系统 Edge 驱动真实 UI，校验交互并断言零 JS 异常 |

```bash
BASE=http://127.0.0.1:8080/api python scripts/e2e_m6b.py
PLAYWRIGHT_CORE_HOME=<playwright-core 所在目录> node scripts/browser_admin_smoke.mjs
```

每个脚本都会自清理测试数据，可重复执行且不污染基线。

## API 概览

统一前缀 `/api`，43 个路由处理器分布在 9 个控制器。

| 模块 | 主要接口 |
|---|---|
| 认证 `/auth` | `POST register` · `login` · `refresh` · `logout` · `password` |
| 文章 `/posts` | `GET`（列表，支持分类/标签/关键词/年月筛选）· `GET hot` · `archive` · `archive/days` · `rank` · `GET :idOrSlug`（详情，含互动状态/上下篇/相关）· `POST` · `PATCH :id` · `DELETE :id` · `PATCH :id/pin` · `POST/DELETE :id/like` · `POST/DELETE :id/favorite` |
| 分类 `/categories` | `GET` · `POST` · `PATCH :id` · `DELETE :id` |
| 标签 `/tags` | `GET` · `GET :slug` · `POST` · `PATCH :id` · `DELETE :id` |
| 评论 `/comments` | `GET`（管理端分页）· `PATCH :id`（审核）· `DELETE :id`；`/posts/:slug/comments` 的 `GET`（树）· `POST` |
| 用户 `/users` | `GET me` · `PATCH me` · `GET me/posts` · `GET me/favorites` · `GET`（管理端）· `PATCH :id/role` · `PATCH :id/status` |
| 上传 `/uploads` | `POST`（图片） |
| 健康检查 | `GET /healthz` · `GET /readyz` |

## 关键设计决策

这些是开发过程中真正的取舍点，也是理解本项目的最佳入口。

**1. 权限实时性优先于省一次查询。**
无状态 JWT 的固有问题是 token 一旦签发就无法收回，`role` 会停留在签发时的快照。
本项目让 `JwtStrategy` **每个请求按 `sub` 回查一次数据库**，以库里的实时 role 与 status 为准。
代价是每请求一次主键查询，换来的是管理员提升作者、停用账号能立即生效。
若要换回性能，可改为在 token 里带版本号、仅在版本变化时回查。

**2. 互动接口做成幂等。**
点赞用 `upsert`、取消用 `deleteMany`：重复点赞不报错，取消一条本不存在的记录也不报错。
网络重试、双击、并发请求都不会让用户看到 500，也不会让计数错乱。

**3. 不设冗余计数字段。**
点赞数、收藏数、评论数全部由关系聚合（`_count`）实时得出，不维护 `like_count` 之类的冗余列。
这会多一次聚合查询，但从根本上消除了"计数与实际记录不一致"这一整类 bug 和它的修复脚本。
未来若排序成为瓶颈，再引入计数字段并用事务维护。

**4. 置顶用可空时间戳，不用布尔值。**
多篇置顶时需要按"最近置顶的排在更前"排序，布尔值表达不了先后。
对外只在映射层派生出 `isPinned`，不额外落冗余列。同时立了一条不变量：**置顶 ⟹ 已发布** ——
草稿置顶返回 400，文章从已发布改回草稿时自动解除置顶。

**5. 排行榜的排序表达式取自服务端白名单。**
`type` 参数只用于在白名单常量里查表，用户输入永不参与 SQL 拼接，没有注入面。
另外评论榜只统计**已过审**评论，与卡片上显示的评论数同一口径 ——
否则会出现"排序按含待审评论、显示按已过审"的数据自相矛盾。

**6. 计数口径统一在服务端收口。**
标签列表的关联计数只算已发布文章（`_count.postTags: { where: { post: { status: 'published' } } }`），
避免把草稿数量暴露给游客。

**7. 真 404 而不是一律回退。**
SPA 回退很容易写成"任何 404 都返回 index.html"，结果是静态资源请求打错字也返回 200 页面，
既污染缓存也让排查变难。Nginx 里用正则 location 区分：带扩展名的静态资源真实返回 404，
其余路径才回退到 `index.html`。

**8. 上传校验不能只信客户端。**
`Content-Type` 由客户端提供，极易伪造。除 MIME 与后缀白名单外，额外读取文件头做魔数嗅探，
识别改名的非图片文件；落盘用随机文件名，规避路径穿越与覆盖。

## 安全设计

- **密码**：bcrypt（cost 12）哈希存储；接口响应统一经映射器脱敏，不外泄 `passwordHash`
- **Token**：access 短效（默认 2h）+ refresh 长效（默认 7d，HttpOnly + SameSite Cookie）；
  refresh 只存 SHA-256 哈希，明文不落库；刷新时旋转并立即吊销旧 token；
  登出 / 改密 / 账号停用会批量吊销该用户全部 refresh token
- **权限**：全局默认鉴权，`@Public()` 显式放行（漏配会导致接口裸奔，因此默认拒绝）；
  管理端禁止修改自身角色与状态，防止把系统里唯一的管理员锁死
- **限流**：全局按用户 / IP 限流，登录等敏感接口更严格；`TRUST_PROXY` 正确配置才能取到真实客户端 IP
- **主键**：主键为 unsigned bigint，超出 JS 安全整数范围的入参直接返回 400，而不是静默精度丢失
- **错误**：统一异常过滤器把 Prisma 错误码映射为语义化状态码（唯一冲突 409、未找到 404 等），
  5xx 记录方法、路径与堆栈；未发布文章对无权访问者按 404 处理，不暴露其是否存在

## 已知限制与未实现

明确列出，避免误期待：

- **排行榜只有总榜。** 周榜 / 月榜需要浏览明细，而当前只存 `posts.views` 总量，无按天的浏览记录表。
- **无 RSS / sitemap。** slug 已为搜索引擎收录预留，但订阅与站点地图尚未实现。
- **浏览计数按 IP + 1 小时去重**，能削弱刷量但不能根治。
- **上传文件无删除接口**，清理只能直接操作 `uploads` 卷。
- **无删除用户接口**，只能停用（`status = 0`）。
- **前端未做路由级代码分割**：当前产物约 496 kB（gzip 约 156 kB），全部页面打进单个 chunk。
  按路由懒加载（`React.lazy`）可显著降低首屏体积，尚未实施。
- **前端全局单测覆盖率偏低**（见上文测试章节的说明）。
- **刻意不做**：关注 / 粉丝、私信、积分等级、付费专栏等平台级功能 —— 与"个人博客"定位冲突。

## 部署到公网前必做

1. 替换 `JWT_SECRET` 与 `JWT_REFRESH_SECRET` 为强随机值，并修改数据库密码
2. 修改 seed 创建的默认管理员密码
3. 启用 HTTPS，并将 `COOKIE_SECURE` 设为 `true`
4. `CORS_ORIGINS` 收敛为实际域名
5. 确认 `TRUST_PROXY` 与前置代理层数一致
6. MySQL 端口不要暴露到公网（当前 compose 仅绑回环，对外部署可直接删掉 `api` 的 `ports` 段）

## 文档

- `PRD.md` —— 产品定位、功能范围与验收口径
- `Tech_Design.md` —— 技术选型、数据模型、接口清单、权限矩阵、里程碑
- `AGENTS.md` —— 事实来源优先级与改库同步流程

事实来源优先级：`PRD.md` > `Tech_Design.md` > `schema.sql` > 代码现状。
数据库结构变更须同步三处：`schema.sql` → `prisma/schema.prisma` → 迁移文件。
