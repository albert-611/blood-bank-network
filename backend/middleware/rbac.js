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
 * Normalize permission key to uniform dot-notation lowercase string.
 * Supports both 'inventory.manage' and 'inventory:manage'.
 */
function normalizePermissionKey(key) {
  if (!key) return '';
  return String(key).toLowerCase().trim().replace(/:/g, '.');
}

/**
 * Check whether an authenticated user profile possesses all specified permissions.
 * Super Admins automatically possess all functional permissions.
 *
 * @param {Object} user - Sanitized req.user profile
 * @param {...(string|string[])} permissionKeys - One or more permission keys
 * @returns {boolean}
 */
function hasPermission(user, ...permissionKeys) {
  if (!user) return false;

  // Super Admin possesses system-wide permissions
  if (
    user.role === 'SUPER_ADMIN' ||
    user.global_role === 'SUPER_ADMIN' ||
    user.roleName === 'SUPER_ADMIN' ||
    user.role_name === 'SUPER_ADMIN'
  ) {
    return true;
  }

  const rawPermissions = user.permissions || [];
  if (rawPermissions.includes('*')) return true;

  const userPerms = rawPermissions.map(normalizePermissionKey);
  const required = permissionKeys.flat().map(normalizePermissionKey).filter(Boolean);

  if (required.length === 0) return true;
  return required.every((reqKey) => userPerms.includes(reqKey));
}

/**
 * Express middleware to enforce fine-grained permissions.
 * All specified permissions are required (AND semantics).
 * Super Admins automatically bypass functional permission checks.
 *
 * @param {...(string|string[])} permissionKeys - Permission keys required (e.g. 'inventory.manage')
 */
function requirePermission(...permissionKeys) {
  const required = permissionKeys.flat().filter(Boolean);

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

    if (hasPermission(req.user, ...required)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: {
        message: 'Access denied: Missing required functional permission.',
        code: 'FORBIDDEN_PERMISSION',
        requiredPermissions: required
      }
    });
  };
}

/**
 * Express middleware to enforce at least one of the specified permissions (OR semantics).
 * Super Admins automatically bypass permission checks.
 *
 * @param {...(string|string[])} permissionKeys - Permission keys where at least one is required
 */
function requireAnyPermission(...permissionKeys) {
  const required = permissionKeys.flat().filter(Boolean);

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

    // Super Admin platform-wide bypass
    if (
      req.user.role === 'SUPER_ADMIN' ||
      req.user.global_role === 'SUPER_ADMIN' ||
      req.user.roleName === 'SUPER_ADMIN' ||
      req.user.role_name === 'SUPER_ADMIN'
    ) {
      return next();
    }

    const rawPermissions = req.user.permissions || [];
    if (rawPermissions.includes('*')) return next();

    const userPerms = rawPermissions.map(normalizePermissionKey);
    const normalizedRequired = required.map(normalizePermissionKey);

    const hasAny = normalizedRequired.some((reqKey) => userPerms.includes(reqKey));

    if (!hasAny) {
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
  hasPermission,
  requirePermission,
  requireAnyPermission,
  ROLE_ALIASES
};
