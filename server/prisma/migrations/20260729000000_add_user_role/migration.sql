ALTER TABLE `User`
  ADD COLUMN `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER';

UPDATE `User`
SET `role` = 'ADMIN'
WHERE `username` = 'fffuuu';
