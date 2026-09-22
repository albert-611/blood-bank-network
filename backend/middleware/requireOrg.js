/**
 * ============================================================================
 * BLOOD BANK PLATFORM — ORGANIZATION AUTHORIZATION & TENANT ISOLATION
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§10, §11, §25)
 *
 * Enforces organization boundaries and multi-tenant data isolation:
 * 1. Ensures user belongs to an organization (unless SUPER_ADMIN).
 * 2. Enforces organization verification lifecycle (APPROVED vs PENDING/SUSPENDED/REJECTED).
 * 3. Prevents organization ID parameter tampering in query, body, or path.
 * 4. Automatically injects verified `req.organizationId`.
 * 5. Provides resource ownership verification for organization-owned entities.
 */

const db = require('../config/db');
const { logAuditEvent } = require('../utils/auditLogger');

/**
 * Express middleware to enforce organization membership, active status,
 * and tenant ID isolation.
 */
function requireOrg(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required to access organization resources.',
        code: 'UNAUTHORIZED'
      }
    });
  }

  const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN';

  // Super Admin is platform-wide and not strictly confined to a single organization
  if (isSuperAdmin) {
    const targetId =
      req.query?.organization_id ||
      req.query?.orgId ||
      req.query?.organizationId ||
      req.body?.organization_id ||
      req.body?.orgId ||
      req.body?.organizationId ||
      req.params?.organization_id ||
      req.params?.orgId ||
      req.params?.organizationId;

    req.organizationId = targetId ? parseInt(targetId, 10) : null;
    return next();
  }

  // Non-Super Admins must belong to an organization
  if (!req.user.organization_id) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Access denied: You are not assigned to an organization workspace.',
        code: 'NO_ORGANIZATION_ASSIGNED'
      }
    });
  }

  // Check organization approval status
  const orgStatus = req.user.organization_status || 'APPROVED';

  if (orgStatus === 'PENDING') {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Your organization is pending verification by a system administrator.',
        code: 'ORGANIZATION_PENDING_APPROVAL'
      }
    });
  }

  if (orgStatus === 'SUSPENDED') {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Your organization workspace has been suspended.',
        code: 'ORGANIZATION_SUSPENDED'
      }
    });
  }

  if (orgStatus === 'REJECTED') {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Your organization registration was rejected.',
        code: 'ORGANIZATION_REJECTED'
      }
    });
  }

  // TENANT ID TAMPERING DETECTION (§25):
  // Check if client explicitly sent a different organization_id via query, body, or params
  const clientSuppliedOrgId =
    req.query?.organization_id ||
    req.query?.orgId ||
    req.query?.organizationId ||
    req.body?.organization_id ||
    req.body?.orgId ||
    req.body?.organizationId ||
    req.params?.organization_id ||
    req.params?.orgId ||
    req.params?.organizationId;

  if (clientSuppliedOrgId !== undefined && clientSuppliedOrgId !== null && clientSuppliedOrgId !== '') {
    if (String(clientSuppliedOrgId).trim() !== String(req.user.organization_id).trim()) {
      // Log security anomaly into audit trail
      logAuditEvent({
        userId: req.user.id,
        action: 'SECURITY_CROSS_ORG_ATTEMPT',
        resourceType: 'ORGANIZATION',
        resourceId: parseInt(clientSuppliedOrgId, 10) || null,
        previousValue: { userOrgId: req.user.organization_id },
        newValue: { attemptedOrgId: clientSuppliedOrgId },
        ipAddress: req.ip
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: Cross-organization data access is strictly forbidden.',
          code: 'CROSS_ORGANIZATION_ACCESS_DENIED'
        }
      });
    }
  }

  // Bind trusted organization ID to request (never trust client payload)
  req.organizationId = req.user.organization_id;
  next();
}

/**
 * Reusable middleware to verify that a specific database resource belongs to
 * the authenticated user's organization.
 *
 * @param {string} tableName - Target SQL table (e.g. 'blood_units', 'donations')
 * @param {string} [idParamName='id'] - Name of route parameter containing entity PK
 * @param {string} [orgColumn='organization_id'] - Name of organization foreign key column
 */
function checkResourceOwnership(tableName, idParamName = 'id', orgColumn = 'organization_id') {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[idParamName];
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Missing required parameter: ${idParamName}`,
            code: 'INVALID_REQUEST'
          }
        });
      }

      const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN';

      const [rows] = await db.query(
        `SELECT * FROM \`${tableName}\` WHERE id = ? LIMIT 1`,
        [resourceId]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Requested resource was not found.',
            code: 'NOT_FOUND'
          }
        });
      }

      const resource = rows[0];

      // If not Super Admin, verify that the resource belongs to user's organization
      if (!isSuperAdmin) {
        const resourceOrgId = resource[orgColumn];
        if (resourceOrgId !== undefined && resourceOrgId !== null) {
          if (String(resourceOrgId) !== String(req.user.organization_id)) {
            // Log security incident
            logAuditEvent({
              userId: req.user.id,
              action: 'SECURITY_CROSS_ORG_RESOURCE_ACCESS',
              resourceType: tableName.toUpperCase(),
              resourceId: parseInt(resourceId, 10),
              previousValue: { userOrgId: req.user.organization_id },
              newValue: { resourceOrgId },
              ipAddress: req.ip
            }).catch(() => {});

            return res.status(403).json({
              success: false,
              error: {
                message: 'Access denied: You do not have permission to access resources belonging to another organization.',
                code: 'CROSS_ORGANIZATION_ACCESS_DENIED'
              }
            });
          }
        }
      }

      req.resource = resource;
      next();
    } catch (err) {
      console.error(`Error verifying resource ownership on ${tableName}:`, err);
      return res.status(500).json({
        success: false,
        error: {
          message: 'An error occurred while checking resource permissions.',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  };
}

module.exports = requireOrg;
module.exports.requireOrg = requireOrg;
module.exports.checkResourceOwnership = checkResourceOwnership;
