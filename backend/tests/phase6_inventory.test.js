/**
 * ============================================================================
 * BLOOD BANK PLATFORM — PHASE 6 BLOOD INVENTORY TEST SUITE
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9.10, §11, §14, §18, §25, §27)
 *
 * Mandatory Automated Verification implementing all Section 12 Test Specifications:
 *
 *   GROUP A: CREATE INVENTORY TESTS (Scenarios 1–6)
 *     1. Authorized staff create a valid inventory record -> 201 Created
 *     2. Request omits a required field -> 400 Validation Error
 *     3. Request contains an unsupported blood group or component -> 400 Validation Error
 *     4. Request contains an invalid date or dates where expiry < collection -> 400 Validation Error
 *     5. Unauthorized user attempts to create inventory -> 403 Forbidden
 *     6. Client attempts to create inventory for another org by manipulating organization_id -> 403 / blocked
 *
 *   GROUP B: READ AND SEARCH TESTS (Scenarios 7–12)
 *     7. Authorized user lists their organization's inventory -> 200 OK, scoped
 *     8. User attempts to read another organization's inventory record -> 403 Forbidden
 *     9. User filters inventory by blood group, component, status, or expiry -> 200 OK, matches filters
 *    10. User supplies invalid filters or pagination values -> 400 Validation Error
 *    11. Unauthorized user attempts to read inventory -> 401/403 Access Denied
 *    12. Inventory counts and availability summaries respect tenant isolation -> 200 OK, no cross-tenant leakage
 *
 *   GROUP C: UPDATE AND DELETE TESTS (Scenarios 13–18)
 *    13. Authorized staff update a record owned by their organization -> 200 OK
 *    14. CRITICAL: User attempts to update another organization's record -> 403 Forbidden, target UNCHANGED
 *    15. User attempts to change a record's owning organization -> 403 Forbidden, ownership remains unchanged
 *    16. User attempts to change protected field or perform invalid status transition -> 400 Bad Request
 *    17. User attempts to delete/deactivate without required permission -> 403 Forbidden
 *    18. Valid update preserves unrelated fields and relationships -> 200 OK
 *
 *   GROUP D: EXPIRY AND AVAILABILITY TESTS (Scenarios 19–22)
 *    19. Expired blood unit is excluded from available inventory (is_available=true filter)
 *    20. Inventory with an invalid/past expiry date cannot be created as AVAILABLE -> 400 Error
 *    21. An ineligible or expired unit is NOT counted as available in summaries even if status says AVAILABLE
 *    22. Inventory summaries correctly reflect the underlying records in database
 *
 *   GROUP E: AUTHENTICATION AND REGRESSION TESTS (Scenarios 23–26)
 *    23. Unauthenticated user attempts an inventory operation -> 401 Unauthorized
 *    24. Invalid or tampered JWT is rejected -> 401 Unauthorized
 *    25. Super Admin performs platform-wide inventory operation -> 200 OK
 *    26. Non-Super Admin attempting platform-wide access is restricted to own tenant
 *
 * Usage:
 *   node backend/tests/phase6_inventory.test.js
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_antigravity_phase6_inventory_2026';

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
  console.log('🩸 BLOOD BANK PLATFORM — PHASE 6 BLOOD INVENTORY TEST SUITE');
  console.log('================================================================\n');

  try {
    await db.query('SELECT 1');
    console.log('📦 Database Status: Connected to MySQL server.');
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
  console.log('▶ GROUP A: Create Inventory Tests (Scenarios 1–6)');
  // --------------------------------------------------------------------------

  // Test 1: Authorized staff create a valid inventory record
  const uniqueCode1 = `TEST-P6-UNIT-${Date.now()}`;
  const resCreateValid = await request('/api/inventory', {
    method: 'POST',
    token: tokenHospitalAdminA,
    body: {
      unit_code: uniqueCode1,
      blood_group: 'O+',
      component: 'PACKED_RBC',
      collection_date: '2026-09-01',
      expiry_date: '2026-11-01',
      status: 'AVAILABLE'
    }
  });
  assert(resCreateValid.status === 201, 'Scenario 1: Authorized staff creates valid unit (201 Created)');
  assert(resCreateValid.body.success === true, 'Scenario 1: Response indicates success: true');
  assert(resCreateValid.body.data?.unit?.unit_code === uniqueCode1, 'Scenario 1: Created unit has correct unit_code');
  assert(resCreateValid.body.data?.unit?.organization_id === 1, 'Scenario 1: Unit stamped strictly with Org 1');

  // Test 2: Request omits a required field (e.g. missing expiry_date)
  const resOmitField = await request('/api/inventory', {
    method: 'POST',
    token: tokenHospitalAdminA,
    body: {
      unit_code: `TEST-P6-OMIT-${Date.now()}`,
      blood_group: 'O+',
      component: 'PACKED_RBC',
      collection_date: '2026-09-01'
      // missing expiry_date
    }
  });
  assert(resOmitField.status === 400, 'Scenario 2: Request omitting required field returns 400 Bad Request');
  assert(resOmitField.body.error?.code === 'INVALID_INPUT', 'Scenario 2: Error code is INVALID_INPUT');

  // Test 3: Request contains an unsupported blood group or component
  const resBadGroup = await request('/api/inventory', {
    method: 'POST',
    token: tokenHospitalAdminA,
    body: {
      unit_code: `TEST-P6-BADGRP-${Date.now()}`,
      blood_group: 'Z_POSITIVE',
      component: 'PACKED_RBC',
      collection_date: '2026-09-01',
      expiry_date: '2026-11-01'
    }
  });
  assert(resBadGroup.status === 400, 'Scenario 3a: Unsupported blood group returns 400 Bad Request');
  assert(resBadGroup.body.error?.code === 'INVALID_BLOOD_GROUP', 'Scenario 3a: Error code is INVALID_BLOOD_GROUP');

  const resBadComp = await request('/api/inventory', {
    method: 'POST',
    token: tokenHospitalAdminA,
    body: {
      unit_code: `TEST-P6-BADCOMP-${Date.now()}`,
      blood_group: 'O+',
      component: 'ENERGY_DRINK',
      collection_date: '2026-09-01',
      expiry_date: '2026-11-01'
    }
  });
  assert(resBadComp.status === 400, 'Scenario 3b: Unsupported component returns 400 Bad Request');
  assert(resBadComp.body.error?.code === 'INVALID_COMPONENT', 'Scenario 3b: Error code is INVALID_COMPONENT');

  // Test 4: Request contains an invalid date or expiry < collection
  const resBadDates = await request('/api/inventory', {
    method: 'POST',
    token: tokenHospitalAdminA,
    body: {
      unit_code: `TEST-P6-BADDATE-${Date.now()}`,
      blood_group: 'O+',
      component: 'PACKED_RBC',
      collection_date: '2026-10-10',
      expiry_date: '2026-09-01' // earlier than collection!
    }
  });
  assert(resBadDates.status === 400, 'Scenario 4: Request where expiry < collection returns 400 Bad Request');
  assert(resBadDates.body.error?.code === 'INVALID_DATES', 'Scenario 4: Error code is INVALID_DATES');

  // Test 5: Unauthorized user attempts to create inventory (Doctor has inventory.view but not inventory.manage)
  const resDoctorCreate = await request('/api/inventory', {
    method: 'POST',
    token: tokenDoctor,
    body: {
      unit_code: `TEST-P6-DOC-${Date.now()}`,
      blood_group: 'O+',
      component: 'PACKED_RBC',
      collection_date: '2026-09-01',
      expiry_date: '2026-11-01'
    }
  });
  assert(resDoctorCreate.status === 403, 'Scenario 5: Unauthorized user (Doctor) returns 403 Forbidden');
  assert(resDoctorCreate.body.error?.code === 'FORBIDDEN_PERMISSION', 'Scenario 5: Error code is FORBIDDEN_PERMISSION');

  // Test 6: Client attempts to create inventory for another organization by manipulating organization_id in body
  const resCrossOrgCreate = await request('/api/inventory', {
    method: 'POST',
    token: tokenHospitalAdminA, // Org 1
    body: {
      unit_code: `TEST-P6-CROSS-${Date.now()}`,
      organization_id: 2, // Hospital A attempting to create in Blood Bank B
      blood_group: 'O+',
      component: 'PACKED_RBC',
      collection_date: '2026-09-01',
      expiry_date: '2026-11-01'
    }
  });
  assert(resCrossOrgCreate.status === 403, 'Scenario 6: Manipulating organization_id returns 403 Forbidden');
  assert(resCrossOrgCreate.body.error?.code === 'CROSS_ORGANIZATION_ACCESS_DENIED', 'Scenario 6: Error code is CROSS_ORGANIZATION_ACCESS_DENIED');

  // --------------------------------------------------------------------------
  console.log('\n▶ GROUP B: Read and Search Tests (Scenarios 7–12)');
  // --------------------------------------------------------------------------

  // Test 7: Authorized user lists their organization's inventory
  const resListOrg1 = await request('/api/inventory', {
    token: tokenHospitalAdminA
  });
  assert(resListOrg1.status === 200, 'Scenario 7: Hospital Admin A lists own inventory (200 OK)');
  assert(Array.isArray(resListOrg1.body.data?.units), 'Scenario 7: Returns array of units');
  const allOrg1 = resListOrg1.body.data?.units.every((u) => u.organization_id === 1);
  assert(allOrg1 === true, 'Scenario 7: All returned units strictly belong to Hospital A (Org 1)');

  // Test 8: User attempts to read another organization's inventory record
  // Unit 1 belongs to Org 2 (Blood Bank). Hospital Admin A belongs to Org 1.
  const resCrossRead = await request('/api/inventory/1', {
    token: tokenHospitalAdminA
  });
  assert(resCrossRead.status === 403, 'Scenario 8: Reading another organization unit returns 403 Forbidden');
  assert(resCrossRead.body.error?.code === 'CROSS_ORGANIZATION_ACCESS_DENIED', 'Scenario 8: Error code is CROSS_ORGANIZATION_ACCESS_DENIED');

  // Test 9: User filters inventory by blood group, component, status, or search
  const resFilterBg = await request('/api/inventory?blood_group=O%2B', {
    token: tokenHospitalAdminA
  });
  assert(resFilterBg.status === 200, 'Scenario 9a: Filtering by blood_group returns 200 OK');
  const allOPlus = resFilterBg.body.data?.units.every((u) => u.blood_group === 'O+');
  assert(allOPlus === true, 'Scenario 9a: All filtered records match blood_group O+');

  const resFilterComp = await request('/api/inventory?component=PACKED_RBC', {
    token: tokenHospitalAdminA
  });
  assert(resFilterComp.status === 200, 'Scenario 9b: Filtering by component returns 200 OK');
  const allRbc = resFilterComp.body.data?.units.every((u) => u.component === 'PACKED_RBC');
  assert(allRbc === true, 'Scenario 9b: All filtered records match component PACKED_RBC');

  const resSearch = await request(`/api/inventory?search=${uniqueCode1}`, {
    token: tokenHospitalAdminA
  });
  assert(resSearch.status === 200, 'Scenario 9c: Searching by unit_code returns 200 OK');
  assert(resSearch.body.data?.units.length === 1, 'Scenario 9c: Search finds exactly 1 unit matching code');
  assert(resSearch.body.data?.units[0]?.unit_code === uniqueCode1, 'Scenario 9c: Found unit code matches search');

  // Test 10: User supplies invalid filters or pagination values
  const resInvalidLimit = await request('/api/inventory?limit=-5', {
    token: tokenHospitalAdminA
  });
  assert(resInvalidLimit.status === 400, 'Scenario 10a: Negative limit returns 400 Bad Request');
  assert(resInvalidLimit.body.error?.code === 'INVALID_PAGINATION', 'Scenario 10a: Error code is INVALID_PAGINATION');

  const resInvalidPage = await request('/api/inventory?page=0', {
    token: tokenHospitalAdminA
  });
  assert(resInvalidPage.status === 400, 'Scenario 10b: Page 0 returns 400 Bad Request');
  assert(resInvalidPage.body.error?.code === 'INVALID_PAGINATION', 'Scenario 10b: Error code is INVALID_PAGINATION');

  const resInvalidStatusFilter = await request('/api/inventory?status=NOT_A_STATUS', {
    token: tokenHospitalAdminA
  });
  assert(resInvalidStatusFilter.status === 400, 'Scenario 10c: Invalid status filter returns 400 Bad Request');
  assert(resInvalidStatusFilter.body.error?.code === 'INVALID_STATUS_FILTER', 'Scenario 10c: Error code is INVALID_STATUS_FILTER');

  // Test 11: Unauthorized user attempts to read inventory (Donor has no inventory.view permission)
  const resDonorRead = await request('/api/inventory', {
    token: tokenDonor
  });
  assert(resDonorRead.status === 403, 'Scenario 11: Donor reading inventory returns 403 Forbidden');
  assert(resDonorRead.body.error && ['FORBIDDEN_PERMISSION', 'NO_ORGANIZATION_ASSIGNED'].includes(resDonorRead.body.error.code), 'Scenario 11: Error code reflects tenant authorization boundary');

  // Test 12: Inventory counts and availability summaries respect tenant isolation
  const resSummaryOrg1 = await request('/api/inventory/summary', {
    token: tokenHospitalAdminA
  });
  assert(resSummaryOrg1.status === 200, 'Scenario 12a: Hospital Admin A gets inventory summary (200 OK)');
  assert(resSummaryOrg1.body.data?.organizationId === 1, 'Scenario 12a: Summary strictly scoped to Org 1');

  const resSummaryOrg2 = await request('/api/inventory/summary', {
    token: tokenBloodBankStaff
  });
  assert(resSummaryOrg2.status === 200, 'Scenario 12b: Blood Bank Staff gets inventory summary (200 OK)');
  assert(resSummaryOrg2.body.data?.organizationId === 2, 'Scenario 12b: Summary strictly scoped to Org 2');
  assert(resSummaryOrg1.body.data?.summary.total !== resSummaryOrg2.body.data?.summary.total, 'Scenario 12c: Counts between Org 1 and Org 2 are independent');

  // --------------------------------------------------------------------------
  console.log('\n▶ GROUP C: Update and Delete Tests (Scenarios 13–18)');
  // --------------------------------------------------------------------------

  // Test 13: Authorized staff update a record owned by their organization
  // Find a unit belonging to Org 1
  const [org1Units] = await db.query('SELECT id, status, expiry_date FROM blood_units WHERE organization_id = 1 LIMIT 1');
  const testUnit13Id = org1Units[0].id;

  const resUpdateOwn = await request(`/api/inventory/${testUnit13Id}`, {
    method: 'PATCH',
    token: tokenHospitalAdminA,
    body: {
      status: 'TESTING'
    }
  });
  assert(resUpdateOwn.status === 200, 'Scenario 13: Authorized staff updates own unit (200 OK)');
  assert(resUpdateOwn.body.data?.unit?.status === 'TESTING', 'Scenario 13: Unit status successfully updated to TESTING');

  // Test 14: CRITICAL COMPLETION CRITERION
  // Hospital Admin A attempts to modify Hospital B / Blood Bank Staff unit (ID: 1)
  const [bBefore] = await db.query('SELECT id, status, expiry_date, organization_id FROM blood_units WHERE id = 1');
  const orgBStatusBefore = bBefore[0].status;

  const resCrossUpdate = await request('/api/inventory/1', {
    method: 'PATCH',
    token: tokenHospitalAdminA,
    body: {
      status: 'DISCARDED'
    }
  });
  assert(resCrossUpdate.status === 403, 'Scenario 14: Hospital A mutating Hospital B unit returns 403 Forbidden');
  assert(resCrossUpdate.body.error?.code === 'CROSS_ORGANIZATION_ACCESS_DENIED', 'Scenario 14: Error code is CROSS_ORGANIZATION_ACCESS_DENIED');

  const [bAfter] = await db.query('SELECT status FROM blood_units WHERE id = 1');
  assert(bAfter[0].status === orgBStatusBefore, 'Scenario 14: CRITICAL CRITERION: Hospital B record strictly UNCHANGED in MySQL');

  // Test 15: User attempts to change a record's owning organization
  const resChangeOrg = await request(`/api/inventory/${testUnit13Id}`, {
    method: 'PATCH',
    token: tokenHospitalAdminA,
    body: {
      organization_id: 2
    }
  });
  assert(resChangeOrg.status === 403, 'Scenario 15: Attempting to change unit organization ownership returns 403 Forbidden');
  const [checkOrg] = await db.query('SELECT organization_id FROM blood_units WHERE id = ?', [testUnit13Id]);
  assert(checkOrg[0].organization_id === 1, 'Scenario 15: Unit organization_id remains strictly Org 1 in database');

  // Test 16: User attempts to perform an invalid status transition
  // Create a discarded unit, then attempt to transition it to AVAILABLE
  const [discardedUnit] = await db.query(
    "INSERT INTO blood_units (unit_code, organization_id, blood_group, component, collection_date, expiry_date, status) VALUES (?, 1, 'O+', 'PACKED_RBC', '2026-09-01', '2026-11-01', 'DISCARDED')",
    [`TEST-TERM-${Date.now()}`]
  );
  const termUnitId = discardedUnit.insertId;

  const resInvalidTransition = await request(`/api/inventory/${termUnitId}`, {
    method: 'PATCH',
    token: tokenHospitalAdminA,
    body: {
      status: 'AVAILABLE'
    }
  });
  assert(resInvalidTransition.status === 400, 'Scenario 16: Transitioning from terminal status DISCARDED returns 400 Bad Request');
  assert(resInvalidTransition.body.error?.code === 'INVALID_STATUS_TRANSITION', 'Scenario 16: Error code is INVALID_STATUS_TRANSITION');

  // Test 17: User attempts to delete/deactivate without required permission (Doctor lacks inventory.manage)
  const resDoctorDiscard = await request(`/api/inventory/${testUnit13Id}`, {
    method: 'DELETE',
    token: tokenDoctor
  });
  assert(resDoctorDiscard.status === 403, 'Scenario 17: User without inventory.manage deleting unit returns 403 Forbidden');
  assert(resDoctorDiscard.body.error?.code === 'FORBIDDEN_PERMISSION', 'Scenario 17: Error code is FORBIDDEN_PERMISSION');

  // Test 18: Valid update preserves unrelated fields and relationships
  const [origRow] = await db.query('SELECT * FROM blood_units WHERE id = ?', [testUnit13Id]);
  const resValidPreserve = await request(`/api/inventory/${testUnit13Id}`, {
    method: 'PATCH',
    token: tokenHospitalAdminA,
    body: {
      status: 'AVAILABLE'
    }
  });
  assert(resValidPreserve.status === 200, 'Scenario 18: Valid update returns 200 OK');
  const [afterRow] = await db.query('SELECT * FROM blood_units WHERE id = ?', [testUnit13Id]);
  assert(afterRow[0].unit_code === origRow[0].unit_code, 'Scenario 18: unit_code preserved');
  assert(afterRow[0].blood_group === origRow[0].blood_group, 'Scenario 18: blood_group preserved');
  assert(afterRow[0].component === origRow[0].component, 'Scenario 18: component preserved');
  assert(afterRow[0].organization_id === origRow[0].organization_id, 'Scenario 18: organization_id preserved');

  // --------------------------------------------------------------------------
  console.log('\n▶ GROUP D: Expiry and Availability Tests (Scenarios 19–22)');
  // --------------------------------------------------------------------------

  // Test 19: An expired blood unit is excluded from available inventory
  // Seed Unit 14 has expiry_date in the past ('2026-08-10') and status 'EXPIRED'
  const resAvailList = await request('/api/inventory?is_available=true', {
    token: tokenHospitalAdminA
  });
  assert(resAvailList.status === 200, 'Scenario 19: List with is_available=true returns 200 OK');
  const unit14InAvail = resAvailList.body.data?.units.some((u) => u.id === 14);
  assert(unit14InAvail === false, 'Scenario 19: Expired unit (ID 14) is strictly excluded from available inventory');

  // Test 20: Inventory with an invalid past expiry date cannot be created as AVAILABLE
  const resPastExpiry = await request('/api/inventory', {
    method: 'POST',
    token: tokenHospitalAdminA,
    body: {
      unit_code: `TEST-EXPIRED-AVAIL-${Date.now()}`,
      blood_group: 'B+',
      component: 'PACKED_RBC',
      collection_date: '2026-01-01',
      expiry_date: '2026-02-01', // in past
      status: 'AVAILABLE'
    }
  });
  assert(resPastExpiry.status === 400, 'Scenario 20: Creating unit with past expiry as AVAILABLE returns 400 Bad Request');
  assert(resPastExpiry.body.error?.code === 'EXPIRED_UNIT_CANNOT_BE_AVAILABLE', 'Scenario 20: Error code is EXPIRED_UNIT_CANNOT_BE_AVAILABLE');

  // Test 21: An ineligible or expired unit is NOT counted as available in summaries even if status says AVAILABLE
  // Insert a test unit with past expiry date but status 'AVAILABLE'
  const [fakeAvail] = await db.query(
    "INSERT INTO blood_units (unit_code, organization_id, blood_group, component, collection_date, expiry_date, status) VALUES (?, 1, 'AB+', 'PLATELETS', '2026-01-01', '2026-01-05', 'AVAILABLE')",
    [`TEST-FAKE-AVAIL-${Date.now()}`]
  );
  const fakeAvailId = fakeAvail.insertId;

  const resSummaryFake = await request('/api/inventory/summary', {
    token: tokenHospitalAdminA
  });
  // Query direct count of truly available AB+ units
  const [realAvailCount] = await db.query(
    "SELECT COUNT(*) AS c FROM blood_units WHERE organization_id = 1 AND blood_group = 'AB+' AND status = 'AVAILABLE' AND expiry_date >= CURDATE()"
  );
  assert(
    resSummaryFake.body.data?.byBloodGroup['AB+']?.available === realAvailCount[0].c,
    'Scenario 21: Expired unit with status=AVAILABLE is NOT counted as available in summary'
  );

  // Clean up test unit
  await db.query('DELETE FROM blood_units WHERE id = ?', [fakeAvailId]);

  // Test 22: Inventory summaries correctly reflect the underlying records
  const [actualDbTotal] = await db.query('SELECT COUNT(*) AS c FROM blood_units WHERE organization_id = 1');
  const resSummaryVerify = await request('/api/inventory/summary', {
    token: tokenHospitalAdminA
  });
  assert(
    resSummaryVerify.body.data?.summary.total === actualDbTotal[0].c,
    `Scenario 22: Summary total (${resSummaryVerify.body.data?.summary.total}) matches MySQL COUNT(*) (${actualDbTotal[0].c})`
  );

  // --------------------------------------------------------------------------
  console.log('\n▶ GROUP E: Authentication and Regression Tests (Scenarios 23–26)');
  // --------------------------------------------------------------------------

  // Test 23: Unauthenticated user attempts an inventory operation
  const resUnauthPost = await request('/api/inventory', {
    method: 'POST',
    body: {
      unit_code: 'TEST-UNAUTH',
      blood_group: 'O+',
      component: 'PACKED_RBC',
      collection_date: '2026-09-01',
      expiry_date: '2026-11-01'
    }
  });
  assert(resUnauthPost.status === 401, 'Scenario 23: Unauthenticated POST /api/inventory returns 401 Unauthorized');
  assert(resUnauthPost.body.error?.code === 'UNAUTHORIZED', 'Scenario 23: Error code is UNAUTHORIZED');

  // Test 24: Invalid or tampered JWT is rejected
  const resTampered = await request('/api/inventory', {
    headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.signature' }
  });
  assert(resTampered.status === 401, 'Scenario 24: Tampered JWT returns 401 Unauthorized');

  // Test 25: Super Admin performs platform-wide inventory operation
  const resSuperAdminList = await request('/api/inventory', {
    token: tokenSuperAdmin
  });
  assert(resSuperAdminList.status === 200, 'Scenario 25a: Super Admin can list all platform inventory (200 OK)');
  const superAdminOrgs = new Set(resSuperAdminList.body.data?.units.map((u) => u.organization_id));
  assert(superAdminOrgs.size > 1, 'Scenario 25a: Super Admin sees inventory across multiple organizations');

  const resSuperAdminSummary = await request('/api/inventory/summary', {
    token: tokenSuperAdmin
  });
  assert(resSuperAdminSummary.status === 200, 'Scenario 25b: Super Admin can retrieve platform-wide summary (200 OK)');
  assert(resSuperAdminSummary.body.data?.organizationId === 'ALL', 'Scenario 25b: Scope is ALL for Super Admin without org filter');

  // Test 26: A non-Super Admin attempting platform-wide / foreign organization access returns 403 Forbidden
  const resTenantTryingAll = await request('/api/inventory?organization_id=2', {
    token: tokenHospitalAdminA // Hospital Admin A belongs to Org 1
  });
  assert(resTenantTryingAll.status === 403, 'Scenario 26: Non-Super Admin attempting foreign organization access returns 403 Forbidden');
  assert(resTenantTryingAll.body.error?.code === 'CROSS_ORGANIZATION_ACCESS_DENIED', 'Scenario 26: Error code is CROSS_ORGANIZATION_ACCESS_DENIED');

  // Discard endpoint verification
  const resDiscard = await request(`/api/inventory/${termUnitId}/discard`, {
    method: 'POST',
    token: tokenHospitalAdminA,
    body: {
      reason: 'Damaged during internal clinical transfer'
    }
  });
  // Unit was already DISCARDED in scenario 16, so ALREADY_DISCARDED is returned
  assert(resDiscard.status === 400 && resDiscard.body.error?.code === 'ALREADY_DISCARDED', 'Scenario Extra: Discarding an already discarded unit returns ALREADY_DISCARDED');

  // Clean up termUnitId
  await db.query('DELETE FROM blood_units WHERE id = ?', [termUnitId]);

  // Clean up created test units
  await db.query('DELETE FROM blood_units WHERE unit_code LIKE "TEST-P6-%"');

  // Close server
  await new Promise((resolve) => server.close(resolve));

  console.log('\n================================================================');
  console.log(`Phase 6 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
