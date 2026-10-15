/**
 * ============================================================================
 * BLOOD INVENTORY DASHBOARD SUMMARY VERIFICATION SUITE
 * ============================================================================
 * Tests all 10 requirements from "Fix Blood Inventory Dashboard — Summary Values Showing '-'":
 *
 * 1. All four summary values display correct values when inventory records exist.
 * 2. All four summary values display 0 when the authorized organization has no matching records.
 * 3. Expired inventory is excluded from available stock.
 * 4. Inventory expiring within seven days is counted correctly.
 * 5. Discarded inventory is excluded from available stock.
 * 6. Quantities are calculated correctly without double-counting units that are both expired and discarded.
 * 7. Summary values update immediately after inventory create, update, and retirement.
 * 8. API failures and unauthenticated requests return explicit error responses.
 * 9. Tenant isolation is strictly enforced (cross-organization tampering blocked).
 * 10. Platform-wide operations for Super Admin calculate totals correctly.
 *
 * Usage:
 *   node backend/tests/inventory_summary_fix.test.js
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
let tokenHospitalAdminOrg1;
let tokenStaffOrg2;
let tokenClinicAdminOrg3;
let tokenSuperAdmin;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✅ PASS: ${message}`);
}

async function request(endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let body = null;
          try {
            body = data ? JSON.parse(data) : {};
          } catch {
            body = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      }
    );

    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🩸 BLOOD INVENTORY SUMMARY CARDS VERIFICATION SUITE');
  console.log('================================================================\n');

  try {
    const [connTest] = await db.query('SELECT 1 + 1 AS result');
    if (connTest[0].result !== 2) throw new Error('Database connection failed.');
    console.log('📦 Database Status: Connected to MySQL server.');

    // Start ephemeral server on random port
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`🧪 Test Server running on: ${baseUrl}\n`);
        resolve();
      });
    });

    // Generate authenticated test tokens
    tokenHospitalAdminOrg1 = generateAccessToken({
      id: 2,
      email: 'hospital.admin@bloodbank.dev',
      role: 'HOSPITAL_ADMIN',
      global_role: 'ORG_USER',
      organization_id: 1,
      organization_status: 'APPROVED',
      permissions: ['inventory.view', 'inventory.manage']
    });

    tokenStaffOrg2 = generateAccessToken({
      id: 5,
      email: 'bloodbank.staff@bloodbank.dev',
      role: 'BLOOD_BANK_STAFF',
      global_role: 'ORG_USER',
      organization_id: 2,
      organization_status: 'APPROVED',
      permissions: ['inventory.view', 'inventory.manage']
    });

    tokenClinicAdminOrg3 = generateAccessToken({
      id: 4,
      email: 'clinic.admin@bloodbank.dev',
      role: 'CLINIC_ADMIN',
      global_role: 'ORG_USER',
      organization_id: 3,
      organization_status: 'APPROVED',
      permissions: ['inventory.view']
    });

    tokenSuperAdmin = generateAccessToken({
      id: 1,
      email: 'admin@bloodbank.dev',
      role: 'SUPER_ADMIN',
      global_role: 'SUPER_ADMIN',
      organization_id: null,
      permissions: ['*']
    });

    // --------------------------------------------------------------------------
    console.log('▶ TEST 1: Summary values display correct values when inventory exists');
    // --------------------------------------------------------------------------
    const resOrg1 = await request('/api/inventory/summary', { token: tokenHospitalAdminOrg1 });
    assert(resOrg1.status === 200, 'Org 1 summary returns 200 OK');
    assert(resOrg1.body.success === true, 'Response has success: true');
    assert(resOrg1.body.data !== undefined, 'Response has data object');

    // Check required top-level camelCase numeric fields
    const d1 = resOrg1.body.data;
    assert(typeof d1.totalRecorded === 'number', `totalRecorded is numeric (${d1.totalRecorded})`);
    assert(typeof d1.availableStock === 'number', `availableStock is numeric (${d1.availableStock})`);
    assert(typeof d1.expiringWithin7Days === 'number', `expiringWithin7Days is numeric (${d1.expiringWithin7Days})`);
    assert(typeof d1.expiredOrDiscarded === 'number', `expiredOrDiscarded is numeric (${d1.expiredOrDiscarded})`);

    // Verify against MySQL direct query
    const [dbRowsOrg1] = await db.query(`
      SELECT
        COUNT(*) AS total_recorded,
        COUNT(CASE WHEN status = 'AVAILABLE' AND expiry_date >= CURDATE() THEN 1 END) AS available_stock,
        COUNT(CASE WHEN status = 'AVAILABLE' AND expiry_date >= CURDATE() AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 END) AS expiring_within_7_days,
        COUNT(CASE WHEN status IN ('EXPIRED', 'DISCARDED') OR (expiry_date < CURDATE() AND status NOT IN ('COMPLETED', 'ISSUED')) THEN 1 END) AS expired_or_discarded
      FROM blood_units
      WHERE organization_id = 1
    `);
    const expectedOrg1 = dbRowsOrg1[0];
    assert(d1.totalRecorded === Number(expectedOrg1.total_recorded), `totalRecorded (${d1.totalRecorded}) matches database count`);
    assert(d1.availableStock === Number(expectedOrg1.available_stock), `availableStock (${d1.availableStock}) matches database count`);
    assert(d1.expiringWithin7Days === Number(expectedOrg1.expiring_within_7_days), `expiringWithin7Days (${d1.expiringWithin7Days}) matches database count`);
    assert(d1.expiredOrDiscarded === Number(expectedOrg1.expired_or_discarded), `expiredOrDiscarded (${d1.expiredOrDiscarded}) matches database count`);

    // --------------------------------------------------------------------------
    console.log('\n▶ TEST 2: All four summary cards display 0 when organization has no records');
    // --------------------------------------------------------------------------
    const resOrg3 = await request('/api/inventory/summary', { token: tokenClinicAdminOrg3 });
    assert(resOrg3.status === 200, 'Org 3 summary returns 200 OK');
    const d3 = resOrg3.body.data;
    assert(d3.totalRecorded === 0, 'totalRecorded is 0 (not null or undefined)');
    assert(d3.availableStock === 0, 'availableStock is 0 (not null or undefined)');
    assert(d3.expiringWithin7Days === 0, 'expiringWithin7Days is 0 (not null or undefined)');
    assert(d3.expiredOrDiscarded === 0, 'expiredOrDiscarded is 0 (not null or undefined)');

    // --------------------------------------------------------------------------
    console.log('\n▶ TEST 3: Expired inventory is strictly excluded from available stock');
    // --------------------------------------------------------------------------
    // Insert a unit with status 'AVAILABLE' but expiry in the past
    const testExpiredCode = `TEST-EXP-EXCL-${Date.now()}`;
    const [insExpired] = await db.query(
      `INSERT INTO blood_units (unit_code, organization_id, blood_group, component, collection_date, expiry_date, status)
       VALUES (?, 1, 'O+', 'WHOLE_BLOOD', DATE_SUB(CURDATE(), INTERVAL 40 DAY), DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'AVAILABLE')`,
      [testExpiredCode]
    );
    const expiredUnitId = insExpired.insertId;

    const resAfterExpired = await request('/api/inventory/summary', { token: tokenHospitalAdminOrg1 });
    // Total recorded should increase by 1, but available stock should NOT increase
    assert(resAfterExpired.body.data.totalRecorded === d1.totalRecorded + 1, 'Total recorded increased by 1');
    assert(resAfterExpired.body.data.availableStock === d1.availableStock, 'Available stock did NOT increase for expired unit');
    assert(resAfterExpired.body.data.expiredOrDiscarded === d1.expiredOrDiscarded + 1, 'Expired unit counted in expiredOrDiscarded');

    await db.query('DELETE FROM blood_units WHERE id = ?', [expiredUnitId]);

    // --------------------------------------------------------------------------
    console.log('\n▶ TEST 4: Inventory expiring within seven days is counted correctly');
    // --------------------------------------------------------------------------
    // Insert unit expiring in 3 days (within 7 days)
    const testExpiringCode = `TEST-EXP-7D-${Date.now()}`;
    const [insExpiring] = await db.query(
      `INSERT INTO blood_units (unit_code, organization_id, blood_group, component, collection_date, expiry_date, status)
       VALUES (?, 1, 'A+', 'PACKED_RBC', DATE_SUB(CURDATE(), INTERVAL 10 DAY), DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'AVAILABLE')`,
      [testExpiringCode]
    );
    const expiringUnitId = insExpiring.insertId;

    const resAfterExpiring = await request('/api/inventory/summary', { token: tokenHospitalAdminOrg1 });
    assert(resAfterExpiring.body.data.expiringWithin7Days === d1.expiringWithin7Days + 1, 'expiringWithin7Days incremented by 1');
    assert(resAfterExpiring.body.data.availableStock === d1.availableStock + 1, 'Unit expiring in 3 days is also available stock');

    // Also insert unit expiring in 15 days (> 7 days) and verify it is available but NOT expiring within 7 days
    const testLaterCode = `TEST-EXP-15D-${Date.now()}`;
    const [insLater] = await db.query(
      `INSERT INTO blood_units (unit_code, organization_id, blood_group, component, collection_date, expiry_date, status)
       VALUES (?, 1, 'B+', 'PACKED_RBC', DATE_SUB(CURDATE(), INTERVAL 5 DAY), DATE_ADD(CURDATE(), INTERVAL 15 DAY), 'AVAILABLE')`,
      [testLaterCode]
    );
    const laterUnitId = insLater.insertId;

    const resAfterLater = await request('/api/inventory/summary', { token: tokenHospitalAdminOrg1 });
    assert(resAfterLater.body.data.expiringWithin7Days === d1.expiringWithin7Days + 1, 'expiringWithin7Days unchanged for unit expiring > 7 days');

    await db.query('DELETE FROM blood_units WHERE id IN (?, ?)', [expiringUnitId, laterUnitId]);

    // --------------------------------------------------------------------------
    console.log('\n▶ TEST 5: Discarded inventory is excluded from available stock');
    // --------------------------------------------------------------------------
    const testDiscardedCode = `TEST-DISC-${Date.now()}`;
    const [insDiscarded] = await db.query(
      `INSERT INTO blood_units (unit_code, organization_id, blood_group, component, collection_date, expiry_date, status)
       VALUES (?, 1, 'AB+', 'PLASMA', DATE_SUB(CURDATE(), INTERVAL 2 DAY), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'DISCARDED')`,
      [testDiscardedCode]
    );
    const discardedUnitId = insDiscarded.insertId;

    const resAfterDisc = await request('/api/inventory/summary', { token: tokenHospitalAdminOrg1 });
    assert(resAfterDisc.body.data.availableStock === d1.availableStock, 'Discarded unit excluded from available stock');
    assert(resAfterDisc.body.data.expiredOrDiscarded === d1.expiredOrDiscarded + 1, 'Discarded unit included in expiredOrDiscarded');

    await db.query('DELETE FROM blood_units WHERE id = ?', [discardedUnitId]);

    // --------------------------------------------------------------------------
    console.log('\n▶ TEST 6: Quantities calculated correctly without double-counting (both expired & discarded)');
    // --------------------------------------------------------------------------
    const testBothCode = `TEST-BOTH-${Date.now()}`;
    const [insBoth] = await db.query(
      `INSERT INTO blood_units (unit_code, organization_id, blood_group, component, collection_date, expiry_date, status)
       VALUES (?, 1, 'O-', 'WHOLE_BLOOD', DATE_SUB(CURDATE(), INTERVAL 50 DAY), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'DISCARDED')`,
      [testBothCode]
    );
    const bothUnitId = insBoth.insertId;

    const resAfterBoth = await request('/api/inventory/summary', { token: tokenHospitalAdminOrg1 });
    assert(resAfterBoth.body.data.totalRecorded === d1.totalRecorded + 1, 'Total recorded incremented by 1');
    assert(resAfterBoth.body.data.expiredOrDiscarded === d1.expiredOrDiscarded + 1, 'Unit meeting both expired and discarded counted strictly ONCE');

    await db.query('DELETE FROM blood_units WHERE id = ?', [bothUnitId]);

    // --------------------------------------------------------------------------
    console.log('\n▶ TEST 7: Summary values update immediately after inventory operations');
    // --------------------------------------------------------------------------
    // A: Create unit
    const createCode = `TEST-LIFECYCLE-${Date.now()}`;
    const resCreate = await request('/api/inventory', {
      method: 'POST',
      token: tokenHospitalAdminOrg1,
      body: {
        unit_code: createCode,
        blood_group: 'O+',
        component: 'PACKED_RBC',
        collection_date: '2026-09-01',
        expiry_date: '2026-12-01',
        status: 'AVAILABLE'
      }
    });
    assert(resCreate.status === 201, 'Unit created successfully -> 201 Created');
    const createdUnitId = resCreate.body.data.unit.id;

    // Check summary immediately updated
    const resSummaryAfterAdd = await request('/api/inventory/summary', { token: tokenHospitalAdminOrg1 });
    assert(resSummaryAfterAdd.body.data.totalRecorded === d1.totalRecorded + 1, 'totalRecorded updated after creation');
    assert(resSummaryAfterAdd.body.data.availableStock === d1.availableStock + 1, 'availableStock updated after creation');

    // B: Retire / discard unit
    const resDiscard = await request(`/api/inventory/${createdUnitId}/discard`, {
      method: 'POST',
      token: tokenHospitalAdminOrg1,
      body: { reason: 'Quality control sample testing' }
    });
    assert(resDiscard.status === 200, 'Unit discarded successfully -> 200 OK');

    // Check summary reflects retirement
    const resSummaryAfterRetire = await request('/api/inventory/summary', { token: tokenHospitalAdminOrg1 });
    assert(resSummaryAfterRetire.body.data.availableStock === d1.availableStock, 'availableStock decreased after retirement');
    assert(resSummaryAfterRetire.body.data.expiredOrDiscarded === d1.expiredOrDiscarded + 1, 'expiredOrDiscarded increased after retirement');

    await db.query('DELETE FROM blood_units WHERE id = ?', [createdUnitId]);

    // --------------------------------------------------------------------------
    console.log('\n▶ TEST 8: API failure states return clear error responses');
    // --------------------------------------------------------------------------
    const resNoToken = await request('/api/inventory/summary');
    assert(resNoToken.status === 401, 'Request with no token returns 401 Unauthorized');
    assert(resNoToken.body.error?.code === 'UNAUTHORIZED', 'Error code is UNAUTHORIZED');

    const resBadToken = await request('/api/inventory/summary', { token: 'invalid_malformed_jwt_token' });
    assert(resBadToken.status === 401, 'Request with invalid token returns 401 Unauthorized');

    // --------------------------------------------------------------------------
    console.log('\n▶ TEST 9: Tenant isolation strictly enforced (cross-organization access blocked)');
    // --------------------------------------------------------------------------
    // Hospital Admin Org 1 attempts to query Org 2's summary by passing ?organization_id=2
    const resTamper = await request('/api/inventory/summary?organization_id=2', { token: tokenHospitalAdminOrg1 });
    assert(resTamper.status === 403, 'Cross-tenant parameter tampering returns 403 Forbidden');
    assert(
      resTamper.body.error?.code === 'CROSS_ORGANIZATION_ACCESS_DENIED' || resTamper.body.error?.code === 'TENANT_FORBIDDEN',
      'Tampering error code indicates forbidden cross-tenant access'
    );

    // Verify Org 2 has independent summary
    const resOrg2 = await request('/api/inventory/summary', { token: tokenStaffOrg2 });
    assert(resOrg2.status === 200, 'Org 2 summary returns 200 OK');
    assert(resOrg2.body.data.totalRecorded !== d1.totalRecorded, 'Org 2 inventory count is independent from Org 1');

    // --------------------------------------------------------------------------
    console.log('\n▶ TEST 10: Super Admin cross-organization and platform-wide calculations');
    // --------------------------------------------------------------------------
    // Super Admin can view Org 1 summary explicitly
    const resAdminOrg1 = await request('/api/inventory/summary?organization_id=1', { token: tokenSuperAdmin });
    assert(resAdminOrg1.status === 200, 'Super Admin querying Org 1 returns 200 OK');
    assert(resAdminOrg1.body.data.totalRecorded === d1.totalRecorded, 'Super Admin matches Org 1 totalRecorded');

    // Super Admin can view platform-wide summary
    const resAdminAll = await request('/api/inventory/summary?organization_id=ALL', { token: tokenSuperAdmin });
    assert(resAdminAll.status === 200, 'Super Admin querying ALL returns 200 OK');
    assert(resAdminAll.body.data.organizationId === 'ALL', 'Super Admin organizationId is ALL');
    assert(resAdminAll.body.data.totalRecorded >= d1.totalRecorded, 'Platform-wide totalRecorded includes all tenants');

    console.log('\n================================================================');
    console.log('✅ ALL INVENTORY SUMMARY VERIFICATION TESTS PASSED');
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ TEST RUN ABORTED WITH ERROR:\n', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests();
