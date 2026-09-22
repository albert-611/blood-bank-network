-- ============================================================================
-- BLOOD BANK PLATFORM — EXPANDED SEED DATA SCRIPT (PHASE 2)
-- ============================================================================
-- Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§5, §9, §10, §13)
-- Description:
--   1. Seed Roles (SUPER_ADMIN, HOSPITAL_ADMIN, CLINIC_ADMIN, BLOOD_BANK_STAFF, DOCTOR, DONOR, REQUESTER)
--   2. Seed Permissions (13 permissions matching §13 Permission Matrix)
--   3. Role-Permission mappings (Full RBAC authorization matrix)
--   4. Dev Users for all 7 platform roles (with verified bcrypt hashes)
--   5. Sample Organizations (Approved Hospital, Approved Blood Bank, Approved Clinic, Pending Hospital)
--   6. Organization Staff Assignments (connecting staff and doctors to organizations)
--   7. Donor Medical Profiles
--   8. Historical Donation Collection Records
--   9. Blood Units Inventory (diverse groups, components, and states: AVAILABLE, EXPIRED, RESERVED)
--   10. Default System Settings
-- ============================================================================

-- Disable foreign key checks during seed insertion to guarantee order independence
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. SEED ROLES (§5 & §13)
-- ----------------------------------------------------------------------------
INSERT INTO roles (id, name, description) VALUES
  (1, 'SUPER_ADMIN', 'Platform owner with full system-wide administrative privileges'),
  (2, 'HOSPITAL_ADMIN', 'Manages hospital organization profile, staff, inventory, and requests'),
  (3, 'CLINIC_ADMIN', 'Manages clinic profile and staff; searches blood and initiates requests'),
  (4, 'BLOOD_BANK_STAFF', 'Registers donations, laboratory testing, and manages blood bank inventory'),
  (5, 'DOCTOR', 'Medical professional creating clinical and emergency blood requests'),
  (6, 'DONOR', 'Blood donor managing profile, history, and appointments'),
  (7, 'REQUESTER', 'Patient or verified representative requesting blood availability'),
  (8, 'ORGANIZATION_ADMIN', 'Manages organization profile, staff, inventory, and operational requests')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- ----------------------------------------------------------------------------
-- 2. SEED PERMISSIONS (§13 Matrix)
-- ----------------------------------------------------------------------------
INSERT INTO permissions (id, `key`, description) VALUES
  (1,  'organizations.approve',      'Approve or reject organization registrations'),
  (2,  'organizations.manage_staff', 'Add, modify, and deactivate staff in own organization'),
  (3,  'inventory.manage',           'Add, edit, discard, and manage inventory in own organization'),
  (4,  'inventory.view',             'Search and view available blood units and inventory levels'),
  (5,  'donations.record',           'Record donor intake, donation collection, and test results'),
  (6,  'donations.view_own',         'View own personal donation history and eligibility info'),
  (7,  'requests.create',            'Create routine blood fulfillment requests'),
  (8,  'requests.verify',            'Approve and verify incoming blood requests for fulfillment'),
  (9,  'requests.emergency',         'Create expedited critical emergency blood requests'),
  (10, 'reservations.create',        'Place time-boxed holds and reserve blood units for requests'),
  (11, 'issues.create',              'Issue reserved blood units for patient delivery/transfusion'),
  (12, 'audit.view',                 'View system mutation audit trail logs'),
  (13, 'settings.manage',            'Modify global system settings and operational parameters')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- ----------------------------------------------------------------------------
-- 3. ROLE_PERMISSIONS MAPPINGS (§13 Matrix)
-- ----------------------------------------------------------------------------
DELETE FROM role_permissions;

-- Super Admin: Full system-wide capabilities
INSERT INTO role_permissions (role_id, permission_id) VALUES
  (1, 1),  -- organizations.approve
  (1, 2),  -- organizations.manage_staff
  (1, 3),  -- inventory.manage
  (1, 4),  -- inventory.view
  (1, 5),  -- donations.record
  (1, 6),  -- donations.view_own
  (1, 7),  -- requests.create
  (1, 8),  -- requests.verify
  (1, 9),  -- requests.emergency
  (1, 10), -- reservations.create
  (1, 11), -- issues.create
  (1, 12), -- audit.view
  (1, 13); -- settings.manage

