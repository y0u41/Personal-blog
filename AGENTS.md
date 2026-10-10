# 个人博客系统 AGENTS 指南

> 本文件写给在本仓库工作的 AI 编码代理与协作者：先读它，再动手。
> 配套文档：PRD.md（需求）、Tech_Design.md（技术方案）、schema.sql（数据库结构）

## 项目概览
- 一个个人博客系统：用户注册登录、文章发布与管理、分类标签、浏览量、文章列表分页筛选
- 技术栈：Node.js 20 + TypeScript + NestJS + Prisma + MySQL 8，前端 React 18 + Vite（详见 Tech_Design.md）
- 当前状态：需求与数据库结构已定稿（PRD.md / schema.sql），业务代码尚未开始，目录结构按 Tech_Design.md 搭建

## 文档地图
- PRD.md：需求事实来源，功能范围的唯一依据
- Tech_Design.md：技术方案，选型、接口、权限、流程、目录结构
- schema.sql：数据库结构事实来源，字段与约束以它为准
- .workbuddy/memory/YYYY-MM-DD.md：每日工作日志，重要变更追加一条
- 冲突处理：PRD > Tech_Design > schema.sql 注释 > 代码现状；发现冲突先向用户提出，不要自行选一个默默改掉

## 常用命令
- pnpm install：安装依赖
- pnpm dev：并行启动 api 与 web
- pnpm --filter api dev / pnpm --filter web dev：单独启动
- pnpm lint / pnpm format：代码检查与格式化
- pnpm test / pnpm --filter api test:e2e：单元测试与接口测试
- pnpm --filter api prisma migrate dev --name <描述>：新建并应用迁移
- pnpm --filter api prisma db seed：初始化管理员账号与默认分类
- docker compose up -d mysql：启动本地数据库
- 说明：以上命令在项目脚手架落地前可能尚不存在，执行失败先确认 package.json 与脚本是否已创建，不要凭空编造命令输出

## 目录约定
- monorepo：apps/api（后端）、apps/web（前端）、packages/shared（前后端共享类型与错误码）
- 后端按业务模块组织：modules/<domain>/{controller,service,dto}
- 分层禁止反向依赖：Controller → Service → Repository(Prisma)；Controller 里不写业务逻辑，Service 里不碰 HTTP 对象
- 前端：页面放 pages/，可复用 UI 放 components/，接口调用统一走 src/api/，全局状态只放 store/

## 编码规范
- TypeScript strict，禁止 any（必要时用 unknown + 类型收窄）
- 命名：文件 kebab-case，类与组件 PascalCase，变量与函数 camelCase，常量 UPPER_SNAKE_CASE
- 数据库字段 snake_case，Prisma 模型用 camelCase 并通过 @map 映射
- 一个文件一个主要导出，函数保持单一职责，超过 80 行考虑拆分
- 提交前通过 lint 与类型检查，不留 console.log 与注释掉的死代码
- 注释用中文，解释「为什么」而不是复述代码在做什么

## 数据库约定
- 表名小写复数 snake_case；主键统一 id BIGINT UNSIGNED 自增；时间字段 DATETIME，必备 created_at / updated_at
- 状态字段用 TINYINT 或 ENUM，并在字段注释里写明每个取值的含义
- 新增字段必须给默认值或允许 NULL，避免破坏存量数据
- 外键必须显式声明 ON DELETE 行为，并说明选择理由
- 改结构流程：改 schema.sql → 改 prisma/schema.prisma → 生成迁移 → 同步更新 Tech_Design.md 的数据库章节
- 禁止手改已提交的迁移文件；禁止在未说明的情况下写 DROP TABLE / DROP COLUMN 等破坏性迁移

## API 约定
- 统一前缀 /api，统一响应体 { code, message, data }
- 分页参数 page / pageSize（pageSize 上限 50），响应带 total
- 写接口必须在 DTO 层做参数校验，在 Service 层做归属与权限校验
- 错误码集中定义在 packages/shared，前后端共用，不散落魔法数字
- 新增或修改接口必须同步更新 Tech_Design.md 的接口清单与 Swagger 注解

## 安全红线
- 密码只存 bcrypt 哈希（cost ≥ 12），任何响应都不得包含 password_hash
- 密钥与数据库连接串走环境变量，.env 及任何凭证不得入仓
- 所有数据库访问走 Prisma 参数化查询，禁止拼接 SQL 字符串
- Markdown / 富文本输出必须经白名单过滤后再渲染，禁止直接注入 HTML
- 写操作必须校验资源归属（作者本人或 admin），不依赖前端隐藏按钮
- 上传文件校验类型与大小，重命名存储，拒绝可执行后缀

## 测试要求
- Service 层核心逻辑必须有单测：注册唯一性、文章归属校验、slug 生成、分页参数边界
- 认证与文章 CRUD 必须有 e2e，覆盖正常流与 401 / 403 / 404 分支
- 修 bug 时先补一个能复现的测试，再改代码
- 覆盖率目标：核心模块 ≥ 70%

## 提交与协作
- 分支：main（保护分支）、feat/<主题>、fix/<主题>
- 提交信息：Conventional Commits（feat / fix / docs / refactor / test / chore）
- 一个提交只做一件事，不混入无关的格式化改动
- PR 描述写清：改了什么、为什么、怎么验证、影响哪些文档

## 完成定义（DoD）
- 功能可用，且通过 lint、类型检查与相关测试
- 涉及需求 / 接口 / 表结构的变更，已同步 PRD.md、Tech_Design.md、schema.sql 三份文档
- 新增接口在 Swagger 可见，错误分支有明确中文提示
- 在 .workbuddy/memory/ 当天日志追加一条记录

## 禁止事项
- 不要提交 .env、密钥或数据库导出文件
- 不要对 main 强推（force push）或改写已推送历史
- 不要擅自引入重量级依赖（新的 ORM、状态管理库、UI 框架），先说明理由并等确认
- 不要删除或改写他人未合并的分支
- 不要把业务逻辑写进 Controller，也不要在前端拼装权限判断当作安全边界
