# 个人博客系统 Tech Design

> 配套文档：PRD.md（需求事实来源）、schema.sql（数据库结构事实来源）
> 版本：v1.0

## 技术选型

### 后端
- 运行时：Node.js 20 LTS + TypeScript 5（strict 模式）
- 框架：NestJS 10（模块化、依赖注入，守卫/拦截器/过滤器开箱即用）
- ORM：Prisma 5（类型安全，与 schema.sql 逐表对应）
- 数据库：MySQL 8.0（InnoDB 引擎，utf8mb4 字符集）
- 认证：JWT（access token 2h + refresh token 7d），密码哈希 bcrypt（cost 12）
- 参数校验：class-validator + class-transformer（DTO 声明式校验）
- 接口文档：Swagger / OpenAPI 3（@nestjs/swagger 自动生成）
- 日志：pino（结构化 JSON）

### 前端
- 框架：React 18 + TypeScript 5 + Vite 5
- 路由：React Router 6（页面级懒加载）
- 状态：Zustand（只放登录态与用户信息，服务端数据不进全局状态）
- 请求：Axios 统一实例 + 拦截器（注入 token、401 静默刷新）
- 样式：Tailwind CSS + shadcn/ui
- Markdown：react-markdown + remark-gfm + highlight.js

### 工程与部署
- 包管理：pnpm + workspace（monorepo）
- 质量：ESLint + Prettier + husky + lint-staged
- 测试：后端 Jest + Supertest（单测与 e2e），前端 Vitest + Testing Library
- 部署：Docker Compose（mysql + api + web），Nginx 托管前端静态资源并反代 /api

## 系统架构

### 分层结构
- Controller：只做参数接收与响应封装，不写业务逻辑
- Service：业务逻辑、事务边界、权限与归属判断
- Repository：Prisma Client 封装，唯一允许直接访问数据库的一层
- DTO：入参 / 出参结构，配合全局校验管道
- 依赖方向固定为 Controller → Service → Repository，禁止反向调用

### 请求处理链路
- CORS 白名单 → 访问日志 → 限流 → JWT 守卫 → DTO 校验 → Service → Prisma → MySQL → 异常过滤器 → 统一响应体

### 目录结构
```
blog/
├─ apps/
│  ├─ api/                       # NestJS 后端
│  │  ├─ src/
│  │  │  ├─ main.ts              # 启动、全局管道/过滤器、Swagger
│  │  │  ├─ app.module.ts
│  │  │  ├─ common/              # 守卫、拦截器、过滤器、装饰器、错误码
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/             # 注册、登录、刷新、登出
│  │  │  │  ├─ users/            # 个人中心
│  │  │  │  ├─ posts/            # 文章 CRUD、列表、浏览量
│  │  │  │  ├─ categories/
│  │  │  │  ├─ tags/
│  │  │  │  └─ comments/         # 可选扩展
│  │  │  └─ prisma/              # PrismaService
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ migrations/
│  │  │  └─ seed.ts
│  │  └─ test/                   # e2e
│  └─ web/                       # React 前端
│     └─ src/
│        ├─ main.tsx
│        ├─ router/
│        ├─ pages/               # Home / PostDetail / Write / Profile / Login
│        ├─ components/          # PostCard / Editor / Pagination / ...
│        ├─ api/                 # axios 实例与接口封装
│        ├─ store/               # 登录态
│        └─ styles/
├─ packages/
│  └─ shared/                    # 前后端共享类型与错误码
├─ schema.sql                    # 数据库结构事实来源
├─ PRD.md / Tech_Design.md / AGENTS.md
└─ docker-compose.yml
```

### 运行形态
- api：无状态 Node 服务，可直接水平扩展（登录态存于 JWT，服务端不存 session）
- web：纯静态资源，Nginx 或 CDN 托管
- 图片：开发期落本地 uploads/，生产建议对象存储（OSS/S3），数据库只存 URL

## 数据库设计

