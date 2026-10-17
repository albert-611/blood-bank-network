-- ============================================================================
-- MIGRATION 003: ADD CANCELLATION FIELDS TO BLOOD REQUESTS
-- ============================================================================
-- Architecture Reference: Requester Request Cancellation & Audit Tracking
-- Safe, idempotent, non-destructive migration script.
--
-- Adds:
-- 1. cancellation_reason: VARCHAR(255) NULL
-- 2. cancelled_at: DATETIME NULL

SET @dbname = DATABASE();
SET @tablename = "blood_requests";

-- 1. Add cancellation_reason column
SET @columnname = "cancellation_reason";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE blood_requests ADD COLUMN cancellation_reason VARCHAR(255) NULL AFTER notes"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 2. Add cancelled_at column
SET @columnname = "cancelled_at";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE blood_requests ADD COLUMN cancelled_at DATETIME NULL AFTER cancellation_reason"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
