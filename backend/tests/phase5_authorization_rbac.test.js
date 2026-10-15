/**
 * ============================================================================
 * BLOOD BANK PLATFORM — PHASE 5 USER ROLES & AUTHORIZATION (RBAC) TEST SUITE
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§5, §9, §11, §13, §18, §25, §27, §31)
 *
 * Mandatory Automated Verification implementing all Section 11 Test Specifications:
 *
 *   AUTHENTICATION TESTS:
 *     1. Unauthenticated user attempts protected route -> 401
 *     2. Authenticated user without required permission -> 403
 *     3. Tampered or invalid JWT signature -> 401
 *
 *   ROLE AUTHORIZATION TESTS:
 *     4. Normal user attempts organization approval -> 403
 *     5. Donor attempts administrative action -> 403
 *     6. User attempts role elevation via register / profile update -> Rejected
 *     7. User without staff membership attempts organization operation -> 403
 *     8. Organization administrator attempts action outside authorized permissions -> 403
 *
 *   TENANT ISOLATION TESTS:
 *     9. CRITICAL COMPLETION CRITERION:
 *        Hospital A attempts to modify Hospital B's blood inventory -> 403 Forbidden,
 *        audit log entry created, Hospital B's unit data strictly UNCHANGED.
 *    10. Hospital A attempts to read Hospital B's private resource -> 403 Forbidden
 *    11. User changes organization_id in request body -> 403 / blocked
 *    12. User changes organization_id in query string -> 403 / blocked
 *    13. User changes resource ID in URL to another organization's entity -> 403
 *    14. User with no valid organization membership attempts tenant access -> 403
 *
 *   SUPER ADMIN TESTS:
 *    15. Super Admin accesses platform-wide operation -> 200 OK
 *    16. Super Admin accesses organization-scoped administrative operation -> 200 OK
 *    17. Non-Super Admin attempts platform-wide operation -> 403
 *
 *   LEGITIMATE OPERATIONAL & REGRESSION TESTS:
 *    18. Hospital Admin reads own tenant inventory -> 200 OK
 *    19. Hospital Admin reads own blood unit -> 200 OK
 *    20. Legitimate staff member updates own organization unit -> 200 OK
 *    21. Database health verification -> 200 OK
 *
 * Usage:
 *   node backend/tests/phase5_authorization_rbac.test.js
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_antigravity_phase5_rbac_authorization_2026';

const http = require('http');
const db = require('../config/db');
const app = require('../server');
const { generateAccessToken } = require('../services/tokenService');

let server;
let baseUrl;

// Test tokens
let tokenSuperAdmin;       // User 1 (SUPER_ADMIN)
let tokenHospitalAdminA;   // User 2 (HOSPITAL_ADMIN, Org 1: City General Hospital)
let tokenBloodBankStaff;    // User 5 (BLOOD_BANK_STAFF, Org 2: Central Red Cross Blood Bank)
let tokenClinicAdmin;       // User 4 (CLINIC_ADMIN, Org 3: Metro Community Clinic)
let tokenDoctor;            // User 3 (DOCTOR, Org 1: City General Hospital)
let tokenDonor;             // User 6 (DONOR, no org)
let tokenRequester;         // User 8 (REQUESTER, no org)

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

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = { ...options.headers };

    let bodyStr = null;
    if (options.body) {
      bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
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

async function runTests() {
  console.log('\n================================================================');
  console.log('🩸 BLOOD BANK PLATFORM — PHASE 5 RBAC & AUTHORIZATION TEST SUITE');
  console.log('================================================================\n');

  try {
    await db.query('SELECT 1');
    console.log('📦 Database Status: Connected to local MySQL server.');
  } catch (err) {
    console.error('❌ Database connection failure:', err.message);
    process.exit(1);
  }

  // Boot HTTP test server
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`🧪 Test Server running on: ${baseUrl}\n`);

  // Generate tokens based on seeded database users
  tokenSuperAdmin = generateAccessToken({ id: 1, global_role: 'SUPER_ADMIN' });
  tokenHospitalAdminA = generateAccessToken({ id: 2, global_role: 'ORG_USER', organization_id: 1 });
  tokenDoctor = generateAccessToken({ id: 3, global_role: 'ORG_USER', organization_id: 1 });
  tokenClinicAdmin = generateAccessToken({ id: 4, global_role: 'ORG_USER', organization_id: 3 });
  tokenBloodBankStaff = generateAccessToken({ id: 5, global_role: 'ORG_USER', organization_id: 2 });
  tokenDonor = generateAccessToken({ id: 6, global_role: 'DONOR', organization_id: null });
  tokenRequester = generateAccessToken({ id: 8, global_role: 'REQUESTER', organization_id: null });

  // --------------------------------------------------------------------------
  console.log('▶ Test Group 1: Authentication & Token Security (Scenarios 1, 2, 3)');
  // --------------------------------------------------------------------------

  // Test 1: Unauthenticated user attempts to access protected inventory route
  const resUnauth = await request('/api/inventory');
  assert(resUnauth.status === 401, 'Scenario 1: Unauthenticated request to /api/inventory returns 401 Unauthorized');
  assert(resUnauth.body.error && resUnauth.body.error.code === 'UNAUTHORIZED', 'Scenario 1: Error code is UNAUTHORIZED');

  // Test 2: Authenticated user without required permission (Clinic Admin attempts POST /api/inventory which requires inventory.manage)
  const resNoPerm = await request('/api/inventory', {
    method: 'POST',
    token: tokenClinicAdmin,
    body: {
      unit_code: `UNIT-TEST-NOP-${Date.now()}`,
      blood_group: 'O+',
      component: 'PACKED_RBC',
      collection_date: '2026-09-01',
      expiry_date: '2026-10-15'
    }
  });
  assert(resNoPerm.status === 403, 'Scenario 2: Authenticated user without inventory.manage permission returns 403 Forbidden');
  assert(resNoPerm.body.error && resNoPerm.body.error.code === 'FORBIDDEN_PERMISSION', 'Scenario 2: Error code is FORBIDDEN_PERMISSION');

  // Test 3: Tampered or invalid JWT
  const resTampered = await request('/api/inventory', {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.tampered_signature'
  });
  assert(resTampered.status === 401, 'Scenario 3: Tampered JWT token signature returns 401');
  assert(resTampered.body.error && resTampered.body.error.code === 'INVALID_TOKEN', 'Scenario 3: Error code is INVALID_TOKEN');

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 2: Role Authorization & Privilege Escalation (Scenarios 4, 5, 6, 7, 8)');
  // --------------------------------------------------------------------------

  // Test 4: Normal user (Hospital Admin) attempts to approve an organization
  const resHospAdminApprove = await request('/api/organizations/4/approve', {
    method: 'PATCH',
    token: tokenHospitalAdminA
  });
  assert(resHospAdminApprove.status === 403, 'Scenario 4: Hospital Admin attempting to approve organization returns 403 Forbidden');

  // Test 5: Donor attempts administrative action (GET /api/organization/staff)
  const resDonorStaff = await request('/api/organization/staff', {
    token: tokenDonor
  });
  assert(resDonorStaff.status === 403, 'Scenario 5: Donor attempting to view organization staff returns 403 Forbidden');

  // Test 6: Privilege escalation via registration payload or profile update
  const resRegEscalate = await request('/api/auth/register', {
    method: 'POST',
    body: {
      full_name: 'Escalation Attempt',
      email: `escalate-${Date.now()}@test.org`,
      password: 'SecurePassword123!',
      global_role: 'SUPER_ADMIN'
    }
  });
  assert(resRegEscalate.status === 400, 'Scenario 6a: Self-registration with SUPER_ADMIN role is rejected with 400 Bad Request');

  const resProfileEscalate = await request('/api/auth/me', {
    method: 'PATCH',
    token: tokenHospitalAdminA,
    body: { role: 'SUPER_ADMIN' }
  });
  assert(resProfileEscalate.status === 403, 'Scenario 6b: Profile update elevating role to SUPER_ADMIN is rejected with 403 Forbidden');
  assert(resProfileEscalate.body.error && resProfileEscalate.body.error.code === 'ROLE_TAMPERING_NOT_PERMITTED', 'Scenario 6b: Error code is ROLE_TAMPERING_NOT_PERMITTED');

  // Test 7: User without staff membership attempts organization operation
  const resRequesterInventory = await request('/api/inventory', {
    token: tokenRequester
  });
  assert(resRequesterInventory.status === 403, 'Scenario 7: User without staff membership attempting inventory access returns 403 Forbidden');
  assert(resRequesterInventory.body.error && resRequesterInventory.body.error.code === 'NO_ORGANIZATION_ASSIGNED', 'Scenario 7: Error code is NO_ORGANIZATION_ASSIGNED');

  // Test 8: Organization Admin attempts operation outside permitted permissions
  const resClinicAdminCreateUnit = await request('/api/inventory', {
    method: 'POST',
    token: tokenClinicAdmin,
    body: {
      unit_code: `CLINIC-ILLEGAL-${Date.now()}`,
      blood_group: 'A+',
      component: 'WHOLE_BLOOD',
      collection_date: '2026-09-01',
      expiry_date: '2026-10-15'
    }
  });
  assert(resClinicAdminCreateUnit.status === 403, 'Scenario 8: Clinic Admin attempting inventory creation without permission returns 403 Forbidden');

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 3: Tenant Isolation & Cross-Tenant Modification Defense (Scenarios 9, 10, 11, 12, 13, 14)');
  // --------------------------------------------------------------------------

  // Target resource in Org 2: Unit 1 (BD-2026-000101, Central Red Cross Blood Bank)
  const [targetUnitBefore] = await db.query('SELECT id, unit_code, organization_id, status FROM blood_units WHERE id = 1 LIMIT 1');
  assert(targetUnitBefore && targetUnitBefore.length > 0, 'Target test unit (ID 1, Org 2) exists in database');
  const initialStatus = targetUnitBefore[0].status;

  // Test 9 (CRITICAL COMPLETION CRITERION):
  // Hospital A (Org 1) user attempts to modify Hospital B's / Blood Bank B's (Org 2) blood unit 1
  const resCrossModify = await request('/api/inventory/1', {
    method: 'PATCH',
    token: tokenHospitalAdminA,
    body: {
      status: 'DISCARDED',
      notes: 'Malicious cross-tenant status change attempt'
    }
  });
  assert(resCrossModify.status === 403, 'Scenario 9: Hospital A attempt to modify Org 2 blood unit returns 403 Forbidden');
  assert(resCrossModify.body.error && resCrossModify.body.error.code === 'CROSS_ORGANIZATION_ACCESS_DENIED', 'Scenario 9: Error code is CROSS_ORGANIZATION_ACCESS_DENIED');

  // VERIFY TARGET DATA UNCHANGED IN DATABASE (§11 & Phase 5 Completion Criterion):
  const [targetUnitAfter] = await db.query('SELECT status FROM blood_units WHERE id = 1 LIMIT 1');
  assert(targetUnitAfter[0].status === initialStatus, `Scenario 9 CRITICAL: Target unit status remained strictly unchanged ('${initialStatus}') in database`);

  // Verify Audit Log captured the cross-tenant attempt
  const [crossOrgAudit] = await db.query(`
    SELECT action, resource_type, resource_id 
    FROM audit_logs 
    WHERE user_id = 2 AND action = 'SECURITY_CROSS_ORG_MUTATION_ATTEMPT' AND resource_id = 1
    ORDER BY id DESC LIMIT 1
  `);
  assert(crossOrgAudit && crossOrgAudit.length > 0, 'Scenario 9: Security incident audit log was successfully recorded');

  // Test 10: Hospital A attempts to read Hospital B's private resource (Unit 1)
  const resCrossRead = await request('/api/inventory/1', {
    token: tokenHospitalAdminA
  });
  assert(resCrossRead.status === 403, 'Scenario 10: Hospital A attempting to read Org 2 blood unit returns 403 Forbidden');
  assert(resCrossRead.body.error && resCrossRead.body.error.code === 'CROSS_ORGANIZATION_ACCESS_DENIED', 'Scenario 10: Error code is CROSS_ORGANIZATION_ACCESS_DENIED');

  // Test 11: User changes organization_id in request body to target another tenant
  const resBodyTampering = await request('/api/inventory', {
    method: 'POST',
    token: tokenHospitalAdminA,
    body: {
      unit_code: `INJECT-${Date.now()}`,
      organization_id: 2, // Attempting to inject unit into Org 2
      blood_group: 'B-',
      component: 'PACKED_RBC',
      collection_date: '2026-09-01',
      expiry_date: '2026-10-15'
    }
  });
  assert(resBodyTampering.status === 403, 'Scenario 11: Body tampering with different organization_id returns 403 Forbidden');
  assert(resBodyTampering.body.error && resBodyTampering.body.error.code === 'CROSS_ORGANIZATION_ACCESS_DENIED', 'Scenario 11: Error code is CROSS_ORGANIZATION_ACCESS_DENIED');

  // Test 12: User changes organization ID in query string
  const resQueryTampering = await request('/api/inventory?organization_id=2', {
    token: tokenHospitalAdminA
  });
  assert(resQueryTampering.status === 403, 'Scenario 12: Query tampering with different organization_id returns 403 Forbidden');
  assert(resQueryTampering.body.error && resQueryTampering.body.error.code === 'CROSS_ORGANIZATION_ACCESS_DENIED', 'Scenario 12: Error code is CROSS_ORGANIZATION_ACCESS_DENIED');

  // Test 13: User targets another tenant organization entity in URL (PATCH /api/organizations/2)
  const resUrlTampering = await request('/api/organizations/2', {
    method: 'PATCH',
    token: tokenHospitalAdminA,
    body: { phone: '+1-555-9999' }
  });
  assert(resUrlTampering.status === 403, 'Scenario 13: Targeting another organization URL parameter returns 403 Forbidden');
  assert(resUrlTampering.body.error && resUrlTampering.body.error.code === 'CROSS_ORGANIZATION_ACCESS_DENIED', 'Scenario 13: Error code is CROSS_ORGANIZATION_ACCESS_DENIED');

  // Test 14: User with no valid organization membership attempts tenant access
  const resNoOrgAccess = await request('/api/inventory', {
    token: tokenDonor
  });
  assert(resNoOrgAccess.status === 403, 'Scenario 14: User with no organization membership attempting tenant access returns 403 Forbidden');

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 4: Super Admin Platform-Wide Access (Scenarios 15, 16, 17)');
  // --------------------------------------------------------------------------

  // Test 15: Super Admin accesses platform-wide operation (GET /api/admin/organizations)
  const resSuperAdminList = await request('/api/admin/organizations', {
    token: tokenSuperAdmin
  });
  assert(resSuperAdminList.status === 200, 'Scenario 15: Super Admin accesses platform-wide operation returns 200 OK');
  assert(Array.isArray(resSuperAdminList.body.data.organizations), 'Scenario 15: Organizations list returned as array');

  // Test 16: Super Admin accesses organization-scoped administrative operation without ordinary tenant restriction
  const resSuperAdminOrgScope = await request('/api/inventory?organization_id=1', {
    token: tokenSuperAdmin
  });
  assert(resSuperAdminOrgScope.status === 200, 'Scenario 16: Super Admin querying specific organization inventory returns 200 OK');
  assert(resSuperAdminOrgScope.body.data.units.every((u) => u.organization_id === 1), 'Scenario 16: All returned units strictly belong to target organization (Org 1)');

  // Test 17: Non-Super Admin attempts platform-wide operation (GET /api/admin/organizations)
  const resNonSuperAdmin = await request('/api/admin/organizations', {
    token: tokenHospitalAdminA
  });
  assert(resNonSuperAdmin.status === 403, 'Scenario 17: Non-Super Admin attempting platform-wide administration returns 403 Forbidden');
  assert(resNonSuperAdmin.body.error && resNonSuperAdmin.body.error.code === 'FORBIDDEN_ROLE', 'Scenario 17: Error code is FORBIDDEN_ROLE');

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 5: Legitimate Operations & Unit Mutation (Scenarios 18, 19, 20, 21)');
  // --------------------------------------------------------------------------

  // Test 18: Hospital Admin A accesses own tenant inventory (Org 1)
  const resOwnInventory = await request('/api/inventory', {
    token: tokenHospitalAdminA
  });
  assert(resOwnInventory.status === 200, 'Scenario 18: Hospital Admin A accesses own inventory returns 200 OK');
  assert(resOwnInventory.body.data.units.every((u) => u.organization_id === 1), 'Scenario 18: All returned units belong strictly to own organization (Org 1)');

  // Test 19: Hospital Admin A reads own blood unit (Unit 11, Org 1)
  const resOwnUnit = await request('/api/inventory/11', {
    token: tokenHospitalAdminA
  });
  assert(resOwnUnit.status === 200, 'Scenario 19: Hospital Admin A reading own unit returns 200 OK');
  assert(resOwnUnit.body.data.unit.organization_id === 1, 'Scenario 19: Unit organization_id is 1');

  // Test 20: Blood Bank Staff updates own unit (Unit 10, Org 2)
  const resLegitUpdate = await request('/api/inventory/10', {
    method: 'PATCH',
    token: tokenBloodBankStaff,
    body: { status: 'AVAILABLE' }
  });
  assert(resLegitUpdate.status === 200, 'Scenario 20: Blood Bank Staff updating own unit returns 200 OK');
  assert(resLegitUpdate.body.data.unit.status === 'AVAILABLE', 'Scenario 20: Unit status successfully transitioned to AVAILABLE');

  // Test 21: Database Health Check
  const resHealthDb = await request('/api/health/db');
  assert(resHealthDb.status === 200, 'Scenario 21: Database health check returns 200 OK');
  assert(resHealthDb.body.db === 'connected', 'Scenario 21: Database connection status is connected');

  console.log('\n================================================================');
  console.log(`PHASE 5 TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal error in Phase 5 test suite:', err);
  if (server) server.close();
  process.exit(1);
});
