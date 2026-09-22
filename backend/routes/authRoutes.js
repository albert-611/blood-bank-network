/**
 * ============================================================================
 * BLOOD BANK PLATFORM — AUTHENTICATION ROUTER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§12, §18, §25)
 *
 * Exposes endpoints for user registration, authentication, token verification,
 * and password recovery.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { verifyAccessToken } = require('../services/tokenService');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} = require('../validators/authValidators');

const router = express.Router();

// ============================================================================
// RATE LIMITING (§25)
// ============================================================================

// Standard auth rate limiter (15 minutes window, relaxed in dev mode)
const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || (isDev ? 1000 : 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  }
});

// Stricter login rate limiter to protect against brute-force attacks (relaxed in dev mode)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || (isDev ? 1000 : 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many login attempts from this IP address. Please try again after 15 minutes.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  }
});

function extractBearerToken(authHeader) {
  if (typeof authHeader !== 'string') return null;

  const match = authHeader.trim().match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// Graceful auth extractor for logout
function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);
  if (token) {
    try {
      const decoded = verifyAccessToken(token);
      req.user = { id: decoded.userId, global_role: decoded.globalRole };
    } catch {
      // Stateless: token error ignored on logout
    }
  }
  next();
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * @route   POST /api/auth/register
 * @desc    Public self-registration (DONOR or REQUESTER only)
 * @access  Public
 */
router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  authController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and issue JWT access token
 * @access  Public
 */
router.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  authController.login
);

/**
 * @route   POST /api/auth/logout
 * @desc    Stateless client logout (records audit log if authenticated)
 * @access  Public (stateless token discard)
 */
router.post(
  '/logout',
  optionalAuthenticate,
  authController.logout
);

/**
 * @route   GET /api/auth/me
 * @desc    Retrieve profile of the currently authenticated user
 * @access  Protected (Requires valid JWT Bearer token)
 */
router.get(
  '/me',
  authenticate,
  authController.getMe
);

/**
 * @route   PATCH /api/auth/me
 * @desc    Update profile with role & organization tampering protection
 * @access  Protected
 */
router.patch(
  '/me',
  authenticate,
  authController.updateMe
);


/**
 * @route   POST /api/auth/forgot-password
 * @desc    Initiate password reset (stubs email delivery to console for MVP)
 * @access  Public
 */
router.post(
  '/forgot-password',
  authLimiter,
  validateBody(forgotPasswordSchema),
  authController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Complete password reset with verified reset token
 * @access  Public
 */
router.post(
  '/reset-password',
  authLimiter,
  validateBody(resetPasswordSchema),
  authController.resetPassword
);

module.exports = router;
