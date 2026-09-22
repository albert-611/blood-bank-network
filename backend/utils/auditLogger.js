/**
 * ============================================================================
 * BLOOD BANK PLATFORM — AUDIT LOGGER UTILITY
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§23 & §25)
 *
 * Records immutable audit trail entries in the `audit_logs` table.
 * Tracks who changed what, when, and from where.
 *
 * CRITICAL SECURITY RULES:
 * - NEVER log raw passwords, hashed passwords, or JWT tokens.
 * - ALWAYS use parameterized queries to prevent SQL injection.
 * - Asynchronous execution with graceful error capture so audit failures
 *   do not crash the primary operational workflow.
 */

const db = require('../config/db');

/**
 * Log an operational or security event into `audit_logs`.
 *
 * @param {Object} params
 * @param {number|null} [params.userId=null] - ID of user performing the action (null if unauthenticated)
 * @param {string} params.action - Event name (e.g. 'AUTH_LOGIN', 'AUTH_REGISTER', 'AUTH_LOGOUT')
 * @param {string} params.resourceType - Target entity type (e.g. 'USER', 'ORGANIZATION', 'BLOOD_UNIT')
 * @param {number|null} [params.resourceId=null] - Target entity primary key
 * @param {Object|null} [params.previousValue=null] - Pre-mutation state (JSON)
 * @param {Object|null} [params.newValue=null] - Post-mutation state (JSON)
 * @param {string|null} [params.ipAddress=null] - Client IP address
 * @returns {Promise<number|null>} Inserted audit log ID or null on failure
 */
async function logAuditEvent({
  userId = null,
  action,
  resourceType,
  resourceId = null,
  previousValue = null,
  newValue = null,
  ipAddress = null
}) {
  try {
    const query = `
      INSERT INTO audit_logs 
        (user_id, action, resource_type, resource_id, previous_value, new_value, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const prevJson = previousValue ? JSON.stringify(previousValue) : null;
    const newJson = newValue ? JSON.stringify(newValue) : null;

    const [result] = await db.query(query, [
      userId,
      action,
      resourceType,
      resourceId,
      prevJson,
      newJson,
      ipAddress
    ]);

    return result.insertId;
  } catch (err) {
    // In MVP, log failure to server stderr without breaking caller workflow
    console.error('⚠️ [AuditLog Error] Failed to write audit log entry:', err.message);
    return null;
  }
}

module.exports = {
  logAuditEvent
};
