/**
 * ============================================================================
 * BLOOD BANK PLATFORM — AUTHENTICATION CONTROLLER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§12, §18, §23, §25)
 *
 * Implements core authentication workflows:
 * - Public self-registration (strictly DONOR or REQUESTER roles)
 * - User login with bcrypt verification & JWT issuance
 * - Stateless logout with audit trail
 * - Current user profile retrieval (GET /me)
 * - Password reset initiation (with console-stubbed email delivery)
 * - Password reset finalization
 */

const bcrypt = require('bcryptjs');
const db = require('../config/db');
const {
  generateAccessToken,
  generatePasswordResetToken,
  verifyPasswordResetToken
} = require('../services/tokenService');
const { logAuditEvent } = require('../utils/auditLogger');

// Bcrypt work factor per §12 & §25 requirements
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Public Self-Registration
 * POST /api/auth/register
 *
 * Enforces §12 rule: Only DONOR and REQUESTER accounts can self-register.
 * Initial account status is PENDING_VERIFICATION.
 */
async function register(req, res, next) {
  try {
    const { full_name, email, password, phone, global_role, blood_group } = req.body;

    // Defense-in-depth role check
    if (!['DONOR', 'REQUESTER'].includes(global_role)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Self-registration is permitted only for DONOR or REQUESTER accounts.',
          code: 'INVALID_ROLE'
        }
      });
    }

    // Check if an account already exists with this email address
    const [existingUsers] = await db.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          message: 'An account with this email address already exists.',
          code: 'EMAIL_ALREADY_EXISTS'
        }
      });
    }

    // Hash password with bcrypt cost 12
    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert new user with status PENDING_VERIFICATION
    const insertUserQuery = `
      INSERT INTO users (full_name, email, password_hash, phone, global_role, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING_VERIFICATION')
    `;

    const [userResult] = await db.query(insertUserQuery, [
      full_name,
      email,
      passwordHash,
      phone || null,
      global_role
    ]);

    const newUserId = userResult.insertId;

    // If registering as a donor with a specified blood group, create initial donor profile
    if (global_role === 'DONOR' && blood_group) {
      await db.query(
        'INSERT INTO donors (user_id, blood_group) VALUES (?, ?)',
        [newUserId, blood_group]
      );
    }

    // Record registration in audit logs
    await logAuditEvent({
      userId: newUserId,
      action: 'AUTH_REGISTER',
      resourceType: 'USER',
      resourceId: newUserId,
      newValue: { email, globalRole: global_role },
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUserId,
          fullName: full_name,
          email,
          phone: phone || null,
          globalRole: global_role,
          status: 'PENDING_VERIFICATION'
        }
      },
      message: 'Account registered successfully. Your account is pending verification.'
    });
  } catch (err) {
    console.error('Registration error:', err.message || err);
    next(err);
  }
}

/**
 * User Login
 * POST /api/auth/login
 *
 * Verifies email + password, checks account suspension, issues signed JWT.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // Query user by email (include password_hash for comparison)
    const [rows] = await db.query(
      `SELECT id, full_name, email, password_hash, phone, global_role, status, email_verified_at 
       FROM users 
       WHERE email = ? 
       LIMIT 1`,
      [email]
    );

    // Constant-time failure message to prevent user account enumeration
    const genericAuthError = {
      success: false,
      error: {
        message: 'Invalid email or password provided.',
        code: 'INVALID_CREDENTIALS'
      }
    };

    if (!rows || rows.length === 0) {
      return res.status(401).json(genericAuthError);
    }

    const user = rows[0];

    // Compare supplied password with stored bcrypt hash
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json(genericAuthError);
    }

    // Check account status
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Your account has been suspended. Please contact system support.',
          code: 'ACCOUNT_SUSPENDED'
        }
      });
    }

    // Generate signed JWT access token
    const token = generateAccessToken(user);

    // Record login audit event
    await logAuditEvent({
      userId: user.id,
      action: 'AUTH_LOGIN',
      resourceType: 'USER',
      resourceId: user.id,
      newValue: { email: user.email, globalRole: user.global_role },
      ipAddress: req.ip
    });

    // Check if the user is attached to an organization via organization_staff
    const [staffRows] = await db.query(
      `SELECT os.id, os.organization_id, os.role_id, os.status AS staff_status,
              r.name AS role_name,
              o.name AS organization_name, o.type AS organization_type, o.status AS organization_status
       FROM organization_staff os
       JOIN roles r ON os.role_id = r.id
       JOIN organizations o ON os.organization_id = o.id
       WHERE os.user_id = ?
       ORDER BY (os.status = 'ACTIVE') DESC
       LIMIT 1`,
      [user.id]
    );

    const organizationStaff = staffRows.length > 0 ? staffRows[0] : null;

    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          phone: user.phone,
          globalRole: user.global_role,
          status: user.status,
          emailVerifiedAt: user.email_verified_at,
          organizationStaff
        }
      },
      message: 'Login successful'
    });
  } catch (err) {
    console.error('Login error:', err.message || err);
    next(err);
  }
}

/**
 * User Logout
 * POST /api/auth/logout
 *
 * In MVP, JWT is stateless so client discards token.
 * Writes audit log if a valid token is present.
 */
