/**
 * ============================================================================
 * BLOOD BANK PLATFORM — CHECK PERMISSION MIDDLEWARE (RBAC)
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§13 & §25)
 *
 * Provides backward-compatible wrapper around RBAC permission checking.
 */

const {
  requirePermission,
  requireAnyPermission,
  hasPermission,
  requireRole,
  hasRole
} = require('./rbac');

/**
 * Reusable middleware factory for fine-grained permission enforcement.
 * Usage:
 *   checkPermission('inventory.manage')
 *   checkPermission('inventory.view', 'inventory.manage')
 *   checkPermission(['inventory.view', 'inventory.manage'])
 *   checkPermission.any('requests.create', 'requests.emergency')
 *
 * @param {...(string|string[])} permissionKeys - One or more permission keys
 * @returns {import('express').RequestHandler}
 */
const checkPermission = (...permissionKeys) => requirePermission(...permissionKeys);

checkPermission.checkPermission = checkPermission;
checkPermission.requirePermission = requirePermission;
checkPermission.requireAnyPermission = requireAnyPermission;
checkPermission.any = requireAnyPermission;
checkPermission.hasPermission = hasPermission;
checkPermission.requireRole = requireRole;
checkPermission.hasRole = hasRole;

module.exports = checkPermission;
module.exports.checkPermission = checkPermission;
module.exports.requirePermission = requirePermission;
module.exports.requireAnyPermission = requireAnyPermission;
module.exports.hasPermission = hasPermission;
module.exports.requireRole = requireRole;
module.exports.hasRole = hasRole;
