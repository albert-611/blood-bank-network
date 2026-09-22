/**
 * ============================================================================
 * BLOOD BANK PLATFORM — ORGANIZATION ONBOARDING VALIDATORS
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9, §11, §12, §25)
 *
 * Enforces strict Joi validation rules for organization onboarding requests.
 * Normalizes and verifies organization profile and initial administrator details.
 */

const Joi = require('joi');

const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
const passwordCustomMessage =
  'Password must be between 8 and 72 characters and contain at least one letter and one number';

const organizationRegisterSchema = Joi.object({
  // Accept nested or flat representation
  organization: Joi.object({
    name: Joi.string().trim().min(2).max(150).required().messages({
      'string.empty': 'Organization name is required',
      'string.min': 'Organization name must be at least 2 characters',
      'string.max': 'Organization name cannot exceed 150 characters',
      'any.required': 'Organization name is required'
    }),
    type: Joi.string()
      .valid('HOSPITAL', 'CLINIC', 'BLOOD_BANK')
      .required()
      .messages({
        'any.only': 'Organization type must be HOSPITAL, CLINIC, or BLOOD_BANK',
        'any.required': 'Organization type is required'
      }),
    email: Joi.string().trim().lowercase().email().max(190).required().messages({
      'string.empty': 'Organization email is required',
      'string.email': 'Please provide a valid organization email address',
      'any.required': 'Organization email is required'
    }),
    phone: Joi.string().trim().min(5).max(30).required().messages({
      'string.empty': 'Organization phone number is required',
      'string.min': 'Organization phone must be at least 5 digits',
      'string.max': 'Organization phone cannot exceed 30 characters',
      'any.required': 'Organization phone number is required'
    }),
    address: Joi.string().trim().min(3).max(255).required().messages({
      'string.empty': 'Organization address is required',
      'string.min': 'Address must be at least 3 characters',
      'string.max': 'Address cannot exceed 255 characters',
      'any.required': 'Organization address is required'
    }),
    city: Joi.string().trim().min(2).max(100).required().messages({
      'string.empty': 'City is required',
      'string.min': 'City must be at least 2 characters',
      'string.max': 'City cannot exceed 100 characters',
      'any.required': 'City is required'
    }),
    country: Joi.string().trim().min(2).max(100).default('USA').messages({
      'string.empty': 'Country is required',
      'string.min': 'Country must be at least 2 characters',
      'string.max': 'Country cannot exceed 100 characters'
    }),
    license_number: Joi.string().trim().max(100).allow('', null).optional()
  }).required().messages({
    'any.required': 'Organization details are required'
  }),

  admin: Joi.object({
    name: Joi.string().trim().min(2).max(150).required().messages({
      'string.empty': 'Administrator full name is required',
      'string.min': 'Administrator name must be at least 2 characters',
      'string.max': 'Administrator name cannot exceed 150 characters',
      'any.required': 'Administrator full name is required'
    }),
    email: Joi.string().trim().lowercase().email().max(190).required().messages({
      'string.empty': 'Administrator email is required',
      'string.email': 'Please provide a valid administrator email address',
      'any.required': 'Administrator email is required'
    }),
    phone: Joi.string().trim().max(30).allow('', null).optional(),
    password: Joi.string().pattern(passwordPattern).required().messages({
      'string.empty': 'Password is required',
      'string.pattern.base': passwordCustomMessage,
      'any.required': 'Password is required'
    }),
    confirm_password: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
        'string.empty': 'Please confirm your password',
        'any.required': 'Please confirm your password'
      })
  }).required().messages({
    'any.required': 'Administrator details are required'
  })
});

/**
 * Middleware adapter to normalize flat or nested request body before Joi validation
 */
function normalizeOrgPayload(req, res, next) {
  if (!req.body) {
    req.body = {};
  }

  // If received as flat payload (e.g., standard HTML form submission)
  if (!req.body.organization && req.body.organization_name) {
    req.body = {
      organization: {
        name: req.body.organization_name,
        type: req.body.organization_type,
        email: req.body.organization_email,
        phone: req.body.organization_phone,
        address: req.body.address,
        city: req.body.city,
        country: req.body.country || 'USA',
        license_number: req.body.license_number || null
      },
      admin: {
        name: req.body.admin_name || req.body.full_name,
        email: req.body.admin_email || req.body.email,
        phone: req.body.admin_phone || req.body.phone || null,
        password: req.body.password,
        confirm_password: req.body.confirm_password || req.body.confirmPassword
      }
    };
  } else if (req.body.admin) {
    if (!req.body.admin.confirm_password && req.body.admin.confirmPassword) {
      req.body.admin.confirm_password = req.body.admin.confirmPassword;
    }
  }

  next();
}

/**
 * Express validation middleware runner for organization registration
 */
function validateOrgRegistration(req, res, next) {
  const { error, value } = organizationRegisterSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errorDetails = error.details.map((d) => ({
      field: d.path.join('.'),
      message: d.message
    }));

    return res.status(400).json({
      success: false,
      error: {
        message: error.details[0].message,
        code: 'VALIDATION_ERROR',
        details: errorDetails
      }
    });
  }

  req.validatedBody = value;
  next();
}

module.exports = {
  organizationRegisterSchema,
  normalizeOrgPayload,
  validateOrgRegistration
};
