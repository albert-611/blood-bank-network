# 🩸 Blood Bank Platform — Database Setup Guide (Phase 2)

This guide walks you through setting up the MySQL database locally using either the **Automated 1-Command CLI Script** (`npm run db:init`), **MySQL Workbench**, or the **MySQL Command Line**, configuring environment variables, and verifying the connection.

---

## Prerequisites

1. **MySQL Server 8.0+** (or compatible MariaDB) installed and running locally.
2. Node.js (v18+) with project dependencies installed (`npm install`).
3. (Optional) **MySQL Workbench** or the `mysql` CLI client.

---

## Step 1: Configure Environment Variables (`.env`)

In your project root, verify or edit your `.env` file to match your local MySQL server credentials:

```env
# Application Configuration
PORT=5000
NODE_ENV=development

# Database Configuration (MySQL Community Server / XAMPP)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=blood_bank_db
DB_PORT=3306

# Authentication (Dev Placeholder)
JWT_SECRET=dev_jwt_secret_phase1_testing_only
JWT_EXPIRES_IN=8h
```

> [!TIP]
> If your MySQL `root` user has a password (set during MySQL Community Server installation), enter it in `DB_PASSWORD`. If using XAMPP with default settings and no password, leave it empty (`DB_PASSWORD=`).

---

## Step 2: Initialize Database (Choose Method A, B, or C)

### 🌟 Option A: Automated 1-Command Setup (Recommended)

Run the automated Node.js database setup script:
```bash
npm run db:init
```

This single command:
1. Connects to your MySQL server.
2. Creates the `blood_bank_db` database if it doesn't already exist.
3. Imports and builds all 19 relational tables from `database/schema.sql`.
4. Seeds all sample users, roles, permissions, organizations, donors, and inventory from `database/seed.sql`.
5. Displays a verified record count summary table in your terminal.

> [!NOTE]
> To re-seed records without dropping or rebuilding the schema, run:
> ```bash
> npm run db:seed
> ```

---

### Option B: Using MySQL Workbench (Manual GUI)

1. Connect to your local MySQL instance in MySQL Workbench.
2. Create the database:
   ```sql
   CREATE DATABASE IF NOT EXISTS blood_bank_db
     CHARACTER SET utf8mb4
     COLLATE utf8mb4_unicode_ci;
   ```
3. Go to **File** → **Open SQL Script...** and select `database/schema.sql`.
4. Select `blood_bank_db` as default schema and click the yellow **Execute** lightning bolt.
5. Go to **File** → **Open SQL Script...** and select `database/seed.sql`.
6. Click the yellow **Execute** lightning bolt to import seed records.

---

### Option C: Using MySQL Command Line (Manual CLI)

From the project root directory in PowerShell or Command Prompt:

```bash
# 1. Create database
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS blood_bank_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. Import schema
mysql -u root -p blood_bank_db < database/schema.sql

# 3. Import seed data
mysql -u root -p blood_bank_db < database/seed.sql
```
*(Enter your MySQL password when prompted, or omit `-p` if no password is set).*

---

## Step 3: Verify the Connection

1. Start the Node backend server:
   ```bash
   npm start
   ```
2. Open your browser or run curl to test the health endpoints:
   - **General Health:** [http://localhost:5000/api/health](http://localhost:5000/api/health)
     ```json
     { "success": true, "message": "API is running" }
     ```
   - **Database Connectivity:** [http://localhost:5000/api/health/db](http://localhost:5000/api/health/db)
     ```json
     { "success": true, "db": "connected", "timestamp": "..." }
     ```

If the database is running and credentials match, `/api/health/db` returns HTTP 200 with `"db": "connected"`. If disconnected, it returns HTTP 503 with a diagnostic error message.

---

## Dev-Only Seed Accounts (For Local Testing)

All seed accounts are pre-configured with secure bcrypt hashes for immediate use in Phase 3+:

| Role | Name | Email | Password | Organization |
|---|---|---|---|---|
| **SUPER_ADMIN** | System Super Administrator | `admin@bloodbank.dev` | `AdminDev123!` | System-wide |
| **HOSPITAL_ADMIN** | Dr. Marcus Vance | `hospital.admin@bloodbank.dev` | `UserDev123!` | City General Hospital |
| **DOCTOR** | Dr. Elena Rostova | `doctor.smith@bloodbank.dev` | `UserDev123!` | City General Hospital |
| **CLINIC_ADMIN** | Sarah Jenkins | `clinic.admin@bloodbank.dev` | `UserDev123!` | Metro Community Clinic |
| **BLOOD_BANK_STAFF** | David Kim | `bloodbank.staff@bloodbank.dev` | `UserDev123!` | Central Red Cross Blood Bank |
| **DONOR** | Johnathan Doe | `donor.john@bloodbank.dev` | `UserDev123!` | Standalone Donor (O+) |
| **DONOR** | Sarah Connor | `donor.sarah@bloodbank.dev` | `UserDev123!` | Universal Donor (O-) |
| **REQUESTER** | Jane Foster | `requester.jane@bloodbank.dev` | `UserDev123!` | Patient Representative |

---

## Database Architecture Summary (19 Tables)

| # | Table | Purpose | Cascade / Delete Rules |
|---|---|---|---|
| 1 | `users` | Platform authentication & accounts | `global_role`, `status` |
| 2 | `roles` | 7 system roles | Referenced by staff/permissions |
| 3 | `permissions` | 13 granular operational permissions | Unique `key` |
| 4 | `role_permissions` | Many-to-many RBAC mapping | `ON DELETE CASCADE` |
| 5 | `organizations` | Common org entity (Hospital/Clinic/Blood Bank) | `ON DELETE RESTRICT` |
| 6 | `hospitals` | Hospital specifics (bed count) | 1:1 with organizations |
| 7 | `clinics` | Clinic specifics | 1:1 with organizations |
| 8 | `blood_banks` | Blood bank specifics (storage capacity) | 1:1 with organizations |
| 9 | `organization_staff` | Ties user to organization + role | Single-org membership (MVP) |
| 10 | `donors` | Donor medical profile & blood group | Links to user or standalone |
| 11 | `donations` | Donation collection & lab test status | Tied to donor + blood bank |
| 12 | `blood_units` | Physical blood units (9 lifecycle states) | Composite index on org/group/component/status |
| 13 | `blood_requests` | Availability requests from clinics/hospitals | `priority`, `status` lifecycle |
| 14 | `request_items` | Individual line items per request | `ON DELETE CASCADE` from request |
| 15 | `reservations` | Time-boxed holds of blood units | `ON DELETE RESTRICT` (audit preservation) |
| 16 | `blood_issues` | Final issuance / transfusion dispatch | 1:1 with reservation |
| 17 | `notifications` | Database-backed in-app alerts | `ON DELETE CASCADE` from user |
| 18 | `audit_logs` | Immutable audit trail with JSON diffs | Indexed by resource & date |
| 19 | `system_settings` | Platform operational settings | Key-value store |
