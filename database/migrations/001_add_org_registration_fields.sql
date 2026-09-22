-- ============================================================================
-- MIGRATION 001: ADD ORGANIZATION REGISTRATION & ONBOARDING FIELDS
-- ============================================================================
-- Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9, §10, §11)
-- Safe, non-destructive migration script for organization onboarding flow.

-- 1. Add email and country fields to organizations table if not present
SET @dbname = DATABASE();
SET @tablename = "organizations";
SET @columnname = "email";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE organizations ADD COLUMN email VARCHAR(190) NULL UNIQUE AFTER type"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = "country";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE organizations ADD COLUMN country VARCHAR(100) NULL DEFAULT 'USA' AFTER city"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 2. Add organization_id reference to users table for direct tenant association
SET @tablename = "users";
SET @columnname = "organization_id";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE users ADD COLUMN organization_id BIGINT UNSIGNED NULL AFTER phone, ADD CONSTRAINT fk_users_organization FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE SET NULL"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 3. Ensure ORGANIZATION_ADMIN role exists in roles table
INSERT INTO roles (id, name, description) VALUES
  (8, 'ORGANIZATION_ADMIN', 'Manages organization profile, staff, inventory, and operational requests')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- 4. Assign standard management permissions to ORGANIZATION_ADMIN
-- Permissions: manage_staff (2), inventory.manage (3), inventory.view (4), requests.create (7), requests.verify (8), requests.emergency (9), reservations.create (10), issues.create (11), audit.view (12)
INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES
  (8, 2),  -- organizations.manage_staff
  (8, 3),  -- inventory.manage
  (8, 4),  -- inventory.view
  (8, 7),  -- requests.create
  (8, 8),  -- requests.verify
  (8, 9),  -- requests.emergency
  (8, 10), -- reservations.create
  (8, 11), -- issues.create
  (8, 12); -- audit.view
