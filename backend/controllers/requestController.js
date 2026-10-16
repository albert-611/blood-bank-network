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

module.exports = {
  createBloodRequest,
  listBloodRequests,
  getBloodRequestById
};
