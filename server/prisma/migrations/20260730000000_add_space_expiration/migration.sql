ALTER TABLE `Space` ADD COLUMN `expiresAt` DATETIME(3) NULL;

UPDATE `Space`
SET `expiresAt` = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 365 DAY);

ALTER TABLE `Space` MODIFY `expiresAt` DATETIME(3) NOT NULL;

CREATE INDEX `Space_expiresAt_idx` ON `Space`(`expiresAt`);
