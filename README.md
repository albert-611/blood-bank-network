# 🩸 Blood Bank Platform

> **Multi-Hospital Blood Bank Management & Blood Availability Platform**  
> A centralized, multi-tenant web application connecting hospitals, clinics, blood banks, medical staff, donors, and patients to track individual blood units through their full lifecycle and coordinate blood fulfillment requests with strict organization-level data isolation.

---

## Current Status: Phase 2 Completed (Database Setup & Seed Data)

- **Phase 1 (Project Setup):** Express server, static frontend, health check endpoints (`/api/health`).
- **Phase 2 (Database):** MySQL relational database schema (19 tables in InnoDB with foreign keys and indexes), expanded seed data (all 7 roles, permissions, dev accounts, sample organizations including clinic and pending hospital, organization staff mappings, donor profiles, donations, 14 blood units across lifecycle states), automated setup CLI (`npm run db:init`), `mysql2` connection pool, and `/api/health/db` 
endpoint.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and configure your local database credentials:
```env
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=blood_bank_db
DB_PORT=3306
```

### 3. Initialize MySQL Database (1-Command Automated)
Make sure your local MySQL server is running, then run:
```bash
npm run db:init
```
*(To refresh seed records without rebuilding schema, run `npm run db:seed`).*

Detailed manual setup options (MySQL Workbench / CLI) are in [docs/database-setup.md](docs/database-setup.md).

### 4. Start the Application
```bash
npm start
```
- Web Application: [http://localhost:5000](http://localhost:5000)
- API Health Check: [http://localhost:5000/api/health](http://localhost:5000/api/health)
- Database Health Check: [http://localhost:5000/api/health/db](http://localhost:5000/api/health/db)

---

## Deployment & Production Database Setup

### Production Architecture
```text
GitHub repository
        ↓
Cloud Deployment (Render / Railway / Heroku / AWS)
        ↓
Production Backend (Node / Express)
        ↓
Production MySQL Database (AWS RDS / Railway / Aiven / PlanetScale)
        ↓
Database schema initialized (npm run db:init)
        ↓
Idempotent seed data applied (npm run db:seed)
        ↓
Configured users authenticate via live database
```

### 1. Production Environment Variables
Configure your deployment hosting provider with the appropriate environment variables:
- `NODE_ENV=production`
- `PORT=5000`
- `DB_HOST=your-cloud-mysql-host.com`
- `DB_USER=your_db_username`
- `DB_PASSWORD=your_db_password`
- `DB_NAME=blood_bank_db`
- `DB_PORT=3306`
- `DB_SSL=true` (if required by your cloud provider)
- `JWT_SECRET=your_secure_random_64_char_jwt_secret`
- `FRONTEND_URL=https://your-frontend-domain.com`

*Alternatively, you can supply a single `DATABASE_URL` connection string:*
```env
DATABASE_URL=mysql://username:password@host:port/database_name?sslmode=require
```

### 2. Database Initialization in Production
Once deployed and connected to the production database:
```bash
# First-time initial schema setup and seed:
npm run db:init

# To safely re-run or refresh seed records without affecting schema:
npm run db:seed
```
> [!NOTE]
> In production (`NODE_ENV=production`), `npm run db:init` automatically detects existing tables and prevents accidental drops/truncations. The seeding process (`npm run db:seed`) is strictly non-destructive and idempotent.

---

## Seed Accounts (Testing & Demonstration)

> [!WARNING]
> The seeded accounts below are intended for development, demonstration, and staging environments. Do not use these standard demo credentials for privileged real-world operations in high-security production environments.

The seed system initializes the following baseline accounts with pre-hashed credentials:

| Role | Email | Password | Assigned Organization | Dashboard |
|---|---|---|---|---|
| **SUPER_ADMIN** | `admin@bloodbank.dev` | `AdminDev123!` | System Super Administrator | `/dashboard/super-admin/index.html` |
| **HOSPITAL_ADMIN** | `hospital.admin@bloodbank.dev` | `UserDev123!` | City General Hospital | `/dashboard/hospital-admin/index.html` |
| **DOCTOR** | `doctor.smith@bloodbank.dev` | `UserDev123!` | City General Hospital | `/dashboard/doctor/index.html` |
| **CLINIC_ADMIN** | `clinic.admin@bloodbank.dev` | `UserDev123!` | Metro Community Clinic | `/dashboard/clinic-admin/index.html` |
| **BLOOD_BANK_STAFF** | `bloodbank.staff@bloodbank.dev` | `UserDev123!` | Central Red Cross Blood Bank | `/dashboard/blood-bank-staff/index.html` |
| **DONOR** | `donor.john@bloodbank.dev` | `UserDev123!` | Walk-in / Independent (O+) | `/dashboard/donor/index.html` |
| **DONOR** | `donor.sarah@bloodbank.dev` | `UserDev123!` | Universal Donor (O-) | `/dashboard/donor/index.html` |
| **REQUESTER** | `requester.jane@bloodbank.dev` | `UserDev123!` | Patient Representative | `/dashboard/donor/index.html` |

---

## Database Architecture Overview

The database uses **InnoDB** with strict foreign key constraints and UTF-8 (`utf8mb4`).

### Core Tables (19 Tables):
- **Identity & Access:** `users`, `roles`, `permissions`, `role_permissions`, `organization_staff`
- **Organizations:** `organizations`, `hospitals`, `clinics`, `blood_banks`
- **Donation & Inventory:** `donors`, `donations`, `blood_units` (9-state unit lifecycle tracking)
- **Requests & Issuance:** `blood_requests`, `request_items`, `reservations` (active hold uniqueness), `blood_issues`
- **Operations & Compliance:** `notifications`, `audit_logs` (JSON mutation logs), `system_settings`

See [BLOOD_BANK_PLATFORM_PLAN.md](BLOOD_BANK_PLATFORM_PLAN.md) for architectural details.
