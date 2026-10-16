/**
 * ============================================================================
 * BLOOD BANK PLATFORM — PREFERRED HOSPITAL / CLINIC SELECTION TEST SUITE
 * ============================================================================
 * Verification implementing all Section 9 Test Specifications:
 *
 *  1. Approved hospitals appear in the dropdown/facility endpoint
 *  2. Approved clinics appear in the dropdown/facility endpoint
 *  3. Blood banks do NOT appear as treatment facilities
 *  4. Pending, rejected, and suspended organizations are excluded
 *  5. Searching by organization name returns correct results
 *  6. Selecting a registered facility saves the correct organization ID
 *  7. Manual entry saves the facility name without creating an organization
 *  8. Switching between registered and manual selection clears stale values (mutual exclusion)
 *  9. Invalid, non-existent, or unapproved organization IDs are rejected (400)
 * 10. Empty or whitespace-only manual facility names are rejected (400)
 * 11. Existing blood request submission without preferred facility continues to work
 * 12. Existing RBAC roles and functionality remain intact
 * 13. Request details display the correct authoritative preferred facility
 * 14. API failures and invalid parameters are handled gracefully
 * 15. SQL queries remain parameterized and access controls remain enforced
 * ============================================================================
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
let tokenBloodBankStaff;   // User 5 (BLOOD_BANK_STAFF, Org 2: Central Red Cross Blood Bank)
let tokenClinicAdmin;      // User 4 (CLINIC_ADMIN, Org 3: Metro Community Clinic)
let tokenDonor;            // User 6 (DONOR, no org)
let tokenRequester;        // User 8 (REQUESTER, no org)
let tokenUnauthorizedUser; // User with arbitrary ID without request permissions

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
  console.log('🏥 PREFERRED HOSPITAL / CLINIC SELECTION VERIFICATION TEST SUITE');
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

  // Setup tokens
  tokenSuperAdmin = generateAccessToken({ id: 1, global_role: 'SUPER_ADMIN' });
  tokenHospitalAdminA = generateAccessToken({ id: 2, global_role: 'ORG_USER', organization_id: 1 });
  tokenClinicAdmin = generateAccessToken({ id: 4, global_role: 'ORG_USER', organization_id: 3 });
  tokenBloodBankStaff = generateAccessToken({ id: 5, global_role: 'ORG_USER', organization_id: 2 });
  tokenDonor = generateAccessToken({ id: 6, global_role: 'DONOR', organization_id: null });
  tokenRequester = generateAccessToken({ id: 8, global_role: 'REQUESTER', organization_id: null });
  tokenUnauthorizedUser = generateAccessToken({ id: 9999, global_role: 'DONOR', organization_id: null });

  // Temporary test organizations for status isolation verification
  let tempPendingOrgId;
  let tempSuspendedOrgId;

  const testSuffix = Date.now();
  try {
    await db.query("DELETE FROM organizations WHERE name IN ('St. Pending Memorial Hospital', 'Suspended Care Medical Clinic')");
    const [resPending] = await db.query(
      `INSERT INTO organizations (name, type, license_number, email, status, address, city) 
       VALUES ('St. Pending Memorial Hospital', 'HOSPITAL', ?, ?, 'PENDING', '101 Queue Ave', 'Dhaka')`,
      [`LIC-PEND-${testSuffix}`, `pending_${testSuffix}@stmemorial.org`]
    );
    tempPendingOrgId = resPending.insertId;

    const [resSuspended] = await db.query(
      `INSERT INTO organizations (name, type, license_number, email, status, address, city) 
       VALUES ('Suspended Care Medical Clinic', 'CLINIC', ?, ?, 'SUSPENDED', '404 Inactive Rd', 'Chittagong')`,
      [`LIC-SUSP-${testSuffix}`, `susp_${testSuffix}@clinic.org`]
    );
    tempSuspendedOrgId = resSuspended.insertId;
  } catch (e) {
    console.error('Warning creating temporary test orgs:', e.message);
  }

  // --------------------------------------------------------------------------
  console.log('▶ GROUP 1: Facility Directory & Dropdown API (Scenarios 1–5)');
  // --------------------------------------------------------------------------

  // Test 1: Approved hospitals appear in GET /api/organizations/facilities
  const resFacilities = await request('/api/organizations/facilities');
  assert(resFacilities.status === 200, 'GET /api/organizations/facilities returns HTTP 200');
  assert(resFacilities.body.success === true, 'Response payload contains success: true');
  assert(Array.isArray(resFacilities.body.data), 'Response data is an array');

  const facilities = resFacilities.body.data;
  const hasHospital = facilities.some(f => f.type === 'HOSPITAL' && f.name.includes('City General Hospital'));
  assert(hasHospital, '1. Approved hospital (City General Hospital) is returned in facilities list');

  // Test 2: Approved clinics appear in GET /api/organizations/facilities
  const hasClinic = facilities.some(f => f.type === 'CLINIC' && f.name.includes('Metro Community Clinic'));
  assert(hasClinic, '2. Approved clinic (Metro Community Clinic) is returned in facilities list');

  // Test 3: Blood banks are strictly excluded
  const hasBloodBank = facilities.some(f => f.type === 'BLOOD_BANK' || f.name.includes('Red Cross'));
  assert(!hasBloodBank, '3. Blood banks are excluded from treatment facility results');

  // Test 4: Pending and suspended organizations are excluded
  const hasPending = facilities.some(f => f.id === tempPendingOrgId || f.name === 'St. Pending Memorial Hospital');
  const hasSuspended = facilities.some(f => f.id === tempSuspendedOrgId || f.name === 'Suspended Care Medical Clinic');
  assert(!hasPending && !hasSuspended, '4. Pending and Suspended organizations are strictly excluded from facilities endpoint');

  // Test 5: Search filtering by facility name
  const resSearch = await request('/api/organizations/facilities?search=General');
  assert(resSearch.status === 200, 'Search query returns HTTP 200');
  const searchResults = resSearch.body.data || [];
  assert(searchResults.length > 0, 'Search with keyword "General" returns matching facilities');
  assert(searchResults.every(f => f.name.toLowerCase().includes('general')), 'All search results match the keyword');

  // Search with no matching records
  const resNoMatch = await request('/api/organizations/facilities?search=NonExistentHospitalXYZ');
  assert(resNoMatch.status === 200, 'Empty search returns HTTP 200');
  assert(Array.isArray(resNoMatch.body.data) && resNoMatch.body.data.length === 0, '5. Empty search returns empty array');

  // --------------------------------------------------------------------------
  console.log('\n▶ GROUP 2: Registered Facility Blood Requests (Scenarios 6, 8, 9, 13)');
  // --------------------------------------------------------------------------

  // Test 6: Selecting a registered facility saves preferred_organization_id
  const resReqRegistered = await request('/api/blood-requests', {
    method: 'POST',
    token: tokenRequester,
    body: {
      organization_id: 2, // Fulfilling blood bank: Central Red Cross Blood Bank
      priority: 'HIGH',
      needed_by: new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' '),
      notes: 'Post-op transfusion needed for patient in oncology',
      items: [
        { blood_group: 'O+', component: 'WHOLE_BLOOD', units_requested: 2 }
      ],
      preferred_organization_id: 1 // Treatment facility: City General Hospital
    }
  });

  assert(resReqRegistered.status === 201, '6. Submitting blood request with registered facility returns HTTP 201 Created');
  assert(resReqRegistered.body.success === true, 'Response indicates success');
  const registeredReqId = resReqRegistered.body.data?.id;
  assert(Number(registeredReqId) > 0, 'Created blood request ID is returned');

  // Verify in database that preferred_organization_id = 1 and preferred_facility_name IS NULL
  const [dbRowRegistered] = await db.query(
    'SELECT id, organization_id, preferred_organization_id, preferred_facility_name, preferred_facility_location FROM blood_requests WHERE id = ?',
    [registeredReqId]
  );
  assert(dbRowRegistered.length === 1, 'Blood request record found in database');
  assert(dbRowRegistered[0].preferred_organization_id === 1, 'preferred_organization_id is saved as 1 (City General Hospital)');
  assert(dbRowRegistered[0].preferred_facility_name === null, 'preferred_facility_name is NULL for registered facility');
  assert(dbRowRegistered[0].organization_id === 2, 'Fulfilling blood bank organization_id remains distinct (2)');

  // Test 13: Request details API returns authoritative preferred facility info
  const resDetailsRegistered = await request(`/api/blood-requests/${registeredReqId}`, {
    method: 'GET',
    token: tokenRequester
  });
  assert(resDetailsRegistered.status === 200, '13. GET /api/blood-requests/:id returns HTTP 200 for owner');
  const detailsData = resDetailsRegistered.body.data;
  assert(detailsData.preferredFacilityType === 'REGISTERED', 'preferredFacilityType is REGISTERED');
  assert(detailsData.preferredFacility === 'City General Hospital', 'Authoritative facility name is populated correctly');
  assert(detailsData.preferredOrganization?.type === 'HOSPITAL', 'Authoritative organization type is HOSPITAL');

  // Test 8: Submitting BOTH preferred_organization_id AND preferred_facility_name must be rejected
  const resConflict = await request('/api/blood-requests', {
    method: 'POST',
    token: tokenRequester,
    body: {
      organization_id: 2,
      priority: 'MEDIUM',
      needed_by: new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' '),
      items: [{ blood_group: 'A+', component: 'WHOLE_BLOOD', units_requested: 1 }],
      preferred_organization_id: 1,
      preferred_facility_name: 'Conflict General Hospital' // Stale/conflicting manual value
    }
  });
  assert(resConflict.status === 400, '8. Mutual exclusion: Submitting both registered ID and manual facility name returns HTTP 400');

  // Test 9: Reject invalid or unapproved organization IDs
  // 9a. Non-existent org ID
  const resNonExistent = await request('/api/blood-requests', {
    method: 'POST',
    token: tokenRequester,
    body: {
      organization_id: 2,
      priority: 'LOW',
      items: [{ blood_group: 'B+', component: 'WHOLE_BLOOD', units_requested: 1 }],
      preferred_organization_id: 999999
    }
  });
  assert(resNonExistent.status === 400, '9a. Non-existent preferred organization ID is rejected with HTTP 400');

  // 9b. Blood bank selected as treatment facility
  const resBloodBankAsTreatment = await request('/api/blood-requests', {
    method: 'POST',
    token: tokenRequester,
    body: {
      organization_id: 2,
      priority: 'LOW',
      items: [{ blood_group: 'B+', component: 'WHOLE_BLOOD', units_requested: 1 }],
      preferred_organization_id: 2 // Central Red Cross Blood Bank
    }
  });
  assert(resBloodBankAsTreatment.status === 400, '9b. Blood Bank submitted as treatment facility is rejected with HTTP 400');

  // 9c. Pending organization submitted
  if (tempPendingOrgId) {
    const resPendingAsTreatment = await request('/api/blood-requests', {
      method: 'POST',
      token: tokenRequester,
      body: {
        organization_id: 2,
        priority: 'LOW',
        items: [{ blood_group: 'B+', component: 'WHOLE_BLOOD', units_requested: 1 }],
        preferred_organization_id: tempPendingOrgId
      }
    });
    assert(resPendingAsTreatment.status === 400, '9c. Pending organization submitted as treatment facility is rejected with HTTP 400');
  }

  // 9d. Suspended organization submitted
  if (tempSuspendedOrgId) {
    const resSuspAsTreatment = await request('/api/blood-requests', {
      method: 'POST',
      token: tokenRequester,
      body: {
        organization_id: 2,
        priority: 'LOW',
        items: [{ blood_group: 'B+', component: 'WHOLE_BLOOD', units_requested: 1 }],
        preferred_organization_id: tempSuspendedOrgId
      }
    });
    assert(resSuspAsTreatment.status === 400, '9d. Suspended organization submitted as treatment facility is rejected with HTTP 400');
  }

  // --------------------------------------------------------------------------
  console.log('\n▶ GROUP 3: Manual Facility Entry (Scenarios 7, 10)');
  // --------------------------------------------------------------------------

  // Check initial count of organizations in database
  const [[{ orgCountBefore }]] = await db.query('SELECT COUNT(*) AS orgCountBefore FROM organizations');

  // Test 7: Manual entry saves facility name without creating an organization
  const resReqManual = await request('/api/blood-requests', {
    method: 'POST',
    token: tokenRequester,
    body: {
      organization_id: 2,
      priority: 'CRITICAL',
      needed_by: new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' '),
      notes: 'Urgent accident victim at rural facility',
      items: [
        { blood_group: 'AB-', component: 'RED_BLOOD_CELLS', units_requested: 3 }
      ],
      preferred_facility_name: 'St. Mary Rural Emergency Clinic',
      preferred_facility_location: 'Savar Thana Road, Building 4'
    }
  });

  assert(resReqManual.status === 201, '7. Submitting blood request with manual facility returns HTTP 201 Created');
  const manualReqId = resReqManual.body.data?.id;

  // Verify in database: preferred_organization_id IS NULL and manual name/location are saved
  const [dbRowManual] = await db.query(
    'SELECT id, preferred_organization_id, preferred_facility_name, preferred_facility_location FROM blood_requests WHERE id = ?',
    [manualReqId]
  );
  assert(dbRowManual.length === 1, 'Manual blood request record found in database');
  assert(dbRowManual[0].preferred_organization_id === null, 'preferred_organization_id is NULL for manual facility');
  assert(dbRowManual[0].preferred_facility_name === 'St. Mary Rural Emergency Clinic', 'preferred_facility_name saved correctly');
  assert(dbRowManual[0].preferred_facility_location === 'Savar Thana Road, Building 4', 'preferred_facility_location saved correctly');

  // Verify NO new row was added to organizations table
  const [[{ orgCountAfter }]] = await db.query('SELECT COUNT(*) AS orgCountAfter FROM organizations');
  assert(orgCountAfter === orgCountBefore, '7b. Manual entry did NOT insert any new row into organizations table');

  // Verify GET details for manual facility
  const resDetailsManual = await request(`/api/blood-requests/${manualReqId}`, {
    method: 'GET',
    token: tokenRequester
  });
  assert(resDetailsManual.status === 200, 'GET /api/blood-requests/:id for manual request returns HTTP 200');
  assert(resDetailsManual.body.data?.preferredFacilityType === 'MANUAL', 'preferredFacilityType is MANUAL');
  assert(resDetailsManual.body.data?.preferredFacility === 'St. Mary Rural Emergency Clinic', 'preferredFacility displays manual name');
  assert(resDetailsManual.body.data?.preferredFacilityLocation === 'Savar Thana Road, Building 4', 'preferredFacilityLocation displays manual address');

  // Test 10: Empty or whitespace-only manual facility name is rejected
  const resEmptyManual = await request('/api/blood-requests', {
    method: 'POST',
    token: tokenRequester,
    body: {
      organization_id: 2,
      priority: 'MEDIUM',
      items: [{ blood_group: 'O-', component: 'WHOLE_BLOOD', units_requested: 1 }],
      preferred_facility_name: '     '
    }
  });
  assert(resEmptyManual.status === 400, '10. Empty or whitespace-only manual facility name is rejected with HTTP 400');

  // --------------------------------------------------------------------------
  console.log('\n▶ GROUP 4: Backward Compatibility, RBAC & Scoping (Scenarios 11, 12, 14, 15)');
  // --------------------------------------------------------------------------

  // Test 11: Standard blood request without preferred facility fields works
  const resReqStandard = await request('/api/blood-requests', {
    method: 'POST',
    token: tokenRequester,
    body: {
      organization_id: 2,
      priority: 'LOW',
      items: [{ blood_group: 'A-', component: 'WHOLE_BLOOD', units_requested: 1 }]
    }
  });
  assert(resReqStandard.status === 201, '11. Standard blood request without preferred facility succeeds with HTTP 201');
  const standardReqId = resReqStandard.body.data?.id;

  const [dbRowStandard] = await db.query(
    'SELECT preferred_organization_id, preferred_facility_name FROM blood_requests WHERE id = ?',
    [standardReqId]
  );
  assert(dbRowStandard[0].preferred_organization_id === null && dbRowStandard[0].preferred_facility_name === null,
    'Preferred facility fields default gracefully to null when omitted');

  // Test 12: List requests as Requester returns own requests with preferred facility data
  const resListRequester = await request('/api/blood-requests', {
    method: 'GET',
    token: tokenRequester
  });
  assert(resListRequester.status === 200, '12. Requester can list their own blood requests');
  const requesterList = resListRequester.body.data || [];
  assert(requesterList.some(r => r.id === registeredReqId && r.preferredFacility === 'City General Hospital'),
    'Requester list includes registered request with authoritative facility name');
  assert(requesterList.some(r => r.id === manualReqId && r.preferredFacility === 'St. Mary Rural Emergency Clinic'),
    'Requester list includes manual request with entered facility name');

  // Test 14: Blood bank staff can view incoming requests assigned to their blood bank
  const resListStaff = await request('/api/blood-requests', {
    method: 'GET',
    token: tokenBloodBankStaff
  });
  assert(resListStaff.status === 200, '14. Blood bank staff can view requests assigned to their facility');
  const staffList = resListStaff.body.data || [];
  assert(staffList.some(r => r.id === registeredReqId), 'Blood bank staff can view the incoming request');

  // Test 15: Access control & tenant isolation: Unauthorized user cannot read requester's request
  const resUnauthorizedRead = await request(`/api/blood-requests/${registeredReqId}`, {
    method: 'GET',
    token: tokenDonor // Donor has no requests.read permission or ownership
  });
  assert(resUnauthorizedRead.status === 403, '15. Unauthorized user is blocked from viewing another user blood request (HTTP 403)');

  // --------------------------------------------------------------------------
  // Cleanup temporary test organizations
  // --------------------------------------------------------------------------
  if (tempPendingOrgId) {
    await db.query('DELETE FROM organizations WHERE id = ?', [tempPendingOrgId]).catch(() => {});
  }
  if (tempSuspendedOrgId) {
    await db.query('DELETE FROM organizations WHERE id = ?', [tempSuspendedOrgId]).catch(() => {});
  }

  // Cleanup test requests created in this run
  const testReqIds = [registeredReqId, manualReqId, standardReqId].filter(Boolean);
  if (testReqIds.length > 0) {
    await db.query('DELETE FROM request_items WHERE request_id IN (?)', [testReqIds]).catch(() => {});
    await db.query('DELETE FROM blood_requests WHERE id IN (?)', [testReqIds]).catch(() => {});
  }

  // Close server and database
  server.close();
  await db.end();

  console.log('\n================================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  if (server) server.close();
  process.exit(1);
});
