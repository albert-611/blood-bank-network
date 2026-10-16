-- ============================================================================
-- MIGRATION 002: ADD PREFERRED FACILITY TO BLOOD REQUESTS
-- ============================================================================
-- Architecture Reference: Requester Preferred Hospital / Clinic Selection
-- Safe, idempotent, non-destructive migration script.
--
-- Adds:
-- 1. preferred_organization_id: FK to organizations (HOSPITAL / CLINIC)
-- 2. preferred_facility_name: For unregistered facilities entered manually
-- 3. preferred_facility_location: Optional address or location for manual entry

SET @dbname = DATABASE();
SET @tablename = "blood_requests";

-- 1. Add preferred_organization_id column
SET @columnname = "preferred_organization_id";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE blood_requests ADD COLUMN preferred_organization_id BIGINT UNSIGNED NULL AFTER notes"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 2. Add foreign key constraint for preferred_organization_id if not present
SET @fkname = "fk_blood_requests_preferred_org";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND CONSTRAINT_NAME = @fkname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE blood_requests ADD CONSTRAINT fk_blood_requests_preferred_org FOREIGN KEY (preferred_organization_id) REFERENCES organizations (id) ON DELETE SET NULL"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 3. Add index on preferred_organization_id if not present
SET @indexname = "idx_blood_requests_preferred_org";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND INDEX_NAME = @indexname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE blood_requests ADD INDEX idx_blood_requests_preferred_org (preferred_organization_id)"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 4. Add preferred_facility_name column
SET @columnname = "preferred_facility_name";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE blood_requests ADD COLUMN preferred_facility_name VARCHAR(150) NULL AFTER preferred_organization_id"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 5. Add preferred_facility_location column
SET @columnname = "preferred_facility_location";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE blood_requests ADD COLUMN preferred_facility_location VARCHAR(255) NULL AFTER preferred_facility_name"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
