/**
 * ============================================================================
 * BLOOD BANK PLATFORM — PHASE 4 RBAC & TENANT ISOLATION TEST SUITE
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§10, §11, §13, §25)
 *
 * Verifies all 12 explicit acceptance test scenarios from Phase 4 specifications:
 *   TEST 1:  Admin A accesses Hospital A data -> PASS
 *   TEST 2:  Admin A accesses Clinic B data -> DENIED (403)
 *   TEST 3:  Admin A changes organization_id in request -> DENIED (403)
 *   TEST 4:  Admin A attempts to modify Clinic B blood inventory -> DENIED (403)
 *   TEST 5:  Admin B accesses Clinic B data -> PASS
 *   TEST 6:  Admin B accesses Hospital A data -> DENIED (403)
 *   TEST 7:  Super Admin accesses Hospital A -> PASS
 *   TEST 8:  Super Admin accesses Clinic B -> PASS
 *   TEST 9:  Organization Admin attempts to change own role to SUPER_ADMIN -> DENIED (403)
 *   TEST 10: Organization Admin attempts to assign another organization_id -> DENIED (403)
 *   TEST 11: Unauthenticated user accesses protected API -> 401
 *   TEST 12: Authenticated user with insufficient role accesses admin endpoint -> 403
 *
 * Additional Multi-Tenant Verifications:
 *   TEST 13: Pending organization access restricted until approval -> 403
 *   TEST 14: Super Admin approves pending organization -> 200
 *   TEST 15: Public blood availability search succeeds without private data -> 200
 *   TEST 16: Organization Admin creates staff inside own organization only -> 201
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_phase4_rbac_tenant_isolation_2026';

const http = require('http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const app = require('../server');

let server;
let baseUrl;

// In-Memory database fixtures
const mockData = {
  organizations: [
    { id: 101, name: 'ABC Hospital', type: 'HOSPITAL', status: 'APPROVED', email: 'hospital.a@test.org', city: 'Metro City' },
    { id: 102, name: 'City Care Clinic', type: 'CLINIC', status: 'APPROVED', email: 'clinic.b@test.org', city: 'Metro City' },
    { id: 103, name: 'Dhaka Blood Bank', type: 'BLOOD_BANK', status: 'APPROVED', email: 'bloodbank.c@test.org', city: 'Dhaka' },
    { id: 104, name: 'Hope Community Hospital', type: 'HOSPITAL', status: 'PENDING', email: 'pending.org@test.org', city: 'Metro City' }
  ],
  roles: [
    { id: 1, name: 'SUPER_ADMIN' },
    { id: 2, name: 'HOSPITAL_ADMIN' },
    { id: 3, name: 'CLINIC_ADMIN' },
    { id: 4, name: 'BLOOD_BANK_STAFF' },
    { id: 5, name: 'DOCTOR' },
    { id: 6, name: 'DONOR' },
    { id: 7, name: 'REQUESTER' },
    { id: 8, name: 'ORGANIZATION_ADMIN' }
  ],
  users: [
    { id: 1, full_name: 'Super Administrator', email: 'super.admin@bloodlink.test', global_role: 'SUPER_ADMIN', organization_id: null, status: 'ACTIVE' },
    { id: 501, full_name: 'Admin A (ABC Hospital)', email: 'admin.a@hospital-a.test', global_role: 'ORG_USER', organization_id: 101, status: 'ACTIVE' },
    { id: 502, full_name: 'Admin B (City Care Clinic)', email: 'admin.b@clinic-b.test', global_role: 'ORG_USER', organization_id: 102, status: 'ACTIVE' },
    { id: 503, full_name: 'Admin C (Dhaka Blood Bank)', email: 'admin.c@bloodbank-c.test', global_role: 'ORG_USER', organization_id: 103, status: 'ACTIVE' },
    { id: 504, full_name: 'Admin P (Pending Org)', email: 'admin.p@pending.test', global_role: 'ORG_USER', organization_id: 104, status: 'ACTIVE' },
    { id: 601, full_name: 'Donor John', email: 'donor.john@test.org', global_role: 'DONOR', organization_id: null, status: 'ACTIVE' },
    { id: 701, full_name: 'Requester Jane', email: 'requester.jane@test.org', global_role: 'REQUESTER', organization_id: null, status: 'ACTIVE' }
  ],
  organization_staff: [
    { id: 1, user_id: 501, organization_id: 101, role_id: 8, status: 'ACTIVE' },
    { id: 2, user_id: 502, organization_id: 102, role_id: 8, status: 'ACTIVE' },
    { id: 3, user_id: 503, organization_id: 103, role_id: 8, status: 'ACTIVE' },
    { id: 4, user_id: 504, organization_id: 104, role_id: 8, status: 'ACTIVE' }
  ],
  blood_units: [
    { id: 5001, unit_code: 'UNIT-HA-5001', organization_id: 101, blood_group: 'O+', component: 'PACKED_RBC', status: 'AVAILABLE', expiry_date: '2026-12-31' },
    { id: 6001, unit_code: 'UNIT-CB-6001', organization_id: 102, blood_group: 'A+', component: 'WHOLE_BLOOD', status: 'AVAILABLE', expiry_date: '2026-12-31' },
    { id: 7001, unit_code: 'UNIT-PEND-7001', organization_id: 104, blood_group: 'B+', component: 'PLASMA', status: 'AVAILABLE', expiry_date: '2026-12-31' }
  ],
  audit_logs: []
};

let usingMockDb = false;

// Setup mock database query handler for isolated multi-tenant RBAC test suite
async function setupDatabaseConnection() {
  usingMockDb = true;
  console.log('🧪 RBAC Test Suite: Using isolated in-memory test fixtures.');

  db.getConnection = async () => ({
    query: async (sql, params) => db.query(sql, params),
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {}
  });

  db.query = async (sql, params = []) => {
      const trimmed = sql.trim();

      // SELECT from users WHERE id = ?
      if (trimmed.includes('FROM users') && trimmed.includes('WHERE id = ?')) {
        const found = mockData.users.filter((u) => u.id === params[0]);
        return [found];
      }

      // SELECT from users WHERE email = ?
      if (trimmed.includes('FROM users') && trimmed.includes('WHERE email = ?')) {
        const found = mockData.users.filter((u) => u.email.toLowerCase() === params[0].toLowerCase());
        return [found];
      }

      // SELECT organization_staff JOIN ... WHERE os.user_id = ?
      if (trimmed.includes('FROM organization_staff') && trimmed.includes('os.user_id = ?')) {
        const userId = params[0];
        const staff = mockData.organization_staff.find((s) => s.user_id === userId);
        if (!staff) return [[]];

        const org = mockData.organizations.find((o) => o.id === staff.organization_id);
        const role = mockData.roles.find((r) => r.id === staff.role_id);

        return [[{
          staff_id: staff.id,
          organization_id: staff.organization_id,
          role_id: staff.role_id,
          staff_status: staff.status,
          role_name: role ? role.name : 'STAFF',
          organization_name: org ? org.name : 'Test Org',
          organization_type: org ? org.type : 'HOSPITAL',
          organization_status: org ? org.status : 'APPROVED'
        }]];
      }

      // SELECT from organizations WHERE id = ?
      if (trimmed.includes('FROM organizations') && trimmed.includes('WHERE id = ?')) {
        const found = mockData.organizations.filter((o) => o.id === parseInt(params[0], 10));
        return [found];
      }

      // UPDATE organizations SET status = ? WHERE id = ?
      if (trimmed.startsWith('UPDATE organizations SET status = ? WHERE id = ?')) {
        const [status, orgId] = params;
        const org = mockData.organizations.find((o) => o.id === parseInt(orgId, 10));
        if (org) org.status = status;
        return [{ affectedRows: 1 }];
      }

      // SELECT from blood_units WHERE id = ?
      if (trimmed.includes('FROM blood_units') && trimmed.includes('WHERE bu.id = ?')) {
        const unitId = parseInt(params[0], 10);
        const unit = mockData.blood_units.find((u) => u.id === unitId);
        if (!unit) return [[]];
        const org = mockData.organizations.find((o) => o.id === unit.organization_id);
        return [[{ ...unit, organization_name: org?.name, organization_type: org?.type }]];
      }

      if (trimmed.includes('FROM `blood_units` WHERE id = ?')) {
        const unitId = parseInt(params[0], 10);
        const unit = mockData.blood_units.find((u) => u.id === unitId);
        return [unit ? [unit] : []];
      }

      // SELECT from blood_units with organization_id filter
      if (trimmed.includes('FROM blood_units')) {
        let results = [...mockData.blood_units];
        if (trimmed.includes('bu.organization_id = ?')) {
          const orgId = parseInt(params[0], 10);
          results = results.filter((u) => u.organization_id === orgId);
        }
        return [results.map((u) => {
          const org = mockData.organizations.find((o) => o.id === u.organization_id);
          return { ...u, organization_name: org?.name, organization_type: org?.type };
        })];
      }

      // INSERT INTO blood_units
      if (trimmed.startsWith('INSERT INTO blood_units')) {
        const [unit_code, donation_id, organization_id, blood_group, component, collection_date, expiry_date, status] = params;
        const newId = 9000 + mockData.blood_units.length;
        const newUnit = { id: newId, unit_code, donation_id, organization_id, blood_group, component, collection_date, expiry_date, status };
        mockData.blood_units.push(newUnit);
        return [{ insertId: newId }];
      }

      // SELECT from organization_staff WHERE os.organization_id = ?
      if (trimmed.includes('FROM organization_staff') && trimmed.includes('os.organization_id = ?')) {
        const orgId = parseInt(params[0], 10);
        const list = mockData.organization_staff
          .filter((s) => s.organization_id === orgId)
          .map((s) => {
            const u = mockData.users.find((user) => user.id === s.user_id) || {};
            const r = mockData.roles.find((role) => role.id === s.role_id) || {};
            return {
              staff_id: s.id,
              organization_id: s.organization_id,
              role_id: s.role_id,
              staff_status: s.status,
              user_id: u.id,
              full_name: u.full_name,
              email: u.email,
              phone: u.phone,
              user_status: u.status,
              role_name: r.name,
              role_description: r.description
            };
          });
        return [list];
      }

      // INSERT INTO organization_staff
      if (trimmed.startsWith('INSERT INTO organization_staff')) {
        const [user_id, organization_id, role_id, status] = params;
        const newStaffId = mockData.organization_staff.length + 1;
        mockData.organization_staff.push({ id: newStaffId, user_id, organization_id, role_id, status });
        return [{ insertId: newStaffId }];
      }

      // INSERT INTO users
      if (trimmed.startsWith('INSERT INTO users')) {
        const [full_name, email, password_hash, phone, organization_id, global_role, status] = params;
        const newUserId = 800 + mockData.users.length;
        mockData.users.push({ id: newUserId, full_name, email, phone, organization_id, global_role, status });
        return [{ insertId: newUserId }];
      }

      // SELECT from organizations
      if (trimmed.includes('FROM organizations')) {
        return [mockData.organizations];
      }

      // SELECT roles WHERE name = ?
      if (trimmed.includes('FROM roles WHERE name = ?')) {
        const r = mockData.roles.find((role) => role.name === params[0]);
        return [r ? [r] : []];
      }

      // INSERT INTO audit_logs
      if (trimmed.startsWith('INSERT INTO audit_logs')) {
        return [{ insertId: mockData.audit_logs.length + 1 }];
      }

      return [[]];
    };
}


// Generate JWT token for test user
function createToken(userId, globalRole) {
  return jwt.sign({ userId, globalRole }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// HTTP request helper
function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}${path}`;
    const parsed = new URL(url);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    let bodyStr = null;
    if (options.body) {
      bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = { raw: data };
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json
        });
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Test Runner
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🩸 BLOOD BANK PLATFORM — PHASE 4 RBAC & ISOLATION TEST SUITE');
  console.log('================================================================\n');

  await setupDatabaseConnection();

  // Boot HTTP test server
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`🧪 Test Server running on: ${baseUrl}\n`);

  const tokenSuperAdmin = createToken(1, 'SUPER_ADMIN');
  const tokenAdminA = createToken(501, 'ORG_USER');    // Hospital A (Org 101)
  const tokenAdminB = createToken(502, 'ORG_USER');    // Clinic B (Org 102)
  const tokenPendingAdmin = createToken(504, 'ORG_USER'); // Pending Hospital (Org 104)
  const tokenDonor = createToken(601, 'DONOR');

  // --------------------------------------------------------------------------
  console.log('▶ Test Group 1: Organization Data Access & Boundaries (Step 21: Tests 1, 2, 5, 6)');
  // --------------------------------------------------------------------------

  // TEST 1: Admin A accesses Hospital A data -> PASS
  const test1Res = await request('/api/inventory', { token: tokenAdminA });
  assert(test1Res.status === 200, 'TEST 1: Admin A accesses Hospital A inventory (returns 200 OK)');
  assert(
    test1Res.body.data && test1Res.body.data.organizationId === 101,
    'TEST 1: Returned inventory is strictly scoped to Hospital A (organization_id = 101)'
  );

  // TEST 2: Admin A accesses Clinic B data -> DENIED
  const test2Res = await request('/api/inventory/6001', { token: tokenAdminA });
  assert(
    test2Res.status === 403,
    'TEST 2: Admin A accessing Clinic B blood unit 6001 is DENIED (returns 403 Forbidden)'
  );
  assert(
    test2Res.body.error && test2Res.body.error.code === 'CROSS_ORGANIZATION_ACCESS_DENIED',
    'TEST 2: Error code is CROSS_ORGANIZATION_ACCESS_DENIED'
  );

  // TEST 5: Admin B accesses Clinic B data -> PASS
  const test5Res = await request('/api/inventory', { token: tokenAdminB });
  assert(test5Res.status === 200, 'TEST 5: Admin B accesses Clinic B inventory (returns 200 OK)');
  assert(
    test5Res.body.data && test5Res.body.data.organizationId === 102,
    'TEST 5: Returned inventory is strictly scoped to Clinic B (organization_id = 102)'
  );

  // TEST 6: Admin B accesses Hospital A data -> DENIED
  const test6Res = await request('/api/inventory/5001', { token: tokenAdminB });
  assert(
    test6Res.status === 403,
    'TEST 6: Admin B accessing Hospital A blood unit 5001 is DENIED (returns 403 Forbidden)'
  );

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 2: Organization ID Tampering Defense (Step 21: Tests 3, 4, 10)');
  // --------------------------------------------------------------------------

  // TEST 3: Admin A changes organization_id in request -> DENIED / ignored
  const test3Res = await request('/api/inventory?organization_id=102', { token: tokenAdminA });
  assert(
    test3Res.status === 403,
    'TEST 3: Admin A tampering query with organization_id=102 is DENIED (returns 403 Forbidden)'
  );
  assert(
    test3Res.body.error && test3Res.body.error.code === 'CROSS_ORGANIZATION_ACCESS_DENIED',
    'TEST 3: Cross-organization tampering detected and blocked'
  );

  // TEST 4: Admin A attempts to modify Clinic B blood inventory -> DENIED
  const test4Res = await request('/api/inventory', {
    method: 'POST',
    token: tokenAdminA,
    body: {
      unit_code: 'MALICIOUS-UNIT-001',
      organization_id: 102, // Attempting to inject into Clinic B
      blood_group: 'O-',
      component: 'PACKED_RBC',
      collection_date: '2026-09-01',
      expiry_date: '2026-10-15'
    }
  });
  assert(
    test4Res.status === 403,
    'TEST 4: Admin A injecting unit into Clinic B (org 102) is DENIED (returns 403 Forbidden)'
  );

  // TEST 10: Organization Admin attempts to assign another organization_id on profile -> DENIED
  const test10Res = await request('/api/auth/me', {
    method: 'PATCH',
    token: tokenAdminA,
    body: { organization_id: 102 }
  });
  assert(
    test10Res.status === 403,
    'TEST 10: Organization Admin modifying own organization_id is DENIED (returns 403 Forbidden)'
  );
  assert(
    test10Res.body.error && test10Res.body.error.code === 'ORGANIZATION_TAMPERING_NOT_PERMITTED',
    'TEST 10: Error specifies ORGANIZATION_TAMPERING_NOT_PERMITTED'
  );

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 3: Super Admin Platform-Wide Access (Step 21: Tests 7, 8)');
  // --------------------------------------------------------------------------

  // TEST 7: Super Admin accesses Hospital A -> PASS
  const test7Res = await request('/api/organizations/101', { token: tokenSuperAdmin });
  assert(test7Res.status === 200, 'TEST 7: Super Admin accesses Hospital A details (returns 200 OK)');
  assert(test7Res.body.data.organization.name === 'ABC Hospital', 'TEST 7: Correct organization returned');

  // TEST 8: Super Admin accesses Clinic B -> PASS
  const test8Res = await request('/api/organizations/102', { token: tokenSuperAdmin });
  assert(test8Res.status === 200, 'TEST 8: Super Admin accesses Clinic B details (returns 200 OK)');
  assert(test8Res.body.data.organization.name === 'City Care Clinic', 'TEST 8: Correct organization returned');

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 4: Privilege Escalation & RBAC Restrictions (Step 21: Tests 9, 11, 12)');
  // --------------------------------------------------------------------------

  // TEST 9: Organization Admin attempts to change own role to SUPER_ADMIN -> DENIED
  const test9Res = await request('/api/auth/me', {
    method: 'PATCH',
    token: tokenAdminA,
    body: { role: 'SUPER_ADMIN' }
  });
  assert(
    test9Res.status === 403,
    'TEST 9: Organization Admin elevating role to SUPER_ADMIN is DENIED (returns 403 Forbidden)'
  );
  assert(
    test9Res.body.error && test9Res.body.error.code === 'ROLE_TAMPERING_NOT_PERMITTED',
    'TEST 9: Error specifies ROLE_TAMPERING_NOT_PERMITTED'
  );

  // TEST 11: Unauthenticated user accesses protected API -> 401
  const test11Res = await request('/api/inventory');
  assert(test11Res.status === 401, 'TEST 11: Unauthenticated request to /api/inventory returns 401 Unauthorized');

  // TEST 12: Authenticated user with insufficient role accesses admin endpoint -> 403
  const test12Res = await request('/api/admin/organizations', { token: tokenAdminA });
  assert(
    test12Res.status === 403,
    'TEST 12: Organization Admin accessing /api/admin/organizations returns 403 Forbidden'
  );
  assert(
    test12Res.body.error && test12Res.body.error.code === 'FORBIDDEN_ROLE',
    'TEST 12: Error specifies FORBIDDEN_ROLE'
  );

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 5: Organization Lifecycle & Pending Status (Step 12)');
  // --------------------------------------------------------------------------

  // TEST 13: Pending organization access restricted until approval -> 403
  const test13Res = await request('/api/inventory', { token: tokenPendingAdmin });
  assert(
    test13Res.status === 403,
    'TEST 13: Admin of PENDING organization accessing inventory returns 403 Forbidden'
  );
  assert(
    test13Res.body.error && test13Res.body.error.code === 'ORGANIZATION_PENDING_APPROVAL',
    'TEST 13: Error code is ORGANIZATION_PENDING_APPROVAL'
  );

  // TEST 14: Super Admin approves pending organization -> 200
  const test14Res = await request('/api/admin/organizations/104/status', {
    method: 'PATCH',
    token: tokenSuperAdmin,
    body: { status: 'APPROVED' }
  });
  assert(
    test14Res.status === 200,
    'TEST 14: Super Admin approving pending organization returns 200 OK'
  );
  assert(
    test14Res.body.data && test14Res.body.data.organization.status === 'APPROVED',
    'TEST 14: Organization status successfully transitioned to APPROVED'
  );

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 6: Public Blood Search & Staff Creation (Steps 16, 19)');
  // --------------------------------------------------------------------------

  // TEST 15: Public blood availability search succeeds without private data -> 200
  const test15Res = await request('/api/public/blood-availability');
  assert(
    test15Res.status === 200,
    'TEST 15: Public blood availability returns 200 OK without authentication'
  );
  assert(
    Array.isArray(test15Res.body.data.results),
    'TEST 15: Returns an array of blood availability results'
  );

  // TEST 16: Organization Admin creates staff inside own organization only
  const test16Res = await request('/api/organization/staff', {
    method: 'POST',
    token: tokenAdminA,
    body: {
      full_name: 'Dr. Sarah Connor',
      email: 'dr.sarah@hospital-a.test',
      password: 'DoctorPass123!',
      role_name: 'DOCTOR'
    }
  });
  assert(
    test16Res.status === 201,
    'TEST 16: Organization Admin creates staff member returns 201 Created'
  );
  assert(
    test16Res.body.data && test16Res.body.data.staff.organizationId === 101,
    'TEST 16: New staff member is strictly bound to Hospital A (organization_id = 101)'
  );

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal error in test suite:', err);
  if (server) server.close();
  process.exit(1);
});
