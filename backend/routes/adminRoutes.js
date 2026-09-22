/**
 * ============================================================================
 * BLOOD BANK PLATFORM — SUPER ADMIN PLATFORM ROUTES
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§5, §11, §13, §25)
 *
 * Exposes platform-wide administrative routes restricted strictly to SUPER_ADMIN.
 */

const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

// Strict security: ALL admin routes require authentication AND SUPER_ADMIN role
router.use(authenticate);
router.use(requireRole('SUPER_ADMIN'));

/**
 * @route   GET /api/admin/organizations
 * @desc    View all organizations platform-wide
 * @access  Protected (SUPER_ADMIN)
 */
router.get('/organizations', adminController.listOrganizations);

/**
 * @route   PATCH /api/admin/organizations/:id/status
 * @desc    Approve, reject, or suspend an organization
 * @access  Protected (SUPER_ADMIN)
 */
router.patch('/organizations/:id/status', adminController.updateOrganizationStatus);

/**
 * @route   GET /api/admin/users
 * @desc    View all platform users
 * @access  Protected (SUPER_ADMIN)
 */
router.get('/users', adminController.listPlatformUsers);

/**
 * @route   PATCH /api/admin/users/:id/role
 * @desc    Update a user's role
 * @access  Protected (SUPER_ADMIN)
 */
router.patch('/users/:id/role', adminController.updateUserRole);

/**
 * @route   GET /api/admin/audit-logs
 * @desc    View system audit logs
 * @access  Protected (SUPER_ADMIN)
 */
router.get('/audit-logs', adminController.listAuditLogs);

/**
 * @route   GET /api/admin/inventory
 * @desc    View network-wide blood inventory
 * @access  Protected (SUPER_ADMIN)
 */
router.get('/inventory', adminController.listPlatformInventory);

module.exports = router;
