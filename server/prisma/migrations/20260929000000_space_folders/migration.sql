CREATE TABLE `SpaceFolder` (
    `id` VARCHAR(191) NOT NULL,
    `spaceId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SpaceFolder_spaceId_name_key`(`spaceId`, `name`),
    INDEX `SpaceFolder_spaceId_idx`(`spaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Deployment` ADD COLUMN `folderId` VARCHAR(191) NULL;
CREATE INDEX `Deployment_folderId_idx` ON `Deployment`(`folderId`);
ALTER TABLE `SpaceFolder` ADD CONSTRAINT `SpaceFolder_spaceId_fkey` FOREIGN KEY (`spaceId`) REFERENCES `Space`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Deployment` ADD CONSTRAINT `Deployment_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `SpaceFolder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
