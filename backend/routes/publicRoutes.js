/**
 * ============================================================================
 * BLOOD BANK PLATFORM — PUBLIC ROUTES
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§8, §18)
 *
 * Exposes publicly accessible endpoints for donors and patients (no auth required).
 */

const express = require('express');
const publicController = require('../controllers/publicController');

const router = express.Router();

/**
 * @route   GET /api/public/blood-availability
 * @desc    Search aggregated blood availability across approved organizations
 * @access  Public
 */
router.get('/blood-availability', publicController.getPublicBloodAvailability);

module.exports = router;
