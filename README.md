# 🩸 Blood Bank Platform

> **Multi-Hospital Blood Bank Management & Blood Availability Platform**  
> A centralized, multi-tenant web application connecting hospitals, clinics, blood banks, medical staff, donors, and patients to track individual blood units through their full lifecycle and coordinate blood fulfillment requests with strict organization-level data isolation.

---

## Current Status: Phase 2 Completed (Database Setup & Seed Data)

- **Phase 1 (Project Setup):** Express server, static frontend, health check endpoints (`/api/health`).
- **Phase 2 (Database):** MySQL relational database schema (19 tables in InnoDB with foreign keys and indexes), expanded seed data (all 7 roles, permissions, dev accounts, sample organizations including clinic and pending hospital, organization staff mappings, donor profiles, donations, 14 blood units across lifecycle states), automated setup CLI (`npm run db:init`), `mysql2` connection pool, and `/api/health/db` endpoint.

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

## Dev-Only Seed Accounts

Pre-configured development credentials for local testing:

| Role | Email | Password | Details |
|---|---|---|---|
| **SUPER_ADMIN** | `admin@bloodbank.dev` | `AdminDev123!` | System Super Administrator |
| **HOSPITAL_ADMIN** | `hospital.admin@bloodbank.dev` | `UserDev123!` | City General Hospital |
| **DOCTOR** | `doctor.smith@bloodbank.dev` | `UserDev123!` | City General Hospital |
| **CLINIC_ADMIN** | `clinic.admin@bloodbank.dev` | `UserDev123!` | Metro Community Clinic |
| **BLOOD_BANK_STAFF** | `bloodbank.staff@bloodbank.dev` | `UserDev123!` | Central Red Cross Blood Bank |
| **DONOR** | `donor.john@bloodbank.dev` | `UserDev123!` | Active Donor (O+) |
| **DONOR** | `donor.sarah@bloodbank.dev` | `UserDev123!` | Universal Donor (O-) |
| **REQUESTER** | `requester.jane@bloodbank.dev` | `UserDev123!` | Patient Representative |

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
