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
  validateOrgRegistration,
  validateOrgCreation,
  validateOrgUpdate,
  validateOrgReject
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
 * @route   GET /api/organizations
 * @desc    List organizations (Super Admin: all; Org User: own organization)
 * @access  Protected
 */
router.get(
  '/',
  authenticate,
  orgController.listOrganizations
);

/**
 * @route   POST /api/organizations
 * @desc    Authenticated user submits a new organization for review (status PENDING)
 * @access  Protected
 */
router.post(
  '/',
  authenticate,
  validateOrgCreation,
  orgController.createOrganization
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
 * @route   PATCH /api/organizations/:id/approve
 * @desc    Super Admin approves a pending organization
 * @access  Protected (SUPER_ADMIN)
 */
router.patch(
  '/:id/approve',
  authenticate,
  requireRole('SUPER_ADMIN'),
  orgController.approveOrganization
);

/**
 * @route   PATCH /api/organizations/:id/reject
 * @desc    Super Admin rejects a pending organization
 * @access  Protected (SUPER_ADMIN)
 */
router.patch(
  '/:id/reject',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validateOrgReject,
  orgController.rejectOrganization
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

/**
 * @route   PATCH /api/organizations/:id
 * @desc    Update organization details
 * @access  Protected (Super Admin or Own Organization Admin)
 */
router.patch(
  '/:id',
  authenticate,
  validateOrgUpdate,
  orgController.updateOrganization
);

module.exports = router;


