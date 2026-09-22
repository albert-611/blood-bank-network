/**
 * ============================================================================
 * BLOOD BANK PLATFORM — AUTHENTICATION VALIDATION SCHEMAS
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§12 & §25)
 *
 * Joi schemas enforcing strict validation rules on all incoming authentication
 * request bodies.
 */

const Joi = require('joi');

// Strong password regex: at least 8 characters, with at least one letter and one number
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
const passwordCustomMessage =
  'Password must be between 8 and 72 characters and contain at least one letter and one number';

const registerSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(150).required().messages({
    'string.empty': 'Full name is required',
    'string.min': 'Full name must be at least 2 characters',
    'string.max': 'Full name cannot exceed 150 characters'
  }),
  email: Joi.string().trim().lowercase().email().max(190).required().messages({
    'string.empty': 'Email address is required',
    'string.email': 'Please provide a valid email address'
  }),
  password: Joi.string().pattern(passwordPattern).required().messages({
    'string.empty': 'Password is required',
    'string.pattern.base': passwordCustomMessage
  }),
  phone: Joi.string().trim().max(30).allow('', null).optional(),
  // Strict Role Restriction (§12): Only DONOR or REQUESTER may self-register
  global_role: Joi.string()
    .valid('DONOR', 'REQUESTER')
    .required()
    .messages({
      'any.only': 'Self-registration is permitted only for DONOR or REQUESTER accounts. Hospital and staff accounts must be created by administrators.',
      'any.required': 'Account role (DONOR or REQUESTER) is required'
    }),
  blood_group: Joi.string()
    .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    .allow('', null)
    .optional()
});

const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required().messages({
    'string.empty': 'Email address is required',
    'string.email': 'Please provide a valid email address'
  }),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required'
  })
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required().messages({
    'string.empty': 'Email address is required',
    'string.email': 'Please provide a valid email address'
  })
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().trim().required().messages({
    'string.empty': 'Reset token is required'
  }),
  password: Joi.string().pattern(passwordPattern).required().messages({
    'string.empty': 'New password is required',
    'string.pattern.base': passwordCustomMessage
  })
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema
};
