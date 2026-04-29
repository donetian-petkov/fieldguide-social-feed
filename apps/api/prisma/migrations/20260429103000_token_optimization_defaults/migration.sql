-- Raise default feed polling interval to reduce ingestion churn.
ALTER TABLE `SourceFeed`
  ALTER COLUMN `pollIntervalSec` SET DEFAULT 3600;

-- Track a stable content hash so unchanged items can skip repeated AI enrichment.
ALTER TABLE `ContentItem`
  ADD COLUMN `aiContentHash` VARCHAR(64) NULL;
