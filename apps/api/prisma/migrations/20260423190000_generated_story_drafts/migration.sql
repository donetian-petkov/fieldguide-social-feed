-- AlterEnum
ALTER TABLE `ContentItem` MODIFY `kind` ENUM('external_article', 'youtube_video', 'community_post', 'generated_story') NOT NULL;

-- CreateTable
CREATE TABLE `GeneratedStoryDraft` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('queued', 'draft', 'approved', 'rejected', 'failed') NOT NULL DEFAULT 'queued',
    `subject` ENUM('history', 'art', 'books', 'movies', 'country_knowledge', 'photography', 'nature', 'video', 'community') NOT NULL,
    `prompt` TEXT NOT NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `itemId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `summary` TEXT NULL,
    `bodyMarkdown` LONGTEXT NULL,
    `citationsJson` LONGTEXT NOT NULL,
    `verificationJson` LONGTEXT NULL,
    `failureReason` TEXT NULL,
    `totalCostUsd` DECIMAL(10, 4) NOT NULL DEFAULT 0,
    `generatedAt` DATETIME(3) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GeneratedStoryDraft_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `GeneratedStoryDraft_subject_createdAt_idx`(`subject`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GeneratedStoryDraft` ADD CONSTRAINT `GeneratedStoryDraft_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratedStoryDraft` ADD CONSTRAINT `GeneratedStoryDraft_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratedStoryDraft` ADD CONSTRAINT `GeneratedStoryDraft_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `ContentItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
