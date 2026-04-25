ALTER TABLE `AiConfig`
  ADD COLUMN `openaiApiKeyCiphertext` LONGTEXT NULL,
  ADD COLUMN `anthropicApiKeyCiphertext` LONGTEXT NULL,
  ADD COLUMN `openrouterApiKeyCiphertext` LONGTEXT NULL;
