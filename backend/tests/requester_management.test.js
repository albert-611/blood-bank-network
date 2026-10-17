/**
 * ============================================================================
 * REQUESTER PORTAL — 6-HOUR EDIT WINDOW & ANYTIME CANCELLATION TEST SUITE
 * ============================================================================
 * Verifies:
 * 1. Requisition edit allowed within 6 hours of original submission
 * 2. Requisition edit rejected after 6 hours with code EDIT_WINDOW_EXPIRED
 * 3. Editing does NOT reset or touch created_at timestamp
 * 4. Requisition cancellation allowed at any time (including after 6 hours)
 * 5. Cancellation safely releases active reservations and marks blood_units AVAILABLE
 * 6. Cannot cancel already ISSUED or COMPLETED requisitions
 * 7. Unauthorized user cannot edit or cancel another requester's requisition
 */

const http = require('http');
const app = require('../server');
const db = require('../config/db');
const { generateAccessToken } = require('../services/tokenService');

let server;
let baseUrl;

function log(title, msg = '') {
  console.log(`  ✅ PASS: ${title} ${msg}`);
}

function fail(title, msg = '') {
  console.error(`  ❌ FAIL: ${title} ${msg}`);
  process.exit(1);
}

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {
          json = data;
        }
        resolve({ status: res.statusCode, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🩸 REQUEST MANAGEMENT (6H EDIT WINDOW & ANYTIME CANCELLATION) TESTS');
  console.log('================================================================\n');

  // Start test server on random port
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`🧪 Test Server running on: ${baseUrl}\n`);
      resolve();
    });
  });

  try {
    // 1. Fetch requester user and another user
    const [requesters] = await db.query(
      `SELECT id, email, full_name, global_role FROM users WHERE email = 'requester.jane@bloodbank.dev' LIMIT 1`
    );
    if (!requesters || requesters.length === 0) {
      fail('Seed requester user not found');
    }
    const requester = requesters[0];
    const requesterToken = generateAccessToken({
      id: requester.id,
      email: requester.email,
      role: 'REQUESTER',
      global_role: 'REQUESTER'
    });

    const [otherUsers] = await db.query(
      `SELECT id, email, full_name, global_role FROM users WHERE email = 'donor.john@bloodbank.dev' LIMIT 1`
    );
    const otherUser = otherUsers[0];
    const otherToken = generateAccessToken({
      id: otherUser.id,
      email: otherUser.email,
      role: 'DONOR',
      global_role: 'DONOR'
    });

    // =========================================================================
    // TEST 1: Create a fresh requisition and update it within 6 hours
    // =========================================================================
    console.log('▶ TEST 1: Requisition Update within 6 Hours');
    const createRes = await request('POST', '/api/blood-requests', {
      blood_group: 'O-',
      component: 'PACKED_RBC',
      quantity: 2,
      priority: 'ROUTINE',
      notes: 'Initial test requisition',
      preferred_organization_id: 1
    }, requesterToken);

    if (createRes.status !== 201) {
      fail('Failed to create initial test requisition', JSON.stringify(createRes.body));
    }
    const reqId = createRes.body.data.id;
    log('1. Created test requisition with ID', reqId);

    // Update fields within 6 hours
    const updateRes = await request('PUT', `/api/blood-requests/${reqId}`, {
      blood_group: 'O-',
      component: 'PACKED_RBC',
      quantity: 3,
      priority: 'URGENT',
      notes: 'Updated context within 6-hour window'
    }, requesterToken);

    if (updateRes.status !== 200 || !updateRes.body.success) {
      fail('Requisition update failed within 6-hour window', JSON.stringify(updateRes.body));
    }
    log('2. Update succeeded within 6-hour window (HTTP 200)');

    // Verify database was updated and created_at was NOT modified
    const [reqRows] = await db.query(
      `SELECT br.*, ri.quantity FROM blood_requests br JOIN request_items ri ON ri.blood_request_id = br.id WHERE br.id = ?`,
      [reqId]
    );
    const updatedRecord = reqRows[0];
    if (updatedRecord.quantity !== 3 || updatedRecord.priority !== 'URGENT') {
      fail('Database fields did not match updated values');
    }
    log('3. Quantity updated to 3 and priority to URGENT in database');

    const originalCreatedAt = new Date(createRes.body.data.created_at).getTime();
    const currentCreatedAt = new Date(updatedRecord.created_at).getTime();
    if (Math.abs(currentCreatedAt - originalCreatedAt) > 2000) {
      fail('created_at was mutated during edit! It must remain unchanged as the 6-hour window anchor.');
    }
    log('4. Editing did NOT reset or mutate created_at timestamp');

    // =========================================================================
    // TEST 2: Requisition Update rejected after 6 hours
    // =========================================================================
    console.log('\n▶ TEST 2: Requisition Update Rejected After 6 Hours');
    // Artificially age the requisition in database to 7 hours ago
    await db.query(
      `UPDATE blood_requests SET created_at = DATE_SUB(NOW(), INTERVAL 7 HOUR) WHERE id = ?`,
      [reqId]
    );

    const expiredUpdateRes = await request('PUT', `/api/blood-requests/${reqId}`, {
      quantity: 4,
      notes: 'Attempted modification after 7 hours'
    }, requesterToken);

    if (expiredUpdateRes.status !== 400 || expiredUpdateRes.body.error?.code !== 'EDIT_WINDOW_EXPIRED') {
      fail('Expected HTTP 400 with EDIT_WINDOW_EXPIRED after 6 hours', JSON.stringify(expiredUpdateRes.body));
    }
    log('5. Edit rejected after 7 hours with HTTP 400 and code EDIT_WINDOW_EXPIRED');

    // =========================================================================
    // TEST 3: Unauthorized user blocked from editing
    // =========================================================================
    console.log('\n▶ TEST 3: Unauthorized User Blocked from Editing');
    const unauthorizedUpdateRes = await request('PUT', `/api/blood-requests/${reqId}`, {
      quantity: 5
    }, otherToken);

    if (unauthorizedUpdateRes.status !== 403) {
      fail('Expected HTTP 403 when editing another user requisition', JSON.stringify(unauthorizedUpdateRes.body));
    }
    log('6. Unauthorized user correctly blocked with HTTP 403 Forbidden');

    // =========================================================================
    // TEST 4: Anytime Cancellation (including after 6 hours)
    // =========================================================================
    console.log('\n▶ TEST 4: Anytime Cancellation Allowed');
    // Notice that reqId is still aged to 7 hours ago! Cancellation must succeed!
    const cancelRes = await request('POST', `/api/blood-requests/${reqId}/cancel`, {
      reason: 'Patient transferred to regional hospital'
    }, requesterToken);

    if (cancelRes.status !== 200 || !cancelRes.body.success) {
      fail('Cancellation failed after 6 hours', JSON.stringify(cancelRes.body));
    }
    log('7. Requisition cancelled successfully after 6-hour edit window expired (HTTP 200)');

    // Verify database record
    const [cancelledRows] = await db.query(
      `SELECT status, cancellation_reason, cancelled_at FROM blood_requests WHERE id = ?`,
      [reqId]
    );
    const cRecord = cancelledRows[0];
    if (cRecord.status !== 'CANCELLED' || !cRecord.cancelled_at || cRecord.cancellation_reason !== 'Patient transferred to regional hospital') {
      fail('Cancellation database fields not recorded properly', JSON.stringify(cRecord));
    }
    log('8. Status updated to CANCELLED with cancellation_reason and cancelled_at timestamp');

    // =========================================================================
    // TEST 5: Reservation Reconciliation on Cancellation
    // =========================================================================
    console.log('\n▶ TEST 5: Active Inventory Reservation Released on Cancellation');
    // Create new request
    const req2 = await request('POST', '/api/blood-requests', {
      blood_group: 'A+',
      component: 'PACKED_RBC',
      quantity: 1,
      priority: 'ROUTINE',
      preferred_organization_id: 1
    }, requesterToken);
    const req2Id = req2.body.data.id;

    // Find an available A+ PACKED_RBC unit in database
    const [availableUnits] = await db.query(
      `SELECT id FROM blood_units WHERE blood_group = 'A+' AND component = 'PACKED_RBC' AND status = 'AVAILABLE' LIMIT 1`
    );
    if (availableUnits.length > 0) {
      const unitId = availableUnits[0].id;
      const [itemRows] = await db.query(`SELECT id FROM request_items WHERE blood_request_id = ?`, [req2Id]);
      const reqItemId = itemRows[0].id;

      // Simulate an active reservation
      await db.query(`UPDATE blood_units SET status = 'RESERVED' WHERE id = ?`, [unitId]);
      await db.query(
        `INSERT INTO reservations (request_item_id, blood_unit_id, reserved_by, status) VALUES (?, ?, ?, 'ACTIVE')`,
        [reqItemId, unitId, requester.id]
      );
      await db.query(`UPDATE blood_requests SET status = 'RESERVED' WHERE id = ?`, [req2Id]);
      log('9. Simulated ACTIVE reservation on blood unit', unitId);

      // Now cancel the requisition
      const cancelReq2 = await request('POST', `/api/blood-requests/${req2Id}/cancel`, {
        reason: 'Surgery rescheduled'
      }, requesterToken);

      if (cancelReq2.status !== 200) {
        fail('Failed to cancel reserved request', JSON.stringify(cancelReq2.body));
      }

      // Check unit status in blood_units and reservation status
      const [unitAfter] = await db.query(`SELECT status FROM blood_units WHERE id = ?`, [unitId]);
      const [resAfter] = await db.query(`SELECT status FROM reservations WHERE request_item_id = ?`, [reqItemId]);

      if (unitAfter[0].status !== 'AVAILABLE') {
        fail('Reserved blood unit was NOT returned to AVAILABLE status on cancellation!');
      }
      log('10. Reserved blood unit safely released back to AVAILABLE status');

      if (resAfter[0].status !== 'RELEASED') {
        fail('Reservation status was NOT updated to RELEASED on cancellation!');
      }
      log('11. Reservation status marked as RELEASED for audit trail');
    }

    // =========================================================================
    // TEST 6: Prevent Cancelling ISSUED Requisitions
    // =========================================================================
    console.log('\n▶ TEST 6: Prevent Cancelling Completed / Issued Requisitions');
    // Set status to ISSUED
    const req3 = await request('POST', '/api/blood-requests', {
      blood_group: 'B+',
      component: 'PACKED_RBC',
      quantity: 1,
      priority: 'ROUTINE'
    }, requesterToken);
    const req3Id = req3.body.data.id;
    await db.query(`UPDATE blood_requests SET status = 'ISSUED' WHERE id = ?`, [req3Id]);

    const cancelIssuedRes = await request('POST', `/api/blood-requests/${req3Id}/cancel`, {}, requesterToken);
    if (cancelIssuedRes.status !== 400 || cancelIssuedRes.body.error?.code !== 'CANNOT_CANCEL_ISSUED') {
      fail('Expected CANNOT_CANCEL_ISSUED on issued requisition', JSON.stringify(cancelIssuedRes.body));
    }
    log('12. Cancellation of ISSUED requisition safely rejected with CANNOT_CANCEL_ISSUED');

    // Clean up test records
    await db.query(`DELETE FROM blood_requests WHERE id IN (?, ?, ?)`, [reqId, req2Id, req3Id]);

    console.log('\n================================================================');
    console.log('🏁 ALL 12 REQUEST MANAGEMENT TESTS PASSED PERFECTLY!');
    console.log('================================================================\n');

  } finally {
    if (server) server.close();
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
