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
const {
  validateCreateBloodRequest,
  validateUpdateBloodRequest,
  validateCancelBloodRequest
} = require('../validators/requestValidators');

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
 * @route   GET /api/blood-requests/summary
 * @desc    Get aggregate request KPI metrics (total, active, ready for collection, completed)
 * @access  Protected
 */
router.get('/summary', requestController.getBloodRequestsSummary);

/**
 * @route   GET /api/blood-requests/:id
 * @desc    Get details of a single blood requisition
 * @access  Protected (Author / Assigned Org / Super Admin)
 */
router.get('/:id', requestController.getBloodRequestById);

/**
 * @route   PUT /api/blood-requests/:id
 * @desc    Update an active blood requisition (within 6-hour edit window)
 * @access  Protected (Requester Author / Super Admin)
 */
router.put(
  '/:id',
  validateUpdateBloodRequest,
  requestController.updateBloodRequest
);

/**
 * @route   POST /api/blood-requests/:id/cancel
 * @desc    Cancel an active blood requisition at any time and release reserved units safely
 * @access  Protected (Requester Author / Fulfilling Org Staff / Super Admin)
 */
router.post(
  '/:id/cancel',
  validateCancelBloodRequest,
  requestController.cancelBloodRequest
);

module.exports = router;