async function logout(req, res, next) {
  try {
    // If the request was authenticated, record the logout event in audit logs
    if (req.user) {
      await logAuditEvent({
        userId: req.user.id,
        action: 'AUTH_LOGOUT',
        resourceType: 'USER',
        resourceId: req.user.id,
        ipAddress: req.ip
      });
    }

    // MVP Note (§12): Logout is stateless on the server side — the client-side
    // application removes the token from localStorage/memory. In Version 2,
    // a Redis-backed token revocation blocklist will be introduced.
    return res.status(200).json({
      success: true,
      data: null,
      message: 'Logged out successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Current User Profile
 * GET /api/auth/me
 *
 * Returns authenticated user details and associated organization staff info if present.
 */
async function getMe(req, res, next) {
  try {
    const user = req.user;

    // Check if the user is attached to an organization via organization_staff
    const [staffRows] = await db.query(
      `SELECT os.id, os.organization_id, os.role_id, os.status AS staff_status,
              r.name AS role_name,
              o.name AS organization_name, o.type AS organization_type, o.status AS organization_status
       FROM organization_staff os
       JOIN roles r ON os.role_id = r.id
       JOIN organizations o ON os.organization_id = o.id
       WHERE os.user_id = ?
       ORDER BY (os.status = 'ACTIVE') DESC
       LIMIT 1`,
      [user.id]
    );

    const organizationStaff = staffRows.length > 0 ? staffRows[0] : null;

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          phone: user.phone,
          globalRole: user.global_role,
          status: user.status,
          emailVerifiedAt: user.email_verified_at,
          organizationStaff
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Request Password Reset
 * POST /api/auth/forgot-password
 *
 * Generates a time-limited reset token and stubs delivery to console log for MVP.
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    const [rows] = await db.query(
      'SELECT id, email, status FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (rows && rows.length > 0 && rows[0].status !== 'SUSPENDED') {
      const user = rows[0];
      const resetToken = generatePasswordResetToken(user);

      // STUBBED EMAIL DELIVERY FOR MVP (§12):
      // In production, an email service (SendGrid/SES/SMTP) will deliver this token.
      console.log('\n================================================================');
      console.log('📧 [EMAIL DELIVERY STUB — PASSWORD RESET]');
      console.log(`To:          ${user.email}`);
      console.log(`Subject:     Blood Bank Platform Password Reset`);
      console.log(`Reset Token: ${resetToken}`);
      console.log(`Valid For:   15 minutes`);
      console.log(`Reset URL:   http://localhost:${process.env.PORT || 5000}/login.html?reset_token=${resetToken}`);
      console.log('================================================================\n');
    }

    // Always return success message to prevent account enumeration
    return res.status(200).json({
      success: true,
      message: 'If an active account exists for that email, a password reset link has been dispatched.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Execute Password Reset
 * POST /api/auth/reset-password
 *
 * Verifies reset token and updates password hash.
 */
async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;

    let decoded;
    try {
      decoded = verifyPasswordResetToken(token);
    } catch (tokenErr) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Password reset token is invalid or has expired. Please request a new one.',
          code: 'INVALID_RESET_TOKEN'
        }
      });
    }

    // Verify user still exists
    const [rows] = await db.query(
      'SELECT id, status FROM users WHERE id = ? LIMIT 1',
      [decoded.userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User account associated with this token was not found.',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Hash the new password with bcrypt cost 12
    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    const passwordHash = await bcrypt.hash(password, salt);

    // Update password hash
    await db.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, decoded.userId]
    );

    // Log password reset audit event
    await logAuditEvent({
      userId: decoded.userId,
      action: 'AUTH_PASSWORD_RESET',
      resourceType: 'USER',
      resourceId: decoded.userId,
      ipAddress: req.ip
    });

    return res.status(200).json({
      success: true,
      message: 'Password has been successfully reset. You may now log in with your new credentials.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Current User Profile
 * PATCH /api/auth/me or PATCH /api/users/me
 *
 * Enforces strict protection against privilege escalation and organization tampering (§15).
 */
async function updateMe(req, res, next) {
  try {
    const userId = req.user.id;
    const body = req.body || {};

    // Prevent Role Tampering (§15)
    if (
      body.role !== undefined ||
      body.global_role !== undefined ||
      body.globalRole !== undefined ||
      body.role_id !== undefined ||
      body.roleId !== undefined ||
      body.role_name !== undefined ||
      body.roleName !== undefined ||
      body.status !== undefined
    ) {
      logAuditEvent({
        userId,
        action: 'SECURITY_ROLE_TAMPERING_ATTEMPT',
        resourceType: 'USER',
        resourceId: userId,
        newValue: body,
        ipAddress: req.ip
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: Modifying roles or account status via profile update is strictly prohibited.',
          code: 'ROLE_TAMPERING_NOT_PERMITTED'
        }
      });
    }

    // Prevent Organization ID Tampering (§15)
    if (
      body.organization_id !== undefined ||
      body.organizationId !== undefined ||
      body.orgId !== undefined
    ) {
      logAuditEvent({
        userId,
        action: 'SECURITY_ORG_TAMPERING_ATTEMPT',
        resourceType: 'USER',
        resourceId: userId,
        newValue: body,
        ipAddress: req.ip
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: Modifying organization assignment is strictly prohibited.',
          code: 'ORGANIZATION_TAMPERING_NOT_PERMITTED'
        }
      });
    }

    const updates = [];
    const values = [];

    if (body.full_name && typeof body.full_name === 'string') {
      updates.push('full_name = ?');
      values.push(body.full_name.trim());
    }
    if (body.phone !== undefined) {
      updates.push('phone = ?');
      values.push(body.phone ? String(body.phone).trim() : null);
    }

    if (updates.length > 0) {
      values.push(userId);
      await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const [rows] = await db.query(
      'SELECT id, full_name, email, phone, organization_id, global_role, status FROM users WHERE id = ?',
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: {
        user: rows[0]
      },
      message: 'Profile updated successfully.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  getMe,
  updateMe,
  forgotPassword,
  resetPassword
};

