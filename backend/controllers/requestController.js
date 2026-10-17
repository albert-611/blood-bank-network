/**
 * ============================================================================
 * BLOOD BANK PLATFORM — BLOOD REQUEST CONTROLLER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9.11, §9.12, §18, §25)
 *
 * Implements blood requisition workflows with Preferred Treatment Facility support:
 * - POST /api/blood-requests (Create blood request with registered or manual facility)
 * - GET  /api/blood-requests (List requests scoped by user role and organization)
 * - GET  /api/blood-requests/:id (Fetch single request details with RBAC ownership checks)
 */

const db = require('../config/db');
const { logAuditEvent } = require('../utils/auditLogger');

/**
 * Helper to determine default fulfilling organization (blood bank)
 */
async function getDefaultFulfillingOrganizationId(executor) {
  const [rows] = await executor.query(
    `SELECT id FROM organizations WHERE type = 'BLOOD_BANK' AND status = 'APPROVED' ORDER BY id ASC LIMIT 1`
  );
  if (rows && rows.length > 0) {
    return rows[0].id;
  }
  // Fallback to any approved organization if no dedicated blood bank
  const [anyOrg] = await executor.query(
    `SELECT id FROM organizations WHERE status = 'APPROVED' ORDER BY id ASC LIMIT 1`
  );
  return anyOrg && anyOrg.length > 0 ? anyOrg[0].id : 1;
}

/**
 * Helper to resolve user's role ID
 */
async function resolveRoleId(executor, user) {
  const roleName = (user.role || user.global_role || 'REQUESTER').toUpperCase().trim();
  const [roles] = await executor.query(
    'SELECT id FROM roles WHERE name = ? LIMIT 1',
    [roleName]
  );
  if (roles && roles.length > 0) {
    return roles[0].id;
  }
  return 7; // Fallback to REQUESTER role ID (7)
}

/**
 * Create a New Blood Request
 * POST /api/blood-requests
 */