### 表清单
- users：用户账号，含角色 role 与软状态 status
- categories：分类，parent_id 自引用支持多级
- posts：文章主体，status 三态（draft / published / archived），pinned_at 支持置顶
- tags + post_tags：标签与多对多关联（可选扩展）
- comments：评论，parent_id 支持多级回复，游客可评论（可选扩展）
- post_likes / post_favorites：点赞与收藏，复合主键 (post_id, user_id) 天然去重

### 字段与约束要点
- users：uk_username、uk_email 唯一；password_hash 绝不存明文；role 取 admin / author / reader；status 1=正常 0=禁用
- categories：uk_slug 唯一；parent_id 自引用 ON DELETE SET NULL（删父分类不影响文章）；sort_order 控制同级排序
- posts：uk_slug 唯一；author_id → users ON DELETE CASCADE（删用户连带删文章）；category_id → categories ON DELETE SET NULL；索引 idx_author、idx_category、idx_status_published(status, published_at)、idx_status_pinned(status, pinned_at)；**删除为物理删除（无 deleted_at），不可逆，仅作者本人或 admin 经 Service 层归属校验后执行**
  - pinned_at：NULL = 未置顶。用可空时间戳而不是布尔值——多篇置顶时按「最近置顶在前」排序，布尔值无法表达先后。单一事实来源是 pinned_at 本身，对外只在映射层派生出 isPinned，不额外落冗余布尔列。
  - **不变量：置顶 ⟹ 已发布**。仅 status = published 的文章可置顶（否则 400）；文章转为草稿/归档时由 Service 层顺手清空 pinned_at，避免草稿以 isPinned=true 留在作者列表里。列表排序统一为 `pinned_at DESC, published_at DESC, id DESC`（MySQL 中 NULL 在 DESC 时排最后，正好等于「未置顶的排在置顶之后」）。
- tags / post_tags：联合主键 (post_id, tag_id) 天然去重；两侧外键均 ON DELETE CASCADE
- comments：user_id ON DELETE SET NULL（保留已注销用户的评论）；parent_id ON DELETE CASCADE（删父评论连带子评论）
- post_likes / post_favorites：联合主键 (post_id, user_id) 保证「一人一赞/一收藏」，因此应用层无需判重，重复点赞走 upsert、取消走 deleteMany（都是幂等操作）；两侧外键均 ON DELETE CASCADE，删文章或删用户自动清干净；额外的 idx_user 用于「我的收藏」列表
- **不设 like_count / favorite_count 冗余列**：计数统一由 Prisma `_count` 关系聚合得到，避免冗余字段与关联表不一致。该项目量级下聚合成本可忽略；若将来成为瓶颈再引入计数字段 + 事务维护
- 全表统一：BIGINT UNSIGNED 自增主键、DATETIME 时间戳、updated_at 自动更新、表与字段加中文注释

### 与 PRD 的映射
- 注册（用户名/邮箱/密码）→ users 插入，唯一约束兜底并发重复注册
- 查看文章浏览次数 +1 → posts.views 计数
- 文章列表分页 / 分类筛选 / 搜索 → page+pageSize、category_id 等值、title/summary 关键词
- 删除文章只能删自己的 → Service 层校验 post.author_id = 当前用户 id（admin 豁免）
- 封面与标签 → posts.cover_image 存 URL，标签走 tags + post_tags

### 迁移与种子
- schema.sql 是数据库结构的事实来源，prisma/schema.prisma 由它翻译而来，二者必须同步
- 结构变更流程：改 schema.sql → 改 prisma/schema.prisma → prisma migrate dev --name <描述>
- 禁止手改已提交的 migration 文件；破坏性变更（DROP）必须单独评审并先备份
- prisma/seed.ts 初始化管理员账号与默认分类
- 现有环境若用 blog 账号（无建 shadow DB 权限，`migrate dev` 会失败）：
  用 `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`
  生成 SQL 落成新迁移目录，再 `prisma migrate deploy`

## 接口设计

