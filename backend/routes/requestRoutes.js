/**
 * ============================================================================
 * BLOOD BANK PLATFORM — BLOOD REQUEST ROUTES
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9.11, §13, §18, §25)
 *
 * Exposes endpoints for creating and querying blood requisitions.
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');
const requestController = require('../controllers/requestController');
const { validateCreateBloodRequest } = require('../validators/requestValidators');

const router = express.Router();

// Require authentication for all blood request routes
router.use(authenticate);

/**
 * @route   POST /api/blood-requests
 * @desc    Submit a new blood requisition with preferred treatment facility
 * @access  Protected (requests.create permission)
 */
router.post(
  '/',
  checkPermission('requests.create'),
  validateCreateBloodRequest,
  requestController.createBloodRequest
);

/**
 * @route   GET /api/blood-requests
 * @desc    List blood requisitions (scoped by user role and tenant)
 * @access  Protected
 */
router.get('/', requestController.listBloodRequests);

/**
 * @route   GET /api/blood-requests/:id
 * @desc    Get details of a single blood requisition
 * @access  Protected (Author / Assigned Org / Super Admin)
 */
router.get('/:id', requestController.getBloodRequestById);

module.exports = router;
