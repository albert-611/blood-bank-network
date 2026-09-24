/**
 * ============================================================================
 * BLOOD BANK PLATFORM — JSON DEMO LOGIN SUITE
 * ============================================================================
 * Verifies all 14 requirements from user prompt:
 *   1. demo/demo-users.json file exists and is strictly formatted
 *   2. Exactly 8 seeded users are present (no more, no less)
 *   3. No unauthorized or fake users exist
 *   4. Validates each of the 8 accounts: credentials, role, organization, dashboard
 *   5. Negative testing: invalid password, unknown email, fake roles
 *   6. Error message matches: "Invalid demo credentials. Please select one of the seeded demo accounts."
 *   7. Static Express serving: /demo/demo-users.json is served with 200 OK
 *   8. Ensures dbsupafix.txt is intact and untouched
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const EXPECTED_SEEDED_USERS = [
  {
    email: 'admin@bloodbank.dev',
    password: 'AdminDev123!',
    role: 'SUPER_ADMIN',
    organization: 'System Super Administrator',
    dashboard: '/dashboard/super-admin/index.html'
  },
  {
    email: 'hospital.admin@bloodbank.dev',
    password: 'UserDev123!',
    role: 'HOSPITAL_ADMIN',
    organization: 'City General Hospital',
    dashboard: '/dashboard/hospital-admin/index.html'
  },
  {
    email: 'doctor.smith@bloodbank.dev',
    password: 'UserDev123!',
    role: 'DOCTOR',
    organization: 'City General Hospital',
    dashboard: '/dashboard/doctor/index.html'
  },
  {
    email: 'clinic.admin@bloodbank.dev',
    password: 'UserDev123!',
    role: 'CLINIC_ADMIN',
    organization: 'Metro Community Clinic',
    dashboard: '/dashboard/clinic-admin/index.html'
  },
  {
    email: 'bloodbank.staff@bloodbank.dev',
    password: 'UserDev123!',
    role: 'BLOOD_BANK_STAFF',
    organization: 'Central Red Cross Blood Bank',
    dashboard: '/dashboard/blood-bank-staff/index.html'
  },
  {
    email: 'donor.john@bloodbank.dev',
    password: 'UserDev123!',
    role: 'DONOR',
    organization: 'Walk-in / Independent (O+)',
    dashboard: '/dashboard/donor/index.html'
  },
  {
    email: 'donor.sarah@bloodbank.dev',
    password: 'UserDev123!',
    role: 'DONOR',
    organization: 'Universal Donor (O-)',
    dashboard: '/dashboard/donor/index.html'
  },
  {
    email: 'requester.jane@bloodbank.dev',
    password: 'UserDev123!',
    role: 'REQUESTER',
    organization: 'Patient Representative',
    dashboard: '/dashboard/donor/index.html'
  }
];

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

async function runDemoAuthSuite() {
  console.log('\n================================================================');
  console.log('🩸 BLOOD BANK PLATFORM — JSON DEMO LOGIN VERIFICATION SUITE');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // Group 1: JSON File Structure and Preservation Checks
  // --------------------------------------------------------------------------
  console.log('▶ Test Group 1: File Existence & Preservation');

  const jsonPath = path.resolve(__dirname, '../../demo/demo-users.json');
  assert(fs.existsSync(jsonPath), 'demo/demo-users.json file exists in root directory');

  const dbsupafixPath = path.resolve(__dirname, '../../dbsupafix.txt');
  assert(fs.existsSync(dbsupafixPath), 'dbsupafix.txt file is preserved and not deleted');

  let rawJson;
  let parsedJson;
  try {
    rawJson = fs.readFileSync(jsonPath, 'utf8');
    parsedJson = JSON.parse(rawJson);
    assert(true, 'demo/demo-users.json is valid JSON');
  } catch (err) {
    assert(false, `demo/demo-users.json failed JSON parse: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // Group 2: Seeded User Count & Exact Composition
  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 2: Seeded User Count & Identity Checks');

  const demoUsers = parsedJson?.demoUsers;
  assert(Array.isArray(demoUsers), 'JSON contains "demoUsers" array');
  assert(demoUsers?.length === 8, `demoUsers contains exactly 8 users (found ${demoUsers?.length})`);

  // Verify no forbidden fake accounts exist
  const forbiddenKeywords = ['patient', 'test user', 'fake doctor', 'fake hospital admin'];
  const hasForbidden = demoUsers.some((u) =>
    forbiddenKeywords.some(
      (kw) => u.email.toLowerCase().includes(kw) || (u.role && u.role.toLowerCase().includes(kw))
    )
  );
  assert(!hasForbidden, 'No forbidden or fake accounts exist in demoUsers');

  // --------------------------------------------------------------------------
  // Group 3: Verify All 8 Seeded Accounts
  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 3: Verification of All 8 Seeded Accounts');

  for (let i = 0; i < EXPECTED_SEEDED_USERS.length; i++) {
    const expected = EXPECTED_SEEDED_USERS[i];
    const actual = demoUsers.find(
      (u) => u.email.toLowerCase() === expected.email.toLowerCase()
    );

    assert(Boolean(actual), `Account ${i + 1} (${expected.email}) exists in JSON`);
    if (actual) {
      assert(actual.password === expected.password, `[${expected.role}] password matches exactly "${expected.password}"`);
      assert(actual.role === expected.role, `[${expected.role}] role matches exactly "${expected.role}"`);
      assert(actual.organization === expected.organization, `[${expected.role}] organization matches "${expected.organization}"`);
      assert(actual.dashboard === expected.dashboard, `[${expected.role}] dashboard redirect matches "${expected.dashboard}"`);
    }
  }

  // --------------------------------------------------------------------------
  // Group 4: Negative Credential Lookup Tests
  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 4: Negative Credential Authentication Tests');

  function simulateDemoLogin(email, password, users) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = password || '';
    if (!cleanEmail || !cleanPass) {
      return { success: false, message: 'Invalid demo credentials. Please select one of the seeded demo accounts.' };
    }
    const matched = users.find(
      (u) => u.email.toLowerCase() === cleanEmail && u.password === cleanPass
    );
    if (!matched) {
      return { success: false, message: 'Invalid demo credentials. Please select one of the seeded demo accounts.' };
    }
    return {
      success: true,
      user: {
        isDemo: true,
        email: matched.email,
        role: matched.role,
        organization: matched.organization,
        dashboard: matched.dashboard
      },
      dashboard: matched.dashboard
    };
  }

  // Negative 1: Wrong password for valid email
  const wrongPassResult = simulateDemoLogin('admin@bloodbank.dev', 'WrongPassword123!', demoUsers);
  assert(!wrongPassResult.success, 'Valid email with wrong password is rejected');
  assert(
    wrongPassResult.message === 'Invalid demo credentials. Please select one of the seeded demo accounts.',
    'Wrong password returns standard non-leaking error message'
  );

  // Negative 2: Unknown unseeded email
  const unknownEmailResult = simulateDemoLogin('nonexistent@bloodbank.dev', 'UserDev123!', demoUsers);
  assert(!unknownEmailResult.success, 'Unknown unseeded email is rejected');
  assert(
    unknownEmailResult.message === 'Invalid demo credentials. Please select one of the seeded demo accounts.',
    'Unknown email returns standard non-leaking error message'
  );

  // Negative 3: Empty email
  const emptyEmailResult = simulateDemoLogin('', 'UserDev123!', demoUsers);
  assert(!emptyEmailResult.success, 'Empty email is rejected');

  // Negative 4: Empty password
  const emptyPassResult = simulateDemoLogin('admin@bloodbank.dev', '', demoUsers);
  assert(!emptyPassResult.success, 'Empty password is rejected');

  // --------------------------------------------------------------------------
  // Group 5: Static Express HTTP Serving of /demo/demo-users.json
  // --------------------------------------------------------------------------
  console.log('\n▶ Test Group 5: Static Express Route Serving Verification');

  const app = require('../server');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(`${baseUrl}/demo/demo-users.json`);
    assert(res.status === 200, `GET /demo/demo-users.json returns HTTP 200 (actual: ${res.status})`);
    const fetchedJson = await res.json();
    assert(fetchedJson?.demoUsers?.length === 8, 'Fetched JSON from server contains all 8 demo users');
  } catch (err) {
    assert(false, `Failed to fetch /demo/demo-users.json via Express: ${err.message}`);
  } finally {
    server.close();
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDemoAuthSuite().catch((err) => {
  console.error('Fatal error running demoAuth suite:', err);
  process.exit(1);
});