### 通用约定
- 统一前缀 /api（预留 /api/v1 版本位）
- 认证方式：Authorization: Bearer <access_token>
- 分页参数：page（默认 1）、pageSize（默认 10，上限 50），响应含 total / page / pageSize
- 成功响应：{ code: 0, message: "ok", data: {...} }
- 失败响应：{ code: <业务码>, message: "<可读原因>", data: null }
- HTTP 状态码：200 成功、201 创建、400 参数错误、401 未登录或令牌失效、403 无权限、404 不存在、409 唯一冲突、429 请求过频、500 服务端错误
- 资源标识约定：**详情展示用 slug**（GET /api/posts/:slug，利于 SEO 与可读 URL）；**编辑/删除用内部 id**（PATCH/DELETE /api/posts/:id，避免 slug 被批量枚举）；列表走查询参数，不带单资源标识，前端路由同理（/post/:slug 展示、/write/:id 编辑）

### 认证与用户
- POST /api/auth/register：注册，入参 username / email / password，返回用户信息与 token
- POST /api/auth/login：登录，支持用户名或邮箱，返回 access 与 refresh token
- POST /api/auth/refresh：用 refresh token 换新 access token
- POST /api/auth/logout：注销，撤销当前 refresh token
- GET /api/users/me：查看当前登录用户（需登录）
- PATCH /api/users/me：编辑 displayName / avatar / bio（需登录）
- GET /api/users/me/posts：我的文章列表，含草稿与归档（需登录）
- GET /api/users/me/favorites：我的收藏，按收藏时间倒序分页（需登录）
- GET /api/users：用户列表，支持 page / pageSize / role / keyword（**仅 admin**），返回邮箱、状态、注册时间与文章数
- PATCH /api/users/:id/role：调整他人角色，入参 role（reader / author / admin），用于「提升作者」（**仅 admin**）
- PATCH /api/users/:id/status：启用（1）/ 停用（0）他人账号（**仅 admin**）；停用即刻吊销其全部 refresh token
  - 两条 PATCH 都禁止操作**自己**（返回 403 CANNOT_MODIFY_SELF=40302），避免管理员把自己降级或停用后系统失去唯一管理员

### 文章
- GET /api/posts：文章列表，支持 page / pageSize / categoryId / tagSlug / keyword / year / month，只返回 published；每项带 likeCount / favoriteCount / commentCount（评论只计已过审）与 isPinned
  - 排序：置顶优先 → 发布时间倒序 → id 倒序（同时间戳兜底，保证翻页稳定）
  - year / month 用于归档页筛选，按 published_at 左闭右开区间查询；**只给 month 不给 year 返回 400**（区间无从确定，静默忽略会返回看起来正常的错数据）
- GET /api/posts/hot：热门文章，按累计浏览量倒序，支持 limit（默认 5，上限 20）
  - **路由顺序**：必须声明在 `GET /api/posts/:idOrSlug` 之前，否则 `/posts/hot` 会被当成 slug 为 hot 的详情请求
- GET /api/posts/archive：归档总览（对标博客园「随笔档案」）。返回 `{ total, years: [{year, count}], months: [{year, month, count}] }`，
  一律倒序；years 由 months 归并而来，保证年份篇数恒等于其下月份之和。只统计 published 且 published_at 非空
- GET /api/posts/archive/days：年度热力图，入参 year（缺省当前 UTC 年份），返回 `[{ date: "YYYY-MM-DD", count }]`，只含有文章的日期
- GET /api/posts/rank：排行榜，入参 type（views | comments | likes，默认 views）/ page / pageSize（默认 20，上限 50）
  - 排序依据走 SQL 表达式白名单，用户输入只用于选择表达式、不参与拼接；评论榜只计 approved，与列表展示口径一致
  - 实现是「先按聚合排序取本页主键 → 再用常规 include 回表」，因此返回结构与其它列表接口完全一致
