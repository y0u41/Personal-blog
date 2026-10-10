-- =========================================================
-- 博客系统数据库结构
-- 引擎: MySQL 8.0 (InnoDB, utf8mb4)
-- 创建: 2026-10-10
-- =========================================================

-- ---------------------------------------------------------
-- 1. 用户表 users
-- ---------------------------------------------------------
CREATE TABLE `users` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `username`      VARCHAR(50)  NOT NULL                  COMMENT '登录用户名（唯一）',
  `email`         VARCHAR(120) NOT NULL                  COMMENT '邮箱（唯一，可用于登录）',
  `password_hash` VARCHAR(255) NOT NULL                  COMMENT '密码哈希（bcrypt/argon2，绝不存明文）',
  `display_name`  VARCHAR(50)  NOT NULL DEFAULT ''       COMMENT '展示昵称',
  `avatar`        VARCHAR(255) DEFAULT NULL              COMMENT '头像URL',
  `bio`           VARCHAR(500) DEFAULT NULL              COMMENT '个人简介',
  `role`          ENUM('admin','author','reader') NOT NULL DEFAULT 'reader' COMMENT '角色权限',
  `status`        TINYINT      NOT NULL DEFAULT 1        COMMENT '1=正常 0=禁用（软状态）',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_email` (`email`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表';

-- ---------------------------------------------------------
-- 1.1 刷新令牌表 refresh_tokens（支持主动撤销）
-- ---------------------------------------------------------
CREATE TABLE `refresh_tokens` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id`    BIGINT UNSIGNED NOT NULL               COMMENT '所属用户',
  `token_hash` VARCHAR(255) NOT NULL                  COMMENT 'refresh token 哈希（不存明文，与密码同理）',
  `expires_at` DATETIME     NOT NULL                  COMMENT '过期时间（约7d）',
  `revoked`    TINYINT      NOT NULL DEFAULT 0        COMMENT '0=有效 1=已撤销（登出/改密时置1）',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token_hash` (`token_hash`),
  KEY `idx_user` (`user_id`),
  KEY `idx_expires` (`expires_at`),
  CONSTRAINT `fk_rt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='刷新令牌表';

-- ---------------------------------------------------------
-- 2. 分类表 categories（支持多级分类）
-- ---------------------------------------------------------
CREATE TABLE `categories` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类ID',
  `name`        VARCHAR(50)  NOT NULL                  COMMENT '分类名称',
  `slug`        VARCHAR(60)  NOT NULL                  COMMENT 'URL别名（唯一，SEO友好）',
  `parent_id`   BIGINT UNSIGNED DEFAULT NULL           COMMENT '父分类ID（自引用，NULL为顶级）',
  `description` VARCHAR(255) DEFAULT NULL              COMMENT '分类描述',
  `sort_order`  INT          NOT NULL DEFAULT 0        COMMENT '排序权重，越小越靠前',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_slug` (`slug`),
  KEY `idx_parent` (`parent_id`),
  CONSTRAINT `fk_category_parent` FOREIGN KEY (`parent_id`)
    REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分类表';

-- ---------------------------------------------------------
-- 3. 文章表 posts
-- ---------------------------------------------------------
CREATE TABLE `posts` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文章ID',
  `title`        VARCHAR(200) NOT NULL                  COMMENT '标题',
  `slug`         VARCHAR(220) NOT NULL                  COMMENT 'URL别名（唯一，SEO友好）',
  `summary`      VARCHAR(500) DEFAULT NULL              COMMENT '摘要/导语',
  `content`      LONGTEXT     NOT NULL                  COMMENT '正文（Markdown 或 HTML）',
  `cover_image`  VARCHAR(255) DEFAULT NULL              COMMENT '封面图URL',
  `author_id`    BIGINT UNSIGNED NOT NULL               COMMENT '作者ID',
  `category_id`  BIGINT UNSIGNED DEFAULT NULL           COMMENT '所属分类ID',
  `status`       ENUM('draft','published','archived') NOT NULL DEFAULT 'draft' COMMENT '草稿/已发布/归档',
  `views`        INT UNSIGNED NOT NULL DEFAULT 0        COMMENT '浏览量',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `published_at` DATETIME     DEFAULT NULL              COMMENT '实际发布时间',
  `pinned_at`    DATETIME     DEFAULT NULL              COMMENT '置顶时间，NULL 表示未置顶；仅已发布文章可置顶',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_slug` (`slug`),
  KEY `idx_author` (`author_id`),
  KEY `idx_category` (`category_id`),
  KEY `idx_status_published` (`status`, `published_at`),
  KEY `idx_status_pinned` (`status`, `pinned_at`),
  CONSTRAINT `fk_post_author`   FOREIGN KEY (`author_id`)   REFERENCES `users`     (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_post_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文章表';

-- =========================================================
-- 以下为可选扩展（按需启用）
-- =========================================================

-- ---------------------------------------------------------
-- 4. 标签表 tags + 文章标签关联 post_tags（多对多）
-- ---------------------------------------------------------
CREATE TABLE `tags` (
  `id`   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '标签ID',
  `name` VARCHAR(50) NOT NULL COMMENT '标签名',
  `slug` VARCHAR(60) NOT NULL COMMENT 'URL别名',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='标签表';

CREATE TABLE `post_tags` (
  `post_id` BIGINT UNSIGNED NOT NULL,
  `tag_id`  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`post_id`, `tag_id`),
  KEY `idx_tag` (`tag_id`),
  CONSTRAINT `fk_pt_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pt_tag`  FOREIGN KEY (`tag_id`)  REFERENCES `tags`  (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文章-标签关联表';

-- ---------------------------------------------------------
-- 5. 评论表 comments（支持多级回复）
-- ---------------------------------------------------------
CREATE TABLE `comments` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '评论ID',
  `post_id`    BIGINT UNSIGNED NOT NULL               COMMENT '所属文章',
  `user_id`    BIGINT UNSIGNED DEFAULT NULL           COMMENT '评论者（游客可为NULL）',
  `parent_id`  BIGINT UNSIGNED DEFAULT NULL           COMMENT '父评论ID（自引用，NULL为顶级）',
  `author_name` VARCHAR(50) DEFAULT NULL             COMMENT '游客昵称',
  `content`    TEXT         NOT NULL                  COMMENT '评论内容',
  `status`     ENUM('pending','approved','spam') NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_post` (`post_id`),
  KEY `idx_parent` (`parent_id`),
  CONSTRAINT `fk_comment_post`   FOREIGN KEY (`post_id`)   REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comment_user`   FOREIGN KEY (`user_id`)   REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_comment_parent` FOREIGN KEY (`parent_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='评论表';

-- ---------------------------------------------------------
-- 6. 点赞表 post_likes
--    复合主键 (post_id, user_id) 天然保证「一人一赞」，重复点赞靠幂等 upsert 处理。
-- ---------------------------------------------------------
CREATE TABLE `post_likes` (
  `post_id`    BIGINT UNSIGNED NOT NULL COMMENT '文章ID',
  `user_id`    BIGINT UNSIGNED NOT NULL COMMENT '点赞用户',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`, `user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_pl_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pl_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文章点赞表';

-- ---------------------------------------------------------
-- 7. 收藏表 post_favorites（结构同点赞，语义独立）
-- ---------------------------------------------------------
CREATE TABLE `post_favorites` (
  `post_id`    BIGINT UNSIGNED NOT NULL COMMENT '文章ID',
  `user_id`    BIGINT UNSIGNED NOT NULL COMMENT '收藏用户',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`, `user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_pf_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pf_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文章收藏表';
