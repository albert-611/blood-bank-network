/**
 * ============================================================================
 * COMPREHENSIVE REQUESTER DASHBOARD VERIFICATION SCRIPT
 * ============================================================================
 * Tests the complete requester workflow end-to-end:
 * 1. Static asset integrity (/dashboard/requester/index.html, requester.js)
 * 2. Requester authentication & JWT acquisition (Jane Foster)
 * 3. Dashboard summary metrics API (/api/blood-requests/summary)
 * 4. Blood availability public search (/api/public/blood-availability)
 * 5. Facility directory search for combobox (/api/organizations/facilities)
 * 6. Blood requisition submission with registered treatment facility
 * 7. 6-Hour editing window update validation
 * 8. Requisition anytime cancellation with status audit
 * 9. Notification retrieval and mark-all-read API
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';

async function fetchJson(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function fetchText(endpoint) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url);
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

async function run() {
  console.log('\n================================================================');
  console.log('🩸 COMPREHENSIVE REQUESTER DASHBOARD END-TO-END VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function check(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // --- 1. HTML & Static Asset Tests ---
  console.log('▶ STEP 1: Static Assets & Layout Markup');
  const htmlRes = await fetchText('/dashboard/requester/index.html');
  check(htmlRes.status === 200, 'Requester dashboard HTML served with HTTP 200');
  check(htmlRes.text.includes('Requester Dashboard — BloodLink Platform'), 'HTML contains correct page title');
  check(htmlRes.text.includes('id="portalSidebar"'), 'Sidebar navigation container is present');
  check(htmlRes.text.includes('id="mobileSidebarToggleBtn"'), 'Mobile hamburger drawer button is present');
  check(htmlRes.text.includes('id="view-overview"'), 'View 1: Dashboard Overview section is present');
  check(htmlRes.text.includes('id="view-find-blood"'), 'View 2: Find Blood discovery section is present');
  check(htmlRes.text.includes('id="view-create-request"'), 'View 3: Create Blood Request form section is present');
  check(htmlRes.text.includes('id="view-my-requests"'), 'View 4: My Requests table & tabs section is present');
  check(htmlRes.text.includes('id="view-active-progress"'), 'View 5: Active Request Progress section is present');
  check(htmlRes.text.includes('id="view-notifications"'), 'View 6: Notifications section is present');
  check(htmlRes.text.includes('id="view-profile"'), 'View 7: Profile & Settings section is present');
  check(htmlRes.text.includes('id="requestDetailsModal"'), 'Request Details modal is present');
  check(htmlRes.text.includes('id="editRequestModal"'), '6-Hour Edit modal is present');
  check(htmlRes.text.includes('id="cancelRequestModal"'), 'Cancellation confirmation modal is present');

  const jsRes = await fetchText('/dashboard/requester/requester.js');
  check(jsRes.status === 200, 'Requester client JS served with HTTP 200');
  check(jsRes.text.includes('SIX_HOURS_MS'), 'Client JS enforces 6-hour edit window constant');
  check(jsRes.text.includes('handleCreateRequestSubmit'), 'Client JS contains request submission handler');
  check(jsRes.text.includes('getRemainingEditTime'), 'Client JS contains real-time countdown calculator');

  // --- 2. Requester Authentication ---
  console.log('\n▶ STEP 2: Requester Authentication & Authorization');
  const loginRes = await fetchJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'requester.jane@bloodbank.dev',
      password: 'UserDev123!'
    })
  });
  check(loginRes.status === 200, 'Jane Foster logs in with HTTP 200');
  check(Boolean(loginRes.data?.data?.token), 'JWT token returned in login response');
  const token = loginRes.data?.data?.token;
  const user = loginRes.data?.data?.user;
  const userRole = user?.globalRole || user?.role;
  check(userRole === 'REQUESTER', 'User role is confirmed as REQUESTER');

  const authHeaders = { 'Authorization': `Bearer ${token}` };

  // --- 3. Summary Metrics API ---
  console.log('\n▶ STEP 3: Requisition Summary Metrics API');
  const summaryRes = await fetchJson('/api/blood-requests/summary', {
    method: 'GET',
    headers: authHeaders
  });
  check(summaryRes.status === 200, 'GET /api/blood-requests/summary returns HTTP 200');
  check(summaryRes.data?.success === true, 'Summary response success is true');
  check(typeof summaryRes.data?.data?.total === 'number', 'Summary data contains numeric total count');
  check(typeof summaryRes.data?.data?.active === 'number', 'Summary data contains numeric active count');
  check(typeof summaryRes.data?.data?.readyForCollection === 'number', 'Summary data contains readyForCollection count');
  check(typeof summaryRes.data?.data?.completed === 'number', 'Summary data contains completed count');

  // --- 4. Public Blood Availability Search ---
  console.log('\n▶ STEP 4: Regional Blood Availability Discovery');
  const searchRes = await fetchJson('/api/public/blood-availability?blood_group=O%2B', {
    method: 'GET'
  });
  check(searchRes.status === 200, 'GET /api/public/blood-availability returns HTTP 200');
  check(Array.isArray(searchRes.data?.data?.results), 'Availability returns array of stock results');
  if (searchRes.data?.data?.results?.length > 0) {
    const item = searchRes.data.data.results[0];
    check(Boolean(item.organization?.name), `Stock result has facility: ${item.organization?.name}`);
    check(item.bloodGroup === 'O+', 'Stock result matches queried blood group O+');
  }

  // --- 5. Facilities Directory Search (Combobox) ---
  console.log('\n▶ STEP 5: Facility Combobox Directory API');
  const facRes = await fetchJson('/api/organizations/facilities?search=City', {
    method: 'GET'
  });
  check(facRes.status === 200, 'GET /api/organizations/facilities returns HTTP 200');
  check(Array.isArray(facRes.data?.data), 'Facilities returns array of registered hospitals and clinics');
  check(facRes.data?.data?.some(f => f.type === 'HOSPITAL'), 'Results include registered hospital');

  // --- 6. Requisition Creation with Treatment Facility ---
  console.log('\n▶ STEP 6: Blood Requisition Creation');
  const createPayload = {
    blood_group: 'A+',
    component: 'PACKED_RBC',
    quantity: 2,
    priority: 'URGENT',
    notes: '[E2E Test] Patient preparing for urgent orthopedic surgery',
    preferred_organization_id: 1 // City General Hospital
  };

  const createRes = await fetchJson('/api/blood-requests', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(createPayload)
  });
  check(createRes.status === 201, 'Blood requisition created with HTTP 201');
  const newReqId = createRes.data?.data?.id || createRes.data?.data?.request?.id;
  check(Boolean(newReqId), `Created requisition assigned ID: #${newReqId}`);

  // --- 7. 6-Hour Editing Window Test ---
  console.log('\n▶ STEP 7: 6-Hour Editing Window Validation');
  const editRes = await fetchJson(`/api/blood-requests/${newReqId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      blood_group: 'A+',
      component: 'PACKED_RBC',
      quantity: 3,
      priority: 'CRITICAL',
      notes: '[E2E Test Updated] Quantity escalated to 3 units'
    })
  });
  check(editRes.status === 200, 'Requisition updated within 6-hour edit window (HTTP 200)');
  check(editRes.data?.data?.quantity === 3, 'Updated quantity successfully verified as 3');
  check(editRes.data?.data?.priority === 'CRITICAL', 'Updated priority successfully verified as CRITICAL');

  // --- 8. Requisition Anytime Cancellation ---
  console.log('\n▶ STEP 8: Requisition Cancellation Safeguards');
  const cancelRes = await fetchJson(`/api/blood-requests/${newReqId}/cancel`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ reason: 'Surgery postponed by clinical team' })
  });
  check(cancelRes.status === 200, 'Requisition cancelled successfully (HTTP 200)');
  check(cancelRes.data?.data?.status === 'CANCELLED', 'Requisition status updated to CANCELLED in database');
  check(cancelRes.data?.data?.cancellation_reason === 'Surgery postponed by clinical team', 'Cancellation reason audit persisted');

  // --- 9. Notification Center API ---
  console.log('\n▶ STEP 9: Notification Center API');
  const notifRes = await fetchJson('/api/notifications', {
    method: 'GET',
    headers: authHeaders
  });
  check(notifRes.status === 200, 'GET /api/notifications returns HTTP 200');
  check(Array.isArray(notifRes.data?.data?.notifications), 'Notifications returns list of user alerts');
  check(typeof notifRes.data?.data?.unreadCount === 'number', 'Unread count is returned');

  const readAllRes = await fetchJson('/api/notifications/read-all', {
    method: 'PATCH',
    headers: authHeaders
  });
  check(readAllRes.status === 200, 'PATCH /api/notifications/read-all returns HTTP 200');

  // --- Summary ---
  console.log('\n================================================================');
  console.log(`🏁 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