- PATCH /api/posts/:id/pin：置顶 / 取消置顶（需登录且为作者本人或 admin），入参 `{ pinned: boolean }`
  - 显式传布尔值而非 toggle，避免重放语义歧义；仅已发布文章可置顶，否则 400
- GET /api/posts/:idOrSlug：文章详情，同时 views +1（按 ip 1 小时去重）。除文章本身外一次性返回：
  - `likeCount` / `favoriteCount` / `commentCount` / `isPinned` / `liked` / `favorited`（未登录时 liked、favorited 恒为 false）
  - `prev` / `next`：上下篇，仅返回 { id, title, slug }；顺序与公开列表一致（publishedAt 倒序），同一时间戳用 id 兜底；草稿/归档不参与导航
  - `related`：共享标签的已发布文章，按浏览量倒序取 5 篇；当前文章无标签时返回空数组
- POST /api/posts：发布文章（需登录），入参 title / content / summary / categoryId / tagIds / coverImage / status
- PATCH /api/posts/:id：编辑文章（需登录且为作者本人）
- DELETE /api/posts/:id：删除文章（需登录且为作者本人）
- GET /api/users/me/posts：我的文章列表，含草稿与归档（需登录）

### 互动（点赞 / 收藏，均需登录）
- POST /api/posts/:id/like、DELETE /api/posts/:id/like：点赞 / 取消点赞
- POST /api/posts/:id/favorite、DELETE /api/posts/:id/favorite：收藏 / 取消收藏
- 四个接口都返回同一结构 `{ liked, favorited, likeCount, favoriteCount }`，前端可直接整体覆盖本地状态，无需二次拉取
- **幂等**：重复点赞走 upsert、未点赞就取消走 deleteMany（影响 0 行），都不会报错；这样前端网络重试不会产生"操作失败"
- **只允许对已发布文章互动**：未发布（含草稿）一律按「文章不存在」返回 404，避免有人用点赞接口探测他人草稿是否存在
- 用 POST/DELETE 而非单个 toggle 接口：语义明确、可安全重放，且 HTTP 缓存与日志里状态可读

### 分类与标签
- GET /api/categories：分类树（一次返回全部，含 parentId 与 sortOrder）
- GET /api/tags：标签列表，`_count.postTags` **只统计已发布文章**（否则标签云会把草稿数量暴露给游客）
- GET /api/tags/:slug：单个标签详情（标签归档页用；slug 比自增 id 更适合出现在 URL 上），不存在返回 404
- POST / PATCH / DELETE /api/categories、/api/tags：仅 admin 可写

### 评论（可选扩展）
- GET /api/posts/:slug/comments：只返回 approved，按 parent_id 组装树形
- POST /api/posts/:slug/comments：发表评论，游客可传 authorName，默认 pending 待审核

## 鉴权与权限

### JWT 方案
- access token：有效期 2h，payload 含 sub（用户 id）与 role，前端存内存（Zustand），刷新页面用 refresh 换回
- refresh token：有效期 7d，放 HttpOnly + Secure + SameSite=Lax Cookie，服务端可撤销（落 `refresh_tokens` 表；登出撤销当前 token、改密/禁用用户时按 `user_id` 批量置 `revoked=1`）
- 密钥 JWT_SECRET / JWT_REFRESH_SECRET 只走环境变量，不入库不入仓
- 登出与改密：撤销该用户全部 refresh token

### 权限矩阵
| 能力 | 游客 | reader | author | admin |
| --- | --- | --- | --- | --- |
| 浏览文章 / 分类 | 是 | 是 | 是 | 是 |
| 发表评论（待审核） | 是 | 是 | 是 | 是 |
| 查看编辑个人中心 | 否 | 是 | 是 | 是 |
| 发布文章 | 否 | 否 | 是 | 是 |
| 编辑 / 删除自己的文章 | 否 | 否 | 是 | 是 |
| 置顶自己的文章 | 否 | 否 | 是 | 是 |
| 管理他人文章 | 否 | 否 | 否 | 是 |
| 分类与标签维护 | 否 | 否 | 否 | 是 |
| 提升 / 调整用户角色 | 否 | 否 | 否 | 是 |
| 用户禁用 | 否 | 否 | 否 | 是 |

