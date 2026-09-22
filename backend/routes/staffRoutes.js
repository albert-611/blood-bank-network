/**
 * ============================================================================
 * BLOOD BANK PLATFORM — ORGANIZATION STAFF ROUTES
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§11, §13, §25)
 *
 * Exposes endpoints for organization administrators to manage staff within
 * their own organization boundary.
 */

const express = require('express');
const staffController = require('../controllers/staffController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const requireOrg = require('../middleware/requireOrg');

const router = express.Router();

// All staff endpoints require authentication, ORGANIZATION_ADMIN role, and organization scoping
router.use(authenticate);
router.use(requireRole('ORGANIZATION_ADMIN', 'SUPER_ADMIN'));
router.use(requireOrg);

/**
 * @route   GET /api/organization/staff
 * @desc    List staff members in user's organization
 * @access  Protected (ORGANIZATION_ADMIN)
 */
router.get('/', staffController.listStaff);

/**
 * @route   POST /api/organization/staff
 * @desc    Create a new staff member within user's organization
 * @access  Protected (ORGANIZATION_ADMIN)
 */
router.post('/', staffController.createStaff);

module.exports = router;
