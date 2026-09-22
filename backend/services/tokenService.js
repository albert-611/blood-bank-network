/**
 * ============================================================================
 * BLOOD BANK PLATFORM — TOKEN SERVICE
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§12 & §25)
 *
 * Handles creation and cryptographic verification of JSON Web Tokens (JWT).
 *
 * ARCHITECTURAL NOTES (§12):
 * - Payload contains ONLY non-sensitive identity markers: `userId` and `globalRole`.
 *   Never embed passwords, personal health information, or excessive PII.
 * - MVP Token Expiry: 8 hours.
 *   MVP LIMITATION NOTE: In Version 2 / Production, this architecture will evolve
 *   to short-lived access tokens (15-30 minutes) accompanied by rotating refresh tokens
 *   and a server-side token blocklist (e.g. Redis) to support immediate revocation.
 */

const jwt = require('jsonwebtoken');

// Ensure JWT secret is present
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('FATAL CONFIGURATION ERROR: JWT_SECRET environment variable is missing from backend configuration!');
    const configError = new Error('JWT_SECRET is not configured on the server. Please define JWT_SECRET in your backend environment configuration.');
    configError.status = 500;
    configError.code = 'CONFIG_ERROR';
    throw configError;
  }
  return secret;
};

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const RESET_TOKEN_EXPIRES_IN = '15m'; // Short-lived 15 minutes for password resets

/**
 * Generate a signed JWT access token for an authenticated user.
 *
 * @param {Object} user - Sanitized user object
 * @param {number} user.id - User primary key
 * @param {string} user.global_role - Platform role (SUPER_ADMIN, ORG_USER, DONOR, REQUESTER)
 * @param {number|null} [user.organization_id] - Associated organization primary key
 * @returns {string} Signed JWT token string
 */
function generateAccessToken(user) {
  const payload = {
    id: user.id,
    userId: user.id,
    role: user.global_role,
    globalRole: user.global_role,
    organization_id: user.organization_id || null
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256'
  });
}

/**
 * Verify an access token and return its decoded payload.
 * Throws JsonWebTokenError or TokenExpiredError on failure.
 *
 * @param {string} token - Raw JWT string
 * @returns {Object} Decoded payload { userId, globalRole, iat, exp }
 */
function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
}

/**
 * Generate a single-use, time-limited token for password reset flows.
 *
 * @param {Object} user - Target user object
 * @param {number} user.id - User primary key
 * @param {string} user.email - User email address
 * @returns {string} Signed reset token
 */
function generatePasswordResetToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    purpose: 'password_reset'
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: RESET_TOKEN_EXPIRES_IN,
    algorithm: 'HS256'
  });
}

/**
 * Verify a password reset token.
 *
 * @param {string} token - Reset token string
 * @returns {Object} Decoded payload { userId, email, purpose }
 */
function verifyPasswordResetToken(token) {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  if (decoded.purpose !== 'password_reset') {
    throw new Error('Invalid token purpose');
  }
  return decoded;
}

module.exports = {
  generateAccessToken,
  verifyAccessToken,
  generatePasswordResetToken,
  verifyPasswordResetToken
};
