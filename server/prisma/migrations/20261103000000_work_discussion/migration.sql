ALTER TABLE `Deployment` ADD COLUMN `description` VARCHAR(2000) NOT NULL DEFAULT '';

CREATE TABLE `DeploymentComment` (
    `id` VARCHAR(191) NOT NULL,
    `deploymentId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `DeploymentComment_deploymentId_createdAt_idx` (`deploymentId`, `createdAt`),
    INDEX `DeploymentComment_authorId_idx` (`authorId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `DeploymentComment_deploymentId_fkey` FOREIGN KEY (`deploymentId`) REFERENCES `Deployment` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `DeploymentComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