注册后的默认角色是 **reader**（不带发文权限）；需要写作能力时由管理员在管理后台
「用户与权限」中提升为 author。

### 权限实现
- 登录态：全局 JwtAuthGuard + @Public() 装饰器放行白名单接口
- 角色：RolesGuard + @Roles('admin') 装饰器
- 角色来源：JwtStrategy 每次请求按 sub 回查 users 表，以**数据库中的实时角色与状态**为准，
  而不是直接信任 token 内的 role 快照。否则管理员提升/降级/停用后，旧 access token
  在 2h 有效期内仍然生效，权限变更要等最长 2 小时才落实。
- 资源归属：Service 层校验 post.author_id === currentUser.id，admin 豁免，不能只靠前端隐藏按钮

## 前端设计

### 路由表
- /：首页，文章列表（分页 + 分类筛选 + 关键词搜索）+ 侧栏（分类 / 热门文章 / 随笔档案 / 标签云）
- /post/:slug：文章详情，正文渲染 + 浏览量 + 点赞收藏 + 上下篇 + 相关文章 + 评论区
- /tag/:slug：标签归档页，该标签下的已发布文章（与 /category/:slug 对称）
- /archive：归档页，年度发文热力图 + 随笔档案（年→月，带篇数）+ 时间线列表；
  支持 `?year=&month=` 联动筛选，heatYear 缺省落在「最近有文章的年份」
- /rank：排行榜，阅读榜 / 评论榜 / 推荐榜三档切换，支持分页
- /write：写文章（需登录）
- /write/:id：编辑文章（需登录，仅作者）
- /me：个人中心（需登录），资料编辑 + 我的文章（含置顶开关）+ 我的收藏入口
- /me/favorites：我的收藏（需登录）
- /admin：管理后台（**仅 admin**），子路由 /admin/users（用户与权限）、/admin/comments（评论审核）、/admin/categories（分类）、/admin/tags（标签）
- /login、/register：登录 / 注册
- /category/:slug：分类归档页
- *：404 页

### 页面与组件
- 布局：Header（Logo、导航「归档 / 排行榜」、搜索、登录态入口）+ Footer
- 列表：PostCard（封面、置顶徽标、标题、摘要、作者、时间、浏览/评论/点赞/收藏数、分类）
- 详情：Markdown 渲染、代码高亮、可选目录；PostActions（点赞/收藏）、上下篇导航、相关文章
- 归档：ArchiveHeatmap（12 月 × 31 日热力图，点击任一格跳到该月；纯计算部分抽到 `lib/heatmap.ts` 便于单测）
- 侧栏：Sidebar（热门文章 Top5 + 随笔档案近 6 个月 + 标签云），首页与各归档页共用
- 表单：标题、分类下拉、标签多选、封面上传、Markdown 编辑器（左右分栏实时预览）
- 通用：分页器、空状态、加载骨架屏、Toast 提示、确认弹窗

### 状态与请求
- 全局：登录态与当前用户信息（Zustand，仅持久化必要的标记）
- 页面数据：页面级请求，不引入全局数据缓存层
- Axios 拦截器：**先等启动时的会话恢复（refresh）尝试结束**，再注入 token；响应 401 先静默刷新一次，失败则跳登录页
- 会话恢复为什么要「等」：access token 只在内存里，刷新页面后要靠 refresh Cookie 重新换取。
  若首个业务请求抢在恢复之前发出，后端会按匿名访客处理，`liked` / `favorited` 这类
  身份相关字段就会返回 false —— 表现为「刷新后我点的赞没了」（数据其实还在）。
  未登录访客靠 `lib/session-hint.ts` 的 localStorage 标记走快速路径，省掉一次注定 401 的请求。
- 错误文案：业务错误码 → 中文提示映射表统一维护