async function createBloodRequest(req, res, next) {
  let connection = null;

  try {
    const payload = req.validatedBody || req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required to create a blood request.',
          code: 'UNAUTHORIZED'
        }
      });
    }

    const {
      blood_group,
      component,
      quantity,
      priority = 'ROUTINE',
      notes = null,
      required_by = null,
      preferred_organization_id = null,
      preferred_facility_name = null,
      preferred_facility_location = null
    } = payload;

    // Defense-in-depth: Validate Preferred Facility Rules (§Section 6)
    let validatedPreferredOrgId = null;
    let validatedManualName = null;
    let validatedManualLocation = null;
    let authoritativeOrgName = null;
    let authoritativeOrgType = null;
    let authoritativeOrgLocation = null;

    if (preferred_organization_id) {
      const orgId = parseInt(preferred_organization_id, 10);
      if (isNaN(orgId) || orgId <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid preferred organization ID.',
            code: 'INVALID_FACILITY_ID'
          }
        });
      }

      const [orgRows] = await db.query(
        'SELECT id, name, type, status, city, address FROM organizations WHERE id = ? LIMIT 1',
        [orgId]
      );

      if (!orgRows || orgRows.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'The selected treatment facility does not exist.',
            code: 'INVALID_FACILITY'
          }
        });
      }

      const facilityOrg = orgRows[0];

      // Check organization type (must be HOSPITAL or CLINIC per §Section 2 & 6)
      if (facilityOrg.type !== 'HOSPITAL' && facilityOrg.type !== 'CLINIC') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Preferred treatment facility must be a registered Hospital or Clinic.',
            code: 'INVALID_FACILITY_TYPE'
          }
        });
      }

      // Check organization status (must be APPROVED and active)
      if (facilityOrg.status !== 'APPROVED') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'The selected facility is not active or approved for treatment requisitions.',
            code: 'FACILITY_NOT_APPROVED'
          }
        });
      }

      validatedPreferredOrgId = facilityOrg.id;
      authoritativeOrgName = facilityOrg.name;
      authoritativeOrgType = facilityOrg.type;
      authoritativeOrgLocation = facilityOrg.city ? (facilityOrg.address ? `${facilityOrg.city} (${facilityOrg.address})` : facilityOrg.city) : (facilityOrg.address || '');
    } else if (preferred_facility_name && String(preferred_facility_name).trim().length > 0) {
      const cleanName = String(preferred_facility_name).trim();
      if (cleanName.length < 2 || cleanName.length > 150) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Manual facility name must be between 2 and 150 characters.',
            code: 'INVALID_MANUAL_FACILITY_NAME'
          }
        });
      }

      validatedManualName = cleanName;
      validatedManualLocation = preferred_facility_location ? String(preferred_facility_location).trim().substring(0, 255) : null;
    }

    // Resolve fulfilling organization ID (separate from preferred treatment facility)
    let fulfillingOrgId = payload.organization_id ? parseInt(payload.organization_id, 10) : null;
    if (!fulfillingOrgId) {
      fulfillingOrgId = await getDefaultFulfillingOrganizationId(db);
    } else {
      // Verify fulfilling organization exists and is approved
      const [fOrgs] = await db.query(
        'SELECT id, status FROM organizations WHERE id = ? LIMIT 1',
        [fulfillingOrgId]
      );
      if (!fOrgs || fOrgs.length === 0 || fOrgs[0].status !== 'APPROVED') {
        fulfillingOrgId = await getDefaultFulfillingOrganizationId(db);
      }
    }

    // Obtain transactional connection
    if (typeof db.getConnection === 'function') {
      try {
        connection = await db.getConnection();
      } catch (err) {
        connection = null;
      }
    }

    const executor = connection || {
      query: db.query.bind(db),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {}
    };

    await executor.beginTransaction();

    const roleId = await resolveRoleId(executor, user);

    // 1. Insert into blood_requests
    const insertRequestSql = `
      INSERT INTO blood_requests (
        requester_user_id,
        organization_id,
        created_by_role_id,
        priority,
        status,
        required_by,
        notes,
        preferred_organization_id,
        preferred_facility_name,
        preferred_facility_location
      ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)
    `;

    const [reqResult] = await executor.query(insertRequestSql, [
      user.id,
      fulfillingOrgId,
      roleId,
      priority,
      required_by,
      notes,
      validatedPreferredOrgId,
      validatedManualName,
      validatedManualLocation
    ]);

    const bloodRequestId = reqResult.insertId;

    // 2. Insert into request_items
    const insertItemSql = `
      INSERT INTO request_items (
        blood_request_id,
        blood_group,
        component,
        quantity,
        fulfilled_quantity
      ) VALUES (?, ?, ?, ?, 0)
    `;

    await executor.query(insertItemSql, [
      bloodRequestId,
      blood_group,
      component,
      quantity
    ]);

    // Insert notification for requester
    try {
      await executor.query(
        `INSERT INTO notifications (user_id, type, title, body, related_entity_type, related_entity_id)
         VALUES (?, 'REQUEST_SUBMITTED', 'Blood Request Submitted',
           CONCAT('Your blood requisition #', ?, ' for ', ?, ' units of ', ?, ' (', ?, ') has been submitted and is under clinical review.'),
           'blood_requests', ?)`,
        [user.id, bloodRequestId, quantity, blood_group, component, bloodRequestId]
      );
    } catch (_) {}

    await executor.commit();

    // 3. Log audit event
    try {
      await logAuditEvent({
        userId: user.id,
        action: 'BLOOD_REQUEST_CREATED',
        resourceType: 'BLOOD_REQUEST',
        resourceId: bloodRequestId,
        newValue: {
          priority,
          blood_group,
          component,
          quantity,
          fulfilling_organization_id: fulfillingOrgId,
          preferred_organization_id: validatedPreferredOrgId,
          preferred_facility_name: validatedManualName
        },
        ipAddress: req.ip
      });
    } catch (_) {
      // Non-fatal
    }

    // Build preferred facility response summary
    let preferredFacilitySummary = null;
    if (validatedPreferredOrgId) {
      preferredFacilitySummary = {
        id: validatedPreferredOrgId,
        name: authoritativeOrgName,
        type: authoritativeOrgType,
        location: authoritativeOrgLocation,
        is_manual: false
      };
    } else if (validatedManualName) {
      preferredFacilitySummary = {
        id: null,
        name: validatedManualName,
        type: 'UNREGISTERED',
        location: validatedManualLocation || 'Manual Entry',
        is_manual: true
      };
    }

    return res.status(201).json({
      success: true,
      message: 'Blood requisition submitted successfully.',
      data: {
        id: bloodRequestId,
        requester_user_id: user.id,
        requester_name: user.full_name,
        organization_id: fulfillingOrgId,
        priority,
        status: 'PENDING',
        blood_group,
        component,
        quantity,
        notes,
        preferred_facility: preferredFacilitySummary,
        created_at: new Date().toISOString(),
        request: {
          id: bloodRequestId,
          requester_user_id: user.id,
          requester_name: user.full_name,
          organization_id: fulfillingOrgId,
          priority,
          status: 'PENDING',
          blood_group,
          component,
          quantity,
          notes,
          preferred_facility: preferredFacilitySummary,
          created_at: new Date().toISOString()
        }
      }
    });
  } catch (err) {
    if (connection && typeof connection.rollback === 'function') {
      try {
        await connection.rollback();
      } catch (_) {}
    }
    next(err);
  } finally {
    if (connection && typeof connection.release === 'function') {
      connection.release();
    }
  }
}

