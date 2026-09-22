/**
 * ============================================================================
 * BLOOD BANK PLATFORM — AUTHENTICATION MIDDLEWARE
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§12 & §25)
 *
 * Validates JSON Web Tokens in the `Authorization: Bearer <token>` header.
 * Verifies cryptographic signature and expiry, queries the database to
 * guarantee the user account remains active, and attaches the sanitized
 * user profile to `req.user`.
 *
 * NOTE: Does NOT perform RBAC permission checks (checkPermission) or
 * multi-tenant organization scoping (requireOrg) — those belong to Phase 5.
 */

const db = require('../config/db');
const { verifyAccessToken } = require('../services/tokenService');

/**
 * Express middleware to authenticate requests via JWT Bearer tokens.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Check for presence of Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Access denied. No authorization token provided.',
          code: 'UNAUTHORIZED'
        }
      });
    }

    // Extract token string
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Access denied. Malformed authorization header.',
          code: 'UNAUTHORIZED'
        }
      });
    }

    // Verify token cryptographic signature and expiration
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Session has expired. Please log in again.',
            code: 'TOKEN_EXPIRED'
          }
        });
      }
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid or corrupted authorization token.',
          code: 'INVALID_TOKEN'
        }
      });
    }

    // Look up the user in the database (never trust token payload without verifying account state)
    const [rows] = await db.query(
      `SELECT id, full_name, email, phone, organization_id, global_role, status, email_verified_at, created_at 
       FROM users 
       WHERE id = ?`,
      [decoded.userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'User account associated with this token no longer exists.',
          code: 'UNAUTHORIZED'
        }
      });
    }

    const user = rows[0];

    // Check if user account is suspended
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Your account has been suspended. Please contact platform administration.',
          code: 'ACCOUNT_SUSPENDED'
        }
      });
    }

    let role = user.global_role;
    let roleId = null;
    let roleName = user.global_role;
    let organizationId = user.organization_id || null;
    let organizationName = null;
    let organizationType = null;
    let organizationStatus = null;
    let organizationStaff = null;
    let permissions = [];

    // If SUPER_ADMIN, platform-wide capabilities
    if (user.global_role === 'SUPER_ADMIN') {
      role = 'SUPER_ADMIN';
      roleName = 'SUPER_ADMIN';
      try {
        const [allPerms] = await db.query('SELECT `key` FROM permissions');
        permissions = (allPerms || []).map((p) => p.key);
      } catch {
        permissions = ['*'];
      }
    } else {
      // Check organization_staff membership for org-scoped users
      try {
        const [staffRows] = await db.query(
          `SELECT os.id AS staff_id, os.organization_id, os.role_id, os.status AS staff_status,
                  r.name AS role_name,
                  o.name AS organization_name, o.type AS organization_type, o.status AS organization_status
           FROM organization_staff os
           LEFT JOIN roles r ON os.role_id = r.id
           LEFT JOIN organizations o ON os.organization_id = o.id
           WHERE os.user_id = ?
           LIMIT 1`,
          [user.id]
        );

        if (staffRows && staffRows.length > 0) {
          organizationStaff = staffRows[0];

          if (organizationStaff.staff_status === 'SUSPENDED') {
            return res.status(403).json({
              success: false,
              error: {
                message: 'Your staff access to this organization has been suspended.',
                code: 'STAFF_ACCESS_SUSPENDED'
              }
            });
          }

          role = organizationStaff.role_name || user.global_role;
          roleId = organizationStaff.role_id;
          roleName = organizationStaff.role_name;
          organizationId = organizationStaff.organization_id;
          organizationName = organizationStaff.organization_name;
          organizationType = organizationStaff.organization_type;
          organizationStatus = organizationStaff.organization_status;
        } else if (user.organization_id) {
          // User has organization_id on users table
          const [orgRows] = await db.query(
            'SELECT id, name, type, status FROM organizations WHERE id = ? LIMIT 1',
            [user.organization_id]
          );
          if (orgRows && orgRows.length > 0) {
            organizationName = orgRows[0].name;
            organizationType = orgRows[0].type;
            organizationStatus = orgRows[0].status;
          }
        }

        // Resolve role ID and permissions if role is known
        if (roleId) {
          const [permRows] = await db.query(
            `SELECT p.\`key\`
             FROM role_permissions rp
             JOIN permissions p ON rp.permission_id = p.id
             WHERE rp.role_id = ?`,
            [roleId]
          );
          permissions = (permRows || []).map((p) => p.key);
        } else {
          // Lookup role by name for DONOR or REQUESTER or fallback
          const [roleRows] = await db.query(
            'SELECT id, name FROM roles WHERE name = ? LIMIT 1',
            [role]
          );
          if (roleRows && roleRows.length > 0) {
            roleId = roleRows[0].id;
            roleName = roleRows[0].name;
            const [permRows] = await db.query(
              `SELECT p.\`key\`
               FROM role_permissions rp
               JOIN permissions p ON rp.permission_id = p.id
               WHERE rp.role_id = ?`,
              [roleId]
            );
            permissions = (permRows || []).map((p) => p.key);
          }
        }
      } catch (ctxErr) {
        // Fallback for mock/test environments
        permissions = [];
      }
    }

    // Attach complete verified user profile to request object
    req.user = {
      id: user.id,
      fullName: user.full_name,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      globalRole: user.global_role,
      global_role: user.global_role,
      status: user.status,
      emailVerifiedAt: user.email_verified_at,
      email_verified_at: user.email_verified_at,
      createdAt: user.created_at,
      created_at: user.created_at,
      role,
      roleId,
      role_id: roleId,
      roleName,
      role_name: roleName,
      organizationId,
      organization_id: organizationId,
      organizationName,
      organization_name: organizationName,
      organizationType,
      organization_type: organizationType,
      organizationStatus,
      organization_status: organizationStatus,
      organizationStaff,
      permissions
    };

    next();
  } catch (error) {
    console.error('Unhandled error in auth middleware:', error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'An internal authentication error occurred.',
        code: 'INTERNAL_ERROR'
      }
    });
  }
}

module.exports = {
  authenticate
};