### 交互约定
- 未登录访问 /write、/me、/admin 时重定向到 /login?redirect=<原路径>
- 前端的角色门禁只做「入口显隐 + 提前拦截」：读者不显示「写文章」，非 admin 不显示「管理后台」；
  直接输 URL 会被 ProtectedRoute 拦成 403 页。真正的权限判定始终在后端，前端隐藏按钮不作为安全边界。
- 删除文章二次确认
- 上传图片前端先校验类型（jpg / png / webp）与大小（≤ 5MB）；后端在 Multer 白名单之外
  还会按文件头魔数复检真实类型，防止伪造 Content-Type 的伪装上传

## 关键流程

### 注册与登录
1. 前端提交表单 → POST /api/auth/register
2. 后端校验用户名与邮箱唯一性 → bcrypt 哈希 → 插入 users
3. 返回用户信息与 token，前端写入登录态并跳回 redirect 或首页
4. 登录流程：查用户 → 校验 status=1 → bcrypt 比对 → 签发 access 与 refresh token

### 发布文章
1. 前端校验表单 → POST /api/posts（携带 token）
2. 守卫校验登录态 → DTO 校验 → 生成 slug（标题拼音或随机后缀，冲突则追加序号）
3. status=published 时写入 published_at
4. 事务内写 posts 与 post_tags，返回文章详情

### 浏览量 +1
- 异步自增：UPDATE posts SET views = views + 1 WHERE id = ?，不阻塞详情接口返回
- 防刷：同一 IP 对同一文章 10 分钟内只计一次，用 Redis SETNX；无 Redis 时降级为进程内 LRU
- 不放进详情查询事务，避免行锁影响并发读

### 列表分页与搜索
- 分页：LIMIT / OFFSET（Prisma skip / take），按 published_at DESC 排序，命中 idx_status_published
- 分类筛选：category_id 等值，命中 idx_category
- 搜索：title / summary 的 LIKE '%kw%'，数据量上万后升级为 MySQL 全文索引或 Elasticsearch
- 多条件组合时关注索引命中，禁止在大表上做无索引排序

## 非功能设计

### 性能
- 首页列表接口 P95 < 200ms（1 万篇文章量级）
- 列表接口加 Redis 缓存 60s，文章发布或更新时失效
- 使用 Prisma 连接池；慢查询（> 200ms）打日志

### 安全
- 密码：bcrypt cost 12，任何接口都不返回 password_hash
- SQL 注入：全部走 Prisma 参数化查询，禁止拼接 SQL 字符串
- XSS：Markdown 渲染后经 sanitize-html 白名单过滤，禁止直接注入 HTML
- 越权：所有写接口在 Service 层校验资源归属；角色变更以数据库实时值为准（见「权限实现」）
- 限流：登录 / 注册 5 次每分钟每 IP，写接口 30 次每分钟每用户
- CORS：白名单域名；跨域带 Cookie 时开启 credentials 并禁用通配符
- 响应头：API 侧 helmet；Nginx 侧统一补 X-Content-Type-Options / X-Frame-Options /
  Referrer-Policy / Permissions-Policy / CSP（见 apps/web/nginx.conf）
- 用户上传内容一律视为不可信输入：类型白名单 + 文件头魔数复检 + 存储侧 nosniff 与 sandbox CSP

### 错误处理与可观测性
- 统一异常过滤器输出 `{ code, message, data: null }`，绝不把堆栈或内部细节回传客户端
- Prisma 已知错误按语义映射为 4xx，避免约束冲突/数值越界冒泡成 500：
  P2002→409、P2003→400、P2000→400、P2020→400、P2025→404
- 主键一律经 parseId 前置校验（非数字、负数、超出 BIGINT UNSIGNED 范围 → 400），
  不让越界值打到 MySQL
- 5xx 与未捕获异常必须写入服务端日志（含请求方法与路径、错误栈）；4xx 属预期内用户错误，不刷日志
- 上传：类型与大小白名单，文件名重命名，拒绝可执行后缀
- 配置：密钥走环境变量，.env 不入仓