/**
 * List Blood Requests
 * GET /api/blood-requests
 */
async function listBloodRequests(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required to list blood requests.',
          code: 'UNAUTHORIZED'
        }
      });
    }

    const isSuperAdmin = user.role === 'SUPER_ADMIN' || user.global_role === 'SUPER_ADMIN';
    const isRequester = user.role === 'REQUESTER' || user.global_role === 'REQUESTER';

    let query = `
      SELECT 
        br.id,
        br.requester_user_id,
        br.organization_id,
        br.created_by_role_id,
        br.priority,
        br.status,
        br.required_by,
        br.notes,
        br.preferred_organization_id,
        br.preferred_facility_name,
        br.preferred_facility_location,
        br.cancellation_reason,
        br.cancelled_at,
        br.created_at,
        br.updated_at,
        u.full_name AS requester_name,
        u.email AS requester_email,
        fo.name AS fulfilling_organization_name,
        fo.type AS fulfilling_organization_type,
        po.name AS preferred_org_name,
        po.type AS preferred_org_type,
        po.city AS preferred_org_city,
        po.address AS preferred_org_address,
        ri.blood_group,
        ri.component,
        ri.quantity,
        ri.fulfilled_quantity
      FROM blood_requests br
      JOIN users u ON br.requester_user_id = u.id
      LEFT JOIN organizations fo ON br.organization_id = fo.id
      LEFT JOIN organizations po ON br.preferred_organization_id = po.id
      LEFT JOIN request_items ri ON ri.blood_request_id = br.id
      WHERE 1=1
    `;
    const params = [];

    // Tenant Scoping & Isolation (§Section 6 & 7)
    if (isSuperAdmin) {
      // Super Admin can optionally filter by org or requester
      if (req.query.organization_id) {
        query += ' AND (br.organization_id = ? OR br.preferred_organization_id = ?)';
        params.push(req.query.organization_id, req.query.organization_id);
      }
      if (req.query.requester_id) {
        query += ' AND br.requester_user_id = ?';
        params.push(req.query.requester_id);
      }
    } else if (isRequester) {
      // Requesters only see their own requests
      query += ' AND br.requester_user_id = ?';
      params.push(user.id);
    } else if (user.organization_id) {
      // Org users see requests assigned to their blood bank or where their org is the preferred hospital/clinic
      query += ' AND (br.organization_id = ? OR br.preferred_organization_id = ?)';
      params.push(user.organization_id, user.organization_id);
    } else {
      // Unassigned non-super admin
      query += ' AND br.requester_user_id = ?';
      params.push(user.id);
    }

    if (req.query.status) {
      query += ' AND br.status = ?';
      params.push(String(req.query.status).toUpperCase().trim());
    }

    if (req.query.blood_group) {
      query += ' AND ri.blood_group = ?';
      params.push(String(req.query.blood_group).toUpperCase().trim());
    }

    query += ' ORDER BY br.created_at DESC LIMIT 100';

    const [rows] = await db.query(query, params);

    const requests = (rows || []).map((r) => {
      let preferredFacility = null;
      if (r.preferred_organization_id && r.preferred_org_name) {
        preferredFacility = {
          id: r.preferred_organization_id,
          name: r.preferred_org_name,
          type: r.preferred_org_type,
          city: r.preferred_org_city,
          location: r.preferred_org_city ? (r.preferred_org_address ? `${r.preferred_org_city} (${r.preferred_org_address})` : r.preferred_org_city) : (r.preferred_org_address || 'Regional Facility'),
          is_manual: false
        };
      } else if (r.preferred_facility_name) {
        preferredFacility = {
          id: null,
          name: r.preferred_facility_name,
          type: 'UNREGISTERED',
          location: r.preferred_facility_location || 'Manual Entry',
          is_manual: true
        };
      }

      const preferredFacilityType = preferredFacility ? (preferredFacility.is_manual ? 'MANUAL' : 'REGISTERED') : null;
      const preferredFacilityName = preferredFacility ? preferredFacility.name : null;
      const preferredFacilityLocation = preferredFacility ? preferredFacility.location : null;
      const preferredOrganization = preferredFacility && !preferredFacility.is_manual ? {
        id: preferredFacility.id,
        name: preferredFacility.name,
        type: preferredFacility.type,
        location: preferredFacility.location
      } : null;

      return {
        id: r.id,
        requester_user_id: r.requester_user_id,
        requester_name: r.requester_name,
        requester_email: isSuperAdmin || r.requester_user_id === user.id ? r.requester_email : undefined,
        organization_id: r.organization_id,
        fulfilling_organization_name: r.fulfilling_organization_name || 'Regional Blood Bank',
        priority: r.priority,
        status: r.status,
        required_by: r.required_by,
        notes: r.notes,
        blood_group: r.blood_group,
        component: r.component,
        quantity: r.quantity,
        fulfilled_quantity: r.fulfilled_quantity,
        preferred_facility: preferredFacility,
        preferredFacility: preferredFacilityName,
        preferredFacilityType,
        preferredFacilityLocation,
        preferredOrganization,
        cancellation_reason: r.cancellation_reason,
        cancelled_at: r.cancelled_at,
        created_at: r.created_at,
        updated_at: r.updated_at
      };
    });

    return res.status(200).json({
      success: true,
      data: requests,
      total: requests.length
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Blood Requests Summary Metrics
 * GET /api/blood-requests/summary
 */
async function getBloodRequestsSummary(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required.',
          code: 'UNAUTHORIZED'
        }
      });
    }

    const isSuperAdmin = user.role === 'SUPER_ADMIN' || user.global_role === 'SUPER_ADMIN';
    const isRequester = user.role === 'REQUESTER' || user.global_role === 'REQUESTER';

    let filterSql = '';
    const params = [];

    if (isSuperAdmin) {
      if (req.query.requester_id) {
        filterSql = ' WHERE br.requester_user_id = ?';
        params.push(req.query.requester_id);
      } else if (req.query.organization_id) {
        filterSql = ' WHERE (br.organization_id = ? OR br.preferred_organization_id = ?)';
        params.push(req.query.organization_id, req.query.organization_id);
      }
    } else if (isRequester) {
      filterSql = ' WHERE br.requester_user_id = ?';
      params.push(user.id);
    } else if (user.organization_id) {
      filterSql = ' WHERE (br.organization_id = ? OR br.preferred_organization_id = ?)';
      params.push(user.organization_id, user.organization_id);
    } else {
      filterSql = ' WHERE br.requester_user_id = ?';
      params.push(user.id);
    }

    const query = `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN br.status IN ('PENDING', 'VERIFIED', 'SEARCHING', 'PARTIALLY_FULFILLED', 'RESERVED') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN br.status IN ('RESERVED') THEN 1 ELSE 0 END) AS ready_for_collection,
        SUM(CASE WHEN br.status IN ('COMPLETED', 'ISSUED') THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN br.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN br.status IN ('REJECTED', 'EXPIRED') THEN 1 ELSE 0 END) AS rejected
      FROM blood_requests br
      ${filterSql}
    `;

    const [rows] = await db.query(query, params);
    const row = rows[0] || {};

    return res.status(200).json({
      success: true,
      data: {
        total: Number(row.total || 0),
        active: Number(row.active || 0),
        readyForCollection: Number(row.ready_for_collection || 0),
        completed: Number(row.completed || 0),
        cancelled: Number(row.cancelled || 0),
        rejected: Number(row.rejected || 0)
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Blood Request by ID
 * GET /api/blood-requests/:id
 */
async function getBloodRequestById(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required to view request details.',
          code: 'UNAUTHORIZED'
        }
      });
    }

    const requestId = parseInt(req.params.id, 10);
    if (isNaN(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid blood request ID provided.',
          code: 'INVALID_ID'
        }
      });
    }

    const query = `
      SELECT 
        br.id,
        br.requester_user_id,
        br.organization_id,
        br.created_by_role_id,
        br.priority,
        br.status,
        br.required_by,
        br.notes,
        br.preferred_organization_id,
        br.preferred_facility_name,
        br.preferred_facility_location,
        br.cancellation_reason,
        br.cancelled_at,
        br.created_at,
        br.updated_at,
        u.full_name AS requester_name,
        u.email AS requester_email,
        fo.name AS fulfilling_organization_name,
        fo.type AS fulfilling_organization_type,
        po.name AS preferred_org_name,
        po.type AS preferred_org_type,
        po.city AS preferred_org_city,
        po.address AS preferred_org_address,
        ri.blood_group,
        ri.component,
        ri.quantity,
        ri.fulfilled_quantity
      FROM blood_requests br
      JOIN users u ON br.requester_user_id = u.id
      LEFT JOIN organizations fo ON br.organization_id = fo.id
      LEFT JOIN organizations po ON br.preferred_organization_id = po.id
      LEFT JOIN request_items ri ON ri.blood_request_id = br.id
      WHERE br.id = ?
      LIMIT 1
    `;

    const [rows] = await db.query(query, [requestId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Blood request not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    const r = rows[0];

    // Access authorization check (§Section 6 & 7)
    const isSuperAdmin = user.role === 'SUPER_ADMIN' || user.global_role === 'SUPER_ADMIN';
    const isOwner = r.requester_user_id === user.id;
    const isAssignedOrg = user.organization_id && (user.organization_id === r.organization_id || user.organization_id === r.preferred_organization_id);

    if (!isSuperAdmin && !isOwner && !isAssignedOrg) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: You are not authorized to view this requisition record.',
          code: 'FORBIDDEN'
        }
      });
    }

    let preferredFacility = null;
    if (r.preferred_organization_id && r.preferred_org_name) {
      preferredFacility = {
        id: r.preferred_organization_id,
        name: r.preferred_org_name,
        type: r.preferred_org_type,
        city: r.preferred_org_city,
        location: r.preferred_org_city ? (r.preferred_org_address ? `${r.preferred_org_city} (${r.preferred_org_address})` : r.preferred_org_city) : (r.preferred_org_address || 'Regional Facility'),
        is_manual: false
      };
    } else if (r.preferred_facility_name) {
      preferredFacility = {
        id: null,
        name: r.preferred_facility_name,
        type: 'UNREGISTERED',
        location: r.preferred_facility_location || 'Manual Entry',
        is_manual: true
      };
    }

    const preferredFacilityType = preferredFacility ? (preferredFacility.is_manual ? 'MANUAL' : 'REGISTERED') : null;
    const preferredFacilityName = preferredFacility ? preferredFacility.name : null;
    const preferredFacilityLocation = preferredFacility ? preferredFacility.location : null;
    const preferredOrganization = preferredFacility && !preferredFacility.is_manual ? {
      id: preferredFacility.id,
      name: preferredFacility.name,
      type: preferredFacility.type,
      location: preferredFacility.location
    } : null;

    const reqData = {
      id: r.id,
      requester_user_id: r.requester_user_id,
      requester_name: r.requester_name,
      requester_email: isSuperAdmin || isOwner ? r.requester_email : undefined,
      organization_id: r.organization_id,
      fulfilling_organization_name: r.fulfilling_organization_name || 'Regional Blood Bank',
      priority: r.priority,
      status: r.status,
      required_by: r.required_by,
      notes: r.notes,
      blood_group: r.blood_group,
      component: r.component,
      quantity: r.quantity,
      fulfilled_quantity: r.fulfilled_quantity,
      preferred_facility: preferredFacility,
      preferredFacility: preferredFacilityName,
      preferredFacilityType,
      preferredFacilityLocation,
      preferredOrganization,
      cancellation_reason: r.cancellation_reason,
      cancelled_at: r.cancelled_at,
      created_at: r.created_at,
      updated_at: r.updated_at
    };

    return res.status(200).json({
      success: true,
      data: {
        ...reqData,
        request: reqData
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Blood Request (within 6-hour edit window)
 * PUT /api/blood-requests/:id
 */
async function updateBloodRequest(req, res, next) {
  let connection = null;

  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required to update a blood request.',
          code: 'UNAUTHORIZED'
        }
      });
    }

    const requestId = parseInt(req.params.id, 10);
    if (isNaN(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid blood request ID provided.',
          code: 'INVALID_ID'
        }
      });
    }

    const payload = req.validatedBody || req.body;

    // Fetch existing request with item details
    const [existingRows] = await db.query(
      `SELECT br.*, ri.id AS request_item_id, ri.blood_group, ri.component, ri.quantity, ri.fulfilled_quantity
       FROM blood_requests br
       LEFT JOIN request_items ri ON ri.blood_request_id = br.id
       WHERE br.id = ? LIMIT 1`,
      [requestId]
    );

    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Blood request not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    const r = existingRows[0];

    // Authorization check: requester owner or SUPER_ADMIN
    const isSuperAdmin = user.role === 'SUPER_ADMIN' || user.global_role === 'SUPER_ADMIN';
    const isOwner = Number(r.requester_user_id) === Number(user.id);

    if (!isSuperAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: You are not authorized to edit this requisition.',
          code: 'FORBIDDEN'
        }
      });
    }

    // Status checks
    if (r.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot edit a cancelled blood request.',
          code: 'REQUEST_ALREADY_CANCELLED'
        }
      });
    }

    if (r.status === 'ISSUED' || r.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot edit a requisition that has already been issued or completed.',
          code: 'CANNOT_MODIFY_ISSUED'
        }
      });
    }

    // Requirement 3.A: 6-hour edit window enforcement
    // Calculate deadline from original server-recorded submission timestamp.
    // Server time is source of truth. Do not reset 6-hour window on edit.
    const createdAtMs = new Date(r.created_at).getTime();
    const nowMs = Date.now();
    const elapsedHours = (nowMs - createdAtMs) / (1000 * 60 * 60);
    const EDIT_WINDOW_HOURS = 6;

    if (!isSuperAdmin && elapsedHours > EDIT_WINDOW_HOURS) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'The 6-hour editing window has expired. Requisitions cannot be modified after 6 hours from original submission.',
          code: 'EDIT_WINDOW_EXPIRED',
          created_at: r.created_at,
          elapsed_hours: Math.round(elapsedHours * 10) / 10,
          max_allowed_hours: EDIT_WINDOW_HOURS
        }
      });
    }

    // Validate preferred facility changes if provided
    let newPreferredOrgId = r.preferred_organization_id;
    let newManualFacilityName = r.preferred_facility_name;
    let newManualFacilityLocation = r.preferred_facility_location;

    if (payload.preferred_organization_id !== undefined) {
      if (payload.preferred_organization_id === null || payload.preferred_organization_id === '') {
        newPreferredOrgId = null;
      } else {
        const orgId = parseInt(payload.preferred_organization_id, 10);
        if (isNaN(orgId) || orgId <= 0) {
          return res.status(400).json({
            success: false,
            error: { message: 'Invalid preferred organization ID.', code: 'INVALID_FACILITY_ID' }
          });
        }
        const [orgRows] = await db.query(
          'SELECT id, name, type, status FROM organizations WHERE id = ? LIMIT 1',
          [orgId]
        );
        if (!orgRows || orgRows.length === 0 || orgRows[0].status !== 'APPROVED' || (orgRows[0].type !== 'HOSPITAL' && orgRows[0].type !== 'CLINIC')) {
          return res.status(400).json({
            success: false,
            error: { message: 'Selected treatment facility must be an approved Hospital or Clinic.', code: 'INVALID_FACILITY' }
          });
        }
        newPreferredOrgId = orgRows[0].id;
        newManualFacilityName = null;
        newManualFacilityLocation = null;
      }
    }

    if (payload.preferred_facility_name !== undefined) {
      const cleanManual = String(payload.preferred_facility_name || '').trim();
      if (cleanManual.length > 0) {
        if (cleanManual.length < 2 || cleanManual.length > 150) {
          return res.status(400).json({
            success: false,
            error: { message: 'Manual facility name must be between 2 and 150 characters.', code: 'INVALID_MANUAL_FACILITY_NAME' }
          });
        }
        newManualFacilityName = cleanManual;
        newManualFacilityLocation = payload.preferred_facility_location ? String(payload.preferred_facility_location).trim().substring(0, 255) : null;
        newPreferredOrgId = null;
      } else if (payload.preferred_facility_name === null || payload.preferred_facility_name === '') {
        if (!newPreferredOrgId) {
          newManualFacilityName = null;
          newManualFacilityLocation = null;
        }
      }
    }

    // Determine changes in clinical specs
    const newBloodGroup = payload.blood_group || r.blood_group;
    const newComponent = payload.component || r.component;
    const newQuantity = payload.quantity !== undefined ? parseInt(payload.quantity, 10) : r.quantity;
    const newPriority = payload.priority || r.priority;
    const newNotes = payload.notes !== undefined ? payload.notes : r.notes;
    const newRequiredBy = payload.required_by !== undefined ? payload.required_by : r.required_by;

    const specsChanged = (newBloodGroup !== r.blood_group) || 
                         (newComponent !== r.component) || 
                         (newQuantity !== r.quantity);

    // Obtain transactional connection
    if (typeof db.getConnection === 'function') {
      try {
        connection = await db.getConnection();
      } catch (err) {
        connection = null;
      }
    }

    const executor = connection || {
      query: db.query.bind(db),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {}
    };

    await executor.beginTransaction();

    let newStatus = r.status;

    // Concurrency & Operational Safety (§3.C):
    // If specs changed and request is currently reserved/partially fulfilled, release active holds for re-review
    if (specsChanged && (r.status === 'RESERVED' || r.status === 'PARTIALLY_FULFILLED')) {
      const [activeReservations] = await executor.query(
        `SELECT r.id, r.blood_unit_id 
         FROM reservations r
         JOIN request_items ri ON r.request_item_id = ri.id
         WHERE ri.blood_request_id = ? AND r.status = 'ACTIVE'`,
        [requestId]
      );

      for (const res of activeReservations) {
        await executor.query(`UPDATE reservations SET status = 'RELEASED' WHERE id = ?`, [res.id]);
        await executor.query(`UPDATE blood_units SET status = 'AVAILABLE' WHERE id = ? AND status = 'RESERVED'`, [res.blood_unit_id]);
      }

      newStatus = 'PENDING';
    }

    // Update blood_requests (Note: created_at is strictly untouched)
    await executor.query(
      `UPDATE blood_requests SET
         priority = ?,
         notes = ?,
         required_by = ?,
         preferred_organization_id = ?,
         preferred_facility_name = ?,
         preferred_facility_location = ?,
         status = ?,
         updated_at = NOW()
       WHERE id = ?`,
      [
        newPriority,
        newNotes,
        newRequiredBy,
        newPreferredOrgId,
        newManualFacilityName,
        newManualFacilityLocation,
        newStatus,
        requestId
      ]
    );

    // Update request_items
    const newFulfilledQty = specsChanged ? 0 : r.fulfilled_quantity;
    if (r.request_item_id) {
      await executor.query(
        `UPDATE request_items SET
           blood_group = ?,
           component = ?,
           quantity = ?,
           fulfilled_quantity = ?,
           updated_at = NOW()
         WHERE id = ?`,
        [newBloodGroup, newComponent, newQuantity, newFulfilledQty, r.request_item_id]
      );
    }

    // Log audit event
    await logAuditEvent({
      userId: user.id,
      action: 'REQUEST_UPDATED',
      resourceType: 'BLOOD_REQUEST',
      resourceId: requestId,
      previousValue: {
        status: r.status,
        blood_group: r.blood_group,
        component: r.component,
        quantity: r.quantity
      },
      newValue: {
        status: newStatus,
        blood_group: newBloodGroup,
        component: newComponent,
        quantity: newQuantity,
        specs_changed: specsChanged,
        hours_elapsed: Math.round(elapsedHours * 10) / 10
      }
    });

    // Notify fulfilling organization staff
    try {
      await executor.query(
        `INSERT INTO notifications (user_id, type, title, body, related_entity_type, related_entity_id)
         SELECT u.id, 'REQUEST_UPDATED', 'Requisition Updated by Requester',
           CONCAT('Requisition #', ?, ' has been modified within the permitted editing window.'),
           'blood_requests', ?
         FROM users u
         WHERE u.organization_id = ? AND u.status = 'ACTIVE'`,
        [requestId, requestId, r.organization_id]
      );
    } catch (_) {}

    // Notify requester of update confirmation
    try {
      await executor.query(
        `INSERT INTO notifications (user_id, type, title, body, related_entity_type, related_entity_id)
         VALUES (?, 'REQUEST_UPDATED', 'Blood Requisition Updated',
           CONCAT('Requisition #', ?, ' was updated successfully within the permitted editing window.'),
           'blood_requests', ?)`,
        [user.id, requestId, requestId]
      );
    } catch (_) {}

    await executor.commit();

    return res.status(200).json({
      success: true,
      message: 'Blood request updated successfully.',
      data: {
        id: requestId,
        priority: newPriority,
        notes: newNotes,
        required_by: newRequiredBy,
        blood_group: newBloodGroup,
        component: newComponent,
        quantity: newQuantity,
        status: newStatus,
        created_at: r.created_at,
        updated_at: new Date().toISOString()
      }
    });
  } catch (err) {
    if (connection && typeof connection.rollback === 'function') {
      try { await connection.rollback(); } catch (_) {}
    }
    next(err);
  } finally {
    if (connection && typeof connection.release === 'function') {
      connection.release();
    }
  }
}

