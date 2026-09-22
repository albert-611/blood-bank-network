/**
 * ============================================================================
 * BLOOD BANK PLATFORM — ORGANIZATION ROUTES
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9, §11, §18, §25)
 *
 * Exposes endpoints for organization onboarding, registration, and type metadata.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const orgController = require('../controllers/orgController');
const {
  normalizeOrgPayload,
  validateOrgRegistration
} = require('../validators/orgValidators');

const router = express.Router();

// Rate limiter for organization registration (max 15 attempts per 15 min per IP)
const orgRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.ORG_REGISTER_RATE_LIMIT_MAX, 10) || 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many registration requests from this IP. Please try again after 15 minutes.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  }
});

const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const requireOrg = require('../middleware/requireOrg');

/**
 * @route   GET /api/organizations/types
 * @desc    Get supported organization types and descriptions
 * @access  Public
 */
router.get('/types', orgController.getOrganizationTypes);

/**
 * @route   POST /api/organizations/register
 * @desc    Register a new organization and create its initial administrator
 * @access  Public
 */
router.post(
  '/register',
  orgRegisterLimiter,
  normalizeOrgPayload,
  validateOrgRegistration,
  orgController.registerOrganization
);

/**
 * @route   GET /api/organizations/me
 * @desc    Get authenticated user's organization profile
 * @access  Protected
 */
router.get(
  '/me',
  authenticate,
  orgController.getOrganizationMe
);

/**
 * @route   PATCH /api/organizations/me
 * @desc    Update authenticated organization details
 * @access  Protected (ORGANIZATION_ADMIN only)
 */
router.patch(
  '/me',
  authenticate,
  requireRole('ORGANIZATION_ADMIN'),
  requireOrg,
  orgController.updateOrganizationMe
);

/**
 * @route   GET /api/organizations/:id
 * @desc    Get organization details by ID
 * @access  Protected (Super Admin or Own Organization)
 */
router.get(
  '/:id',
  authenticate,
  orgController.getOrganizationById
);

module.exports = router;

