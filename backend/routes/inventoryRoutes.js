/**
 * ============================================================================
 * BLOOD BANK PLATFORM — INVENTORY & BLOOD UNIT ROUTES
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9.10, §11, §25)
 *
 * Exposes protected endpoints for inventory management with strict organization
 * boundary enforcement.
 */

const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const requireOrg = require('../middleware/requireOrg');

const router = express.Router();

// All inventory operations require authentication, role check, and organization scoping
router.use(authenticate);
router.use(requireRole('ORGANIZATION_ADMIN', 'STAFF', 'SUPER_ADMIN'));
router.use(requireOrg);

/**
 * @route   GET /api/inventory
 * @desc    List blood units in authenticated organization
 * @access  Protected (ORGANIZATION_ADMIN, STAFF, SUPER_ADMIN)
 */
router.get('/', inventoryController.listInventory);

/**
 * @route   POST /api/inventory
 * @desc    Add blood unit to organization inventory
 * @access  Protected (ORGANIZATION_ADMIN, STAFF, SUPER_ADMIN)
 */
router.post('/', inventoryController.createBloodUnit);

/**
 * @route   GET /api/inventory/:id
 * @desc    Get specific blood unit by ID (ownership verified)
 * @access  Protected (ORGANIZATION_ADMIN, STAFF, SUPER_ADMIN)
 */
router.get('/:id', inventoryController.getBloodUnitById);

module.exports = router;
