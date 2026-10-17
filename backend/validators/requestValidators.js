/**
 * ============================================================================
 * BLOOD BANK PLATFORM — BLOOD REQUEST VALIDATORS
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9.11, §9.12, §18, §25)
 *
 * Enforces strict Joi validation for blood request submission and updates,
 * including preferred treatment facility (registered vs manual) rules.
 */

const Joi = require('joi');

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS = ['WHOLE_BLOOD', 'PACKED_RBC', 'PLASMA', 'PLATELETS', 'CRYO'];
const PRIORITIES = ['ROUTINE', 'URGENT', 'CRITICAL', 'LOW', 'MEDIUM', 'HIGH'];

const createBloodRequestSchema = Joi.object({
  blood_group: Joi.string()
    .valid(...BLOOD_GROUPS)
    .optional()
    .messages({
      'any.only': 'Invalid blood group. Allowed: A+, A-, B+, B-, AB+, AB-, O+, O-'
    }),

  items: Joi.array().items(
    Joi.object({
      blood_group: Joi.string().valid(...BLOOD_GROUPS).required(),
      component: Joi.string().valid(...COMPONENTS, 'RED_CELLS', 'RED_BLOOD_CELLS').default('WHOLE_BLOOD'),
      units_requested: Joi.number().integer().min(1).max(50).optional(),
      quantity: Joi.number().integer().min(1).max(50).optional(),
      units: Joi.number().integer().min(1).max(50).optional()
    }).unknown(true)
  ).optional(),

  component: Joi.string()
    .valid(...COMPONENTS, 'RED_CELLS', 'RED_BLOOD_CELLS')
    .default('WHOLE_BLOOD')
    .messages({
      'any.only': 'Invalid component. Allowed: WHOLE_BLOOD, PACKED_RBC, PLASMA, PLATELETS, CRYO'
    }),

  quantity: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .default(1)
    .messages({
      'number.base': 'Quantity must be a valid number',
      'number.integer': 'Quantity must be an integer',
      'number.min': 'Quantity must be at least 1 unit',
      'number.max': 'Quantity cannot exceed 50 units per requisition'
    }),

  units: Joi.number().integer().min(1).max(50).optional(),

  priority: Joi.string()
    .valid(...PRIORITIES)
    .default('ROUTINE')
    .messages({
      'any.only': 'Priority must be ROUTINE, URGENT, or CRITICAL'
    }),

  notes: Joi.string().trim().max(1000).allow('', null).optional(),
  clinical_context: Joi.string().trim().max(1000).allow('', null).optional(),
  patient_ref: Joi.string().trim().max(150).allow('', null).optional(),

  required_by: Joi.any().allow(null).optional(),
  needed_by: Joi.any().allow(null).optional(),

  organization_id: Joi.number().integer().positive().allow(null).optional(),

  // Preferred Treatment Facility (§Section 5 & 6)
  preferred_organization_id: Joi.number()
    .integer()
    .positive()
    .allow(null)
    .optional()
    .messages({
      'number.base': 'Preferred organization ID must be a numeric integer',
      'number.positive': 'Preferred organization ID must be positive'
    }),

  preferred_facility_name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .allow(null)
    .optional()
    .messages({
      'string.min': 'Manual facility name must be at least 2 characters',
      'string.max': 'Manual facility name cannot exceed 150 characters'
    }),

  preferred_facility_location: Joi.string()
    .trim()
    .max(255)
    .allow(null, '')
    .optional()
    .messages({
      'string.max': 'Manual facility location cannot exceed 255 characters'
    })
}).custom((value, helpers) => {
  // Normalize items array to top-level blood_group, component, quantity
  if (Array.isArray(value.items) && value.items.length > 0) {
    const firstItem = value.items[0];
    if (!value.blood_group && firstItem.blood_group) {
      value.blood_group = firstItem.blood_group;
    }
    if (!value.component && firstItem.component) {
      value.component = firstItem.component;
    }
    const itemQty = firstItem.units_requested || firstItem.quantity || firstItem.units;
    if (itemQty && !value.quantity) {
      value.quantity = itemQty;
    }
  }

  if (!value.blood_group) {
    return helpers.error('any.required', { message: 'Blood group is required' });
  }

  // Normalize units to quantity if provided
  if (value.units && !value.quantity) {
    value.quantity = value.units;
  }
  // Normalize RED_CELLS alias to PACKED_RBC
  if (value.component === 'RED_CELLS' || value.component === 'RED_BLOOD_CELLS') {
    value.component = 'PACKED_RBC';
  }
  // Normalize priority aliases
  if (value.priority === 'LOW') value.priority = 'ROUTINE';
  else if (value.priority === 'MEDIUM') value.priority = 'ROUTINE';
  else if (value.priority === 'HIGH') value.priority = 'URGENT';

  // Normalize needed_by to required_by
  if (value.needed_by && !value.required_by) {
    value.required_by = value.needed_by;
  }
  if (value.required_by instanceof Date) {
    value.required_by = value.required_by.toISOString().slice(0, 19).replace('T', ' ');
  }

  // Normalize notes / clinical_context
  if (!value.notes && value.clinical_context) {
    value.notes = value.clinical_context;
  } else if (!value.notes && value.patient_ref) {
    value.notes = value.patient_ref;
  }

  // Cross-field validation:
  const hasRegistered = Boolean(value.preferred_organization_id);
  const hasManual = Boolean(value.preferred_facility_name && String(value.preferred_facility_name).trim().length > 0);

  if (hasRegistered && hasManual) {
    return helpers.error('custom.mutualExclusiveFacility', {
      message: 'Cannot provide both a registered facility ID and a manual facility name simultaneously.'
    });
  }

  return value;
});

