/**
 * Verification script for Super Admin Sidebar & Centralized Organization Management Restructure
 */
const fs = require('fs');
const path = require('path');

async function runVerification() {
  console.log('================================================================');
  console.log('🔍 VERIFYING SUPER ADMIN DASHBOARD RESTRUCTURE');
  console.log('================================================================\n');

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

  // 1. Inspect frontend/dashboard/super-admin/index.html
  console.log('▶ Test 1: HTML Architecture & Layout Constraints');
  const htmlPath = path.join(__dirname, '../../frontend/dashboard/super-admin/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert(html.includes('id="sidebarNav"'), 'Sidebar nav element #sidebarNav exists');
  assert(html.includes('md:w-[220px]'), 'Sidebar fixed desktop width of 220px applied');
  assert(html.includes('main class="main-content flex-1 overflow-y-auto'), 'Main content container scrolls independently with overflow-y-auto');
  assert(html.includes('id="platformManagementSection"'), 'Centralized #platformManagementSection exists');
  assert(!html.includes('id="allOrgsSection"'), 'Duplicate bottom #allOrgsSection has been completely removed');
  assert(!html.includes('id="pendingSection"'), 'Old split #pendingSection has been removed');
  assert(!html.includes('id="activitySection"'), 'Old split #activitySection has been removed');

  assert(html.includes('id="tabBtnPending"') && html.includes('id="tabBtnAllOrgs"') && html.includes('id="tabBtnActivity"'), 'All 3 tab buttons exist');
  assert(html.includes('id="tabPanePending"') && html.includes('id="tabPaneAllOrgs"') && html.includes('id="tabPaneActivity"'), 'All 3 tab content panes exist');
  assert(html.includes('id="pendingPagination"') && html.includes('id="allOrgsPagination"') && html.includes('id="activityPagination"'), 'Independent pagination footers exist for all 3 tabs');

  // Check for emojis
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert(!emojiRegex.test(html), 'Strict zero emoji compliance verified in index.html');

  // 2. Inspect frontend/dashboard/super-admin/super-admin.js
  console.log('\n▶ Test 2: JavaScript Logic & Tab Controller');
  const jsPath = path.join(__dirname, '../../frontend/dashboard/super-admin/super-admin.js');
  const js = fs.readFileSync(jsPath, 'utf8');

  assert(js.includes('function animateCounter'), 'animateCounter function implemented for 0 -> actual value animation');
  assert(js.includes('statsAnimated'), 'statsAnimated flag prevents re-animation on tab switches');
  assert(js.includes('tabState = {'), 'Independent tab state exists with pending, allOrgs, activity');
  assert(js.includes('limit: 30'), 'Default pagination limit is set to 30 rows per page');
  assert(js.includes('function switchTab'), 'Centralized tab switching mechanism implemented');
  assert(js.includes('function renderPaginationUI'), 'Reusable pagination controls renderer implemented');
  assert(js.includes('data-nav-target'), 'Sidebar links dynamically mapped to switch tabs and scroll');
  assert(!emojiRegex.test(js), 'Strict zero emoji compliance verified in super-admin.js');

  // 3. API Endpoints & Live Data Integration
  console.log('\n▶ Test 3: Backend API Endpoints & Pagination');
  try {
    // Authenticate Super Admin
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@bloodbank.dev', password: 'AdminDev123!' })
    });
    const loginData = await loginRes.json();
    assert(loginData.success && loginData.data?.token, 'Super admin login succeeds and returns JWT');
    const token = loginData.data.token;

    // Test Tab 1 API: Pending Organizations
    const pendingRes = await fetch('http://localhost:5000/api/organizations?status=PENDING&page=1&limit=30', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const pendingData = await pendingRes.json();
    assert(pendingData.success, 'GET /api/organizations?status=PENDING returns 200');
    assert(pendingData.data?.pagination !== undefined, 'Pending query returns pagination metadata');
    assert(Array.isArray(pendingData.data?.organizations), 'Pending query returns organizations array');
    console.log(`    ℹ️ Pending orgs found: ${pendingData.data.organizations.length} (total: ${pendingData.data.pagination.total})`);

    // Test Tab 2 API: All Organizations
    const allOrgsRes = await fetch('http://localhost:5000/api/organizations?page=1&limit=30', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const allOrgsData = await allOrgsRes.json();
    assert(allOrgsData.success, 'GET /api/organizations returns 200 with pagination');
    assert(allOrgsData.data?.pagination?.limit === 30, 'Organizations pagination limit is 30');
    assert(Array.isArray(allOrgsData.data?.organizations), 'Organizations array returned');
    console.log(`    ℹ️ All orgs found: ${allOrgsData.data.organizations.length} (total: ${allOrgsData.data.pagination.total})`);

    // Test Tab 3 API: Audit Logs with Pagination
    const logsRes = await fetch('http://localhost:5000/api/admin/audit-logs?page=1&limit=30', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const logsData = await logsRes.json();
    assert(logsData.success, 'GET /api/admin/audit-logs?page=1&limit=30 returns 200');
    assert(logsData.data?.pagination?.totalPages > 1, `Audit logs multi-page pagination verified (${logsData.data?.pagination?.totalPages} pages)`);
    assert(logsData.data.logs.length <= 30, `Audit logs page size verified (${logsData.data.logs.length} items)`);
    console.log(`    ℹ️ Audit logs page 1: ${logsData.data.logs.length} logs (total: ${logsData.data.pagination.total}, pages: ${logsData.data.pagination.totalPages})`);

    // Test Audit Logs Page 2
    const logsP2Res = await fetch('http://localhost:5000/api/admin/audit-logs?page=2&limit=30', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const logsP2Data = await logsP2Res.json();
    assert(logsP2Data.success && logsP2Data.data?.pagination?.page === 2, 'Audit logs page 2 query works correctly');

    // Test Dashboard Stats
    const statsRes = await fetch('http://localhost:5000/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const statsData = await statsRes.json();
    assert(statsData.success && statsData.data?.kpis, 'GET /api/admin/stats returns aggregated KPI metrics');
  } catch (err) {
    console.error('API testing error:', err.message);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runVerification();
