/**
 * ============================================================================
 * BLOOD BANK PLATFORM — SUPER ADMIN CONTROLLER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§5, §11, §13, §23, §25)
 *
 * Implements platform-wide administrative controls:
 * - Review and approve/reject/suspend organizations
 * - View platform-wide users and assign roles
 * - View platform audit trail
 * - Network-wide blood inventory visibility
 */

const db = require('../config/db');
const { logAuditEvent } = require('../utils/auditLogger');

/**
 * List All Organizations Platform-Wide
 * GET /api/admin/organizations
 */
async function listOrganizations(req, res, next) {
  try {
    const { status, type, search, page, limit } = req.query;

    let baseFrom = `
      FROM organizations o
      LEFT JOIN organization_staff os ON o.id = os.organization_id
    `;
    const params = [];
    const conditions = [];

    if (status && status.toUpperCase() !== 'ALL') {
      conditions.push('o.status = ?');
      params.push(status.toUpperCase().trim());
    }

    if (type && type.toUpperCase() !== 'ALL') {
      conditions.push('o.type = ?');
      params.push(type.toUpperCase().trim());
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      conditions.push('(o.name LIKE ? OR o.email LIKE ? OR o.city LIKE ? OR o.license_number LIKE ?)');
      params.push(s, s, s, s);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    // Check if pagination requested
    const hasPagination = page !== undefined || limit !== undefined;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 30));
    const offset = (pageNum - 1) * limitNum;

    let total = 0;
    if (hasPagination) {
      const countQuery = `SELECT COUNT(DISTINCT o.id) AS total ${baseFrom} ${whereClause}`;
      const [countRows] = await db.query(countQuery, params);
      total = countRows && countRows.length > 0 ? countRows[0].total : 0;
    }

    let selectQuery = `
      SELECT o.id, o.name, o.type, o.email, o.phone, o.address, o.city, o.country,
             o.license_number, o.status, o.created_at, o.updated_at,
             COUNT(os.id) AS staff_count
      ${baseFrom}
      ${whereClause}
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `;

    const queryParams = [...params];
    if (hasPagination) {
      selectQuery += ' LIMIT ? OFFSET ?';
      queryParams.push(limitNum, offset);
    }

    const [organizations] = await db.query(selectQuery, queryParams);

    if (hasPagination) {
      const totalPages = Math.ceil(total / limitNum) || 1;
      return res.status(200).json({
        success: true,
        data: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages
          },
          organizations
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        total: organizations.length,
        organizations
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Organization Approval / Operational Status
 * PATCH /api/admin/organizations/:id/status
 */
async function updateOrganizationStatus(req, res, next) {
  try {
    const orgId = parseInt(req.params.id, 10);
    const { status, reason } = req.body;

    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];
    const targetStatus = (status || '').toUpperCase().trim();

    if (!validStatuses.includes(targetStatus)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid status. Allowed values: ${validStatuses.join(', ')}`,
          code: 'INVALID_STATUS'
        }
      });
    }

    // Check organization exists
    const [existing] = await db.query(
      'SELECT id, name, status FROM organizations WHERE id = ? LIMIT 1',
      [orgId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Organization not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    const previousStatus = existing[0].status;

    // Update status
    await db.query(
      'UPDATE organizations SET status = ? WHERE id = ?',
      [targetStatus, orgId]
    );

    // If approved, also activate initial admin user if pending verification
    if (targetStatus === 'APPROVED') {
      await db.query(
        `UPDATE users 
         SET status = 'ACTIVE' 
         WHERE organization_id = ? AND status = 'PENDING_VERIFICATION'`,
        [orgId]
      );
    }

    // Record audit log
    logAuditEvent({
      userId: req.user.id,
      action: 'ADMIN_ORG_STATUS_UPDATE',
      resourceType: 'ORGANIZATION',
      resourceId: orgId,
      previousValue: { status: previousStatus },
      newValue: { status: targetStatus, reason: reason || null },
      ipAddress: req.ip
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      data: {
        organization: {
          id: orgId,
          name: existing[0].name,
          previousStatus,
          status: targetStatus
        }
      },
      message: `Organization status successfully updated to ${targetStatus}.`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List All Platform Users
 * GET /api/admin/users
 */
async function listPlatformUsers(req, res, next) {
  try {
    const { role, organization_id, status } = req.query;

    let query = `
      SELECT u.id, u.full_name, u.email, u.phone, u.global_role, u.status, u.created_at,
             os.organization_id, os.role_id,
             r.name AS role_name,
             o.name AS organization_name, o.type AS organization_type
      FROM users u
      LEFT JOIN organization_staff os ON u.id = os.user_id
      LEFT JOIN roles r ON os.role_id = r.id
      LEFT JOIN organizations o ON os.organization_id = o.id
    `;
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push('u.status = ?');
      params.push(status.toUpperCase());
    }

    if (role) {
      conditions.push('(r.name = ? OR u.global_role = ?)');
      params.push(role.toUpperCase(), role.toUpperCase());
    }

    if (organization_id) {
      conditions.push('(os.organization_id = ? OR u.organization_id = ?)');
      params.push(organization_id, organization_id);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY u.created_at DESC';

    const [users] = await db.query(query, params);

    return res.status(200).json({
      success: true,
      data: {
        total: users.length,
        users
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update User Role (Super Admin Only)
 * PATCH /api/admin/users/:id/role
 */
async function updateUserRole(req, res, next) {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { role_id, role_name, global_role } = req.body;

    const [existing] = await db.query(
      'SELECT id, email, global_role, organization_id FROM users WHERE id = ? LIMIT 1',
      [targetUserId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    const targetUser = existing[0];

    // If global_role specified (e.g. SUPER_ADMIN, ORG_USER, DONOR, REQUESTER)
    if (global_role) {
      await db.query('UPDATE users SET global_role = ? WHERE id = ?', [
        global_role.toUpperCase(),
        targetUserId
      ]);
    }

    // If role_id or role_name specified for organization staff
    if (role_id || role_name) {
      let resolvedRoleId = role_id ? parseInt(role_id, 10) : null;
      if (!resolvedRoleId && role_name) {
        const [rRows] = await db.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [
          role_name.toUpperCase()
        ]);
        if (rRows && rRows.length > 0) resolvedRoleId = rRows[0].id;
      }

      if (resolvedRoleId) {
        await db.query(
          `UPDATE organization_staff SET role_id = ? WHERE user_id = ?`,
          [resolvedRoleId, targetUserId]
        );
      }
    }

    logAuditEvent({
      userId: req.user.id,
      action: 'ADMIN_USER_ROLE_UPDATE',
      resourceType: 'USER',
      resourceId: targetUserId,
      newValue: { global_role, role_id, role_name },
      ipAddress: req.ip
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'User role updated successfully.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * View System Audit Logs
 * GET /api/admin/audit-logs
 */
async function listAuditLogs(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 30, 100));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = req.query.offset !== undefined ? parseInt(req.query.offset, 10) : (page - 1) * limit;

    const [logs] = await db.query(
      `SELECT al.id, al.user_id, al.action, al.resource_type, al.resource_id,
              al.previous_value, al.new_value, al.ip_address, al.created_at,
              u.email AS user_email, u.full_name AS user_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [countRows] = await db.query('SELECT COUNT(id) AS total FROM audit_logs');
    const total = countRows && countRows.length > 0 ? countRows[0].total : 0;
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        total,
        page,
        limit,
        totalPages,
        offset,
        pagination: {
          total,
          page,
          limit,
          totalPages
        },
        logs
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * View Platform-Wide Inventory (Super Admin)
 * GET /api/admin/inventory
 */
async function listPlatformInventory(req, res, next) {
  try {
    const [units] = await db.query(`
      SELECT bu.id, bu.unit_code, bu.donation_id, bu.organization_id,
             bu.blood_group, bu.component, bu.collection_date, bu.expiry_date, bu.status,
             o.name AS organization_name, o.type AS organization_type, o.city
      FROM blood_units bu
      JOIN organizations o ON bu.organization_id = o.id
      ORDER BY bu.created_at DESC
      LIMIT 100
    `);

    return res.status(200).json({
      success: true,
      data: {
        total: units.length,
        units
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieve Comprehensive Super Admin Dashboard Statistics
 * GET /api/admin/stats
 */
async function getDashboardStats(req, res, next) {
  try {
    // 1. Organization aggregates
    const [orgAggRows] = await db.query(`
      SELECT 
        COUNT(*) AS total_organizations,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending_approvals,
        COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END), 0) AS active_organizations,
        COALESCE(SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END), 0) AS rejected_organizations,
        COALESCE(SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END), 0) AS suspended_organizations,
        COALESCE(SUM(CASE WHEN type = 'HOSPITAL' THEN 1 ELSE 0 END), 0) AS hospital_count,
        COALESCE(SUM(CASE WHEN type = 'CLINIC' THEN 1 ELSE 0 END), 0) AS clinic_count,
        COALESCE(SUM(CASE WHEN type = 'BLOOD_BANK' THEN 1 ELSE 0 END), 0) AS blood_bank_count,
        COALESCE(SUM(CASE WHEN created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN 1 ELSE 0 END), 0) AS orgs_this_month
      FROM organizations
    `);

    const orgAgg = (orgAggRows && orgAggRows[0]) || {};

    // 2. User aggregates
    const [userAggRows] = await db.query(`
      SELECT 
        COUNT(*) AS total_users,
        COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END), 0) AS active_users
      FROM users
    `);
    const userAgg = (userAggRows && userAggRows[0]) || {};

    // 3. Blood units in network
    const [unitRows] = await db.query(`
      SELECT COUNT(*) AS total_units FROM blood_units
    `);
    const totalUnits = (unitRows && unitRows[0]) ? unitRows[0].total_units : 0;

    // 4. Reports count (from audit_logs or 0)
    let reportsCount = 0;
    try {
      const [reportRows] = await db.query(`
        SELECT COUNT(*) AS report_count FROM audit_logs WHERE action LIKE '%REPORT%'
      `);
      reportsCount = (reportRows && reportRows[0]) ? reportRows[0].report_count : 0;
    } catch {
      reportsCount = 0;
    }

    // 5. Growth timeline (monthly breakdown by type)
    const [growthRows] = await db.query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        type,
        COUNT(*) AS count
      FROM organizations
      GROUP BY month, type
      ORDER BY month ASC
    `);

    return res.status(200).json({
      success: true,
      data: {
        kpis: {
          total_organizations: Number(orgAgg.total_organizations || 0),
          pending_approvals: Number(orgAgg.pending_approvals || 0),
          active_organizations: Number(orgAgg.active_organizations || 0),
          total_users: Number(userAgg.total_users || 0),
          active_users: Number(userAgg.active_users || 0),
          orgs_this_month: Number(orgAgg.orgs_this_month || 0),
          total_units: Number(totalUnits || 0),
          reports_generated: Number(reportsCount || 0)
        },
        organization_breakdown: {
          by_type: {
            hospitals: Number(orgAgg.hospital_count || 0),
            clinics: Number(orgAgg.clinic_count || 0),
            blood_banks: Number(orgAgg.blood_bank_count || 0)
          },
          by_status: {
            approved: Number(orgAgg.active_organizations || 0),
            pending: Number(orgAgg.pending_approvals || 0),
            rejected: Number(orgAgg.rejected_organizations || 0),
            suspended: Number(orgAgg.suspended_organizations || 0)
          }
        },
        growth_timeline: growthRows || [],
        system_status: {
          status: 'OPERATIONAL',
          database: 'CONNECTED',
          uptime_seconds: Math.round(process.uptime()),
          timestamp: new Date().toISOString()
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listOrganizations,
  updateOrganizationStatus,
  listPlatformUsers,
  updateUserRole,
  listAuditLogs,
  listPlatformInventory,
  getDashboardStats
};
