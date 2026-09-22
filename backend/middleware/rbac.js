/**
 * ============================================================================
 * BLOOD BANK PLATFORM — ROLE-BASED ACCESS CONTROL (RBAC) MIDDLEWARE
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§13 & §25)
 *
 * Enforces role-based authorization and fine-grained permission checks.
 * Supports standard roles across organizations:
 * - SUPER_ADMIN
 * - ORGANIZATION_ADMIN (includes HOSPITAL_ADMIN, CLINIC_ADMIN)
 * - STAFF (includes BLOOD_BANK_STAFF)
 * - DOCTOR / MEDICAL_STAFF
 * - DONOR
 * - PATIENT / REQUESTER
 */

const ROLE_ALIASES = {
  SUPER_ADMIN: ['SUPER_ADMIN'],
  ORGANIZATION_ADMIN: ['ORGANIZATION_ADMIN', 'HOSPITAL_ADMIN', 'CLINIC_ADMIN'],
  HOSPITAL_ADMIN: ['HOSPITAL_ADMIN', 'ORGANIZATION_ADMIN'],
  CLINIC_ADMIN: ['CLINIC_ADMIN', 'ORGANIZATION_ADMIN'],
  STAFF: ['STAFF', 'BLOOD_BANK_STAFF'],
  BLOOD_BANK_STAFF: ['BLOOD_BANK_STAFF', 'STAFF'],
  DOCTOR: ['DOCTOR', 'MEDICAL_STAFF'],
  MEDICAL_STAFF: ['DOCTOR', 'MEDICAL_STAFF'],
  DONOR: ['DONOR'],
  REQUESTER: ['REQUESTER', 'PATIENT'],
  PATIENT: ['REQUESTER', 'PATIENT']
};

/**
 * Check whether a user profile possesses any of the required roles.
 *
 * @param {Object} user - Sanitized req.user profile
 * @param {...string} requiredRoles - One or more role names or aliases
 * @returns {boolean}
 */
function hasRole(user, ...requiredRoles) {
  if (!user) return false;

  const userRoles = [
    user.role,
    user.role_name,
    user.roleName,
    user.global_role,
    user.globalRole
  ]
    .filter(Boolean)
    .map((r) => String(r).toUpperCase().trim());

  // Flatten and normalize required roles through alias definitions
  const targetRoles = requiredRoles
    .flat()
    .map((r) => String(r).toUpperCase().trim())
    .flatMap((roleKey) => ROLE_ALIASES[roleKey] || [roleKey]);

  return userRoles.some((userRole) => targetRoles.includes(userRole));
}

/**
 * Express middleware to enforce that the authenticated user possesses one of the allowed roles.
 *
 * @param {...string} allowedRoles - Allowed role names or aliases
 */
function requireRole(...allowedRoles) {
  const roles = allowedRoles.flat();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required to access this resource.',
          code: 'UNAUTHORIZED'
        }
      });
    }

    if (!hasRole(req.user, ...roles)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: You do not have permission to perform this action.',
          code: 'FORBIDDEN_ROLE',
          requiredRoles: roles
        }
      });
    }

    next();
  };
}

/**
 * Express middleware to enforce fine-grained permissions.
 * Super Admins automatically bypass permission checks.
 *
 * @param {...string} permissionKeys - Permission keys required (e.g. 'inventory.manage')
 */
function requirePermission(...permissionKeys) {
  const required = permissionKeys.flat();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required to access this resource.',
          code: 'UNAUTHORIZED'
        }
      });
    }

    // Super Admin has system-wide permissions
    if (req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN') {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const hasAll = required.every((key) => userPermissions.includes(key));

    if (!hasAll) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: Missing required functional permission.',
          code: 'FORBIDDEN_PERMISSION',
          requiredPermissions: required
        }
      });
    }

    next();
  };
}

module.exports = {
  hasRole,
  requireRole,
  requirePermission,
  ROLE_ALIASES
};