-- Hospital Admin:
INSERT INTO role_permissions (role_id, permission_id) VALUES
  (2, 2),  -- organizations.manage_staff
  (2, 3),  -- inventory.manage
  (2, 4),  -- inventory.view
  (2, 7),  -- requests.create
  (2, 8),  -- requests.verify
  (2, 9),  -- requests.emergency
  (2, 10), -- reservations.create
  (2, 11), -- issues.create
  (2, 12); -- audit.view

-- Clinic Admin:
INSERT INTO role_permissions (role_id, permission_id) VALUES
  (3, 2),  -- organizations.manage_staff
  (3, 4),  -- inventory.view
  (3, 7),  -- requests.create
  (3, 9),  -- requests.emergency
  (3, 12); -- audit.view

-- Blood Bank Staff:
INSERT INTO role_permissions (role_id, permission_id) VALUES
  (4, 2),  -- organizations.manage_staff
  (4, 3),  -- inventory.manage
  (4, 4),  -- inventory.view
  (4, 5),  -- donations.record
  (4, 10), -- reservations.create
  (4, 11), -- issues.create
  (4, 12); -- audit.view

-- Doctor:
INSERT INTO role_permissions (role_id, permission_id) VALUES
  (5, 4),  -- inventory.view
  (5, 7),  -- requests.create
  (5, 9);  -- requests.emergency

-- Donor:
INSERT INTO role_permissions (role_id, permission_id) VALUES
  (6, 4),  -- inventory.view
  (6, 6);  -- donations.view_own

-- Requester:
INSERT INTO role_permissions (role_id, permission_id) VALUES
  (7, 4),  -- inventory.view
  (7, 7);  -- requests.create

-- Organization Admin:
INSERT INTO role_permissions (role_id, permission_id) VALUES
  (8, 2),  -- organizations.manage_staff
  (8, 3),  -- inventory.manage
  (8, 4),  -- inventory.view
  (8, 7),  -- requests.create
  (8, 8),  -- requests.verify
  (8, 9),  -- requests.emergency
  (8, 10), -- reservations.create
  (8, 11), -- issues.create
  (8, 12); -- audit.view

