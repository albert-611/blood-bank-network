/**
 * Comprehensive Restart & Authentication Verification Suite
 * Verifies backend cold starts, multiple restarts, login, registration, and org registration.
 */

const cp = require('child_process');
const http = require('http');
const path = require('path');

function httpRequest({ method, path: urlPath, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Accept': 'application/json',
      ...headers
    };
    if (postData) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: urlPath,
        method,
        headers: reqHeaders
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function waitForServer(maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await httpRequest({ method: 'GET', path: '/api/health' });
      if (res.status === 200) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

async function runCycle(cycleNumber) {
  console.log(`\n======================================================`);
  console.log(`🔄 RESTART CYCLE ${cycleNumber}: Starting backend via npm start...`);
  console.log(`======================================================`);

  const serverProcess = cp.spawn('node', ['backend/server.js'], {
    cwd: path.resolve(__dirname, '../../'),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[Server STDOUT] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[Server STDERR] ${d}`));

  const isUp = await waitForServer();
  if (!isUp) {
    serverProcess.kill();
    throw new Error(`Server failed to become healthy on cycle ${cycleNumber}`);
  }

  console.log(`\n✅ Server is UP and healthy on http://localhost:5000`);

  // Test 1: Health DB Check
  const dbHealth = await httpRequest({ method: 'GET', path: '/api/health/db' });
  console.log(`🩺 DB Health Check: Status ${dbHealth.status}, State: ${dbHealth.body?.db}`);
  if (dbHealth.status !== 200 || dbHealth.body?.db !== 'connected') {
    serverProcess.kill();
    throw new Error(`DB health check failed on cycle ${cycleNumber}`);
  }

  // Test 2: Login Check
  console.log(`🔐 Testing Login (admin@bloodbank.dev)...`);
  const loginRes = await httpRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { email: 'admin@bloodbank.dev', password: 'AdminDev123!' }
  });
  console.log(`   Login Status: ${loginRes.status}`);
  console.log(`   Success: ${loginRes.body?.success}`);
  console.log(`   User Role: ${loginRes.body?.data?.user?.globalRole}`);
  console.log(`   Token Present: ${Boolean(loginRes.body?.data?.token)}`);

  if (loginRes.status !== 200 || !loginRes.body?.data?.token) {
    serverProcess.kill();
    throw new Error(`Login failed on cycle ${cycleNumber}: ${JSON.stringify(loginRes.body)}`);
  }

  // Test 3 (on cycle 2): Test Registration & Org Registration
  if (cycleNumber === 2) {
    const ts = Date.now();
    console.log(`📝 Testing Normal Registration (Donor)...`);
    const regRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        full_name: 'Cycle Two Donor ' + ts,
        email: `cycle2_donor_${ts}@example.com`,
        password: 'Password123!',
        global_role: 'DONOR',
        blood_group: 'A+'
      }
    });
    console.log(`   Registration Status: ${regRes.status}`);
    console.log(`   Success: ${regRes.body?.success}`);
    console.log(`   User ID: ${regRes.body?.data?.user?.id}`);

    if (regRes.status !== 201) {
      serverProcess.kill();
      throw new Error(`Registration failed: ${JSON.stringify(regRes.body)}`);
    }

    console.log(`🏥 Testing Organization Registration...`);
    const orgRes = await httpRequest({
      method: 'POST',
      path: '/api/organizations/register',
      body: {
        organization: {
          name: 'City Care Hospital ' + ts,
          type: 'HOSPITAL',
          email: `cch_${ts}@carehospital.org`,
          phone: '+1-555-0155',
          address: '789 Care Ave',
          city: 'Careville',
          country: 'USA',
          license_number: `LIC-HOSP-${ts}`
        },
        admin: {
          name: 'Dr. Gregory House ' + ts,
          email: `drhouse_${ts}@carehospital.org`,
          password: 'Password123!',
          confirm_password: 'Password123!',
          phone: '+1-555-0156'
        }
      }
    });
    console.log(`   Org Registration Status: ${orgRes.status}`);
    console.log(`   Success: ${orgRes.body?.success}`);

    if (orgRes.status !== 201) {
      serverProcess.kill();
      throw new Error(`Org registration failed: ${JSON.stringify(orgRes.body)}`);
    }
  }

  // Clean shutdown
  console.log(`🛑 Stopping backend server...`);
  serverProcess.kill();
  await new Promise((r) => setTimeout(r, 1500));
  console.log(`✅ Backend server process cleanly stopped.\n`);
}

async function runAll() {
  try {
    for (let c = 1; c <= 3; c++) {
      await runCycle(c);
    }
    console.log(`\n🎉 ALL 3 RESTART CYCLES COMPLETED SUCCESSFULLY WITH 100% PASS RATE!`);
  } catch (err) {
    console.error(`\n❌ VERIFICATION TEST FAILED:`, err.message);
    process.exit(1);
  }
}

runAll();