### 可观测性
- 结构化日志：请求 ID、用户 ID、耗时、错误栈
- GET /healthz 存活探针；GET /readyz 检查数据库连通性
- 5xx 记录完整上下文，响应体只返回通用文案

### 兼容性
- 浏览器：Chrome / Edge / Firefox / Safari 最近两个大版本
- 移动端：列表与详情页响应式适配（≥ 375px）
- 无障碍：图片 alt、表单 label、键盘可操作

## 环境与配置

### 环境变量
- NODE_ENV、PORT
- DATABASE_URL=mysql://user:pass@host:3306/blog
- JWT_SECRET、JWT_REFRESH_SECRET、JWT_ACCESS_EXPIRES=2h、JWT_REFRESH_EXPIRES=7d
- CORS_ORIGINS、UPLOAD_DIR、MAX_UPLOAD_SIZE
- REDIS_URL（可选，用于限流与浏览量防刷）

### 环境划分
- local：Docker 起 MySQL，热重载开发
- staging：预发，数据可清空，用于验收
- production：真实数据，迁移前必须备份

## 开发里程碑

### M1 基础框架
- monorepo 搭建、Prisma 接入 schema.sql、健康检查、CI（lint + 类型检查 + 测试）

### M2 用户与鉴权
- 注册 / 登录 / 刷新 / 登出、个人中心、守卫与权限矩阵落地

### M3 文章核心
- 文章 CRUD、列表分页筛选搜索、详情与浏览量、Markdown 编辑器

### M4 分类标签与前端页面
- 分类树、标签多选、首页 / 详情 / 写文章 / 个人中心页面联调

### M5 可选扩展与上线
- 评论（含审核）、图片对象存储、限流与安全加固、Docker Compose 部署

### M6 阅读体验与内容组织（对标 CSDN 的核心能力）
- 互动：点赞 / 收藏（幂等接口 + 计数），「我的收藏」页
- 阅读页：上一篇 / 下一篇、相关文章（按共享标签）、热门文章侧栏
- 归档：标签归档页 /tag/:slug 与标签云（补齐与分类归档对称的能力）
- 明确不做：关注/粉丝、私信、积分等级、付费专栏 —— 平台级功能，与「个人博客」定位冲突

### M6-B 归档与组织（对标博客园「随笔档案」）
- 数据：posts 新增 pinned_at 与 idx_status_pinned（迁移 20261010202714_add_post_pinned_at）
- 归档：GET /api/posts/archive（年/月篇数）、GET /api/posts/archive/days（年度热力图）、
  GET /api/posts?year=&month= 归档筛选；前端 /archive 页（热力图 + 随笔档案 + 时间线）+ 侧栏随笔档案块
- 排行：GET /api/posts/rank（阅读 / 评论 / 推荐 总榜），前端 /rank 页三档切换
- 置顶：PATCH /api/posts/:id/pin，列表置顶优先，个人中心可切换，卡片与详情显示置顶徽标
- 明确不做：作者主页、关注粉丝、私信、积分等级（与 M6 同一判断，均为平台化功能）
- 遗留：排行榜目前只有总榜。周榜/月榜需要浏览明细表（现仅存 posts.views 总量），未排期；
  RSS / sitemap 也属本轮范围之外（已在本节与「待确认事项」中记录）

## 待确认事项
- 图片存本地还是对象存储（当前按对象存储设计，开发期本地兜底）
- 评论是否需要人工审核与是否开放游客评论（schema 已预留 status 与 author_name）
- 多级分类在前端的展示形态（schema 支持多级，PRD 未明确）
- 浏览量的实时性与去重强度要求
- 是否需要 RSS / 站点地图等 SEO 能力（slug 已为此预留）
- 「热门文章」与排行榜目前按**累计**浏览量/评论数/点赞数排序；若要周榜/月榜，需要按时间窗口
  统计浏览记录（现仅存 posts.views 总量，无浏览明细）