-- ----------------------------------------------------------------------------
-- 4. DEV USERS FOR ALL 7 ROLES (§9.1)
-- ----------------------------------------------------------------------------
-- Standard Development Passwords:
-- - Super Admin: AdminDev123! ($2b$10$s1shZN17RVe.7jOkHKIgpuh3rtS.NvChn4EeaghSSkwoeeZzkOMKS)
-- - All other users: UserDev123!  ($2b$10$aEo7eR6ZyrjGy1.4rKEqYevUZSPXyv4tlVjOGU3ctDTlZXfcgp7W6)
INSERT INTO users (id, full_name, email, password_hash, phone, global_role, status, email_verified_at) VALUES
  (1, 'System Super Administrator', 'admin@bloodbank.dev', 
   '$2b$10$s1shZN17RVe.7jOkHKIgpuh3rtS.NvChn4EeaghSSkwoeeZzkOMKS', 
   '+1-555-0000', 'SUPER_ADMIN', 'ACTIVE', NOW()),
  (2, 'Dr. Marcus Vance (Hospital Admin)', 'hospital.admin@bloodbank.dev', 
   '$2b$10$aEo7eR6ZyrjGy1.4rKEqYevUZSPXyv4tlVjOGU3ctDTlZXfcgp7W6', 
   '+1-555-0101', 'ORG_USER', 'ACTIVE', NOW()),
  (3, 'Dr. Elena Rostova (Attending Physician)', 'doctor.smith@bloodbank.dev', 
   '$2b$10$aEo7eR6ZyrjGy1.4rKEqYevUZSPXyv4tlVjOGU3ctDTlZXfcgp7W6', 
   '+1-555-0102', 'ORG_USER', 'ACTIVE', NOW()),
  (4, 'Sarah Jenkins (Clinic Manager)', 'clinic.admin@bloodbank.dev', 
   '$2b$10$aEo7eR6ZyrjGy1.4rKEqYevUZSPXyv4tlVjOGU3ctDTlZXfcgp7W6', 
   '+1-555-0301', 'ORG_USER', 'ACTIVE', NOW()),
  (5, 'David Kim (Blood Bank Technologist)', 'bloodbank.staff@bloodbank.dev', 
   '$2b$10$aEo7eR6ZyrjGy1.4rKEqYevUZSPXyv4tlVjOGU3ctDTlZXfcgp7W6', 
   '+1-555-0201', 'ORG_USER', 'ACTIVE', NOW()),
  (6, 'Johnathan Doe (Active Donor)', 'donor.john@bloodbank.dev', 
   '$2b$10$aEo7eR6ZyrjGy1.4rKEqYevUZSPXyv4tlVjOGU3ctDTlZXfcgp7W6', 
   '+1-555-0601', 'DONOR', 'ACTIVE', NOW()),
  (7, 'Sarah Connor (Universal Donor)', 'donor.sarah@bloodbank.dev', 
   '$2b$10$aEo7eR6ZyrjGy1.4rKEqYevUZSPXyv4tlVjOGU3ctDTlZXfcgp7W6', 
   '+1-555-0602', 'DONOR', 'ACTIVE', NOW()),
  (8, 'Jane Foster (Patient Requester)', 'requester.jane@bloodbank.dev', 
   '$2b$10$aEo7eR6ZyrjGy1.4rKEqYevUZSPXyv4tlVjOGU3ctDTlZXfcgp7W6', 
   '+1-555-0701', 'REQUESTER', 'ACTIVE', NOW())
ON DUPLICATE KEY UPDATE 
  full_name = VALUES(full_name), 
  password_hash = VALUES(password_hash),
  global_role = VALUES(global_role), 
  status = VALUES(status);

-- ----------------------------------------------------------------------------
-- 5. SAMPLE ORGANIZATIONS (§9.5 & §9.6)
-- ----------------------------------------------------------------------------
-- Org 1: Hospital (APPROVED)
INSERT INTO organizations (id, name, type, email, address, city, country, phone, license_number, status) VALUES
  (1, 'City General Hospital', 'HOSPITAL', 'info@citygeneral.org', '100 Medical Center Blvd', 'Metro City', 'USA', '+1-555-0100', 'HOSP-2026-001', 'APPROVED')
ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), status = VALUES(status);

INSERT INTO hospitals (id, organization_id, bed_count) VALUES
  (1, 1, 450)
ON DUPLICATE KEY UPDATE bed_count = VALUES(bed_count);

-- Org 2: Blood Bank (APPROVED)
INSERT INTO organizations (id, name, type, email, address, city, country, phone, license_number, status) VALUES
  (2, 'Central Red Cross Blood Bank', 'BLOOD_BANK', 'contact@redcrossbank.org', '250 Donor Plaza', 'Metro City', 'USA', '+1-555-0200', 'BB-2026-001', 'APPROVED')
ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), status = VALUES(status);

INSERT INTO blood_banks (id, organization_id, storage_capacity_units) VALUES
  (1, 2, 1500)
ON DUPLICATE KEY UPDATE storage_capacity_units = VALUES(storage_capacity_units);

-- Org 3: Community Clinic (APPROVED)
INSERT INTO organizations (id, name, type, email, address, city, country, phone, license_number, status) VALUES
  (3, 'Metro Community Clinic', 'CLINIC', 'clinic@metroclinic.org', '45 Green Street', 'Metro City', 'USA', '+1-555-0300', 'CLN-2026-001', 'APPROVED')
ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), status = VALUES(status);

INSERT INTO clinics (id, organization_id) VALUES
  (1, 3)
ON DUPLICATE KEY UPDATE organization_id = VALUES(organization_id);

