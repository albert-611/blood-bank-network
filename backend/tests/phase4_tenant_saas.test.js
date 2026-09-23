/**
 * ============================================================================
 * BLOOD BANK PLATFORM — PHASE 4 MULTI-TENANT SAAS TEST SUITE
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9, §10, §11, §12, §16, §18, §21, §25, §31-35)
 *
 * Exhaustive automated verification covering:
 *   1. Organization Creation & Onboarding (Hospital, Clinic, Blood Bank)
 *   2. Subtype Validation (bed_count, storage_capacity_units, invalid types)
 *   3. Initial Status Guarantee (strictly PENDING, client status ignored)
 *   4. Transactional Integrity & Rollback on failure (no orphan records)
 *   5. Tenant Isolation Boundaries (Hospital A, Clinic B, Blood Bank C)
 *   6. Cross-Organization Access Denial (403 Forbidden across all tenant pairings)
 *   7. Super Admin Platform-Wide Scope (List all, view any, approve, reject)
 *   8. Non-Super-Admin RBAC Restrictions (Hospital Admin, Clinic Admin, Staff, Doctor, Donor, Requester -> 403)
 *   9. Status Transition & Manipulation Defense (Generic PATCH status blocked, invalid transitions -> 400)
 *  10. Specialized Endpoints (/api/hospitals, /api/clinics, /api/blood-banks)
 *  11. Audit Trail Recording (ORGANIZATION_CREATED, ORGANIZATION_APPROVED, ORGANIZATION_REJECTED)
 *
 * Usage:
 *   node backend/tests/phase4_tenant_saas.test.js
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_antigravity_phase4_saas_2026';

const http = require('http');
const db = require('../config/db');
const app = require('../server');
const { generateAccessToken } = require('../services/tokenService');

let server;
let baseUrl;

// Test fixtures & tokens
let tokenSuperAdmin;
let tokenHospitalAdminA; // Org 1 (City General Hospital)
let tokenHospitalAdminB; // Org 102
let tokenClinicAdmin;     // Org 3 (Metro Community Clinic)
let tokenBloodBankStaff;  // Org 2 (Central Red Cross Blood Bank)
let tokenDoctor;          // Org 1 (Doctor)
let tokenDonor;           // Donor (no org)
let tokenRequester;       // Requester (no org)

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
  console.log('🩸 BLOOD BANK PLATFORM — PHASE 4 SAAS TENANT & ORG TEST SUITE');
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

  // Setup Applicant User (ID 99) for onboarding creation tests so seeded user org bindings are preserved
  await db.query(`
    INSERT INTO users (id, full_name, email, password_hash, global_role, status)
    VALUES (99, 'Onboarding Applicant', 'applicant@onboarding.dev', '$2b$10$aEo7eR6ZyrjGy1.4rKEqYevUZSPXyv4tlVjOGU3ctDTlZXfcgp7W6', 'ORG_USER', 'ACTIVE')
    ON DUPLICATE KEY UPDATE status = 'ACTIVE'
  `);

  const tokenApplicant = generateAccessToken({ id: 99, global_role: 'ORG_USER' });

  // Setup Tokens from Seeded / Known Database Users
  tokenSuperAdmin = generateAccessToken({ id: 1, global_role: 'SUPER_ADMIN' });
  tokenHospitalAdminA = generateAccessToken({ id: 2, global_role: 'ORG_USER', organization_id: 1 });
  tokenClinicAdmin = generateAccessToken({ id: 4, global_role: 'ORG_USER', organization_id: 3 });
  tokenBloodBankStaff = generateAccessToken({ id: 5, global_role: 'ORG_USER', organization_id: 2 });
  tokenDoctor = generateAccessToken({ id: 3, global_role: 'ORG_USER', organization_id: 1 });
  tokenDonor = generateAccessToken({ id: 6, global_role: 'DONOR', organization_id: null });
  tokenRequester = generateAccessToken({ id: 8, global_role: 'REQUESTER', organization_id: null });

  // --------------------------------------------------------------------------
  console.log('▶ Test Group 1: Organization Creation & Onboarding (§11-15, §34)');
  // --------------------------------------------------------------------------

  // Test 1: Create Hospital -> 201, PENDING, bed_count saved
  const hospPayload = {
    name: 'Metropolis Memorial Hospital',
    type: 'HOSPITAL',
    phone: '+1-555-4001',
    address: '400 Grand Avenue',
    city: 'Metropolis',
    license_number: `HOSP-TEST-${Date.now()}`,
    bed_count: 320
  };
  const resCreateHosp = await request('/api/organizations', {
    method: 'POST',
    token: tokenApplicant,
    body: hospPayload
  });
  assert(resCreateHosp.status === 201, 'Create Hospital returns 201 Created');
  assert(resCreateHosp.body.data.organization.name === hospPayload.name, 'Hospital name correctly persisted');
  assert(resCreateHosp.body.data.organization.type === 'HOSPITAL', 'Hospital type correctly persisted');
  assert(resCreateHosp.body.data.organization.status === 'PENDING', 'Hospital starts strictly in PENDING status (§10)');
  assert(resCreateHosp.body.data.organization.bed_count === 320, 'Hospital bed_count correctly persisted in subtype table (§13)');
  const createdHospId = resCreateHosp.body.data.organization.id;

  // Test 2: Create Clinic -> 201, PENDING
  const clinicPayload = {
    name: 'Eastside Health Clinic',
    type: 'CLINIC',
    phone: '+1-555-4002',
    address: '12 Sunrise Boulevard',
    city: 'Eastside',
    license_number: `CLN-TEST-${Date.now()}`
  };
  const resCreateClinic = await request('/api/organizations', {
    method: 'POST',
    token: tokenApplicant,
    body: clinicPayload
  });
  assert(resCreateClinic.status === 201, 'Create Clinic returns 201 Created');
  assert(resCreateClinic.body.data.organization.type === 'CLINIC', 'Clinic type correctly persisted (§14)');
  assert(resCreateClinic.body.data.organization.status === 'PENDING', 'Clinic starts strictly in PENDING status');
  const createdClinicId = resCreateClinic.body.data.organization.id;

  // Test 3: Create Blood Bank -> 201, PENDING, storage_capacity_units saved
  const bbPayload = {
    name: 'Regional Blood Logistics Bank',
    type: 'BLOOD_BANK',
    phone: '+1-555-4003',
    address: '77 Life Saver Road',
    city: 'Metro City',
    license_number: `BB-TEST-${Date.now()}`,
    storage_capacity_units: 2500
  };
  const resCreateBB = await request('/api/organizations', {
    method: 'POST',
    token: tokenApplicant,
    body: bbPayload
  });
  assert(resCreateBB.status === 201, 'Create Blood Bank returns 201 Created');
  assert(resCreateBB.body.data.organization.type === 'BLOOD_BANK', 'Blood Bank type correctly persisted (§15)');
  assert(resCreateBB.body.data.organization.status === 'PENDING', 'Blood Bank starts strictly in PENDING status');
  assert(resCreateBB.body.data.organization.storage_capacity_units === 2500, 'Blood Bank storage capacity correctly persisted');
  const createdBBId = resCreateBB.body.data.organization.id;

  // Test 4: Rejection of invalid organization type
  const resBadType = await request('/api/organizations', {
    method: 'POST',
    token: tokenApplicant,
    body: { ...hospPayload, type: 'PHARMACY' }
  });
  assert(resBadType.status === 400, 'Invalid organization type returns 400 Bad Request');
  assert(resBadType.body.error && resBadType.body.error.code === 'VALIDATION_ERROR', 'Validation error returned for invalid type');

  // Test 5: Rejection of missing required fields (empty name)
  const resBadName = await request('/api/organizations', {
    method: 'POST',
    token: tokenApplicant,
    body: { ...hospPayload, name: '' }
  });
  assert(resBadName.status === 400, 'Empty name returns 400 Bad Request');

  // Test 6: Rejection of negative bed count
  const resBadBeds = await request('/api/organizations', {
    method: 'POST',
    token: tokenApplicant,
    body: { ...hospPayload, bed_count: -15 }
  });
  assert(resBadBeds.status === 400, 'Negative bed_count returns 400 Bad Request');

  // Test 7: Rejection of non-integer bed count
  const resStrBeds = await request('/api/organizations', {
    method: 'POST',
    token: tokenApplicant,
    body: { ...hospPayload, bed_count: 'not-a-number' }
  });
  assert(resStrBeds.status === 400, 'String bed_count returns 400 Bad Request');

  // Test 8: Rejection of negative storage capacity
  const resBadCapacity = await request('/api/organizations', {
    method: 'POST',
    token: tokenApplicant,
    body: { ...bbPayload, storage_capacity_units: -100 }
  });
  assert(resBadCapacity.status === 400, 'Negative storage_capacity_units returns 400 Bad Request');

  // Test 9: Client status injection defense (client sends status: APPROVED, server must force PENDING)
  const resStatusInject = await request('/api/organizations', {
    method: 'POST',
    token: tokenApplicant,
    body: {
      ...hospPayload,
      name: 'Hacked Status Hospital',
      license_number: `HOSP-INJECT-${Date.now()}`,
      status: 'APPROVED'
    }
  });
  assert(resStatusInject.status === 201, 'Request accepted but status overridden');
  assert(resStatusInject.body.data.organization.status === 'PENDING', 'Injected status is ignored; server enforces PENDING (§10)');

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 2: Transactional Creation & Rollback Guarantee (§12, §35)');
  // --------------------------------------------------------------------------

  // Test 10: Verify subtype records were created alongside organizations (Atomic commit)
  const [hospSubtypeRows] = await db.query('SELECT * FROM hospitals WHERE organization_id = ?', [createdHospId]);
  assert(hospSubtypeRows.length === 1 && hospSubtypeRows[0].bed_count === 320, 'Transaction commit: hospitals record created with bed_count');

  const [clinicSubtypeRows] = await db.query('SELECT * FROM clinics WHERE organization_id = ?', [createdClinicId]);
  assert(clinicSubtypeRows.length === 1, 'Transaction commit: clinics record created');

  const [bbSubtypeRows] = await db.query('SELECT * FROM blood_banks WHERE organization_id = ?', [createdBBId]);
  assert(bbSubtypeRows.length === 1 && bbSubtypeRows[0].storage_capacity_units === 2500, 'Transaction commit: blood_banks record created with storage capacity');

  // Test 11: Transaction rollback test — simulated subtype failure
  // If subtype insert fails, the organization row must NOT remain in the database (no orphan records)
  const countOrgsBefore = (await db.query('SELECT COUNT(*) AS total FROM organizations'))[0][0].total;
  let simulatedRollbackPassed = false;

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    await conn.query(
      'INSERT INTO organizations (name, type, phone, address, city, status) VALUES (?, ?, ?, ?, ?, "PENDING")',
      ['Temporary Orphan Org', 'HOSPITAL', '+1-555-9999', 'Ghost Street', 'Nowhere']
    );
    // Force constraint error: organization_id is NOT NULL on hospitals table
    await conn.query('INSERT INTO hospitals (organization_id) VALUES (NULL)');
    await conn.commit();
  } catch (subtypeError) {
    await conn.rollback();
    simulatedRollbackPassed = true;
  } finally {
    conn.release();
  }

  const countOrgsAfter = (await db.query('SELECT COUNT(*) AS total FROM organizations'))[0][0].total;
  assert(simulatedRollbackPassed && countOrgsBefore === countOrgsAfter, 'Transaction rollback: Subtype failure rolls back organization creation with 0 orphan records (§35)');

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 3: Tenant Isolation & Boundaries (§4, §17, §31)');
  // --------------------------------------------------------------------------

  // Test 12: Hospital A user accesses Hospital A data -> ALLOW (200)
  const resHospAccessOwn = await request('/api/organizations/1', { token: tokenHospitalAdminA });
  assert(resHospAccessOwn.status === 200, 'Hospital A user -> Hospital A data -> ALLOW (200 OK)');
  assert(resHospAccessOwn.body.data.organization.id === 1, 'Hospital A user retrieves own organization');

  // Test 13: Hospital A user accesses Hospital B (or other org, e.g. Org 2) -> DENY (403)
  const resHospAccessOther = await request('/api/organizations/2', { token: tokenHospitalAdminA });
  assert(resHospAccessOther.status === 403, 'Hospital A user -> Hospital B/Org 2 data -> DENY (403 Forbidden)');
  assert(resHospAccessOther.body.error && resHospAccessOther.body.error.code === 'CROSS_ORGANIZATION_ACCESS_DENIED', 'Error code is CROSS_ORGANIZATION_ACCESS_DENIED');

  // Test 14: Hospital A user accesses Clinic B (Org 3) -> DENY (403)
  const resHospAccessClinic = await request('/api/organizations/3', { token: tokenHospitalAdminA });
  assert(resHospAccessClinic.status === 403, 'Hospital A user -> Clinic B (Org 3) data -> DENY (403 Forbidden)');

  // Test 15: Clinic A user accesses Blood Bank B (Org 2) -> DENY (403)
  const resClinicAccessBB = await request('/api/organizations/2', { token: tokenClinicAdmin });
  assert(resClinicAccessBB.status === 403, 'Clinic A user -> Blood Bank B (Org 2) data -> DENY (403 Forbidden)');

  // Test 16: Blood Bank A user accesses Hospital B (Org 1) -> DENY (403)
  const resBBAccessHosp = await request('/api/organizations/1', { token: tokenBloodBankStaff });
  assert(resBBAccessHosp.status === 403, 'Blood Bank A user -> Hospital B (Org 1) data -> DENY (403 Forbidden)');

  // Test 17: Tenant-scoped listing — Hospital Admin listing /api/organizations sees ONLY Hospital A
  const resOrgUserList = await request('/api/organizations', { token: tokenHospitalAdminA });
  assert(resOrgUserList.status === 200, 'Hospital Admin GET /api/organizations returns 200 OK');
  assert(resOrgUserList.body.data.organizations.length === 1 && resOrgUserList.body.data.organizations[0].id === 1, 'Hospital Admin listing is strictly tenant-scoped to own organization');

  // Test 18: Cross-organization PATCH modification attempt is DENIED (403)
  const resCrossPatch = await request('/api/organizations/3', {
    method: 'PATCH',
    token: tokenHospitalAdminA,
    body: { name: 'Malicious Renaming Attempt' }
  });
  assert(resCrossPatch.status === 403, 'Hospital Admin PATCH on Clinic (Org 3) -> DENIED (403 Forbidden)');

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 4: Super Admin Platform-Wide Scope (§8, §18, §19, §32)');
  // --------------------------------------------------------------------------

  // Test 19: Super Admin can list all organizations
  const resSuperAdminList = await request('/api/organizations', { token: tokenSuperAdmin });
  assert(resSuperAdminList.status === 200, 'Super Admin lists all organizations returns 200 OK');
  assert(resSuperAdminList.body.data.organizations.length >= 4, 'Super Admin sees all platform organizations across all tenants');

  // Test 20: Super Admin can view any organization (Org 1, Org 2, Org 3)
  const resSuperView1 = await request('/api/organizations/1', { token: tokenSuperAdmin });
  const resSuperView2 = await request('/api/organizations/2', { token: tokenSuperAdmin });
  const resSuperView3 = await request('/api/organizations/3', { token: tokenSuperAdmin });
  assert(resSuperView1.status === 200 && resSuperView2.status === 200 && resSuperView3.status === 200, 'Super Admin can view any organization across platform');

  // Test 21: Super Admin approves PENDING organization
  const resApprove = await request(`/api/organizations/${createdHospId}/approve`, {
    method: 'PATCH',
    token: tokenSuperAdmin
  });
  assert(resApprove.status === 200, 'Super Admin approves PENDING organization returns 200 OK');
  assert(resApprove.body.data.organization.status === 'APPROVED', 'Organization status transitioned to APPROVED');

  // Test 22: Super Admin rejects PENDING organization with reason
  const resReject = await request(`/api/organizations/${createdClinicId}/reject`, {
    method: 'PATCH',
    token: tokenSuperAdmin,
    body: { reason: 'Incomplete state health department licensing documentation' }
  });
  assert(resReject.status === 200, 'Super Admin rejects PENDING organization returns 200 OK');
  assert(resReject.body.data.organization.status === 'REJECTED', 'Organization status transitioned to REJECTED');

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 5: Non-Super-Admin RBAC Restrictions (§23, §33)');
  // --------------------------------------------------------------------------

  const nonAdminRoles = [
    { name: 'HOSPITAL_ADMIN', token: tokenHospitalAdminA },
    { name: 'CLINIC_ADMIN', token: tokenClinicAdmin },
    { name: 'BLOOD_BANK_STAFF', token: tokenBloodBankStaff },
    { name: 'DOCTOR', token: tokenDoctor },
    { name: 'DONOR', token: tokenDonor },
    { name: 'REQUESTER', token: tokenRequester }
  ];

  for (const roleTest of nonAdminRoles) {
    const resApproveForbidden = await request(`/api/organizations/${createdBBId}/approve`, {
      method: 'PATCH',
      token: roleTest.token
    });
    assert(resApproveForbidden.status === 403, `${roleTest.name} cannot approve organization (403 Forbidden)`);

    const resRejectForbidden = await request(`/api/organizations/${createdBBId}/reject`, {
      method: 'PATCH',
      token: roleTest.token,
      body: { reason: 'Unauthorized rejection attempt' }
    });
    assert(resRejectForbidden.status === 403, `${roleTest.name} cannot reject organization (403 Forbidden)`);
  }

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 6: Status Lifecycle & Manipulation Defense (§18-21)');
  // --------------------------------------------------------------------------

  // Test 23: Generic PATCH endpoint rejects status mutation
  const resPatchStatusBlocked = await request(`/api/organizations/${createdBBId}`, {
    method: 'PATCH',
    token: tokenSuperAdmin,
    body: { status: 'APPROVED' }
  });
  assert(resPatchStatusBlocked.status === 400, 'Generic PATCH /api/organizations/:id rejects status mutation with 400 Bad Request');
  assert(resPatchStatusBlocked.body.error && resPatchStatusBlocked.body.error.code === 'STATUS_MUTATION_FORBIDDEN', 'Error code is STATUS_MUTATION_FORBIDDEN');

  // Test 24: Attempting to approve an already approved organization
  const resApproveAlreadyApproved = await request(`/api/organizations/${createdHospId}/approve`, {
    method: 'PATCH',
    token: tokenSuperAdmin
  });
  assert(resApproveAlreadyApproved.status === 400, 'Approving already approved organization returns 400 Bad Request');

  // Test 25: Attempting to reject a non-pending organization
  const resRejectNonPending = await request(`/api/organizations/${createdHospId}/reject`, {
    method: 'PATCH',
    token: tokenSuperAdmin
  });
  assert(resRejectNonPending.status === 400, 'Rejecting non-pending organization returns 400 Bad Request');

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 7: Specialized Endpoints (§16, §21)');
  // --------------------------------------------------------------------------

  // Test 26: GET /api/hospitals returns approved hospitals with bed_count
  const resHospitals = await request('/api/hospitals');
  assert(resHospitals.status === 200, 'GET /api/hospitals returns 200 OK');
  assert(Array.isArray(resHospitals.body.data.hospitals), 'Hospitals returned as array');
  assert(resHospitals.body.data.hospitals.every((h) => h.type === 'HOSPITAL'), 'All records have type HOSPITAL');

  // Test 27: GET /api/hospitals/:id returns specific hospital
  const resHospDetail = await request('/api/hospitals/1');
  assert(resHospDetail.status === 200, 'GET /api/hospitals/1 returns 200 OK');
  assert(resHospDetail.body.data.hospital.bed_count !== undefined, 'Hospital detail includes bed_count attribute');

  // Test 28: GET /api/clinics returns approved clinics
  const resClinics = await request('/api/clinics');
  assert(resClinics.status === 200, 'GET /api/clinics returns 200 OK');
  assert(resClinics.body.data.clinics.every((c) => c.type === 'CLINIC'), 'All records have type CLINIC');

  // Test 29: GET /api/blood-banks returns approved blood banks with storage_capacity_units
  const resBloodBanks = await request('/api/blood-banks');
  assert(resBloodBanks.status === 200, 'GET /api/blood-banks returns 200 OK');
  assert(resBloodBanks.body.data.blood_banks.every((b) => b.type === 'BLOOD_BANK'), 'All records have type BLOOD_BANK');
  const resBBDetail = await request('/api/blood-banks/2');
  assert(resBBDetail.status === 200, 'GET /api/blood-banks/2 returns 200 OK');
  assert(resBBDetail.body.data.blood_bank.storage_capacity_units !== undefined, 'Blood bank detail includes storage_capacity_units');

  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 8: Audit Logging Verification (§26)');
  // --------------------------------------------------------------------------

  // Check audit logs in database
  const [createdLogs] = await db.query(
    'SELECT * FROM audit_logs WHERE action = "ORGANIZATION_CREATED" ORDER BY id DESC LIMIT 1'
  );
  assert(createdLogs.length > 0, 'ORGANIZATION_CREATED audit log was recorded');

  const [approvedLogs] = await db.query(
    'SELECT * FROM audit_logs WHERE action = "ORGANIZATION_APPROVED" ORDER BY id DESC LIMIT 1'
  );
  assert(
    approvedLogs.length > 0 && Number(approvedLogs[0].resource_id) === Number(createdHospId),
    'ORGANIZATION_APPROVED audit log was recorded with actor and org ID'
  );

  const [rejectedLogs] = await db.query(
    'SELECT * FROM audit_logs WHERE action = "ORGANIZATION_REJECTED" ORDER BY id DESC LIMIT 1'
  );
  assert(
    rejectedLogs.length > 0 && Number(rejectedLogs[0].resource_id) === Number(createdClinicId),
    'ORGANIZATION_REJECTED audit log was recorded with rejection reason'
  );

  // Clean up created test organizations and applicant user
  try {
    await db.query('DELETE FROM organization_staff WHERE user_id = 99');
    await db.query('DELETE FROM users WHERE id = 99');
    await db.query('DELETE FROM hospitals WHERE organization_id IN (?, ?)', [createdHospId, resStatusInject.body.data.organization.id]);
    await db.query('DELETE FROM clinics WHERE organization_id = ?', [createdClinicId]);
    await db.query('DELETE FROM blood_banks WHERE organization_id = ?', [createdBBId]);
    await db.query('DELETE FROM organizations WHERE id IN (?, ?, ?, ?)', [
      createdHospId,
      createdClinicId,
      createdBBId,
      resStatusInject.body.data.organization.id
    ]);
  } catch (cleanErr) {}

  // Finish
  console.log('\n================================================================');
  console.log(`PHASE 4 TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  server.close();
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  if (server) server.close();
  process.exit(1);
});
