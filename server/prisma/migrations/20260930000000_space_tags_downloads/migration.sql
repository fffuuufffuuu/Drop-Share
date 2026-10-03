ALTER TABLE `Space` ADD COLUMN `downloadsEnabled` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `SpaceTag` (
    `id` VARCHAR(191) NOT NULL,
    `spaceId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `SpaceTag_spaceId_name_key`(`spaceId`, `name`),
    INDEX `SpaceTag_spaceId_idx`(`spaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DeploymentTag` (
    `deploymentId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,
    INDEX `DeploymentTag_tagId_idx`(`tagId`),
    PRIMARY KEY (`deploymentId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `SpaceTag` (`id`, `spaceId`, `name`, `createdAt`)
SELECT `id`, `spaceId`, `name`, `createdAt` FROM `SpaceFolder`;

INSERT INTO `DeploymentTag` (`deploymentId`, `tagId`)
SELECT `id`, `folderId` FROM `Deployment` WHERE `folderId` IS NOT NULL;

ALTER TABLE `SpaceTag` ADD CONSTRAINT `SpaceTag_spaceId_fkey`
    FOREIGN KEY (`spaceId`) REFERENCES `Space`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DeploymentTag` ADD CONSTRAINT `DeploymentTag_deploymentId_fkey`
    FOREIGN KEY (`deploymentId`) REFERENCES `Deployment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DeploymentTag` ADD CONSTRAINT `DeploymentTag_tagId_fkey`
    FOREIGN KEY (`tagId`) REFERENCES `SpaceTag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Deployment` DROP FOREIGN KEY `Deployment_folderId_fkey`;
DROP INDEX `Deployment_folderId_idx` ON `Deployment`;
ALTER TABLE `Deployment` DROP COLUMN `folderId`;
DROP TABLE `SpaceFolder`;
