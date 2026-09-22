/**
 * ============================================================================
 * BLOOD BANK PLATFORM — REQUEST VALIDATION MIDDLEWARE
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§18 & §25)
 *
 * Uses Joi to validate incoming request bodies against strict schemas.
 * Ensures data integrity, prevents unwanted fields, and standardizes
 * validation error responses without exposing server internals.
 */

/**
 * Creates an Express middleware to validate req.body against a Joi schema.
 *
 * @param {import('joi').ObjectSchema} schema - Joi schema object
 * @returns {import('express').RequestHandler} Express middleware function
 */
function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,     // Return all errors, not just the first one
      stripUnknown: true     // Strip unspecified fields for security
    });

    if (error) {
      const details = error.details.map((detail) => detail.message.replace(/['"]/g, ''));
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request data provided',
          code: 'VALIDATION_ERROR',
          details
        }
      });
    }

    // Replace req.body with the sanitized and coerced values
    req.body = value;
    next();
  };
}

module.exports = {
  validateBody
};
