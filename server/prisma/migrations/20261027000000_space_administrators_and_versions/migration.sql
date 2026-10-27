-- Additive change only: existing works and ownership are preserved.
ALTER TABLE `Deployment` ADD COLUMN `previousRootPath` VARCHAR(191) NULL;

CREATE TABLE `SpaceAdministrator` (
  `spaceId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`spaceId`, `userId`),
  INDEX `SpaceAdministrator_userId_idx` (`userId`),
  CONSTRAINT `SpaceAdministrator_spaceId_fkey` FOREIGN KEY (`spaceId`) REFERENCES `Space` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SpaceAdministrator_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