/**
 * Middleware to validate POST /api/blood-requests
 */
function validateCreateBloodRequest(req, res, next) {
  const payload = req.body || {};

  const { error, value } = createBloodRequestSchema.validate(payload, {
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
        message: errorDetails[0]?.message || 'Validation failed for blood request.',
        code: 'VALIDATION_ERROR',
        details: errorDetails
      }
    });
  }

  req.validatedBody = value;
  next();
}

/**
 * Update Blood Request Schema (Supports 6-hour edit window modifications)
 */
const updateBloodRequestSchema = Joi.object({
  blood_group: Joi.string()
    .valid(...BLOOD_GROUPS)
    .optional()
    .messages({
      'any.only': 'Invalid blood group. Allowed: A+, A-, B+, B-, AB+, AB-, O+, O-'
    }),

  component: Joi.string()
    .valid(...COMPONENTS, 'RED_CELLS', 'RED_BLOOD_CELLS')
    .optional()
    .messages({
      'any.only': 'Invalid component. Allowed: WHOLE_BLOOD, PACKED_RBC, PLASMA, PLATELETS, CRYO'
    }),

  quantity: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .optional()
    .messages({
      'number.base': 'Quantity must be a valid number',
      'number.integer': 'Quantity must be an integer',
      'number.min': 'Quantity must be at least 1 unit',
      'number.max': 'Quantity cannot exceed 50 units per requisition'
    }),

  units: Joi.number().integer().min(1).max(50).optional(),

  priority: Joi.string()
    .valid(...PRIORITIES)
    .optional()
    .messages({
      'any.only': 'Priority must be ROUTINE, URGENT, or CRITICAL'
    }),

  notes: Joi.string().trim().max(1000).allow('', null).optional(),
  clinical_context: Joi.string().trim().max(1000).allow('', null).optional(),
  patient_ref: Joi.string().trim().max(150).allow('', null).optional(),

  required_by: Joi.any().allow(null).optional(),
  needed_by: Joi.any().allow(null).optional(),

  preferred_organization_id: Joi.number()
    .integer()
    .positive()
    .allow(null)
    .optional(),

  preferred_facility_name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .allow(null, '')
    .optional(),

  preferred_facility_location: Joi.string()
    .trim()
    .max(255)
    .allow(null, '')
    .optional()
}).custom((value, helpers) => {
  if (value.units && !value.quantity) {
    value.quantity = value.units;
  }
  if (value.component === 'RED_CELLS' || value.component === 'RED_BLOOD_CELLS') {
    value.component = 'PACKED_RBC';
  }
  if (value.priority === 'LOW') value.priority = 'ROUTINE';
  else if (value.priority === 'MEDIUM') value.priority = 'ROUTINE';
  else if (value.priority === 'HIGH') value.priority = 'URGENT';

  if (value.needed_by && !value.required_by) {
    value.required_by = value.needed_by;
  }
  if (value.required_by instanceof Date) {
    value.required_by = value.required_by.toISOString().slice(0, 19).replace('T', ' ');
  }

  if (!value.notes && value.clinical_context) {
    value.notes = value.clinical_context;
  } else if (!value.notes && value.patient_ref) {
    value.notes = value.patient_ref;
  }

  // Cross-field validation for preferred facility
  const hasRegistered = Boolean(value.preferred_organization_id);
  const hasManual = Boolean(value.preferred_facility_name && String(value.preferred_facility_name).trim().length > 0);

  if (hasRegistered && hasManual) {
    return helpers.error('custom.mutualExclusiveFacility', {
      message: 'Cannot provide both a registered facility ID and a manual facility name simultaneously.'
    });
  }

  return value;
});

/**
 * Middleware to validate PUT /api/blood-requests/:id
 */
function validateUpdateBloodRequest(req, res, next) {
  const payload = req.body || {};

  const { error, value } = updateBloodRequestSchema.validate(payload, {
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
        message: errorDetails[0]?.message || 'Validation failed for blood request update.',
        code: 'VALIDATION_ERROR',
        details: errorDetails
      }
    });
  }

  req.validatedBody = value;
  next();
}

/**
 * Cancel Blood Request Schema
 */
const cancelBloodRequestSchema = Joi.object({
  reason: Joi.string().trim().max(255).allow('', null).optional()
});

/**
 * Middleware to validate POST /api/blood-requests/:id/cancel
 */
function validateCancelBloodRequest(req, res, next) {
  const payload = req.body || {};

  const { error, value } = cancelBloodRequestSchema.validate(payload, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid cancellation request payload.',
        code: 'VALIDATION_ERROR'
      }
    });
  }

  req.validatedBody = value;
  next();
}

module.exports = {
  BLOOD_GROUPS,
  COMPONENTS,
  PRIORITIES,
  createBloodRequestSchema,
  validateCreateBloodRequest,
  updateBloodRequestSchema,
  validateUpdateBloodRequest,
  cancelBloodRequestSchema,
  validateCancelBloodRequest
};
