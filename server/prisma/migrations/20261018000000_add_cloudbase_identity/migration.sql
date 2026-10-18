-- Preserve local IDs, usernames, roles and all existing ownership relationships.
ALTER TABLE `User`
  MODIFY `passwordHash` VARCHAR(191) NULL,
  ADD COLUMN `cloudbaseEnvId` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  ADD COLUMN `cloudbaseSubject` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  ADD UNIQUE INDEX `User_cloudbaseEnvId_cloudbaseSubject_key` (`cloudbaseEnvId`, `cloudbaseSubject`);
