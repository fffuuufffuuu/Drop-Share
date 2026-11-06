CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `recipientId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `href` VARCHAR(1024) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readAt` DATETIME(3) NULL,
    INDEX `Notification_recipientId_readAt_createdAt_idx` (`recipientId`, `readAt`, `createdAt`),
    INDEX `Notification_recipientId_createdAt_id_idx` (`recipientId`, `createdAt`, `id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `Notification_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
