-- ============================================================================
-- BLOOD BANK PLATFORM — RELATIONAL DATABASE SCHEMA DEFINITION (PHASE 2)
-- ============================================================================
-- Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9 & §10)
-- Engine: InnoDB | Character Set: utf8mb4 | Collation: utf8mb4_unicode_ci
-- Foreign Keys: Strictly enforced with explicit CASCADE and RESTRICT behaviors
-- ============================================================================

-- Disable foreign key checks for clean, repeatable teardown
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- Drop existing tables in reverse dependency order
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS blood_issues;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS request_items;
DROP TABLE IF EXISTS blood_requests;
DROP TABLE IF EXISTS blood_units;
DROP TABLE IF EXISTS donations;
DROP TABLE IF EXISTS donors;
DROP TABLE IF EXISTS organization_staff;
DROP TABLE IF EXISTS hospitals;
DROP TABLE IF EXISTS clinics;
DROP TABLE IF EXISTS blood_banks;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS users;

-- Re-enable foreign key checks for table creation
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 1. USERS & IDENTITY (§9.1)
-- ============================================================================
-- Central authentication and profile table for all platform participants.
CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NULL,
  organization_id BIGINT UNSIGNED NULL,
  global_role ENUM('SUPER_ADMIN', 'ORG_USER', 'DONOR', 'REQUESTER') NOT NULL DEFAULT 'ORG_USER',
  status ENUM('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION') NOT NULL DEFAULT 'PENDING_VERIFICATION',
  email_verified_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_org_id (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. ROLES (§9.2)
-- ============================================================================
-- Distinct operational roles across the platform.
CREATE TABLE roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. PERMISSIONS (§9.3)
-- ============================================================================
-- Fine-grained functional permissions matching the authorization matrix (§13).
CREATE TABLE permissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. ROLE_PERMISSIONS (§9.4)
-- ============================================================================
-- Many-to-many relationship mapping roles to authorized permissions.
CREATE TABLE role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) 
    REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_perm FOREIGN KEY (permission_id) 
    REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5. ORGANIZATIONS (§9.5)
