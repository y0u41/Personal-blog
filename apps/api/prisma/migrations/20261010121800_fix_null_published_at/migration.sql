-- 修复历史数据：status = 'published' 但 published_at 为 NULL 的文章。
--
-- 背景：应用层在「创建为已发布」与「首次转为已发布」时都会写入 published_at，
-- 但早期直连数据库插入的演示数据绕过了这一层，留下了 status='published'
-- 且 published_at IS NULL 的记录。
--
-- 影响（都是静默的，不会报错）：
--   * 公开列表按 published_at DESC 排序时，NULL 在 MySQL 中排最后 → 该文被压到列表末尾；
--   * 上一篇 / 下一篇用 published_at 做大小比较 → 该文永远不参与导航；
--   * 之后新增的任何按发布时间归档的能力同样会漏掉它。
--
-- 处理：以 created_at 作为兜底发布时间回填。仅影响 published_at 为空的行，可重复执行。
UPDATE `posts`
SET `published_at` = `created_at`
WHERE `status` = 'published'
  AND `published_at` IS NULL;