-- Org 4: Community Hospital (PENDING - for testing Super Admin Approval Workflow)
INSERT INTO organizations (id, name, type, email, address, city, country, phone, license_number, status) VALUES
  (4, 'St. Jude Community Hospital', 'HOSPITAL', 'contact@stjudehospital.org', '78 Hope Avenue', 'Metro City', 'USA', '+1-555-0400', 'HOSP-2026-002', 'PENDING')
ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), status = VALUES(status);

INSERT INTO hospitals (id, organization_id, bed_count) VALUES
  (2, 4, 120)
ON DUPLICATE KEY UPDATE bed_count = VALUES(bed_count);

-- ----------------------------------------------------------------------------
-- 6. ORGANIZATION STAFF ASSIGNMENTS (§9.7)
-- ----------------------------------------------------------------------------
INSERT INTO organization_staff (id, user_id, organization_id, role_id, status) VALUES
  (1, 2, 1, 2, 'ACTIVE'),  -- Dr. Marcus Vance -> City General Hospital (HOSPITAL_ADMIN)
  (2, 3, 1, 5, 'ACTIVE'),  -- Dr. Elena Rostova -> City General Hospital (DOCTOR)
  (3, 4, 3, 3, 'ACTIVE'),  -- Sarah Jenkins -> Metro Community Clinic (CLINIC_ADMIN)
  (4, 5, 2, 4, 'ACTIVE')   -- David Kim -> Central Red Cross Blood Bank (BLOOD_BANK_STAFF)
ON DUPLICATE KEY UPDATE organization_id = VALUES(organization_id), role_id = VALUES(role_id), status = VALUES(status);

-- ----------------------------------------------------------------------------
-- 7. DONOR MEDICAL PROFILES (§9.8)
-- ----------------------------------------------------------------------------
INSERT INTO donors (id, user_id, blood_group, date_of_birth, last_donation_date) VALUES
  (1, 6,    'O+', '1992-05-14', DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY)),   -- John Doe
  (2, 7,    'O-', '1988-11-20', DATE_SUB(CURRENT_DATE, INTERVAL 120 DAY)),  -- Sarah Connor (Universal Donor)
  (3, NULL, 'A+', '1995-02-10', DATE_SUB(CURRENT_DATE, INTERVAL 45 DAY))   -- Walk-in unregistered donor
ON DUPLICATE KEY UPDATE blood_group = VALUES(blood_group), last_donation_date = VALUES(last_donation_date);

-- ----------------------------------------------------------------------------
-- 8. DONATION COLLECTION RECORDS (§9.9)
-- ----------------------------------------------------------------------------
INSERT INTO donations (id, donor_id, blood_bank_id, donation_date, volume_ml, status) VALUES
  (1, 1, 2, DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY),  450, 'PASSED'),
  (2, 2, 2, DATE_SUB(CURRENT_DATE, INTERVAL 120 DAY), 450, 'PASSED'),
  (3, 3, 2, DATE_SUB(CURRENT_DATE, INTERVAL 45 DAY),  500, 'PASSED')
ON DUPLICATE KEY UPDATE status = VALUES(status);