-- ============================================================================
-- Shared root table for hospitals, clinics, and blood banks.
CREATE TABLE organizations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type ENUM('HOSPITAL', 'CLINIC', 'BLOOD_BANK') NOT NULL,
  email VARCHAR(190) NULL UNIQUE,
  phone VARCHAR(30) NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  country VARCHAR(100) NULL DEFAULT 'USA',
  license_number VARCHAR(100) NULL UNIQUE,
  status ENUM('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 6. HOSPITALS (§9.6)
-- ============================================================================
-- Specialized extension for hospital organizations (1:1 with organizations).
CREATE TABLE hospitals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL UNIQUE,
  bed_count INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_hospitals_org FOREIGN KEY (organization_id) 
    REFERENCES organizations (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 7. CLINICS (§9.6)
-- ============================================================================
-- Specialized extension for clinic organizations (1:1 with organizations).
CREATE TABLE clinics (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_clinics_org FOREIGN KEY (organization_id) 
    REFERENCES organizations (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 8. BLOOD_BANKS (§9.6)
-- ============================================================================
-- Specialized extension for blood bank organizations (1:1 with organizations).
CREATE TABLE blood_banks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL UNIQUE,
  storage_capacity_units INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_blood_banks_org FOREIGN KEY (organization_id) 
    REFERENCES organizations (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 9. ORGANIZATION_STAFF (§9.7)
-- ============================================================================
-- Membership table binding a user to an organization with a specific role.
-- In MVP: user_id is UNIQUE (each user belongs to at most one organization).
CREATE TABLE organization_staff (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  organization_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  status ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_org_staff_user FOREIGN KEY (user_id) 
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_org_staff_org FOREIGN KEY (organization_id) 
    REFERENCES organizations (id) ON DELETE RESTRICT,
  CONSTRAINT fk_org_staff_role FOREIGN KEY (role_id) 
    REFERENCES roles (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 10. DONORS (§9.8)
-- ============================================================================
-- Donor medical reference profile (may link to a registered user or be standalone).
CREATE TABLE donors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL UNIQUE,
  blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
  date_of_birth DATE NULL,
  last_donation_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_donors_user FOREIGN KEY (user_id) 
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 11. DONATIONS (§9.9)
-- ============================================================================
-- Records of blood donation collection and testing events.
CREATE TABLE donations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  donor_id BIGINT UNSIGNED NOT NULL,
  blood_bank_id BIGINT UNSIGNED NOT NULL,
  donation_date DATE NOT NULL,
  volume_ml INT UNSIGNED NOT NULL DEFAULT 450,
  status ENUM('COLLECTED', 'TESTING', 'PASSED', 'FAILED') NOT NULL DEFAULT 'COLLECTED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_donations_donor FOREIGN KEY (donor_id) 
    REFERENCES donors (id) ON DELETE RESTRICT,
  CONSTRAINT fk_donations_org FOREIGN KEY (blood_bank_id) 
    REFERENCES organizations (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 12. BLOOD_UNITS (§9.10)
-- ============================================================================
-- Physical unit tracking (not counters) through 9 lifecycle states.
CREATE TABLE blood_units (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  unit_code VARCHAR(50) NOT NULL UNIQUE,
  donation_id BIGINT UNSIGNED NULL,
  organization_id BIGINT UNSIGNED NOT NULL,
  blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
  component ENUM('WHOLE_BLOOD', 'PACKED_RBC', 'PLASMA', 'PLATELETS', 'CRYO') NOT NULL,
  collection_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status ENUM('DONATED', 'TESTING', 'AVAILABLE', 'RESERVED', 'ISSUED', 'COMPLETED', 'EXPIRED', 'DISCARDED', 'REJECTED') NOT NULL DEFAULT 'DONATED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_blood_units_donation FOREIGN KEY (donation_id) 
    REFERENCES donations (id) ON DELETE SET NULL,
  CONSTRAINT fk_blood_units_org FOREIGN KEY (organization_id) 
    REFERENCES organizations (id) ON DELETE RESTRICT,
  INDEX idx_blood_units_org_grp_comp_status (organization_id, blood_group, component, status),
  INDEX idx_blood_units_expiry_date (expiry_date),
  INDEX idx_blood_units_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 13. BLOOD_REQUESTS (§9.11)
-- ============================================================================
-- Blood availability fulfillment requests submitted to an organization.
CREATE TABLE blood_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requester_user_id BIGINT UNSIGNED NOT NULL,
  organization_id BIGINT UNSIGNED NOT NULL,
  created_by_role_id BIGINT UNSIGNED NOT NULL,
  priority ENUM('ROUTINE', 'URGENT', 'CRITICAL') NOT NULL DEFAULT 'ROUTINE',
  status ENUM('PENDING', 'VERIFIED', 'SEARCHING', 'PARTIALLY_FULFILLED', 'RESERVED', 'ISSUED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  required_by DATETIME NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_blood_requests_user FOREIGN KEY (requester_user_id) 
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_blood_requests_org FOREIGN KEY (organization_id) 
    REFERENCES organizations (id) ON DELETE RESTRICT,
  CONSTRAINT fk_blood_requests_role FOREIGN KEY (created_by_role_id) 
    REFERENCES roles (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 14. REQUEST_ITEMS (§9.12)
-- ============================================================================
-- Individual line items in a blood request. Cascades on request deletion.
CREATE TABLE request_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  blood_request_id BIGINT UNSIGNED NOT NULL,
  blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
  component ENUM('WHOLE_BLOOD', 'PACKED_RBC', 'PLASMA', 'PLATELETS', 'CRYO') NOT NULL,
  quantity INT NOT NULL,
  fulfilled_quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_request_items_request FOREIGN KEY (blood_request_id) 
    REFERENCES blood_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 15. RESERVATIONS (§9.13)
-- ============================================================================
-- Time-boxed hold of a physical blood unit for a request item.
-- Preserves audit history via ON DELETE RESTRICT.
-- Enforces at most one active reservation per blood unit via virtual generated column.
CREATE TABLE reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_item_id BIGINT UNSIGNED NOT NULL,
  blood_unit_id BIGINT UNSIGNED NOT NULL,
  reserved_by BIGINT UNSIGNED NOT NULL,
  status ENUM('ACTIVE', 'RELEASED', 'CONSUMED') NOT NULL DEFAULT 'ACTIVE',
  expires_at DATETIME NULL,
  -- Active hold uniqueness: only ACTIVE status populates active_unit_id, preventing duplicate active holds
  active_unit_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'ACTIVE' THEN blood_unit_id ELSE NULL END) VIRTUAL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservations_req_item FOREIGN KEY (request_item_id) 
    REFERENCES request_items (id) ON DELETE RESTRICT,
  CONSTRAINT fk_reservations_blood_unit FOREIGN KEY (blood_unit_id) 
    REFERENCES blood_units (id) ON DELETE RESTRICT,
  CONSTRAINT fk_reservations_user FOREIGN KEY (reserved_by) 
    REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 16. BLOOD_ISSUES (§9.14)
-- ============================================================================
-- Final issuance record linking a reservation to clinical dispatch (1:1).
CREATE TABLE blood_issues (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id BIGINT UNSIGNED NOT NULL UNIQUE,
  issued_by BIGINT UNSIGNED NOT NULL,
  issued_to_patient_ref VARCHAR(100) NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_blood_issues_res FOREIGN KEY (reservation_id) 
    REFERENCES reservations (id) ON DELETE RESTRICT,
  CONSTRAINT fk_blood_issues_user FOREIGN KEY (issued_by) 
    REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 17. NOTIFICATIONS (§9.15)
-- ============================================================================
-- Database-backed in-app user notifications.
CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  related_entity_type VARCHAR(50) NULL,
  related_entity_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) 
    REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_notifications_user_read (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 18. AUDIT_LOGS (§9.16)
-- ============================================================================
-- Immutable system audit trail tracking state mutations and security events.
CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id BIGINT UNSIGNED NULL,
  previous_value JSON NULL,
  new_value JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) 
    REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_audit_logs_resource (resource_type, resource_id),
  INDEX idx_audit_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 19. SYSTEM_SETTINGS (§9.17)
-- ============================================================================
-- Key-value store for global platform configuration.
CREATE TABLE system_settings (
  `key` VARCHAR(100) NOT NULL PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
