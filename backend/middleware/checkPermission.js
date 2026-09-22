/**
 * ============================================================================
 * BLOOD BANK PLATFORM — CHECK PERMISSION MIDDLEWARE (RBAC)
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§13 & §25)
 *
 * Provides backward-compatible wrapper around RBAC permission checking.
 */

const { requirePermission, requireRole, hasRole } = require('./rbac');

/**
 * Re-export checkPermission as a function returning middleware.
 * Usage: checkPermission('inventory.manage')
 */
const checkPermission = (permissionKey) => requirePermission(permissionKey);

checkPermission.requirePermission = requirePermission;
checkPermission.requireRole = requireRole;
checkPermission.hasRole = hasRole;

module.exports = checkPermission;