-- ----------------------------------------------------------------------------
-- 9. BLOOD UNITS INVENTORY (§9.10)
-- ----------------------------------------------------------------------------
-- Realistic distribution across blood groups, components, and inventory statuses
INSERT INTO blood_units (id, unit_code, donation_id, organization_id, blood_group, component, collection_date, expiry_date, status) VALUES
  -- Central Red Cross Blood Bank Units (Org 2)
  (1,  'BD-2026-000101', 1,    2, 'O+',  'PACKED_RBC',   DATE_SUB(CURRENT_DATE, INTERVAL 5 DAY),  DATE_ADD(CURRENT_DATE, INTERVAL 37 DAY),  'AVAILABLE'),
  (2,  'BD-2026-000102', 2,    2, 'O-',  'WHOLE_BLOOD',  DATE_SUB(CURRENT_DATE, INTERVAL 3 DAY),  DATE_ADD(CURRENT_DATE, INTERVAL 32 DAY),  'AVAILABLE'),
  (3,  'BD-2026-000103', 3,    2, 'A+',  'PACKED_RBC',   DATE_SUB(CURRENT_DATE, INTERVAL 4 DAY),  DATE_ADD(CURRENT_DATE, INTERVAL 38 DAY),  'AVAILABLE'),
  (4,  'BD-2026-000104', 1,    2, 'B+',  'PLATELETS',    DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY),  DATE_ADD(CURRENT_DATE, INTERVAL 4 DAY),   'AVAILABLE'),
  (5,  'BD-2026-000105', 2,    2, 'AB+', 'PLASMA',       DATE_SUB(CURRENT_DATE, INTERVAL 10 DAY), DATE_ADD(CURRENT_DATE, INTERVAL 355 DAY), 'AVAILABLE'),
  (6,  'BD-2026-000106', NULL, 2, 'AB-', 'CRYO',         DATE_SUB(CURRENT_DATE, INTERVAL 15 DAY), DATE_ADD(CURRENT_DATE, INTERVAL 350 DAY), 'AVAILABLE'),
  (7,  'BD-2026-000107', NULL, 2, 'O-',  'PACKED_RBC',   DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY),  DATE_ADD(CURRENT_DATE, INTERVAL 41 DAY),  'AVAILABLE'),
  (8,  'BD-2026-000108', NULL, 2, 'A+',  'PLATELETS',    DATE_SUB(CURRENT_DATE, INTERVAL 2 DAY),  DATE_ADD(CURRENT_DATE, INTERVAL 3 DAY),   'AVAILABLE'),
  (9,  'BD-2026-000109', NULL, 2, 'B+',  'PLASMA',       DATE_SUB(CURRENT_DATE, INTERVAL 8 DAY),  DATE_ADD(CURRENT_DATE, INTERVAL 357 DAY), 'AVAILABLE'),
  (10, 'BD-2026-000110', NULL, 2, 'O+',  'PACKED_RBC',   DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY),  DATE_ADD(CURRENT_DATE, INTERVAL 35 DAY),  'RESERVED'),
  -- City General Hospital Units (Org 1)
  (11, 'BD-2026-000111', NULL, 1, 'O+',  'WHOLE_BLOOD',  DATE_SUB(CURRENT_DATE, INTERVAL 2 DAY),  DATE_ADD(CURRENT_DATE, INTERVAL 33 DAY),  'AVAILABLE'),
  (12, 'BD-2026-000112', NULL, 1, 'A-',  'PACKED_RBC',   DATE_SUB(CURRENT_DATE, INTERVAL 6 DAY),  DATE_ADD(CURRENT_DATE, INTERVAL 36 DAY),  'AVAILABLE'),
  (13, 'BD-2026-000113', NULL, 1, 'B-',  'WHOLE_BLOOD',  DATE_SUB(CURRENT_DATE, INTERVAL 12 DAY), DATE_ADD(CURRENT_DATE, INTERVAL 23 DAY),  'AVAILABLE'),
  (14, 'BD-2026-000114', NULL, 1, 'A+',  'PACKED_RBC',   DATE_SUB(CURRENT_DATE, INTERVAL 50 DAY), DATE_SUB(CURRENT_DATE, INTERVAL 8 DAY),   'EXPIRED')
ON DUPLICATE KEY UPDATE 
  status = VALUES(status), 
  expiry_date = VALUES(expiry_date);

-- ----------------------------------------------------------------------------
-- 10. DEFAULT SYSTEM SETTINGS (§9.17)
-- ----------------------------------------------------------------------------
INSERT INTO system_settings (`key`, value) VALUES
  ('reservation_hold_hours',        '24'),
  ('emergency_auto_alert',          'true'),
  ('inventory_low_threshold',       '5'),
  ('system_name',                   'Blood Bank Platform'),
  ('contact_email',                 'support@bloodbank.dev'),
  ('max_daily_donations_per_bank',  '50'),
  ('donor_minimum_interval_days',   '56')
ON DUPLICATE KEY UPDATE value = VALUES(value);

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;