/**
 * Cancel Blood Request (Allowed at any time, safe inventory reconciliation)
 * POST /api/blood-requests/:id/cancel
 */
async function cancelBloodRequest(req, res, next) {
  let connection = null;

  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required to cancel a blood request.',
          code: 'UNAUTHORIZED'
        }
      });
    }

    const requestId = parseInt(req.params.id, 10);
    if (isNaN(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid blood request ID provided.',
          code: 'INVALID_ID'
        }
      });
    }

    const cancellationReason = (req.validatedBody?.reason || req.body?.reason || 'Cancelled by requester').trim().substring(0, 255);

    // Fetch existing request
    const [existingRows] = await db.query(
      `SELECT br.*, ri.id AS request_item_id, ri.blood_group, ri.component, ri.quantity, ri.fulfilled_quantity
       FROM blood_requests br
       LEFT JOIN request_items ri ON ri.blood_request_id = br.id
       WHERE br.id = ? LIMIT 1`,
      [requestId]
    );

    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Blood request not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    const r = existingRows[0];

    // Authorization: owner, fulfilling org staff, or SUPER_ADMIN
    const isSuperAdmin = user.role === 'SUPER_ADMIN' || user.global_role === 'SUPER_ADMIN';
    const isOwner = Number(r.requester_user_id) === Number(user.id);
    const isFulfillingStaff = user.organization_id && Number(user.organization_id) === Number(r.organization_id);

    if (!isSuperAdmin && !isOwner && !isFulfillingStaff) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: You are not authorized to cancel this requisition.',
          code: 'FORBIDDEN'
        }
      });
    }

    // Status checks
    if (r.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'This blood request is already cancelled.',
          code: 'REQUEST_ALREADY_CANCELLED'
        }
      });
    }

    // Operational and Inventory Rule (§3.B):
    // Do not automatically reverse physical issues if units were already dispatched
    if (r.status === 'ISSUED' || r.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot cancel a blood request that has already been issued or completed. Physical units have already been dispatched. Please contact blood bank staff directly.',
          code: 'CANNOT_CANCEL_ISSUED'
        }
      });
    }

    // Obtain transactional connection
    if (typeof db.getConnection === 'function') {
      try {
        connection = await db.getConnection();
      } catch (err) {
        connection = null;
      }
    }

    const executor = connection || {
      query: db.query.bind(db),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {}
    };

    await executor.beginTransaction();

    // Release any active reservations on blood units safely back to AVAILABLE
    const [activeReservations] = await executor.query(
      `SELECT r.id, r.blood_unit_id 
       FROM reservations r
       JOIN request_items ri ON r.request_item_id = ri.id
       WHERE ri.blood_request_id = ? AND r.status = 'ACTIVE'`,
      [requestId]
    );

    for (const res of activeReservations) {
      await executor.query(`UPDATE reservations SET status = 'RELEASED' WHERE id = ?`, [res.id]);
      await executor.query(`UPDATE blood_units SET status = 'AVAILABLE' WHERE id = ? AND status = 'RESERVED'`, [res.blood_unit_id]);
    }

    // Reset fulfilled quantity on request_items
    await executor.query(
      `UPDATE request_items SET fulfilled_quantity = 0 WHERE blood_request_id = ?`,
      [requestId]
    );

    // Update blood_requests with CANCELLED status, timestamp, and reason
    const now = new Date();
    await executor.query(
      `UPDATE blood_requests SET
         status = 'CANCELLED',
         cancellation_reason = ?,
         cancelled_at = NOW(),
         updated_at = NOW()
       WHERE id = ?`,
      [cancellationReason, requestId]
    );

    // Record audit event
    await logAuditEvent({
      userId: user.id,
      action: 'REQUEST_CANCELLED',
      resourceType: 'BLOOD_REQUEST',
      resourceId: requestId,
      previousValue: {
        status: r.status,
        blood_group: r.blood_group,
        quantity: r.quantity
      },
      newValue: {
        status: 'CANCELLED',
        cancellation_reason: cancellationReason,
        released_reservations_count: activeReservations.length
      }
    });

    // Notify fulfilling organization staff
    try {
      await executor.query(
        `INSERT INTO notifications (user_id, type, title, body, related_entity_type, related_entity_id)
         SELECT u.id, 'REQUEST_CANCELLED', 'Blood Requisition Cancelled',
           CONCAT('Requisition #', ?, ' was cancelled. Reason: ', ?),
           'blood_requests', ?
         FROM users u
         WHERE u.organization_id = ? AND u.status = 'ACTIVE'`,
        [requestId, cancellationReason, requestId, r.organization_id]
      );
    } catch (_) {}

    // Notify requester of cancellation confirmation
    try {
      await executor.query(
        `INSERT INTO notifications (user_id, type, title, body, related_entity_type, related_entity_id)
         VALUES (?, 'REQUEST_CANCELLED', 'Blood Requisition Cancelled',
           CONCAT('Requisition #', ?, ' was successfully cancelled and any reserved units released.'),
           'blood_requests', ?)`,
        [user.id, requestId, requestId]
      );
    } catch (_) {}

    await executor.commit();

    return res.status(200).json({
      success: true,
      message: 'Blood request cancelled successfully and reserved units released.',
      data: {
        id: requestId,
        status: 'CANCELLED',
        cancellation_reason: cancellationReason,
        cancelled_at: now.toISOString()
      }
    });
  } catch (err) {
    if (connection && typeof connection.rollback === 'function') {
      try { await connection.rollback(); } catch (_) {}
    }
    next(err);
  } finally {
    if (connection && typeof connection.release === 'function') {
      connection.release();
    }
  }
}

module.exports = {
  createBloodRequest,
  listBloodRequests,
  getBloodRequestsSummary,
  getBloodRequestById,
  updateBloodRequest,
  cancelBloodRequest
};
