/**
 * ============================================================================
 * BLOOD BANK PLATFORM — INVENTORY & BLOOD UNIT ROUTES
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9.10, §11, §14, §18, §25)
 *
 * Exposes protected endpoints for inventory management with strict organization
 * boundary enforcement.
 */

const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const { authenticate } = require('../middleware/auth');
const requireOrg = require('../middleware/requireOrg');
const { checkResourceOwnership } = require('../middleware/requireOrg');
const checkPermission = require('../middleware/checkPermission');

const router = express.Router();

// All inventory operations require authentication and organization scoping
router.use(authenticate);
router.use(requireOrg);

/**
 * @route   GET /api/inventory/summary
 * @desc    Get aggregate inventory KPI metrics (total, available, expired, expiring soon, reserved)
 * @access  Protected (Requires 'inventory.view' permission)
 */
router.get('/summary', checkPermission('inventory.view'), inventoryController.getInventorySummary);

/**
 * @route   GET /api/inventory
 * @desc    List blood units in authenticated organization (with search, filter, pagination)
 * @access  Protected (Requires 'inventory.view' permission)
 */
router.get('/', checkPermission('inventory.view'), inventoryController.listInventory);

/**
 * @route   POST /api/inventory
 * @desc    Add blood unit to organization inventory
 * @access  Protected (Requires 'inventory.manage' permission)
 */
router.post('/', checkPermission('inventory.manage'), inventoryController.createBloodUnit);

/**
 * @route   GET /api/inventory/:id
 * @desc    Get specific blood unit by ID (ownership verified)
 * @access  Protected (Requires 'inventory.view' permission & organization ownership)
 */
router.get('/:id', checkPermission('inventory.view'), checkResourceOwnership('blood_units'), inventoryController.getBloodUnitById);

/**
 * @route   PATCH /api/inventory/:id
 * @desc    Update specific blood unit status/expiry (ownership verified)
 * @access  Protected (Requires 'inventory.manage' permission & organization ownership)
 */
router.patch('/:id', checkPermission('inventory.manage'), checkResourceOwnership('blood_units'), inventoryController.updateBloodUnit);

/**
 * @route   DELETE /api/inventory/:id
 * @desc    Discard / deactivate blood unit (ownership verified)
 * @access  Protected (Requires 'inventory.manage' permission & organization ownership)
 */
router.delete('/:id', checkPermission('inventory.manage'), checkResourceOwnership('blood_units'), inventoryController.discardBloodUnit);

/**
 * @route   POST /api/inventory/:id/discard
 * @desc    Explicit endpoint to discard / deactivate blood unit with reason
 * @access  Protected (Requires 'inventory.manage' permission & organization ownership)
 */
router.post('/:id/discard', checkPermission('inventory.manage'), checkResourceOwnership('blood_units'), inventoryController.discardBloodUnit);

module.exports = router;
