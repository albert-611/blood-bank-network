/**
 * ============================================================================
 * BLOOD BANK PLATFORM — INVENTORY & BLOOD UNITS CONTROLLER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9.10, §11, §25)
 *
 * Implements tenant-isolated blood inventory management:
 * - Scoped strictly to authenticated organization
 * - Prevents cross-organization unit viewing, creation, and manipulation
 * - Super Admin can view across organizations or scope to a specific organization
 */

const db = require('../config/db');
const { logAuditEvent } = require('../utils/auditLogger');

/**
 * List Blood Units in Current Organization
 * GET /api/inventory or GET /api/blood-units
 */
async function listInventory(req, res, next) {
  try {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN';
    const orgId = req.organizationId;

    let query = `
      SELECT bu.id, bu.unit_code, bu.donation_id, bu.organization_id,
             bu.blood_group, bu.component, bu.collection_date, bu.expiry_date, bu.status,
             bu.created_at, bu.updated_at,
             o.name AS organization_name, o.type AS organization_type
      FROM blood_units bu
      JOIN organizations o ON bu.organization_id = o.id
    `;
    const params = [];
    const conditions = [];

    // Enforce organization scoping
    if (!isSuperAdmin) {
      conditions.push('bu.organization_id = ?');
      params.push(orgId);
    } else if (orgId) {
      // Super Admin filtered by specific organization
      conditions.push('bu.organization_id = ?');
      params.push(orgId);
    }

    // Optional query filters
    if (req.query.blood_group) {
      conditions.push('bu.blood_group = ?');
      params.push(req.query.blood_group.toUpperCase());
    }
    if (req.query.component) {
      conditions.push('bu.component = ?');
      params.push(req.query.component.toUpperCase());
    }
    if (req.query.status) {
      conditions.push('bu.status = ?');
      params.push(req.query.status.toUpperCase());
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY bu.expiry_date ASC, bu.id DESC';

    const [units] = await db.query(query, params);

    return res.status(200).json({
      success: true,
      data: {
        total: units.length,
        organizationId: orgId || 'ALL',
        units
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Add / Record Blood Unit in Organization Inventory
 * POST /api/inventory
 */
async function createBloodUnit(req, res, next) {
  try {
    const orgId = req.organizationId;
    const { unit_code, blood_group, component, collection_date, expiry_date, status, donation_id } = req.body;

    if (!unit_code || !blood_group || !component || !collection_date || !expiry_date) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'unit_code, blood_group, component, collection_date, and expiry_date are required.',
          code: 'INVALID_INPUT'
        }
      });
    }

    // Check duplicate unit code
    const [existing] = await db.query(
      'SELECT id FROM blood_units WHERE unit_code = ? LIMIT 1',
      [unit_code.trim()]
    );

    if (existing && existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          message: `Blood unit code '${unit_code}' already exists.`,
          code: 'DUPLICATE_UNIT_CODE'
        }
      });
    }

    // Insert unit stamped strictly with authenticated organization ID
    const insertQuery = `
      INSERT INTO blood_units 
        (unit_code, donation_id, organization_id, blood_group, component, collection_date, expiry_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(insertQuery, [
      unit_code.trim(),
      donation_id ? parseInt(donation_id, 10) : null,
      orgId,
      blood_group.toUpperCase(),
      component.toUpperCase(),
      collection_date,
      expiry_date,
      status ? status.toUpperCase() : 'AVAILABLE'
    ]);

    const newUnitId = result.insertId;

    // Log audit trail
    logAuditEvent({
      userId: req.user.id,
      action: 'INVENTORY_UNIT_CREATE',
      resourceType: 'BLOOD_UNIT',
      resourceId: newUnitId,
      newValue: {
        unitCode: unit_code,
        organizationId: orgId,
        bloodGroup: blood_group,
        component,
        status: status || 'AVAILABLE'
      },
      ipAddress: req.ip
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      data: {
        unit: {
          id: newUnitId,
          unitCode: unit_code.trim(),
          organizationId: orgId,
          bloodGroup: blood_group.toUpperCase(),
          component: component.toUpperCase(),
          collectionDate: collection_date,
          expiryDate: expiry_date,
          status: status ? status.toUpperCase() : 'AVAILABLE'
        }
      },
      message: 'Blood unit added to inventory successfully.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Specific Blood Unit By ID
 * GET /api/inventory/:id
 *
 * Verifies resource ownership: Organization Admin can only view units owned by their organization.
 */
async function getBloodUnitById(req, res, next) {
  try {
    const unitId = req.params.id;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN';

    const [rows] = await db.query(
      `SELECT bu.id, bu.unit_code, bu.donation_id, bu.organization_id,
              bu.blood_group, bu.component, bu.collection_date, bu.expiry_date, bu.status,
              bu.created_at, bu.updated_at,
              o.name AS organization_name, o.type AS organization_type
       FROM blood_units bu
       JOIN organizations o ON bu.organization_id = o.id
       WHERE bu.id = ?
       LIMIT 1`,
      [unitId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Blood unit not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    const unit = rows[0];

    // Resource Ownership Check
    if (!isSuperAdmin && String(unit.organization_id) !== String(req.user.organization_id)) {
      logAuditEvent({
        userId: req.user.id,
        action: 'SECURITY_CROSS_ORG_UNIT_ACCESS',
        resourceType: 'BLOOD_UNIT',
        resourceId: parseInt(unitId, 10),
        previousValue: { userOrgId: req.user.organization_id },
        newValue: { unitOrgId: unit.organization_id },
        ipAddress: req.ip
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: You do not have permission to access blood units belonging to another organization.',
          code: 'CROSS_ORGANIZATION_ACCESS_DENIED'
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        unit
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listInventory,
  createBloodUnit,
  getBloodUnitById
};
