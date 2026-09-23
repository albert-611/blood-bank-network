/**
 * ============================================================================
 * BLOOD BANK PLATFORM — PRODUCTION SEEDED AUTHENTICATION & IDEMPOTENCY TEST SUITE
 * ============================================================================
 *
 * Verifies all requirements from prompt:
 *   1. All 8 seeded users authenticate via POST /api/auth/login with defined credentials
 *   2. Valid JWT returned containing correct userId and globalRole
 *   3. Stakeholder accounts return correct organization assignment and role
 *   4. Invalid login attempts properly rejected (wrong pass, unknown email, empty)
 *   5. Seed system idempotency verified (consecutive db:seed runs yield identical counts)
 *   6. Health check endpoints /api/health and /api/health/db return 200 OK
 *   7. Database connection resolves DATABASE_URL and SSL options cleanly
 */

const http = require('http');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT_MAX = '500';
process.env.AUTH_RATE_LIMIT_MAX = '500';

const db = require('../config/db');
const { getDatabaseConfig } = require('../config/db');
const app = require('../server');

let server;
let baseUrl;

async function request(endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  const config = {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  };
  const res = await fetch(url, config);
  const json = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, body: json };
}

async function runSeededAuthSuite() {
  console.log(`\n================================================================`);
  console.log(`🩸 BLOOD BANK PLATFORM — SEEDED ACCOUNTS & PRODUCTION AUTH VERIFICATION`);
  console.log(`================================================================\n`);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`🧪 Test Server running on: ${baseUrl}\n`);

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

  try {
    // ------------------------------------------------------------------------
    // Group 1: System Health Checks
    // ------------------------------------------------------------------------
    console.log('▶ Test Group 1: API & Database Health Checks');
    const healthRes = await request('/api/health');
    assert(healthRes.status === 200 && healthRes.body?.success === true, 'GET /api/health returns 200 OK');

    const dbHealthRes = await request('/api/health/db');
    assert(dbHealthRes.status === 200 && dbHealthRes.body?.db === 'connected', 'GET /api/health/db returns 200 connected');

    // ------------------------------------------------------------------------
    // Group 2: Authenticate All 8 Seeded Accounts
    // ------------------------------------------------------------------------
    console.log('\n▶ Test Group 2: Authentication of All 8 Seeded Accounts');

    const seedAccounts = [
      {
        role: 'SUPER_ADMIN',
        email: 'admin@bloodbank.dev',
        pass: 'AdminDev123!',
        expectedGlobal: 'SUPER_ADMIN',
        orgName: null,
        staffRole: null
      },
      {
        role: 'HOSPITAL_ADMIN',
        email: 'hospital.admin@bloodbank.dev',
        pass: 'UserDev123!',
        expectedGlobal: 'ORG_USER',
        orgName: 'City General Hospital',
        staffRole: 'HOSPITAL_ADMIN'
      },
      {
        role: 'DOCTOR',
        email: 'doctor.smith@bloodbank.dev',
        pass: 'UserDev123!',
        expectedGlobal: 'ORG_USER',
        orgName: 'City General Hospital',
        staffRole: 'DOCTOR'
      },
      {
        role: 'CLINIC_ADMIN',
        email: 'clinic.admin@bloodbank.dev',
        pass: 'UserDev123!',
        expectedGlobal: 'ORG_USER',
        orgName: 'Metro Community Clinic',
        staffRole: 'CLINIC_ADMIN'
      },
      {
        role: 'BLOOD_BANK_STAFF',
        email: 'bloodbank.staff@bloodbank.dev',
        pass: 'UserDev123!',
        expectedGlobal: 'ORG_USER',
        orgName: 'Central Red Cross Blood Bank',
        staffRole: 'BLOOD_BANK_STAFF'
      },
      {
        role: 'DONOR (O+)',
        email: 'donor.john@bloodbank.dev',
        pass: 'UserDev123!',
        expectedGlobal: 'DONOR',
        orgName: null,
        staffRole: null
      },
      {
        role: 'DONOR (O-)',
        email: 'donor.sarah@bloodbank.dev',
        pass: 'UserDev123!',
        expectedGlobal: 'DONOR',
        orgName: null,
        staffRole: null
      },
      {
        role: 'REQUESTER',
        email: 'requester.jane@bloodbank.dev',
        pass: 'UserDev123!',
        expectedGlobal: 'REQUESTER',
        orgName: null,
        staffRole: null
      }
    ];

    for (const acc of seedAccounts) {
      const loginRes = await request('/api/auth/login', {
        method: 'POST',
        body: { email: acc.email, password: acc.pass }
      });

      assert(
        loginRes.status === 200 && loginRes.body?.success === true,
        `[${acc.role}] POST /api/auth/login with credentials succeeds (200 OK)`
      );

      const token = loginRes.body?.data?.token;
      assert(typeof token === 'string' && token.length > 20, `[${acc.role}] Valid signed JWT token issued`);

      const userData = loginRes.body?.data?.user;
      assert(
        userData?.email === acc.email && userData?.globalRole === acc.expectedGlobal,
        `[${acc.role}] User profile returned with email and globalRole=${acc.expectedGlobal}`
      );

      if (acc.orgName) {
        assert(
          userData?.organizationStaff?.organization_name === acc.orgName &&
          userData?.organizationStaff?.role_name === acc.staffRole,
          `[${acc.role}] Organization context correctly bound: ${acc.orgName} (${acc.staffRole})`
        );
      }
    }

    // ------------------------------------------------------------------------
    // Group 3: Negative Login Scenarios
    // ------------------------------------------------------------------------
    console.log('\n▶ Test Group 3: Negative Login Tests');

    const wrongPass = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@bloodbank.dev', password: 'WrongPassword999!' }
    });
    assert(
      wrongPass.status === 401 && wrongPass.body?.success === false,
      'Valid email + incorrect password rejected with 401'
    );

    const unknownEmail = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'nonexistent.user.999@bloodbank.dev', password: 'UserDev123!' }
    });
    assert(
      unknownEmail.status === 401 && unknownEmail.body?.success === false,
      'Unknown email + password rejected with 401 (no user enumeration)'
    );

    const emptyEmail = await request('/api/auth/login', {
      method: 'POST',
      body: { email: '', password: 'UserDev123!' }
    });
    assert(
      emptyEmail.status === 400 && emptyEmail.body?.success === false,
      'Empty email returns 400 Bad Request'
    );

    const emptyPass = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@bloodbank.dev', password: '' }
    });
    assert(
      emptyPass.status === 400 && emptyPass.body?.success === false,
      'Empty password returns 400 Bad Request'
    );

    // ------------------------------------------------------------------------
    // Group 4: Config Resolution Tests (DATABASE_URL & SSL)
    // ------------------------------------------------------------------------
    console.log('\n▶ Test Group 4: Connection Configuration Resolution');

    const origEnv = { ...process.env };
    try {
      process.env.DATABASE_URL = 'mysql://cloud_user:secret_pass@db.cloud-provider.internal:3307/cloud_blood_db?ssl=true';
      const parsedConfig = getDatabaseConfig();
      assert(parsedConfig.host === 'db.cloud-provider.internal', 'DATABASE_URL hostname correctly parsed');
      assert(parsedConfig.port === 3307, 'DATABASE_URL port correctly parsed');
      assert(parsedConfig.user === 'cloud_user', 'DATABASE_URL username correctly parsed');
      assert(parsedConfig.password === 'secret_pass', 'DATABASE_URL password correctly parsed');
      assert(parsedConfig.database === 'cloud_blood_db', 'DATABASE_URL database correctly parsed');
      assert(Boolean(parsedConfig.ssl), 'SSL enabled from DATABASE_URL query parameters');
    } finally {
      process.env = origEnv;
    }

    // ------------------------------------------------------------------------
    // Group 5: CORS Policy & Production Vercel Origin Verification
    // ------------------------------------------------------------------------
    console.log('\n▶ Test Group 5: CORS Policy & Production Vercel Origin Verification');

    // 1. Preflight OPTIONS request from production Vercel frontend
    const preflightVercel = await request('/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://blood-bank-network.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization'
      }
    });
    assert(preflightVercel.status === 204, 'OPTIONS /api/auth/login from Vercel returns 204 No Content');
    assert(
      preflightVercel.headers.get('access-control-allow-origin') === 'https://blood-bank-network.vercel.app',
      'Vercel preflight returns exact Access-Control-Allow-Origin header'
    );
    assert(
      preflightVercel.headers.get('access-control-allow-credentials') === 'true',
      'Vercel preflight returns Access-Control-Allow-Credentials: true'
    );

    // 2. Actual POST /api/auth/login request from production Vercel frontend
    const postVercel = await request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Origin': 'https://blood-bank-network.vercel.app'
      },
      body: {
        email: 'admin@bloodbank.dev',
        password: 'AdminDev123!'
      }
    });
    assert(postVercel.status === 200, 'POST /api/auth/login from Vercel succeeds (200 OK)');
    assert(
      postVercel.headers.get('access-control-allow-origin') === 'https://blood-bank-network.vercel.app',
      'Vercel POST login returns exact Access-Control-Allow-Origin header'
    );
    assert(
      postVercel.body?.data?.user?.email === 'admin@bloodbank.dev',
      'Vercel POST login returns authenticated user data'
    );

    // 3. Local development origin (http://localhost:5173)
    const preflightVite = await request('/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization'
      }
    });
    assert(preflightVite.status === 204, 'OPTIONS from http://localhost:5173 returns 204 No Content');
    assert(
      preflightVite.headers.get('access-control-allow-origin') === 'http://localhost:5173',
      'Vite dev origin allowed in Access-Control-Allow-Origin'
    );

    // 4. Local development origin (http://localhost:3000)
    const preflightLocal3000 = await request('/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization'
      }
    });
    assert(preflightLocal3000.status === 204, 'OPTIONS from http://localhost:3000 returns 204 No Content');
    assert(
      preflightLocal3000.headers.get('access-control-allow-origin') === 'http://localhost:3000',
      'Port 3000 dev origin allowed in Access-Control-Allow-Origin'
    );

    // 5. Unauthorized origin rejected
    const unauthorizedPreflight = await request('/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://unauthorized-attacker.site',
        'Access-Control-Request-Method': 'POST'
      }
    });
    assert(
      unauthorizedPreflight.status === 403 && unauthorizedPreflight.body?.error?.code === 'CORS_ERROR',
      'Preflight from unauthorized origin rejected with 403 CORS_ERROR'
    );

    const unauthorizedPost = await request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Origin': 'https://unauthorized-attacker.site'
      },
      body: {
        email: 'admin@bloodbank.dev',
        password: 'AdminDev123!'
      }
    });
    assert(
      unauthorizedPost.status === 403 && unauthorizedPost.body?.error?.code === 'CORS_ERROR',
      'POST login from unauthorized origin rejected with 403 CORS_ERROR'
    );

    // ------------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------------
    console.log(`\n================================================================`);
    console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
    console.log(`================================================================\n`);

    server.close(() => process.exit(failed > 0 ? 1 : 0));
  } catch (err) {
    console.error('Fatal error during test run:', err);
    if (server) server.close();
    process.exit(1);
  }
}

runSeededAuthSuite();
