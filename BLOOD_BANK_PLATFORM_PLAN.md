# 🩸 BLOOD BANK PLATFORM — MASTER PLAN

**Status:** Phase 3 (Authentication Architecture) Completed — Phase 4 Ready
**Single Source of Truth for this project.** Update this file whenever an architectural decision is made or a phase is completed.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Project Goals](#3-project-goals)
4. [Technology Stack](#4-technology-stack)
5. [User Roles](#5-user-roles)
6. [Medical Safety Principle](#6-medical-safety-principle)
7. [Feature List](#7-feature-list)
8. [Core Modules](#8-core-modules)
9. [Database Architecture](#9-database-architecture)
10. [Database Relationships / ERD](#10-database-relationships--erd)
11. [Multi-Organization Architecture](#11-multi-organization-architecture)
12. [Authentication Architecture](#12-authentication-architecture)
13. [Authorization Architecture](#13-authorization-architecture)
14. [Blood Inventory Architecture](#14-blood-inventory-architecture)
15. [Blood Request Workflow](#15-blood-request-workflow)
16. [Emergency Request Workflow](#16-emergency-request-workflow)
17. [Blood Search System](#17-blood-search-system)
18. [REST API Architecture](#18-rest-api-architecture)
19. [Dashboard Architecture](#19-dashboard-architecture)
20. [Frontend Sitemap](#20-frontend-sitemap)
21. [UI/UX System](#21-uiux-system)
22. [Notification System](#22-notification-system)
23. [Audit Log System](#23-audit-log-system)
24. [Reports and Analytics](#24-reports-and-analytics)
25. [Security Architecture](#25-security-architecture)
26. [Folder Structure](#26-folder-structure)
27. [Testing Strategy](#27-testing-strategy)
28. [MVP Scope / Version 2 / Version 3 / Production](#28-mvp-scope--version-2--version-3--production)
29. [Real-World Considerations](#29-real-world-considerations)
30. [Future Architecture](#30-future-architecture)
31. [Development Roadmap](#31-development-roadmap)
32. [Development Rules](#32-development-rules)
33. [Portfolio Strategy](#33-portfolio-strategy)
34. [Phase 1 Implementation Prompt](#34-phase-1-implementation-prompt)

---

## 1. Project Overview

A **Multi-Hospital Blood Bank Management & Blood Availability Platform** — a centralized web application connecting hospitals, clinics, blood banks, medical staff, donors, and patients/requesters. It lets verified medical organizations manage blood inventory, and lets authorized users search for and request blood, including emergency requests, across multiple independent organizations.

## 2. Problem Statement

Blood availability information is usually siloed inside individual hospitals or blood banks with no shared, searchable view. Patients and clinics often cannot quickly discover which nearby organization has the blood group/component they need, especially in emergencies. There is no standard, auditable workflow for requesting, reserving, and issuing blood units, nor a consistent way to track a blood unit's lifecycle from donation to transfusion. This platform addresses that by providing a shared, permissioned, auditable inventory and request system across organizations, while explicitly leaving all medical decisions to qualified professionals.

## 3. Project Goals

- Build a **high-quality educational/portfolio MVP** demonstrating full-stack competence.
- Design the architecture so it can evolve toward a real production platform without a rewrite.
- Demonstrate: REST API design, relational database design, authentication, RBAC, multi-tenant data isolation, inventory/state-machine modeling, business-rule validation, security fundamentals, and testing.
- Avoid over-engineering — no premature scaling technology.

## 4. Technology Stack

### Frontend (MVP)
- HTML, CSS, vanilla JavaScript, Tailwind CSS (via CDN or build step)

### Backend (MVP)
- Node.js + Express.js

### Database (MVP)
- MySQL, run locally via XAMPP, managed with phpMyAdmin

### Authentication (MVP)
- JWT (access tokens), bcrypt (password hashing), custom role-based middleware

### Tooling
- VS Code, Git, GitHub, Postman

### Explicitly excluded from MVP
React, Next.js, MongoDB, Docker, Kubernetes, microservices, GraphQL, Redis, message queues, complex cloud infra. (See [Future Architecture](#30-future-architecture) for when/why these could be introduced.)

## 5. User Roles

| Role | Summary |
|---|---|
| **Super Admin** | Platform owner. Approves/rejects organizations, manages all users, views system-wide stats, audit logs, settings. |
| **Hospital Admin** | Manages one hospital's profile, staff, inventory, and requests. |
| **Clinic Admin** | Manages one clinic's profile/staff; searches blood and creates requests (clinics typically don't hold inventory). |
| **Blood Bank Staff** | Registers donations, testing, blood units, and inventory for one blood bank. |
| **Doctor / Medical Staff** | Creates blood requests (including emergency) on behalf of patients; specifies component/quantity/urgency. |
| **Donor** | Manages own donor profile, views donation history and donation opportunities. |
| **Patient / Requester** | Searches blood availability and (where permitted) submits/tracks requests. |

Each role's detailed responsibilities are exactly as listed in the original planning brief (organization management, inventory, requests, donations, dashboards, etc.).

## 6. Medical Safety Principle

This platform is an **operational and inventory-management system**, not a medical decision engine. It must never autonomously decide:
- Whether a person is medically eligible to donate.
- Whether a transfusion is medically appropriate.
- Whether a specific patient should receive a specific component.

The system's job is limited to: storing blood groups/components/inventory, storing requests, letting authorized professionals record requirements, and running the operational workflow (search → reserve → issue → complete). Anything touching eligibility, transfusion appropriateness, or clinical judgment is explicitly flagged throughout this document as requiring **medical validation, legal review, regulatory approval, and professional healthcare consultation** before any real-world deployment.

## 7. Feature List

Blood availability search · hospital inventory · clinic requests · blood-bank inventory · donations · blood-unit tracking · expiry tracking · blood requests · emergency requests · reservations · issuing · donor management · hospital/clinic/blood-bank management · organization verification · notifications · reports · analytics · role-based access control · organization-level data isolation · audit logs.

## 8. Core Modules

For each module: purpose, users, features, DB tables, key endpoints, security notes, dependencies, and business rules.

### 8.1 Authentication
- **Purpose:** Verify identity, issue session tokens.
- **Users:** All.
- **Tables:** `users`.
- **Endpoints:** `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh`, `/api/auth/reset-password`.
- **Security:** bcrypt hashing, JWT signing secret in env, rate-limited login.
- **Rules:** Email must be unique; unverified accounts have restricted access.

### 8.2 User Management
- **Purpose:** CRUD on user accounts, profile info.
- **Users:** Super Admin (all), Org Admins (their staff).
- **Tables:** `users`, `organization_staff`.
- **Rules:** Only Super Admin can hard-delete a user; org admins can only deactivate their own staff.

### 8.3 Role Management
- **Purpose:** Define system roles.
- **Tables:** `roles`.
- **Rules:** Roles are seeded, not user-creatable in MVP.

### 8.4 Permission Management
- **Purpose:** Map roles to allowed actions.
- **Tables:** `permissions`, `role_permissions`.
- **Rules:** Enforced server-side on every protected route, never trust the frontend.

### 8.5 Hospital Management
- **Purpose:** CRUD hospital organization records.
- **Tables:** `organizations`, `hospitals`.
- **Rules:** New hospitals start `PENDING` until Super Admin approves.

### 8.6 Clinic Management
- Same pattern as Hospital, table `clinics`.

### 8.7 Blood-Bank Management
- Same pattern as Hospital, table `blood_banks`.

### 8.8 Organization Verification
- **Purpose:** Super Admin approval workflow for new organizations.
- **Tables:** `organizations` (status column).
- **Rules:** Unverified organizations cannot list inventory or receive requests.

### 8.9 Organization Staff Management
- **Purpose:** Link users to an organization with a role.
- **Tables:** `organization_staff`.
- **Rules:** A user can belong to exactly one organization in the MVP (simplifies isolation logic).

### 8.10 Donor Management
- **Tables:** `donors`.
- **Rules:** Donor profile is separate from organization staff; a user may also be a donor.

### 8.11 Donation Management
- **Purpose:** Record a donation event, feeding into blood-unit creation.
- **Tables:** `donations`.
- **Rules:** A donation becomes one or more `blood_units` only after testing passes.

### 8.12 Blood-Unit Management
- **Purpose:** Track each physical unit individually (see [§14](#14-blood-inventory-architecture)).
- **Tables:** `blood_units`.

### 8.13 Blood Inventory Management
- **Purpose:** Derived/aggregated view of available units per organization/group/component.
- **Tables:** Computed from `blood_units` (see §14); optionally a materialized `blood_inventory` summary table refreshed on unit status change.

### 8.14 Blood Request Management
- **Tables:** `blood_requests`, `request_items`.
- See [§15](#15-blood-request-workflow).

### 8.15 Emergency Request Management
- Extension of blood requests with `priority = CRITICAL` and expedited handling. See [§16](#16-emergency-request-workflow).

### 8.16 Blood Reservation
- **Tables:** `reservations`.
- **Rules:** A unit can have at most one active reservation at a time (enforced by unique constraint / status check).

### 8.17 Blood Issuing
- **Tables:** `blood_issues`.
- **Rules:** Only `RESERVED` units in the requesting organization may be issued.

### 8.18 Blood Expiry Tracking
- **Rules:** A scheduled job (or on-read check) flags units past `expiry_date` and moves them to `EXPIRED`, removing them from available inventory.

### 8.19 Search and Filtering
- See [§17](#17-blood-search-system).

### 8.20 Dashboards
- See [§19](#19-dashboard-architecture).

### 8.21 Notifications
- See [§22](#22-notification-system).

### 8.22 Reports
- See [§24](#24-reports-and-analytics).

### 8.23 Analytics
- Aggregate queries over `blood_units`, `blood_requests`, `donations` for charts.

### 8.24 Audit Logs
- See [§23](#23-audit-log-system).

### 8.25 System Settings
- **Tables:** `system_settings` (key/value).
- **Rules:** Only Super Admin can modify.

---

## 9. Database Architecture

All tables use `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY` unless noted, `created_at`/`updated_at` TIMESTAMP defaults, and InnoDB with foreign keys enforced.

### `users`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| full_name | VARCHAR(150) | required |
| email | VARCHAR(190) | UNIQUE, required |
| password_hash | VARCHAR(255) | required |
| phone | VARCHAR(30) | nullable |
| global_role | ENUM('SUPER_ADMIN','ORG_USER','DONOR','REQUESTER') | required, default 'ORG_USER' |
| status | ENUM('ACTIVE','SUSPENDED','PENDING_VERIFICATION') | default PENDING_VERIFICATION |
| email_verified_at | TIMESTAMP | nullable |
| created_at / updated_at | TIMESTAMP | |

*Why:* Single identity table for everyone; `global_role` distinguishes platform-level role, while org-level role lives in `organization_staff`.

### `roles`
id, name (UNIQUE, e.g. HOSPITAL_ADMIN, CLINIC_ADMIN, BLOOD_BANK_STAFF, DOCTOR), description.

### `permissions`
id, key (UNIQUE, e.g. `inventory.create`), description.

### `role_permissions`
role_id (FK→roles), permission_id (FK→permissions), composite PK. *Why:* many-to-many mapping of roles to allowed actions.

### `organizations`
id, name, type ENUM('HOSPITAL','CLINIC','BLOOD_BANK'), address, city, phone, license_number (UNIQUE, nullable), status ENUM('PENDING','APPROVED','REJECTED','SUSPENDED') default PENDING, created_at, updated_at.
*Why:* one shared table for the common fields of all three organization types (single-table-inheritance style), with type-specific tables holding extras.

### `hospitals` / `clinics` / `blood_banks`
id, organization_id (FK→organizations, UNIQUE), [type-specific columns e.g. bed_count for hospitals], created_at, updated_at.
*Why:* keeps `organizations` generic for shared queries (e.g. "all approved orgs near me") while allowing type-specific attributes without sparse nullable columns on one giant table.

### `organization_staff`
id, user_id (FK→users, UNIQUE in MVP), organization_id (FK→organizations), role_id (FK→roles), status ENUM('ACTIVE','SUSPENDED'), created_at, updated_at.
*Why:* the join table that ties a user to exactly one organization + role, the backbone of data isolation.

### `donors`
id, user_id (FK→users, UNIQUE, nullable if donor not registered as a platform user), blood_group ENUM(8 groups), date_of_birth, last_donation_date, created_at, updated_at.

### `donations`
id, donor_id (FK→donors), blood_bank_id (FK→organizations), donation_date, volume_ml, status ENUM('COLLECTED','TESTING','PASSED','FAILED'), created_at, updated_at.

### `blood_units`
id, unit_code (VARCHAR UNIQUE, e.g. BD-2026-000123), donation_id (FK→donations, nullable for MVP-seeded stock), organization_id (FK→organizations, current holder), blood_group ENUM(8), component ENUM('WHOLE_BLOOD','PACKED_RBC','PLASMA','PLATELETS','CRYO'), collection_date DATE, expiry_date DATE, status ENUM('DONATED','TESTING','AVAILABLE','RESERVED','ISSUED','COMPLETED','EXPIRED','DISCARDED','REJECTED') default DONATED, created_at, updated_at. Index on (organization_id, blood_group, component, status), index on expiry_date.
*Why:* individual-unit tracking (not aggregate counters) is required for real traceability, expiry handling, and preventing double-issue.

### `blood_requests`
id, requester_user_id (FK→users), organization_id (FK→organizations, the fulfilling org), created_by_role_id (FK→roles), priority ENUM('ROUTINE','URGENT','CRITICAL') default ROUTINE, status ENUM('PENDING','VERIFIED','SEARCHING','PARTIALLY_FULFILLED','RESERVED','ISSUED','COMPLETED','REJECTED','CANCELLED','EXPIRED') default PENDING, required_by DATETIME nullable, notes TEXT nullable, created_at, updated_at.

### `request_items`
id, blood_request_id (FK→blood_requests), blood_group ENUM(8), component ENUM(5), quantity INT, fulfilled_quantity INT default 0.
*Why:* a single request can ask for multiple group/component/quantity lines.

### `reservations`
id, request_item_id (FK→request_items), blood_unit_id (FK→blood_units, UNIQUE while active), reserved_by (FK→users), status ENUM('ACTIVE','RELEASED','CONSUMED') default ACTIVE, expires_at DATETIME nullable, created_at, updated_at.
*Why:* separate reservation record allows time-boxed holds and release-on-expiry without mutating the unit history directly.

### `blood_issues`
id, reservation_id (FK→reservations, UNIQUE), issued_by (FK→users), issued_to_patient_ref VARCHAR(100) nullable, issued_at TIMESTAMP, created_at.

### `notifications`
id, user_id (FK→users), type VARCHAR(50), title VARCHAR(150), body TEXT, is_read BOOLEAN default false, related_entity_type VARCHAR(50) nullable, related_entity_id BIGINT nullable, created_at.

### `audit_logs`
id, user_id (FK→users, nullable for system actions), action VARCHAR(100), resource_type VARCHAR(50), resource_id BIGINT nullable, previous_value JSON nullable, new_value JSON nullable, ip_address VARCHAR(45) nullable, created_at. Index on (resource_type, resource_id), index on created_at.

### `system_settings`
key VARCHAR(100) PK, value TEXT, updated_at.

---

## 10. Database Relationships / ERD

```text
users ─┬──< organization_staff >──┬── roles
       │                          └── organizations ─┬── hospitals
       │                                              ├── clinics
       │                                              └── blood_banks
       ├──< donors ──< donations ──< blood_units
       ├──< blood_requests ──< request_items ──< reservations ──< blood_issues
       ├──< notifications
       └──< audit_logs

blood_units }──── organizations   (many units belong to one org)
reservations }──── blood_units    (one active reservation per unit)
blood_issues ──── reservations    (one issue per reservation, 1:1)
role_permissions: roles }──{ permissions  (many-to-many)
```

**Relationship types:**
- One-to-one: `hospitals.organization_id` ↔ `organizations.id`; `reservations` ↔ `blood_issues`.
- One-to-many: `organizations` → `blood_units`; `donors` → `donations`; `blood_requests` → `request_items`.
- Many-to-many: `roles` ↔ `permissions` via `role_permissions`.

**Cascading:** Deleting an organization is disallowed while it has staff/units/requests (`ON DELETE RESTRICT`). Deleting a `blood_request` cascades to `request_items` (`ON DELETE CASCADE`) but reservations/issues are preserved for audit (`ON DELETE RESTRICT`) — in practice requests are soft-cancelled, not deleted.

---

## 11. Multi-Organization Architecture

Every protected request goes through this chain:

```text
Authenticated User (JWT)
        ↓
Look up organization_staff row (user_id → organization_id, role_id)
        ↓
Load role's permissions
        ↓
Check requested action against permissions
        ↓
Check resource.organization_id === session.organization_id
   (unless global_role === SUPER_ADMIN)
        ↓
Allow / Deny
```

**Enforcement rules for the MVP (simplest secure approach):**
1. Every table holding org-owned data has an `organization_id` column.
2. A single Express middleware (`requireOrg`) loads the caller's `organization_id` from their `organization_staff` record and attaches it to `req.orgId`.
3. Every controller that reads/writes org-owned data adds `WHERE organization_id = ?` using `req.orgId` — never trusts an `organization_id` supplied in the request body/query.
4. Super Admin bypasses the org filter (checked via `global_role`).
5. Cross-organization writes (e.g., Hospital A editing Hospital B's unit) are rejected with `403` before touching the DB, and the attempt is written to `audit_logs`.

This is enforced **only in the backend** — the frontend may hide UI, but authorization decisions never rely on that.

---

## 12. Authentication Architecture

- **Registration:** email/password (bcrypt, cost 12) + full name → user created as `PENDING_VERIFICATION`. Org-staff accounts are created by an Org Admin or Super Admin (not self-registered), reducing spoofed-organization risk.
- **Login:** verify email+password → issue short-lived JWT access token (e.g., 15–60 min) containing `user_id`, `global_role`; on the MVP a simple long-lived token (e.g., 8h) is acceptable, with a clear "Future: refresh tokens" note.
- **Password hashing:** bcrypt, never store plaintext or reversible encryption.
- **Token verification:** Express middleware validates signature + expiry on every protected route.
- **Logout:** MVP uses stateless JWT — logout is client-side token discard; note in Future Architecture that a token-blocklist (Redis) enables true server-side invalidation.
- **Password reset:** emailed single-use, time-limited token (MVP can stub email via console log).
- **Account verification:** email-verification token flow, gating some actions until verified.

---

## 13. Authorization Architecture

Roles: `SUPER_ADMIN, HOSPITAL_ADMIN, CLINIC_ADMIN, BLOOD_BANK_STAFF, DOCTOR, DONOR, REQUESTER`.

### Permission Matrix (excerpt — full matrix maintained in code as seed data)

| Action | Super Admin | Hospital Admin | Clinic Admin | Blood Bank Staff | Doctor | Donor | Requester |
|---|---:|---:|---:|---:|---:|---:|---:|
| Approve organizations | Yes | No | No | No | No | No | No |
| Manage own org staff | Yes | Yes | Yes | Yes | No | No | No |
| Manage inventory (own org) | Yes | Yes | No | Yes | No | No | No |
| Record donation | Yes | No | No | Yes | No | No | No |
| Create blood request | Yes | Yes | Yes | No | Yes | No | Limited |
| Approve/verify request | Yes | Yes | No | No | No | No | No |
| Reserve blood unit | Yes | Yes | No | Yes | No | No | No |
| Issue blood | Yes | Yes | No | Yes | No | No | No |
| Create emergency request | Yes | Yes | Yes | No | Yes | No | No |
| Search blood availability | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| View own donation history | Yes | No | No | No | No | Yes | No |
| View audit logs | Yes | Org-scoped | Org-scoped | Org-scoped | No | No | No |
| Manage system settings | Yes | No | No | No | No | No | No |

Enforcement: `role_permissions` seed table + a `checkPermission(permKey)` middleware factory used on every route.

---

## 14. Blood Inventory Architecture

Inventory is **never** a raw counter (`O+ = 25`). It is always derived from individual `blood_units` rows.

**Example unit:**
```text
Unit ID: BD-2026-000123
Blood Group: O+
Component: Whole Blood
Collection Date: 2026-09-14
Expiry Date: 2026-10-26
Organization: XYZ Hospital
Status: AVAILABLE
```

**Lifecycle (state machine):**
```text
DONATED → TESTING → AVAILABLE → RESERVED → ISSUED → COMPLETED
                                     ↓
                                 (RELEASED back to AVAILABLE if reservation expires/cancelled)

Side states reachable from most stages:
AVAILABLE/RESERVED → EXPIRED   (expiry_date passed)
TESTING             → REJECTED (failed testing)
any non-terminal     → DISCARDED (damaged/contaminated)
```

**Computing available inventory:**
```sql
SELECT organization_id, blood_group, component, COUNT(*) AS available_units
FROM blood_units
WHERE status = 'AVAILABLE' AND expiry_date >= CURDATE()
GROUP BY organization_id, blood_group, component;
```
This query (optionally cached in a summary table refreshed on write) is the single source of truth for "how much blood is available" — never a manually maintained counter.

**Preventing invalid states (application + DB level):**
- **Double reservation:** unique constraint / partial-unique check ensuring at most one `ACTIVE` reservation per `blood_unit_id`; also re-check unit status inside a DB transaction (`SELECT ... FOR UPDATE`) before creating the reservation.
- **Issuing unavailable/expired units:** the issue endpoint validates `reservation.status = ACTIVE` and `blood_unit.status = RESERVED` and `expiry_date >= CURDATE()` inside the same transaction before writing `blood_issues`.
- **Negative inventory:** inventory is a `COUNT()` of rows, not a decrementable integer, so it structurally cannot go negative.
- **Duplicate unit IDs:** `unit_code` has a UNIQUE constraint; generated server-side with a collision-checked scheme (e.g., `BD-{year}-{zero-padded sequence}`).

---

## 15. Blood Request Workflow

```text
Doctor/Clinic/Hospital Admin
        ↓ create
Blood Request (PENDING)
        ↓ hospital verification
VERIFIED
        ↓ system searches inventory
SEARCHING → PARTIALLY_FULFILLED (if only some items found)
        ↓ staff reserves matching units
RESERVED
        ↓ staff issues blood
ISSUED
        ↓ confirmed received
COMPLETED

Alternate terminal states: REJECTED, CANCELLED, EXPIRED (required_by passed unfulfilled)
```

**Status-transition table:**

| From | To | Who |
|---|---|---|
| — | PENDING | Doctor, Clinic Admin, Hospital Admin |
| PENDING | VERIFIED / REJECTED | Hospital Admin (fulfilling org) |
| VERIFIED | SEARCHING | System (automatic) |
| SEARCHING | PARTIALLY_FULFILLED / RESERVED | System + Blood Bank/Hospital staff |
| RESERVED | ISSUED | Hospital Admin, Blood Bank Staff |
| ISSUED | COMPLETED | Hospital Admin, Blood Bank Staff |
| PENDING/VERIFIED/SEARCHING | CANCELLED | Original requester |
| any non-terminal | EXPIRED | System (past `required_by`) |

Only the fulfilling organization's authorized staff can approve/reserve/issue; only the original requester (or Super Admin) can cancel.

---

## 16. Emergency Request Workflow

```text
Doctor/Hospital Admin
  ↓ create with priority = CRITICAL
Emergency Request
  ↓ immediate notification to matching org(s) with stock
  ↓ fastest-response org reserves + confirms
  ↓ issue
  ↓ close (COMPLETED) — always fully audited
```

Example payload:
```text
Blood Group: O-
Component: Packed RBC
Quantity: 3 units
Hospital: XYZ Hospital
Required By: 2026-09-15 10:00
Priority: CRITICAL
```

- **Who creates:** Doctor or Hospital Admin only (not Requester/Donor).
- **Who approves:** Same verification step as normal requests, but expedited — the fulfilling org is auto-notified rather than polled.
- **Priority handling:** `CRITICAL` requests are sorted first in staff worklists and trigger immediate in-app (and, later, SMS/email) notifications.
- **Response:** Any organization with matching `AVAILABLE` stock can respond; first valid reservation wins (enforced by the same unit-locking transaction as §14).
- **Closure:** Same status machine as §15, with mandatory audit-log entries at every transition.
- The system never decides medical urgency itself — the requesting doctor sets priority; the platform only routes and tracks it.

---

## 17. Blood Search System

**Filters:** blood group, component, city/location, hospital, blood bank, minimum quantity, emergency-only.

Example query → example result:
```text
Query:  Blood Group=O+, Location=Dhaka, Component=Whole Blood, Quantity>=2

Result:
Hospital A — O+ Available: 12 units — Dhaka — Updated 10 min ago
[View Details] [Request Blood]
```

**Implementation notes:**
- Query hits the derived-inventory aggregation from §14, joined to `organizations` for name/city.
- Composite index on `blood_units(organization_id, blood_group, component, status)` and a separate index on `organizations.city` back the filters.
- Pagination via `LIMIT/OFFSET` (or keyset pagination once data volume grows).
- Sorting: by distance (future, needs geocoding) or by quantity/last-updated in MVP.
- **Future:** store `latitude/longitude` on `organizations` and use a bounding-box + Haversine query, later a geospatial index (PostGIS/MySQL spatial types) for true "near me" search.

---

## 18. REST API Architecture

Base path: `/api`. All protected routes require `Authorization: Bearer <JWT>`.

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/reset-password

GET    /api/users               (Super Admin, org-scoped for Org Admins)
GET    /api/users/:id
PATCH  /api/users/:id/suspend   (Super Admin)

GET    /api/organizations
POST   /api/organizations       (any authenticated user submits for approval)
PATCH  /api/organizations/:id/approve   (Super Admin)
PATCH  /api/organizations/:id/reject    (Super Admin)

GET    /api/hospitals /api/clinics /api/blood-banks
GET    /api/hospitals/:id

GET    /api/inventory            (search/aggregate view, public-readable subset)
GET    /api/blood-units          (org-scoped detail list)
POST   /api/blood-units          (Blood Bank Staff / Hospital Admin)
PATCH  /api/blood-units/:id      (status transitions)

GET    /api/blood-requests
POST   /api/blood-requests
POST   /api/blood-requests/:id/verify
POST   /api/blood-requests/:id/reject
POST   /api/blood-requests/:id/reserve
POST   /api/blood-requests/:id/issue
POST   /api/blood-requests/:id/complete
POST   /api/blood-requests/:id/cancel

POST   /api/emergency-requests   (thin wrapper: creates blood_requests with priority=CRITICAL)

GET    /api/donors/:id/donations
POST   /api/donations            (Blood Bank Staff)

GET    /api/notifications
PATCH  /api/notifications/:id/read

GET    /api/reports/inventory
GET    /api/reports/requests
GET    /api/audit-logs           (Super Admin / org-scoped Admin)
```

For each group, define (documented fully in code via OpenAPI/Postman collection, summarized here):
- **Method + path + purpose** (above).
- **Required role:** enforced via `checkPermission()`.
- **Organization access:** enforced via `requireOrg()` (§11).
- **Request body validation:** using a schema validator (e.g., `zod`/`joi`) — reject unknown fields, enforce enums/types.
- **Response shape:** consistent envelope `{ success, data, error }`.
- **Error responses:** `400` validation, `401` unauthenticated, `403` unauthorized/cross-org, `404` not found, `409` conflict (e.g., double reservation), `500` server error — never leak stack traces in production.
- **Security:** parameterized queries only, rate limiting on `/auth/*`, CORS restricted to known frontend origin.

---

## 19. Dashboard Architecture

- **Super Admin:** total/verified/pending organizations, total users, total donors, available blood units, active + emergency requests, low-stock organizations, expiring units, recent activity feed.
- **Hospital Admin:** total/available/reserved/expiring units, low-stock blood groups, active + emergency requests, recent donations, recent activity.
- **Blood Bank Staff:** donations, testing queue, available/reserved/issued units, expiring units, recent activity.
- **Donor:** profile, blood group, donation history, nearby donation centers, eligibility info (static/informational, not a medical determination), upcoming opportunities.

**Layout pattern (all dashboards):** top KPI stat cards → mid-page charts (bar/line via a lightweight charting lib) → bottom recent-activity table, with a persistent left sidebar nav scoped to the role.

---

## 20. Frontend Sitemap

**Public:** Home, About, Find Blood, Hospitals, Blood Banks, Donate Blood, Emergency Help, Contact, Login, Register.

**Authenticated (role-scoped nav):**
- *Super Admin:* Dashboard, Organizations (approve/reject), Users, Inventory (all), Requests (all), Emergency Requests, Reports, Audit Logs, Settings.
- *Hospital Admin:* Dashboard, Staff, Inventory, Requests, Reports.
- *Clinic Admin:* Dashboard, Staff, Find Blood, My Requests.
- *Blood Bank Staff:* Dashboard, Donations, Testing Queue, Inventory, Issued Units.
- *Doctor:* Dashboard, New Request, My Requests, Emergency Request.
- *Donor:* Dashboard, Profile, Donation History, Donation Centers.
- *Patient/Requester:* Find Blood, My Requests, Organization Info.

Each role only sees nav items and pages relevant to its permission set; the backend independently enforces the same boundaries.

---

## 21. UI/UX System

**Direction:** clean, professional, trustworthy, minimal, responsive, accessible — not flashy.

**Color system:**
```text
Primary: Red (#DC2626)
Background: White / Light Neutral (#F9FAFB)
Text: Dark Navy / Charcoal (#111827)
Success: Green (#16A34A)
Warning: Amber (#D97706)
Danger: Red (#DC2626)
Info: Blue (#2563EB)
```

- **Typography:** one clean sans-serif (e.g., Inter), clear heading scale, generous line-height for readability in forms/tables.
- **Components:** buttons (primary/secondary/danger), cards (stat cards, inventory cards), tables (sortable, paginated), forms with inline validation, modals for confirm/reserve/issue actions, alert banners, status badges color-coded to blood-unit/request status, empty states with a clear CTA, skeleton/loading states, error states with retry.
- **Mobile:** single-column stacking below `md` breakpoint, sticky bottom action bar on request/search screens.
- **Accessibility:** semantic HTML, sufficient color contrast (esp. status badges), labeled form inputs, keyboard-navigable modals.

---

## 22. Notification System

MVP: **database-backed in-app notifications** (`notifications` table), polled or fetched on page load/interval.

Events: request created, request approved/rejected, blood reserved, blood issued, emergency request raised, low inventory, unit expiring soon, organization verified, donor reminder.

**Future extension path:** add a `channel` column and pluggable senders — Email (e.g., SMS/Nodemailer), SMS (Twilio), Push (web push/FCM) — triggered from the same notification-creation service without changing calling code.

---

## 23. Audit Log System

Tracked actions: login, logout, inventory created/modified, blood unit issued, request approved/rejected, reservation created, user role changed, organization verified/suspended.

**Stored fields:** `user_id, action, resource_type, resource_id, timestamp, previous_value, new_value, ip_address`.

**Should store:** enough to reconstruct "who changed what, from what, to what, when, from where."
**Should NOT store:** raw passwords/tokens, full request bodies containing sensitive personal health details beyond what's operationally necessary, or unnecessary PII not required for the audit purpose.

---

## 24. Reports and Analytics

- **Hospital:** current inventory, blood usage over time, requests, donations received, expired-unit counts.
- **Blood Bank:** donations over time, inventory snapshot, issued units, expired units.
- **Super Admin:** organizations (growth/status), platform-wide blood availability, requests/emergency-requests volume, donor statistics, system activity.

**Recommended visuals:** stat cards for point-in-time counts, bar charts for group/component breakdowns, line charts for trends over time (donations, requests), tables for exportable detail (CSV export as a Version 2 feature).

---

## 25. Security Architecture

- Password hashing with bcrypt (cost ≥ 10).
- Short-lived JWTs, secret from environment variable, never committed.
- RBAC + org-scoping enforced server-side on every route (§11, §13).
- Input validation on every endpoint (schema validator), rejecting unexpected fields.
- **Parameterized queries only** — never string-concatenate SQL — to prevent SQL injection.
- Rate limiting on auth endpoints (e.g., `express-rate-limit`).
- CORS restricted to the known frontend origin(s).
- Secure HTTP headers (`helmet`).
- Full audit logging (§23).
- Password-reset tokens: single-use, short expiry, sent out-of-band.
- Account verification before sensitive actions.
- Token invalidation: document as a known MVP limitation (stateless JWT), with Redis-blocklist as the future fix.
- Sensitive data: minimize PII stored; never log secrets.
- Centralized error handler that never leaks stack traces or SQL errors to clients.
- Structured logging (e.g., `winston`) separate from audit logs.
- Backup strategy: scheduled `mysqldump` exports (MVP), automated managed backups in production.

**Common beginner mistakes to avoid:** trusting `organization_id` from the request body instead of the session; storing JWT secret in source code; skipping input validation because "the frontend already validates it"; using string concatenation for SQL; storing plaintext passwords; over-permissive CORS (`*`) with credentials enabled; not rate-limiting login.

---

## 26. Folder Structure

```text
blood-bank-system/
│
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── find-blood.html
│   ├── hospitals.html
│   ├── donors.html
│   ├── dashboard/
│   │   ├── super-admin/
│   │   ├── hospital-admin/
│   │   ├── clinic-admin/
│   │   ├── blood-bank-staff/
│   │   ├── doctor/
│   │   └── donor/
│   ├── css/
│   └── js/
│       ├── api.js
│       ├── auth.js
│       └── components/
│
├── backend/
│   ├── server.js
│   ├── config/
│   │   └── db.js
│   ├── routes/
│   ├── controllers/
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── requireOrg.js
│   │   └── checkPermission.js
│   ├── models/
│   ├── services/
│   └── utils/
│
├── database/
│   ├── schema.sql
│   └── seed.sql
│
├── docs/
│
├── .env.example
├── .gitignore
├── package.json
└── BLOOD_BANK_PLATFORM_PLAN.md
```

---

## 27. Testing Strategy

Covers: authentication, authorization/org-isolation, API contracts, DB constraints, inventory rules, request-workflow transitions, emergency requests, frontend form validation, and basic security probes.

**Concrete test cases:**
```text
Test: Hospital A attempts to modify Hospital B's blood inventory.
Expected: 403 Access denied; audit log entry created.

Test: Attempt to reserve an already-reserved unit.
Expected: 409 Operation rejected.

Test: Attempt to issue an expired blood unit.
Expected: 409 Operation rejected.

Test: Attempt to issue more units than available in a request item.
Expected: 400/409 Operation rejected.

Test: Login with wrong password 6 times in a row.
Expected: Rate limited after threshold.

Test: Doctor tries to approve their own blood request.
Expected: 403 — only fulfilling-org staff may verify.
```

Suggested tooling: Jest + Supertest for API/integration tests; a small seeded test database (separate schema) reset between test runs.

---

## 28. MVP Scope / Version 2 / Version 3 / Production

### MVP (V1) — must-have, keep it small
Auth (register/login/logout), roles/permissions, organization CRUD + Super Admin approval, org staff management, blood-unit CRUD + status lifecycle, derived inventory view, blood search, blood request workflow (create → verify → reserve → issue → complete), basic emergency-request flag, in-app notifications, basic audit logging, role-specific dashboards (core KPIs only), basic donor profile + donation recording.
*Why these:* they demonstrate the full stack end-to-end (auth → RBAC → multi-tenant data → core business workflow) without extra surface area.

### Version 2 — useful improvements
Email/SMS notifications, CSV/PDF report export, refresh tokens + token blocklist, password-reset via real email, richer analytics/charts, pagination + advanced filtering everywhere, donor eligibility informational content, audit-log UI with filters.
*Why:* valuable but not required to prove the core architecture.

### Version 3 — advanced features
Location-based ("near me") search with geocoding, React frontend migration, WebSocket live inventory/notification updates, Redis caching for inventory aggregates, multi-organization membership per user, API rate-limit tiers, admin-configurable workflows.
*Why:* meaningful UX/scale upgrades that assume the MVP's data model is already solid.

### Production Scale — required before real hospitals use it
Legal/regulatory compliance review (health-data law, blood-bank regulations), real identity verification for organizations and staff, encryption at rest for sensitive fields, formal backup/disaster-recovery plan, high-availability deployment, third-party security audit/pen test, incident-response plan, SLAs, professional medical oversight of any clinically-adjacent content. *(Detailed in §29.)*

---

## 29. Real-World Considerations

Before any real hospital could use this platform, the following are required and are explicitly **out of scope for the educational MVP**:

- **Data privacy & healthcare regulations:** applicable local health-data protection laws (e.g., HIPAA-equivalent), data-processing agreements with each organization.
- **Blood-bank regulations:** compliance with national blood-bank/transfusion-service standards.
- **Organization & identity verification:** real licensing checks, not just an admin checkbox.
- **Data retention policy:** how long donor/patient/audit data is kept and how it's purged.
- **Security:** encryption at rest, secrets management, regular penetration testing.
- **Backups & disaster recovery:** tested restore procedures, geographically separated backups.
- **High availability:** redundant infrastructure, monitoring, alerting.
- **Auditability:** tamper-evident audit logs, retained per regulation.
- **Legal responsibility:** clear terms of service defining liability between platform, organizations, and medical staff.
- **Medical workflow validation:** review by licensed medical/blood-bank professionals of every workflow that touches clinical decisions.
- **Access control:** stronger identity assurance (MFA) for staff handling inventory/issuing.
- **Incident response:** a documented plan for data breaches or safety-critical failures.

---

## 30. Future Architecture

| Technology | Introduce when | Problem it solves |
|---|---|---|
| React | UI complexity grows beyond manageable vanilla JS (many interactive dashboards) | Component reuse, state management |
| Redis | Need for fast inventory aggregate reads, token blocklists, or job queues | Caching, session/token invalidation |
| WebSockets | Need live inventory/notification updates without polling | Real-time UX |
| Docker | Need reproducible environments across dev/staging/prod | Consistent deployment |
| Cloud hosting (e.g., AWS/GCP/Azure) | Moving beyond local XAMPP for real users | Scalability, uptime |
| Managed MySQL (e.g., RDS) | Production reliability needed | Backups, HA, patching handled for you |
| Object storage (e.g., S3) | Need to store documents/images (licenses, ID proofs) | Scalable file storage |
| Email service (e.g., SES/SendGrid) | Real notification delivery needed | Deliverable transactional email |
| SMS service (e.g., Twilio) | Emergency alerts need to reach staff off-app | Time-critical notifications |
| Push notifications | Mobile/PWA usage grows | Re-engagement, urgent alerts |
| CI/CD | Team grows or deploy frequency increases | Safer, faster releases |
| Monitoring/Logging (e.g., Grafana/ELK) | Production traffic needs observability | Faster incident detection |

None of these are added to the MVP unless a concrete need arises.

---

## 31. Development Roadmap

| Phase | Goal | Key Deliverables | Definition of Done |
|---|---|---|---|
| 1 | Project Setup | Repo, folder structure, `.env.example`, base Express server, Tailwind-linked static pages | ✅ **Completed** — Express running on port 5000, GET /api/health returns 200 OK, static frontend live |
| 2 | Database | `schema.sql`, `seed.sql`, MySQL connection pool | ✅ **Completed** — All 19 tables in InnoDB, full seed data, mysql2 pool, GET /api/health/db route |
| 3 | Authentication | Register/login/logout, JWT middleware, bcrypt | ✅ **Completed** — Can register, log in, access protected routes with signed JWT, rate limiting, helmet, audit logging |
| 4 | Organization Management | CRUD + Super Admin approval flow | Org created as PENDING, approvable/rejectable by Super Admin only |
| 5 | User Roles & Authorization | `organization_staff`, `checkPermission`, `requireOrg` middleware | Cross-org write attempt returns 403 in a test |
| 6 | Blood Inventory | `blood_units` CRUD + status transitions, derived inventory query | Inventory query returns correct counts after unit status changes |
| 7 | Blood Requests | Request + request_items + full status workflow | A request can be created, verified, reserved, issued, completed |
| 8 | Emergency Requests | Priority flag, notification trigger | Emergency request visibly prioritized in staff worklist |
| 9 | Dashboards | Role-specific KPI pages | Each role sees only its own data/nav |
| 10 | Notifications | `notifications` table + in-app feed | Relevant events generate a notification row |
| 11 | Reports | Inventory/requests report endpoints + basic charts | Reports render accurate aggregates |
| 12 | Testing | Jest/Supertest suite covering §27 cases | All listed test cases pass |
| 13 | Deployment | Deployment docs, env hardening checklist | App runnable from a clean clone following README |

Each phase's detailed task/file/DB/API/frontend/testing/risk breakdown is elaborated **inside the actual phase-kickoff prompt** given to the implementer at the start of that phase, referencing this document.

---

## 32. Development Rules

1. **Planning first — no implementation until explicitly told `START PHASE 1`.**
2. `BLOOD_BANK_PLATFORM_PLAN.md` is the single source of truth — update it after every completed phase and every architectural decision.
3. Keep the MVP simple and beginner-friendly; avoid unnecessary technologies (§4, §30).
4. Security and organization-level data isolation are non-negotiable priorities (§11, §25).
5. No automated medical decision-making (§6).
6. Before starting any new phase: re-read this file, review completed phases, review existing files/DB structure, avoid breaking prior functionality.
7. If the architecture needs to change: explain the problem → proposed solution → alternatives → impact → **ask for approval** before making the change.
8. Do not create duplicate/parallel architecture documents.

---

## 33. Portfolio Strategy

**Project description (resume/README lead-in):** "A multi-tenant blood bank management platform enabling hospitals, clinics, and blood banks to track individual blood units through their full lifecycle and coordinate blood requests — including emergencies — with strict organization-level data isolation."

**Main technical challenges to highlight:** relational schema design for a real inventory lifecycle (not counters), enforcing multi-tenant data isolation purely at the backend layer, modeling a multi-step approval/reservation/issue state machine, RBAC across seven distinct roles, and preventing race conditions on concurrent blood-unit reservation.

**README structure:** Overview → Screenshots/GIF demo → Tech Stack → Architecture diagram (from §10/§11) → Key Features → Setup Instructions → API docs link/Postman collection → Testing → Roadmap (link to this plan file) → License.

**Screenshots to include:** login/register, Super Admin org-approval screen, hospital inventory table with status badges, blood search results, request-creation form, request status-transition view, a dashboard with charts.

**Demo flow for interviews/video:** register a hospital → Super Admin approves it → hospital staff adds blood units → a doctor searches and creates a request → hospital staff verifies/reserves/issues → requester sees status update → show the audit log entry for the issue.

**Resume bullet points (examples):**
- "Designed and built a multi-tenant blood-bank inventory platform (Node.js/Express/MySQL) enforcing organization-level data isolation via backend-only RBAC across 7 roles."
- "Modeled a 9-state blood-unit lifecycle and a request→reserve→issue workflow with transactional locking to prevent double-reservation of inventory."
- "Implemented JWT/bcrypt authentication, parameterized-query data access, and a full audit-log system tracking every inventory and request state change."

**Possible interview questions to prepare for:** How do you prevent Hospital A from seeing Hospital B's data? How do you prevent two staff members from reserving the same blood unit simultaneously? Why individual blood units instead of a count per blood group? How would you evolve this to production scale? What would you change about the schema knowing what you know now?

---

## 34. Phase 1 Implementation Prompt

*(Ready to hand to an implementation session once `START PHASE 1` is given — do not execute yet.)*

```text
Read BLOOD_BANK_PLATFORM_PLAN.md in full before doing anything else.

Implement ONLY Phase 1 (Project Setup) from the Development Roadmap (§31):
1. Check the current project directory for any existing files; do not overwrite anything without checking first.
2. Create the folder structure exactly as defined in §26 (Folder Structure).
3. Initialize package.json and install only the dependencies needed for Phase 1
   (express, dotenv, and dev basics — nothing from later phases yet).
4. Create backend/server.js with a minimal Express app and a GET /api/health
   route that returns { success: true, message: "API is running" }.
5. Create .env.example with placeholder values (PORT, DB_HOST, DB_USER,
   DB_PASSWORD, DB_NAME, JWT_SECRET) — do not commit a real .env.
6. Create basic static frontend/index.html linked to Tailwind (CDN is fine for
   Phase 1) with a simple placeholder homepage.
7. Create .gitignore (node_modules, .env, etc.).
8. Follow the technology stack in §4 exactly — no React, no MongoDB, no Docker.
9. Keep everything beginner-friendly: comment key files explaining what they do.
10. Avoid unnecessary dependencies.
11. Test that `npm start` (or `node backend/server.js`) runs and GET /api/health
    responds correctly.
12. Report clearly what was completed and any deviations from the plan, with reasoning.
13. Update BLOOD_BANK_PLATFORM_PLAN.md: mark Phase 1 as "Completed" in §31's
    roadmap table, and add a short "Phase 1 Completion Notes" entry describing
    what was built and any decisions made.

Do not implement Phase 2 or beyond in this session.
```

---
 
### Phase 1 Completion Notes

- **Date Completed:** 2026-09-15
- **Scaffolding:** Created full folder hierarchy conforming to §26 (`backend/`, `frontend/`, `database/`, `docs/`).
- **Dependencies:** Configured `package.json` with `express`, `dotenv`, `cors`, and `nodemon`.
- **Environment & Git:** Created `.gitignore` and `.env.example` / `.env` for local configuration.
- **Express Server:** Created `backend/server.js` with static asset serving from `frontend/`, 404 handler, centralized error handling, and `GET /api/health` diagnostic route.
- **Frontend:** Built modern, responsive landing page `frontend/index.html` styled with Tailwind CSS and custom design tokens in `frontend/css/style.css`, featuring real-time health-check telemetry via `frontend/js/api.js`, search bar preview, architecture highlights, role portals overview, and medical safety disclaimer (§6).
- **Verification:** Verified `GET /api/health` returns HTTP 200 OK (`{"success": true, "message": "API is running"}`) and `GET /` serves HTML status 200 OK on `http://localhost:5000`.

Implementation Status: **Phase 1 & Phase 2 Completed.**

---

### Phase 2 Completion Notes

- **Date Completed:** 2026-09-15
- **Relational Schema (`database/schema.sql`):** Implemented all 19 tables defined in §9 in InnoDB (`utf8mb4_unicode_ci`) with clean, repeatable teardown (`SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS ...`):
  1. `users` (with `global_role`, `status`, verification timestamp)
  2. `roles` (7 roles, unique `name`)
  3. `permissions` (13 permissions, unique `` `key` ``)
  4. `role_permissions` (composite PK, cascade on role/perm deletion)
  5. `organizations` (`type`, `status`, unique `license_number`)
  6. `hospitals` (1:1 with organizations, `bed_count`)
  7. `clinics` (1:1 with organizations)
  8. `blood_banks` (1:1 with organizations, `storage_capacity_units`)
  9. `organization_staff` (`user_id` unique in MVP, connects user to organization + role)
  10. `donors` (`user_id` nullable unique, `blood_group`, donation dates)
  11. `donations` (`donor_id`, `blood_bank_id`, `volume_ml`, collection/testing status)
  12. `blood_units` (`unit_code` unique, 9-state lifecycle status, composite index `(organization_id, blood_group, component, status)`, index on `expiry_date`, index on `status`)
  13. `blood_requests` (`requester_user_id`, `organization_id`, `created_by_role_id`, priority, status)
  14. `request_items` (`blood_request_id` FK `ON DELETE CASCADE`, group, component, quantity, fulfilled_quantity)
  15. `reservations` (`request_item_id`, `blood_unit_id`, `reserved_by`, `status`, `expires_at`, virtual generated column `active_unit_id` with `UNIQUE` constraint enforcing single active hold per unit)
  16. `blood_issues` (`reservation_id` 1:1, `issued_by`, `patient_ref`, `issued_at`)
  17. `notifications` (`user_id` FK `ON DELETE CASCADE`, in-app notification attributes)
  18. `audit_logs` (`user_id`, `action`, `resource_type`, `resource_id`, `previous_value` JSON, `new_value` JSON, `ip_address`, indexes on resource and date)
  19. `system_settings` (`` `key` `` PK, value, updated_at)
- **Cascade & Integrity Rules (§10):** Enforced `ON DELETE RESTRICT` on `organizations` and `reservations`/`blood_issues` to preserve audit records; `ON DELETE CASCADE` from `blood_requests` to `request_items` and `users` to `notifications`.
- **Seed Data (`database/seed.sql`):** Populated comprehensive test environment:
  - 7 system roles (`SUPER_ADMIN`, `HOSPITAL_ADMIN`, `CLINIC_ADMIN`, `BLOOD_BANK_STAFF`, `DOCTOR`, `DONOR`, `REQUESTER`)
  - 13 permissions from §13 Permission Matrix and complete `role_permissions` RBAC mappings
  - 8 dev-only users spanning all 7 roles with verified bcrypt password hashes:
    - Super Admin: `admin@bloodbank.dev` / `AdminDev123!`
    - Staff & Requesters: `UserDev123!` for Hospital Admin, Doctor, Clinic Admin, Blood Bank Staff, Donors, and Requester
  - 4 sample organizations across all types:
    - Approved Hospital: City General Hospital (450 beds)
    - Approved Blood Bank: Central Red Cross Blood Bank (1500 unit capacity)
    - Approved Clinic: Metro Community Clinic
    - Pending Hospital: St. Jude Community Hospital (for Super Admin approval workflow tests)
  - `organization_staff` bindings linking administrators and doctors to their respective organizations
  - `donors` medical profiles (O+, O-, A+) with donation dates and eligibility markers
  - `donations` historical collection records linked to donors and blood bank
  - 14 realistic `blood_units` distributed across groups (O+, O-, A+, A-, B+, B-, AB+, AB-), components (PACKED_RBC, WHOLE_BLOOD, PLATELETS, PLASMA, CRYO), and lifecycle states (AVAILABLE, EXPIRED, RESERVED)
  - Default system settings (`reservation_hold_hours`, `emergency_auto_alert`, `inventory_low_threshold`, `system_name`, `contact_email`, `max_daily_donations_per_bank`, `donor_minimum_interval_days`)
- **Automated CLI Runner (`backend/scripts/init-db.js`):** Implemented one-command initialization (`npm run db:init`) that creates the database, applies schema, seeds records, and outputs a formatted verification summary table, plus a seed-only runner (`npm run db:seed`).
- **Connection Module (`backend/config/db.js`):** Configured reusable MySQL connection pool with `mysql2/promise`, reading environment variables (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`).
- **Health Verification Route:** Extended `backend/server.js` with `GET /api/health/db` executing `SELECT 1 AS alive`, returning HTTP 200 `{ success: true, db: "connected" }` when alive and HTTP 503 `{ success: false, db: "disconnected" }` on connection error. Verified graceful error handling.
- **Documentation:** Authored `docs/database-setup.md` and `README.md` with setup guides for automated CLI, MySQL Workbench, and MySQL CLI.
- **Deviations:** None from schema architecture §9.

Implementation Status: **Phase 1, Phase 2, & Phase 3 Completed.**

---

### Phase 3 Completion Notes

- **Date Completed:** 2026-09-15
- **Endpoints Implemented:**
  - `POST /api/auth/register`: Public self-registration strictly restricted to `DONOR` and `REQUESTER` roles per §12, setting initial status to `PENDING_VERIFICATION`. Rejects privilege escalation attempts to `SUPER_ADMIN` or `ORG_USER` with HTTP 400.
  - `POST /api/auth/login`: Verifies email and password using bcrypt (cost 12), validates account is not `SUSPENDED`, returns a signed JWT access token, and records an `AUTH_LOGIN` entry in `audit_logs`. Uses generic error message ("Invalid email or password provided.") to prevent user account enumeration.
  - `POST /api/auth/logout`: Stateless client logout. If accompanied by a valid Bearer token, logs an `AUTH_LOGOUT` audit event.
  - `GET /api/auth/me`: Protected by `auth` middleware. Returns the sanitized user profile (never password hash) and joins `organization_staff` details if the user is attached to an organization.
  - `POST /api/auth/forgot-password`: Generates a single-use 15-minute reset token. Stubs email delivery by outputting the reset link and token to the server console log.
  - `POST /api/auth/reset-password`: Validates the reset token signature and expiry, hashes the new password with bcrypt (cost 12), updates `users.password_hash`, and records `AUTH_PASSWORD_RESET` in `audit_logs`.
- **Security & Middleware Architecture (§25):**
  - **Bcrypt Hashing:** Work factor 12 applied across all registrations and password resets.
  - **JWT Handling:** Signed with `process.env.JWT_SECRET` with 8-hour expiration (`JWT_EXPIRES_IN`). Token payload contains strictly non-sensitive identity markers (`userId`, `globalRole`).
  - **Auth Middleware (`backend/middleware/auth.js`):** Validates `Authorization: Bearer <token>`, verifies signature and expiry, queries database to verify user existence and active status, and attaches `req.user`. Returns structured 401 on missing, expired, or invalid tokens.
  - **Validation Middleware (`backend/middleware/validate.js`):** Enforces Joi validation schemas on all auth endpoints, strips unspecified fields, and returns uniform HTTP 400 responses.
  - **Rate Limiting:** Added `express-rate-limit` on all `/api/auth/*` endpoints and strict limiting on `/api/auth/login` (max 10 attempts per 15 min window, returning HTTP 429).
  - **Helmet & CORS:** Integrated `helmet` for secure HTTP headers and configured CORS to allow only configured origin (`process.env.CORS_ORIGIN || http://localhost:5000`).
  - **Audit Logging (`backend/utils/auditLogger.js`):** Parameterized asynchronous logging into `audit_logs` table for registration, login, logout, and password resets (§23).
  - **Centralized Error Handling:** Formats all API failures into standard `{ success: false, error: { message, code } }` envelope without leaking database or stack traces.
- **Frontend Integration:**
  - `frontend/login.html`: Responsive Tailwind CSS login interface, show/hide password toggle, inline validation, demo quick-fill accounts, and forgot-password modal.
  - `frontend/register.html`: Public registration form with donor/requester role switcher, blood group dropdown, medical safety disclaimer checkbox (§6), and staff account restriction notices.
  - `frontend/js/api.js`: Unified HTTP client automatically injecting `Authorization: Bearer <token>` on all authenticated requests.
  - `frontend/js/auth.js`: Session token and profile management with role-based redirection helpers.
- **Verification & Testing:**
  - Automated integration test suite `backend/tests/auth.test.js` (`npm test`) executing 14 test cases covering registration, role escalation rejection, duplicate emails (409), login verification, protected routes (401/200), tampered tokens, expired tokens, audit log verification, and rate limiting (429). All 14 tests passing.
- **Known MVP Limitations:**
  - Stateless logout: Client discards token; server-side token blocklist (Redis) scheduled for Version 2.
  - Stubbed email delivery: Password reset tokens logged to server console rather than transactional SMTP/SES.

Implementation Status: **Phase 3 Completed.**
Waiting for: **START PHASE 4** (Organization Management: CRUD + Super Admin approval flow)


