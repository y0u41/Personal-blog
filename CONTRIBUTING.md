# 贡献指南

感谢你对本项目的关注！本文档说明如何参与开发。

## 项目信息

- **项目名称**：个人博客
- **技术栈**：NestJS + Prisma + MySQL + React

## 快速开始

```
pnpm install
cp .env.example .env
pnpm db:push
pnpm dev
```

## 项目结构

```
├── apps/
│   ├── api/         # NestJS 后端
│   └── web/         # React 前端
├── packages/shared/ # 共享类型
└── docker-compose.yml
```

## 开发流程

### 1. 创建分支

```
git checkout -b feature/your-feature-name
```

### 2. 修改代码

- 遵循现有代码风格
- 新功能需添加测试
- 修复 Bug 需说明复现步骤

### 3. 验证

```
# 测试
pnpm test

# 构建
pnpm build
```

### 4. 提交代码

```
git add .
git commit -m "feat: 添加 XXX 功能"
git push origin feature/your-feature-name
```

**提交信息规范**：

| 前缀 | 说明 |
|------|------|
| ` ` ` ` ` `feat:` ` ` ` ` ` | 新功能 |
| ` ` ` ` ` `fix:` ` ` ` ` ` | 修复 Bug |
| ` ` ` ` ` `docs:` ` ` ` ` ` | 文档更新 |
| ` ` ` ` ` `test:` ` ` ` ` ` | 测试 |
| ` ` ` ` ` `chore:` ` ` ` ` ` | 构建/工具 |

### 5. 创建 Pull Request

- 描述改动内容和原因
- 关联相关 Issue（如有）
- 确保 CI 通过

## 注意事项

- 修改 Prisma schema 后需运行 pnpm db:push
- 新增 API 需添加测试
- JWT_SECRET 生产环境必须修改

## Issue 反馈

提交 Issue 时请包含：

1. **环境信息**：操作系统、相关工具版本
2. **复现步骤**：最小复现操作
3. **期望行为 vs 实际行为**
4. **错误日志**（如有）

## 行为准则

- 尊重他人，友善交流
- 聚焦技术讨论
- 欢迎新人提问
