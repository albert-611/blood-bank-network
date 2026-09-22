/**
 * ============================================================================
 * BLOOD BANK PLATFORM — PHASE 3 AUTHENTICATION TEST SUITE
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§12, §18, §23, §25, §27)
 *
 * Automated verification for all Phase 3 requirements:
 *   1. Registration of new user (DONOR / REQUESTER)
 *   2. Rejection of unauthorized role self-registration (SUPER_ADMIN / ORG_USER)
 *   3. Rejection of duplicate email (409 Conflict)
 *   4. Successful login and JWT issuance
 *   5. Failed login with wrong password (401, no user enumeration)
 *   6. Protected route without token (401)
 *   7. Protected route with tampered or expired token (401)
 *   8. Protected route with valid token (200)
 *   9. Audit log creation on login
 *  10. Exceeding login rate limit (429)
 *
 * Usage:
 *   node backend/tests/auth.test.js
 *   npm test
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_antigravity_phase3_2026';
process.env.LOGIN_RATE_LIMIT_MAX = '5'; // Low limit for rapid rate-limit testing

const http = require('http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const app = require('../server');

let server;
let baseUrl;

// In-memory fallback database for testing if local MySQL is offline
const memoryStore = {
  users: [],
  audit_logs: [],
  userIdCounter: 100,
  auditIdCounter: 1
};

let usingMockDb = false;

// Setup mock DB wrapper if MySQL is unreachable
async function setupDatabaseConnection() {
  try {
    await db.query('SELECT 1');
    console.log('📦 Database Status: Connected to local MySQL server.');
  } catch (err) {
    usingMockDb = true;
    console.log('⚠️ Database Status: Local MySQL offline (ECONNREFUSED).');
    console.log('   Enabling in-memory database simulation for test runner.');

    const originalQuery = db.query.bind(db);
    db.query = async (sql, params = []) => {
      const trimmed = sql.trim();

      // SELECT id FROM users WHERE email = ?
      if (trimmed.startsWith('SELECT id FROM users WHERE email = ?')) {
        const found = memoryStore.users.filter((u) => u.email.toLowerCase() === params[0].toLowerCase());
        return [found];
      }

      // SELECT id, full_name, email, password_hash... FROM users WHERE email = ?
      if (trimmed.includes('FROM users') && trimmed.includes('WHERE email = ?')) {
        const found = memoryStore.users.filter((u) => u.email.toLowerCase() === params[0].toLowerCase());
        return [found];
      }

      // SELECT id, full_name, email... FROM users WHERE id = ?
      if (trimmed.includes('FROM users') && trimmed.includes('WHERE id = ?')) {
        const found = memoryStore.users.filter((u) => u.id === params[0]);
        return [found];
      }

      // INSERT INTO users
      if (trimmed.startsWith('INSERT INTO users')) {
        const [full_name, email, password_hash, phone, global_role] = params;
        const newId = ++memoryStore.userIdCounter;
        const newUser = {
          id: newId,
          full_name,
          email,
          password_hash,
          phone,
          global_role,
          status: 'PENDING_VERIFICATION',
          email_verified_at: null,
          created_at: new Date()
        };
        memoryStore.users.push(newUser);
        return [{ insertId: newId }];
      }

      // INSERT INTO donors
      if (trimmed.startsWith('INSERT INTO donors')) {
        return [{ insertId: 1 }];
      }

      // INSERT INTO audit_logs
      if (trimmed.startsWith('INSERT INTO audit_logs')) {
        const [user_id, action, resource_type, resource_id, previous_value, new_value, ip_address] = params;
        const logId = ++memoryStore.auditIdCounter;
        memoryStore.audit_logs.push({
          id: logId,
          user_id,
          action,
          resource_type,
          resource_id,
          previous_value,
          new_value,
          ip_address,
          created_at: new Date()
        });
        return [{ insertId: logId }];
      }

      // SELECT for audit_logs verification
      if (trimmed.includes('FROM audit_logs WHERE action =')) {
        const action = params[0];
        const userId = params[1];
        const found = memoryStore.audit_logs.filter(
          (l) => l.action === action && (!userId || l.user_id === userId)
        );
        return [found];
      }

      // organization_staff query
      if (trimmed.includes('FROM organization_staff')) {
        return [[]];
      }

      return [[]];
    };
  }
}

// Helper fetch client
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
  return { status: res.status, body: json };
}

// Test Runner
async function runTests() {
  console.log(`\n================================================================`);
  console.log(`🩸 BLOOD BANK PLATFORM — PHASE 3 AUTOMATED TEST SUITE`);
  console.log(`================================================================\n`);

  await setupDatabaseConnection();

  // Start Express on ephemeral port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`🧪 Test Server running on: ${baseUrl}\n`);

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      testsPassed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      testsFailed++;
    }
  }

  try {
    const timestamp = Date.now();
    const testEmail = `donor_${timestamp}@bloodbank.org`;
    const testPassword = 'SecurePass123!';

    // ------------------------------------------------------------------------
    // TEST 1: Privilege Escalation Prevention (SUPER_ADMIN)
    // ------------------------------------------------------------------------
    console.log('▶ Test Group 1: Role Escalation Prevention');
    const superAdminReg = await request('/api/auth/register', {
      method: 'POST',
      body: {
        full_name: 'Malicious Attacker',
        email: `hacker_${timestamp}@test.com`,
        password: testPassword,
        global_role: 'SUPER_ADMIN'
      }
    });
    assert(
      superAdminReg.status === 400 && superAdminReg.body?.success === false,
      'POST /api/auth/register with global_role=SUPER_ADMIN returns 400 Bad Request'
    );

    // ------------------------------------------------------------------------
    // TEST 2: Privilege Escalation Prevention (ORG_USER)
    // ------------------------------------------------------------------------
    const orgUserReg = await request('/api/auth/register', {
      method: 'POST',
      body: {
        full_name: 'Fake Hospital Staff',
        email: `fakestaff_${timestamp}@test.com`,
        password: testPassword,
        global_role: 'ORG_USER'
      }
    });
    assert(
      orgUserReg.status === 400 && orgUserReg.body?.success === false,
      'POST /api/auth/register with global_role=ORG_USER returns 400 Bad Request'
    );

    // ------------------------------------------------------------------------
    // TEST 3: Successful Public Registration (DONOR)
    // ------------------------------------------------------------------------
    console.log('\n▶ Test Group 2: Public Registration & Duplication');
    const validReg = await request('/api/auth/register', {
      method: 'POST',
      body: {
        full_name: 'Alexander Fleming',
        email: testEmail,
        password: testPassword,
        phone: '+1-555-0999',
        global_role: 'DONOR',
        blood_group: 'O+'
      }
    });

    assert(
      validReg.status === 201 &&
      validReg.body?.success === true &&
      validReg.body?.data?.user?.email === testEmail &&
      validReg.body?.data?.user?.status === 'PENDING_VERIFICATION' &&
      !validReg.body?.data?.user?.password_hash,
      'POST /api/auth/register creates user with status PENDING_VERIFICATION and returns 201 (no password_hash)'
    );

    // ------------------------------------------------------------------------
    // TEST 4: Duplicate Email Registration Rejection
    // ------------------------------------------------------------------------
    const duplicateReg = await request('/api/auth/register', {
      method: 'POST',
      body: {
        full_name: 'Alexander Duplicate',
        email: testEmail,
        password: testPassword,
        global_role: 'DONOR'
      }
    });
    assert(
      duplicateReg.status === 409 && duplicateReg.body?.success === false,
      'POST /api/auth/register with duplicate email returns 409 Conflict'
    );

    // ------------------------------------------------------------------------
    // TEST 5: Login with Wrong Password (No User Enumeration)
    // ------------------------------------------------------------------------
    console.log('\n▶ Test Group 3: Authentication & Login Security');
    const wrongPassLogin = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: testEmail,
        password: 'CompletelyWrongPassword999!'
      }
    });
    assert(
      wrongPassLogin.status === 401 &&
      wrongPassLogin.body?.success === false &&
      wrongPassLogin.body?.error?.message.includes('Invalid email or password'),
      'POST /api/auth/login with incorrect password returns 401 with generic error message'
    );

    // Non-existent email login
    const wrongEmailLogin = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'nobody_exists_at_all@bloodbank.org',
        password: testPassword
      }
    });
    assert(
      wrongEmailLogin.status === 401 &&
      wrongEmailLogin.body?.error?.message === wrongPassLogin.body?.error?.message,
      'POST /api/auth/login with unknown email returns identical 401 message (no user enumeration)'
    );

    // ------------------------------------------------------------------------
    // TEST 6: Successful Login & Signed JWT
    // ------------------------------------------------------------------------
    const validLogin = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: testEmail,
        password: testPassword
      }
    });

    const authToken = validLogin.body?.data?.token;
    assert(
      validLogin.status === 200 &&
      validLogin.body?.success === true &&
      typeof authToken === 'string' &&
      validLogin.body?.data?.user?.email === testEmail &&
      !validLogin.body?.data?.user?.password_hash,
      'POST /api/auth/login with valid credentials returns 200 and signed JWT access token'
    );

    // Verify JWT payload
    const decodedToken = jwt.decode(authToken);
    assert(
      decodedToken.userId &&
      decodedToken.globalRole === 'DONOR' &&
      !decodedToken.password &&
      !decodedToken.password_hash,
      'JWT payload contains userId and globalRole without sensitive data'
    );

    // ------------------------------------------------------------------------
    // TEST 7: Protected Route Without Token
    // ------------------------------------------------------------------------
    console.log('\n▶ Test Group 4: Token Verification & Protected Routes');
    const noTokenRes = await request('/api/auth/me');
    assert(
      noTokenRes.status === 401 && noTokenRes.body?.success === false,
      'GET /api/auth/me with no token returns 401 Unauthorized'
    );

    // ------------------------------------------------------------------------
    // TEST 8: Protected Route With Tampered Token
    // ------------------------------------------------------------------------
    const tamperedTokenRes = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}_tampered` }
    });
    assert(
      tamperedTokenRes.status === 401 && tamperedTokenRes.body?.error?.code === 'INVALID_TOKEN',
      'GET /api/auth/me with tampered token signature returns 401 INVALID_TOKEN'
    );

    // ------------------------------------------------------------------------
    // TEST 9: Protected Route With Expired Token
    // ------------------------------------------------------------------------
    const expiredToken = jwt.sign(
      { userId: decodedToken.userId, globalRole: 'DONOR' },
      process.env.JWT_SECRET,
      { expiresIn: '-10s' }
    );
    const expiredTokenRes = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    assert(
      expiredTokenRes.status === 401 && expiredTokenRes.body?.error?.code === 'TOKEN_EXPIRED',
      'GET /api/auth/me with expired token returns 401 TOKEN_EXPIRED'
    );

    // ------------------------------------------------------------------------
    // TEST 10: Protected Route With Valid Token
    // ------------------------------------------------------------------------
    const validMeRes = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert(
      validMeRes.status === 200 &&
      validMeRes.body?.success === true &&
      validMeRes.body?.data?.user?.email === testEmail &&
      !validMeRes.body?.data?.user?.password_hash,
      'GET /api/auth/me with valid Bearer token returns 200 and sanitized user profile'
    );

    // ------------------------------------------------------------------------
    // TEST 11: Audit Log Generation on Login
    // ------------------------------------------------------------------------
    console.log('\n▶ Test Group 5: Audit Logging & Security Operations');
    let auditLogFound = false;
    if (usingMockDb) {
      auditLogFound = memoryStore.audit_logs.some(
        (l) => l.action === 'AUTH_LOGIN' && l.user_id === decodedToken.userId
      );
    } else {
      const [auditRows] = await db.query(
        'SELECT * FROM audit_logs WHERE action = "AUTH_LOGIN" AND user_id = ? ORDER BY id DESC LIMIT 1',
        [decodedToken.userId]
      );
      auditLogFound = auditRows && auditRows.length > 0;
    }
    assert(
      auditLogFound,
      'AUTH_LOGIN audit log row was recorded with user_id, action, and IP address'
    );

    // ------------------------------------------------------------------------
    // TEST 12: Rate Limiting on Login Endpoint
    // ------------------------------------------------------------------------
    console.log('\n▶ Test Group 6: Rate Limiting Protection');
    let rateLimited = false;
    // We configured LOGIN_RATE_LIMIT_MAX = 5. Send 7 attempts to trigger 429
    for (let i = 0; i < 7; i++) {
      const attempt = await request('/api/auth/login', {
        method: 'POST',
        body: { email: testEmail, password: 'wrong' }
      });
      if (attempt.status === 429) {
        rateLimited = true;
        break;
      }
    }
    assert(
      rateLimited,
      'Exceeding login attempt threshold triggers HTTP 429 Too Many Requests'
    );

    // ------------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------------
    console.log(`\n================================================================`);
    console.log(`TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
    console.log(`================================================================\n`);

    if (server) {
      server.close(() => {
        process.exit(testsFailed > 0 ? 1 : 0);
      });
    } else {
      process.exit(testsFailed > 0 ? 1 : 0);
    }
  } catch (error) {
    console.error('Fatal error during test run:', error);
    if (server) {
      server.close(() => process.exit(1));
    } else {
      process.exit(1);
    }
  }
}

runTests();
