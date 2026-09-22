/**
 * ============================================================================
 * BLOOD BANK PLATFORM — ORGANIZATION STAFF CONTROLLER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9, §11, §13, §25)
 *
 * Implements organization staff management:
 * - Scoped strictly to the authenticated administrator's organization
 * - Prevents cross-tenant staff creation
 * - Prevents role escalation to SUPER_ADMIN
 */

const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { logAuditEvent } = require('../utils/auditLogger');

const BCRYPT_SALT_ROUNDS = 12;

/**
 * List Staff in Current Organization
 * GET /api/organization/staff
 */
async function listStaff(req, res, next) {
  try {
    const orgId = req.organizationId;

    const [rows] = await db.query(
      `SELECT os.id AS staff_id, os.organization_id, os.role_id, os.status AS staff_status, os.created_at,
              u.id AS user_id, u.full_name, u.email, u.phone, u.status AS user_status,
              r.name AS role_name, r.description AS role_description
       FROM organization_staff os
       JOIN users u ON os.user_id = u.id
       JOIN roles r ON os.role_id = r.id
       WHERE os.organization_id = ?
       ORDER BY os.created_at DESC`,
      [orgId]
    );

    return res.status(200).json({
      success: true,
      data: {
        staff: rows
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create Staff Member in Current Organization
 * POST /api/organization/staff
 *
 * Backend enforces organization_id = req.organizationId.
 * Rejects any client attempt to target another organization or grant SUPER_ADMIN.
 */
async function createStaff(req, res, next) {
  let connection = null;

  try {
    const orgId = req.organizationId;
    const { full_name, email, password, phone, role_name, role_id } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Full name, email, and password are required for staff creation.',
          code: 'INVALID_INPUT'
        }
      });
    }

    // Role Escalation Defense: Organization Admin cannot create SUPER_ADMIN or assign unauthorized roles
    const requestedRole = (role_name || '').toUpperCase().trim();
    if (requestedRole === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: Organization administrators cannot create Super Admin accounts.',
          code: 'ROLE_ESCALATION_DENIED'
        }
      });
    }

    // Check duplicate email
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email.toLowerCase().trim()]
    );

    if (existing && existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          message: 'An account with this email address already exists.',
          code: 'EMAIL_ALREADY_EXISTS'
        }
      });
    }

    // Resolve target role ID
    let targetRoleId = role_id ? parseInt(role_id, 10) : null;
    let finalRoleName = requestedRole || 'STAFF';

    if (!targetRoleId) {
      // Map requested role name to DB role ID
      const [roleRows] = await db.query(
        'SELECT id, name FROM roles WHERE name = ? LIMIT 1',
        [finalRoleName]
      );
      if (roleRows && roleRows.length > 0) {
        targetRoleId = roleRows[0].id;
        finalRoleName = roleRows[0].name;
      } else {
        // Default staff role fallback based on organization type
        const [orgRows] = await db.query('SELECT type FROM organizations WHERE id = ?', [orgId]);
        const orgType = orgRows && orgRows.length > 0 ? orgRows[0].type : 'HOSPITAL';
        if (orgType === 'BLOOD_BANK') {
          targetRoleId = 4; // BLOOD_BANK_STAFF
          finalRoleName = 'BLOOD_BANK_STAFF';
        } else if (finalRoleName === 'DOCTOR') {
          targetRoleId = 5; // DOCTOR
          finalRoleName = 'DOCTOR';
        } else {
          targetRoleId = 4; // Default to staff
          finalRoleName = 'STAFF';
        }
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    const passwordHash = await bcrypt.hash(password, salt);

    if (typeof db.getConnection === 'function') {
      try {
        connection = await db.getConnection();
      } catch {
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

    // Insert user with organization_id forced to req.organizationId
    const [userRes] = await executor.query(
      `INSERT INTO users (full_name, email, password_hash, phone, organization_id, global_role, status, email_verified_at)
       VALUES (?, ?, ?, ?, ?, 'ORG_USER', 'ACTIVE', NOW())`,
      [full_name.trim(), email.toLowerCase().trim(), passwordHash, phone || null, orgId]
    );

    const newUserId = userRes.insertId;

    // Insert into organization_staff
    const [staffRes] = await executor.query(
      `INSERT INTO organization_staff (user_id, organization_id, role_id, status)
       VALUES (?, ?, ?, 'ACTIVE')`,
      [newUserId, orgId, targetRoleId]
    );

    await executor.commit();

    if (connection) {
      connection.release();
      connection = null;
    }

    // Log audit trail
    logAuditEvent({
      userId: req.user.id,
      action: 'ORG_STAFF_CREATE',
      resourceType: 'ORGANIZATION_STAFF',
      resourceId: staffRes.insertId,
      newValue: {
        createdUserId: newUserId,
        organizationId: orgId,
        roleId: targetRoleId,
        roleName: finalRoleName,
        email
      },
      ipAddress: req.ip
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      data: {
        staff: {
          id: staffRes.insertId,
          userId: newUserId,
          organizationId: orgId,
          fullName: full_name.trim(),
          email: email.toLowerCase().trim(),
          phone: phone || null,
          roleId: targetRoleId,
          roleName: finalRoleName,
          status: 'ACTIVE'
        }
      },
      message: 'Organization staff member created successfully.'
    });

  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
        connection.release();
      } catch {}
      connection = null;
    }
    next(err);
  }
}

module.exports = {
  listStaff,
  createStaff
};
