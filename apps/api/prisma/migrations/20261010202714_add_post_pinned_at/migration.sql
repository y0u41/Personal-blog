-- AlterTable
ALTER TABLE `posts` ADD COLUMN `pinned_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `idx_status_pinned` ON `posts`(`status`, `pinned_at`);
