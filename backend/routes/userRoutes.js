/**
 * ============================================================================
 * BLOOD BANK PLATFORM — USER ROUTES
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§12, §25)
 *
 * Exposes user profile routes with strict role-tampering defense.
 */

const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   GET /api/users/me
 * @desc    Get current authenticated user profile
 * @access  Protected
 */
router.get('/me', authenticate, authController.getMe);

/**
 * @route   PATCH /api/users/me
 * @desc    Update profile with role & organization tampering protection
 * @access  Protected
 */
router.patch('/me', authenticate, authController.updateMe);

module.exports = router;
