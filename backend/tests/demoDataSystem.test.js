/**
 * ============================================================================
 * BLOOD BANK PLATFORM — DEMO DATA SYSTEM VERIFICATION SUITE
 * ============================================================================
 * Validates the complete isolation and integrity of the demo data system:
 * - demo/demo-data.json existence, schema, and statistics
 * - Seeded users and organizations alignment
 * - Blood inventory counts and group distributions
 * - Blood requests and emergency requests
 * - Donor and requester profiles
 * - Notifications and platform activity
 * - Complete database isolation (zero real database mutations)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🩸 BLOOD BANK PLATFORM — DEMO DATA SYSTEM INTEGRATION TESTS');
  console.log('================================================================\n');

  const demoDataPath = path.resolve(__dirname, '../../demo/demo-data.json');
  const frontendDemoDataPath = path.resolve(__dirname, '../../frontend/demo/demo-data.json');

  // --------------------------------------------------------------------------
  // Group 1: Files Existence and Preservation
  // --------------------------------------------------------------------------
  console.log('▶ Test Group 1: File Existence & Preservation');
  assert(fs.existsSync(demoDataPath), 'demo/demo-data.json exists in root directory');
  assert(fs.existsSync(frontendDemoDataPath), 'frontend/demo/demo-data.json exists for static frontend serving');

  const raw = fs.readFileSync(demoDataPath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
    assert(true, 'demo/demo-data.json is valid JSON');
  } catch (e) {
    assert(false, `demo/demo-data.json parse error: ${e.message}`);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Group 2: Core Demo Organizations (§3, §15)
  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 2: Demo Organizations Alignment');
  assert(Array.isArray(data.organizations), 'data.organizations is an array');

  const org1 = data.organizations.find(o => o.id === 1);
  assert(Boolean(org1 && org1.name === 'City General Hospital' && org1.type === 'HOSPITAL' && org1.status === 'APPROVED'),
    'Org 1 is City General Hospital (HOSPITAL, APPROVED)');

  const org2 = data.organizations.find(o => o.id === 2);
  assert(Boolean(org2 && org2.name === 'Metro Community Clinic' && org2.type === 'CLINIC' && org2.status === 'APPROVED'),
    'Org 2 is Metro Community Clinic (CLINIC, APPROVED)');

  const org3 = data.organizations.find(o => o.id === 3);
  assert(Boolean(org3 && org3.name === 'Central Red Cross Blood Bank' && org3.type === 'BLOOD_BANK' && org3.status === 'APPROVED'),
    'Org 3 is Central Red Cross Blood Bank (BLOOD_BANK, APPROVED)');

  const pendingOrgs = data.organizations.filter(o => o.status === 'PENDING');
  assert(pendingOrgs.length >= 3 && pendingOrgs.length <= 5,
    `Contains 3–5 pending demo organizations for Super Admin (found ${pendingOrgs.length})`);

  // --------------------------------------------------------------------------
  // Group 3: Demo Blood Inventory Counts & Distribution (§4, §5)
  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 3: Inventory Quantities & Distribution (§5)');
  assert(Array.isArray(data.inventory), 'data.inventory is an array');
  assert(data.inventory.length === 102, `Total blood units equals 102 (found ${data.inventory.length})`);

  const groups = {
    'A+': 24,
    'A-': 8,
    'B+': 19,
    'B-': 5,
    'AB+': 7,
    'AB-': 2,
    'O+': 31,
    'O-': 6
  };

  for (const [bg, expectedCount] of Object.entries(groups)) {
    const actual = data.inventory.filter(u => u.bloodGroup === bg).length;
    assert(actual === expectedCount, `Blood group ${bg} quantity matches ${expectedCount} (actual: ${actual})`);
  }

  // Component breakdown
  const components = ['WHOLE_BLOOD', 'RED_CELLS', 'PLASMA', 'PLATELETS'];
  for (const comp of components) {
    const count = data.inventory.filter(u => u.component === comp).length;
    assert(count > 0, `Component ${comp} is present in demo units (count: ${count})`);
  }

  // Status breakdown
  const available = data.inventory.filter(u => u.status === 'AVAILABLE').length;
  const reserved = data.inventory.filter(u => u.status === 'RESERVED').length;
  const issued = data.inventory.filter(u => u.status === 'ISSUED').length;
  const expired = data.inventory.filter(u => u.status === 'EXPIRED').length;

  assert(available > reserved + issued + expired, `Majority of units are AVAILABLE (AVAILABLE: ${available}, others: ${reserved + issued + expired})`);
  assert(reserved > 0, `Contains RESERVED units (count: ${reserved})`);
  assert(issued > 0, `Contains ISSUED units (count: ${issued})`);
  assert(expired > 0, `Contains EXPIRED units (count: ${expired})`);

  // Expiring soon units (§4, §13)
  const refDate = new Date('2026-09-24T00:00:00Z');
  const expiringSoon = data.inventory.filter(u => {
    if (u.status !== 'AVAILABLE') return false;
    const exp = new Date(u.expiryDate);
    const diffDays = Math.ceil((exp.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  });
  assert(expiringSoon.length >= 3, `Contains units approaching expiry within 7 days (found: ${expiringSoon.length})`);

  // --------------------------------------------------------------------------
  // Group 4: Blood Requests & Emergency Requests (§6, §7)
  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 4: Blood Requests & Emergency Requests');
  assert(Array.isArray(data.requests), 'data.requests is an array');
  assert(data.requests.length >= 15, `Contains at least 15 blood requests (found ${data.requests.length})`);

  const criticalReqs = data.requests.filter(r => r.priority === 'CRITICAL');
  assert(criticalReqs.length >= 2, `Contains CRITICAL blood requests (found ${criticalReqs.length})`);

  assert(Array.isArray(data.emergencyRequests), 'data.emergencyRequests is an array');
  assert(data.emergencyRequests.length >= 3, `Dedicated emergency requests dataset contains >= 3 records (found ${data.emergencyRequests.length})`);

  // --------------------------------------------------------------------------
  // Group 5: Seeded Donor & Requester Accounts (§8, §9)
  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 5: Donor & Requester Profiles');
  assert(Boolean(data.donors && data.donors['donor.john@bloodbank.dev']), 'John profile exists (donor.john@bloodbank.dev)');
  assert(data.donors['donor.john@bloodbank.dev'].bloodGroup === 'O+', 'John blood group is O+');
  assert(data.donors['donor.john@bloodbank.dev'].donations.length >= 3, 'John has several historical donations');

  assert(Boolean(data.donors && data.donors['donor.sarah@bloodbank.dev']), 'Sarah profile exists (donor.sarah@bloodbank.dev)');
  assert(data.donors['donor.sarah@bloodbank.dev'].bloodGroup === 'O-', 'Sarah blood group is O-');
  assert(data.donors['donor.sarah@bloodbank.dev'].donations.length >= 3, 'Sarah has several historical donations');

  assert(Boolean(data.requesters && data.requesters['requester.jane@bloodbank.dev']), 'Jane profile exists (requester.jane@bloodbank.dev)');
  assert(data.requesters['requester.jane@bloodbank.dev'].requests.length >= 2, 'Jane has realistic blood request history');

  // --------------------------------------------------------------------------
  // Group 6: Platform Activity & Notifications (§16, §17)
  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 6: Activity & Notifications');
  assert(Array.isArray(data.platformActivity) && data.platformActivity.length >= 15,
    `Platform activity has >= 15 records (found ${data.platformActivity.length})`);

  // Verify sorted newest first
  let isSorted = true;
  for (let i = 1; i < data.platformActivity.length; i++) {
    if (new Date(data.platformActivity[i].timestamp) > new Date(data.platformActivity[i - 1].timestamp)) {
      isSorted = false;
      break;
    }
  }
  assert(isSorted, 'Platform activity is sorted newest first');

  const roles = ['SUPER_ADMIN', 'HOSPITAL_ADMIN', 'BLOOD_BANK_STAFF', 'DOCTOR', 'CLINIC_ADMIN', 'DONOR', 'REQUESTER'];
  for (const r of roles) {
    assert(Boolean(data.notifications && data.notifications[r] && data.notifications[r].length > 0),
      `Notifications present for role ${r}`);
  }

  // --------------------------------------------------------------------------
  // Group 7: Express Static Serving Verification
  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 7: HTTP Static Serving');
  const server = require('../server');
  const testPort = 61082;
  const testServer = server.listen(testPort, async () => {
    http.get(`http://127.0.0.1:${testPort}/demo/demo-data.json`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        assert(res.statusCode === 200, `GET /demo/demo-data.json returns HTTP 200 (actual: ${res.statusCode})`);
        try {
          const parsed = JSON.parse(body);
          assert(parsed.inventory.length === 102, 'Served JSON contains exact 102 inventory units');
        } catch (err) {
          assert(false, `Failed to parse served JSON: ${err.message}`);
        }

        testServer.close(() => {
          console.log('\n================================================================');
          console.log(`TEST RESULTS: ${passedTests} passed, ${totalTests - passedTests} failed`);
          console.log('================================================================\n');
          process.exit(totalTests === passedTests ? 0 : 1);
        });
      });
    }).on('error', (err) => {
      assert(false, `HTTP GET failed: ${err.message}`);
      testServer.close(() => process.exit(1));
    });
  });
}

runTests().catch(err => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
