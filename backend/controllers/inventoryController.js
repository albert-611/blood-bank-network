/**
 * ============================================================================
 * BLOOD BANK PLATFORM — INVENTORY & BLOOD UNITS CONTROLLER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9.10, §11, §14, §18, §25)
 *
 * Implements tenant-isolated blood inventory management:
 * - Scoped strictly to authenticated organization
 * - Real availability calculation: AVAILABLE only when status = 'AVAILABLE' AND expiry_date >= CURDATE()
 * - Prevents cross-organization unit viewing, creation, and manipulation
 * - Exposes KPI inventory summary metrics (total, available, expired, expiring soon, reserved)
 * - Search, filtering (blood group, component, status, availability, expiry days), pagination
 * - Lifecycle state machine enforcement and audit logging
 */

const db = require('../config/db');
const { logAuditEvent } = require('../utils/auditLogger');

// Domain enums from schema.sql (§9.10)
const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const VALID_COMPONENTS = ['WHOLE_BLOOD', 'PACKED_RBC', 'PLASMA', 'PLATELETS', 'CRYO'];
const VALID_STATUSES = [
  'DONATED',
  'TESTING',
  'AVAILABLE',
  'RESERVED',
  'ISSUED',
  'COMPLETED',
  'EXPIRED',
  'DISCARDED',
  'REJECTED'
];
const TERMINAL_STATUSES = ['COMPLETED', 'DISCARDED', 'REJECTED'];

/**
 * Validate YYYY-MM-DD date format and calendar validity
 */
function isValidDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

/**
 * Get Today's Date String in YYYY-MM-DD
 */
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get Inventory Summary & Availability Metrics
 * GET /api/inventory/summary
 *
 * Availability Rule (§14):
 * A unit is AVAILABLE only if status = 'AVAILABLE' AND expiry_date >= CURDATE().
 * Expired units are never counted as available.
 */
async function getInventorySummary(req, res, next) {
  try {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN';
    const orgId = req.organizationId;
    const requestedOrgId = req.query.organization_id;

    let targetOrgId = orgId;
    if (isSuperAdmin) {
      if (requestedOrgId && requestedOrgId !== 'ALL') {
        const parsed = parseInt(requestedOrgId, 10);
        targetOrgId = isNaN(parsed) ? (orgId || null) : parsed;
      } else if (requestedOrgId === 'ALL') {
        targetOrgId = null;
      } else {
        targetOrgId = orgId || null;
      }
    }

    const conditions = [];
    const params = [];

    if (targetOrgId) {
      conditions.push('bu.organization_id = ?');
      params.push(targetOrgId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Aggregated metrics query (§14, §18)
    const statsQuery = `
      SELECT
        COUNT(*) AS total_recorded,
        COUNT(CASE WHEN bu.status = 'AVAILABLE' AND bu.expiry_date >= CURDATE() THEN 1 END) AS available_stock,
        COUNT(CASE WHEN bu.status = 'AVAILABLE' AND bu.expiry_date >= CURDATE() AND bu.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 END) AS expiring_within_7_days,
        COUNT(CASE WHEN bu.status IN ('EXPIRED', 'DISCARDED') OR (bu.expiry_date < CURDATE() AND bu.status NOT IN ('COMPLETED', 'ISSUED')) THEN 1 END) AS expired_or_discarded,
        COUNT(CASE WHEN bu.status = 'EXPIRED' OR (bu.expiry_date < CURDATE() AND bu.status NOT IN ('DISCARDED', 'COMPLETED', 'REJECTED')) THEN 1 END) AS expired_units,
        COUNT(CASE WHEN bu.status = 'DISCARDED' THEN 1 END) AS discarded_units,
        COUNT(CASE WHEN bu.status = 'RESERVED' THEN 1 END) AS reserved_units,
        COUNT(CASE WHEN bu.status = 'TESTING' THEN 1 END) AS testing_units,
        COUNT(CASE WHEN bu.status = 'ISSUED' THEN 1 END) AS issued_units
      FROM blood_units bu
      ${whereClause}
    `;

    const [statsRows] = await db.query(statsQuery, params);
    const row = statsRows[0] || {};

    const totalRecorded = parseInt(row.total_recorded, 10) || 0;
    const availableStock = parseInt(row.available_stock, 10) || 0;
    const expiringWithin7Days = parseInt(row.expiring_within_7_days, 10) || 0;
    const expiredOrDiscarded = parseInt(row.expired_or_discarded, 10) || 0;
    const expiredUnits = parseInt(row.expired_units, 10) || 0;
    const discardedUnits = parseInt(row.discarded_units, 10) || 0;
    const reservedUnits = parseInt(row.reserved_units, 10) || 0;
    const testingUnits = parseInt(row.testing_units, 10) || 0;
    const issuedUnits = parseInt(row.issued_units, 10) || 0;

    // Blood group matrix breakdown
    const groupQuery = `
      SELECT
        bu.blood_group,
        COUNT(*) AS total,
        COUNT(CASE WHEN bu.status = 'AVAILABLE' AND bu.expiry_date >= CURDATE() THEN 1 END) AS available,
        COUNT(CASE WHEN bu.status = 'RESERVED' THEN 1 END) AS reserved,
        COUNT(CASE WHEN bu.status = 'EXPIRED' OR (bu.expiry_date < CURDATE() AND bu.status NOT IN ('DISCARDED', 'COMPLETED', 'REJECTED')) THEN 1 END) AS expired
      FROM blood_units bu
      ${whereClause}
      GROUP BY bu.blood_group
    `;
    const [groupRows] = await db.query(groupQuery, params);

    const byBloodGroup = {};
    for (const bg of VALID_BLOOD_GROUPS) {
      byBloodGroup[bg] = { total: 0, available: 0, reserved: 0, expired: 0 };
    }
    for (const r of groupRows) {
      if (byBloodGroup[r.blood_group]) {
        byBloodGroup[r.blood_group] = {
          total: parseInt(r.total, 10) || 0,
          available: parseInt(r.available, 10) || 0,
          reserved: parseInt(r.reserved, 10) || 0,
          expired: parseInt(r.expired, 10) || 0
        };
      }
    }

    // Component breakdown
    const compQuery = `
      SELECT
        bu.component,
        COUNT(*) AS total,
        COUNT(CASE WHEN bu.status = 'AVAILABLE' AND bu.expiry_date >= CURDATE() THEN 1 END) AS available
      FROM blood_units bu
      ${whereClause}
      GROUP BY bu.component
    `;
    const [compRows] = await db.query(compQuery, params);

    const byComponent = {};
    for (const c of VALID_COMPONENTS) {
      byComponent[c] = { total: 0, available: 0 };
    }
    for (const r of compRows) {
      if (byComponent[r.component]) {
        byComponent[r.component] = {
          total: parseInt(r.total, 10) || 0,
          available: parseInt(r.available, 10) || 0
        };
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        organizationId: targetOrgId || 'ALL',
        totalRecorded,
        availableStock,
        expiringWithin7Days,
        expiredOrDiscarded,
        summary: {
          totalRecorded,
          availableStock,
          expiringWithin7Days,
          expiredOrDiscarded,
          total: totalRecorded,
          available: availableStock,
          expiringSoon: expiringWithin7Days,
          expired: expiredUnits,
          discarded: discardedUnits,
          reserved: reservedUnits,
          testing: testingUnits,
          issued: issuedUnits
        },
        byBloodGroup,
        byComponent
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List Blood Units in Current Organization
 * GET /api/inventory or GET /api/blood-units
 *
 * Supports search, filtering, deterministic sorting, and pagination.
 */
async function listInventory(req, res, next) {
  try {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN';
    const orgId = req.organizationId;
    const requestedOrgId = req.query.organization_id;

    let targetOrgId = orgId;
    if (isSuperAdmin) {
      targetOrgId = requestedOrgId ? parseInt(requestedOrgId, 10) : (orgId || null);
    }

    const conditions = [];
    const params = [];

    // Enforce organization scoping
    if (targetOrgId) {
      conditions.push('bu.organization_id = ?');
      params.push(targetOrgId);
    } else if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: Tenant organization required to list inventory.',
          code: 'ORGANIZATION_REQUIRED'
        }
      });
    }

    // Optional Search Filter (unit_code)
    if (req.query.search) {
      const search = String(req.query.search).trim();
      if (search.length > 0) {
        conditions.push('bu.unit_code LIKE ?');
        params.push(`%${search}%`);
      }
    }

    // Optional Blood Group Filter
    if (req.query.blood_group) {
      let bg = String(req.query.blood_group).toUpperCase();
      // Handle query param where '+' was parsed as a space (e.g. ?blood_group=O+ -> 'O ')
      if (bg.endsWith(' ') || (bg.length > 0 && !bg.endsWith('-') && !bg.endsWith('+'))) {
        bg = bg.trim() + '+';
      } else {
        bg = bg.trim();
      }
      if (!VALID_BLOOD_GROUPS.includes(bg)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Invalid blood_group '${bg}'. Supported values: ${VALID_BLOOD_GROUPS.join(', ')}`,
            code: 'INVALID_BLOOD_GROUP_FILTER'
          }
        });
      }
      conditions.push('bu.blood_group = ?');
      params.push(bg);
    }

    // Optional Component Filter
    if (req.query.component) {
      const comp = String(req.query.component).toUpperCase().trim();
      if (!VALID_COMPONENTS.includes(comp)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Invalid component '${comp}'. Supported values: ${VALID_COMPONENTS.join(', ')}`,
            code: 'INVALID_COMPONENT_FILTER'
          }
        });
      }
      conditions.push('bu.component = ?');
      params.push(comp);
    }

    // Optional Status Filter
    if (req.query.status) {
      const st = String(req.query.status).toUpperCase().trim();
      if (!VALID_STATUSES.includes(st)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Invalid status '${st}'. Supported values: ${VALID_STATUSES.join(', ')}`,
            code: 'INVALID_STATUS_FILTER'
          }
        });
      }
      conditions.push('bu.status = ?');
      params.push(st);
    }

    // Optional Availability Filter (§14: Available only if status='AVAILABLE' AND expiry_date >= CURDATE())
    if (req.query.is_available !== undefined) {
      const isAvail = String(req.query.is_available).toLowerCase().trim();
      if (isAvail === 'true' || isAvail === '1') {
        conditions.push("bu.status = 'AVAILABLE' AND bu.expiry_date >= CURDATE()");
      } else if (isAvail === 'false' || isAvail === '0') {
        conditions.push("(bu.status != 'AVAILABLE' OR bu.expiry_date < CURDATE())");
      }
    }

    // Optional Expiring Within Days Filter
    if (req.query.expiring_days !== undefined) {
      const days = parseInt(req.query.expiring_days, 10);
      if (isNaN(days) || days < 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'expiring_days must be a non-negative integer.',
            code: 'INVALID_FILTER'
          }
        });
      }
      conditions.push('bu.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)');
      params.push(days);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Pagination validation
    let page = 1;
    let limit = 20;

    if (req.query.page !== undefined) {
      const p = parseInt(req.query.page, 10);
      if (isNaN(p) || p < 1) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Page number must be an integer greater than or equal to 1.',
            code: 'INVALID_PAGINATION'
          }
        });
      }
      page = p;
    }

    if (req.query.limit !== undefined) {
      const l = parseInt(req.query.limit, 10);
      if (isNaN(l) || l < 1 || l > 100) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Limit must be an integer between 1 and 100.',
            code: 'INVALID_PAGINATION'
          }
        });
      }
      limit = l;
    }

    // Count total matching records for pagination
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM blood_units bu
      JOIN organizations o ON bu.organization_id = o.id
      ${whereClause}
    `;
    const [countRows] = await db.query(countQuery, params);
    const totalCount = parseInt(countRows[0].total, 10) || 0;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const offset = (page - 1) * limit;

    // Fetch paginated records with deterministic sort
    const dataQuery = `
      SELECT bu.id, bu.unit_code, bu.donation_id, bu.organization_id,
             bu.blood_group, bu.component, bu.collection_date, bu.expiry_date, bu.status,
             bu.created_at, bu.updated_at,
             o.name AS organization_name, o.type AS organization_type,
             CASE
               WHEN bu.status = 'AVAILABLE' AND bu.expiry_date >= CURDATE() THEN 1
               ELSE 0
             END AS is_available,
             CASE
               WHEN bu.expiry_date < CURDATE() THEN 1
               ELSE 0
             END AS is_expired
      FROM blood_units bu
      JOIN organizations o ON bu.organization_id = o.id
      ${whereClause}
      ORDER BY bu.expiry_date ASC, bu.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, limit, offset];
    const [units] = await db.query(dataQuery, dataParams);

    return res.status(200).json({
      success: true,
      data: {
        total: totalCount,
        page,
        limit,
        totalPages,
        organizationId: targetOrgId || 'ALL',
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
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN';
    const serverOrgId = req.organizationId;
    const {
      unit_code,
      blood_group,
      component,
      collection_date,
      expiry_date,
      status,
      donation_id,
      organization_id: bodyOrgId
    } = req.body;

    // Tenant Boundary Defense:
    // If client supplied organization_id and doesn't match authenticated org
    if (bodyOrgId && !isSuperAdmin && String(bodyOrgId) !== String(serverOrgId)) {
      logAuditEvent({
        userId: req.user.id,
        action: 'SECURITY_CROSS_ORG_MUTATION_ATTEMPT',
        resourceType: 'BLOOD_UNIT',
        previousValue: { userOrgId: serverOrgId },
        newValue: { attemptedOrgId: bodyOrgId, unitCode: unit_code },
        ipAddress: req.ip
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: Cannot create blood units for another organization.',
          code: 'CROSS_ORGANIZATION_ACCESS_DENIED'
        }
      });
    }

    const effectiveOrgId = isSuperAdmin ? (bodyOrgId ? parseInt(bodyOrgId, 10) : serverOrgId) : serverOrgId;

    if (!effectiveOrgId) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'A valid organization is required to create a blood unit.',
          code: 'ORGANIZATION_REQUIRED'
        }
      });
    }

    // Required fields check
    if (!unit_code || !blood_group || !component || !collection_date || !expiry_date) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'unit_code, blood_group, component, collection_date, and expiry_date are required.',
          code: 'INVALID_INPUT'
        }
      });
    }

    const cleanUnitCode = String(unit_code).trim();
    if (cleanUnitCode.length < 3 || cleanUnitCode.length > 50) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'unit_code must be between 3 and 50 characters.',
          code: 'INVALID_INPUT'
        }
      });
    }

    // Blood group validation
    const cleanBloodGroup = String(blood_group).toUpperCase().trim();
    if (!VALID_BLOOD_GROUPS.includes(cleanBloodGroup)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid blood_group '${blood_group}'. Supported values: ${VALID_BLOOD_GROUPS.join(', ')}`,
          code: 'INVALID_BLOOD_GROUP'
        }
      });
    }

    // Component validation
    const cleanComponent = String(component).toUpperCase().trim();
    if (!VALID_COMPONENTS.includes(cleanComponent)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid component '${component}'. Supported values: ${VALID_COMPONENTS.join(', ')}`,
          code: 'INVALID_COMPONENT'
        }
      });
    }

    // Date validations
    if (!isValidDateString(collection_date)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'collection_date must be a valid date in YYYY-MM-DD format.',
          code: 'INVALID_DATE'
        }
      });
    }

    if (!isValidDateString(expiry_date)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'expiry_date must be a valid date in YYYY-MM-DD format.',
          code: 'INVALID_DATE'
        }
      });
    }

    if (expiry_date < collection_date) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'expiry_date cannot be earlier than collection_date.',
          code: 'INVALID_DATES'
        }
      });
    }

    // Initial status validation
    const targetStatus = status ? String(status).toUpperCase().trim() : 'AVAILABLE';
    if (!VALID_STATUSES.includes(targetStatus)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid status '${status}'. Supported values: ${VALID_STATUSES.join(', ')}`,
          code: 'INVALID_STATUS'
        }
      });
    }

    // Expiry vs Availability rule (§14)
    const today = getTodayDateString();
    if (targetStatus === 'AVAILABLE' && expiry_date < today) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot create an inventory record with AVAILABLE status if the expiry date has already passed.',
          code: 'EXPIRED_UNIT_CANNOT_BE_AVAILABLE'
        }
      });
    }

    // Check duplicate unit code
    const [existing] = await db.query(
      'SELECT id FROM blood_units WHERE unit_code = ? LIMIT 1',
      [cleanUnitCode]
    );

    if (existing && existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          message: `Blood unit code '${cleanUnitCode}' already exists.`,
          code: 'DUPLICATE_UNIT_CODE'
        }
      });
    }

    // Insert unit stamped strictly with verified organization ID
    const insertQuery = `
      INSERT INTO blood_units 
        (unit_code, donation_id, organization_id, blood_group, component, collection_date, expiry_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(insertQuery, [
      cleanUnitCode,
      donation_id ? parseInt(donation_id, 10) : null,
      effectiveOrgId,
      cleanBloodGroup,
      cleanComponent,
      collection_date,
      expiry_date,
      targetStatus
    ]);

    const newUnitId = result.insertId;

    // Log audit trail
    logAuditEvent({
      userId: req.user.id,
      action: 'INVENTORY_UNIT_CREATE',
      resourceType: 'BLOOD_UNIT',
      resourceId: newUnitId,
      newValue: {
        unitCode: cleanUnitCode,
        organizationId: effectiveOrgId,
        bloodGroup: cleanBloodGroup,
        component: cleanComponent,
        collectionDate: collection_date,
        expiryDate: expiry_date,
        status: targetStatus
      },
      ipAddress: req.ip
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      data: {
        unit: {
          id: newUnitId,
          unit_code: cleanUnitCode,
          organization_id: effectiveOrgId,
          blood_group: cleanBloodGroup,
          component: cleanComponent,
          collection_date,
          expiry_date,
          status: targetStatus,
          is_available: targetStatus === 'AVAILABLE' && expiry_date >= today ? 1 : 0
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
 */
async function getBloodUnitById(req, res, next) {
  try {
    const unitId = req.params.id;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN';

    const [rows] = await db.query(
      `SELECT bu.id, bu.unit_code, bu.donation_id, bu.organization_id,
              bu.blood_group, bu.component, bu.collection_date, bu.expiry_date, bu.status,
              bu.created_at, bu.updated_at,
              o.name AS organization_name, o.type AS organization_type,
              CASE
                WHEN bu.status = 'AVAILABLE' AND bu.expiry_date >= CURDATE() THEN 1
                ELSE 0
              END AS is_available,
              CASE
                WHEN bu.expiry_date < CURDATE() THEN 1
                ELSE 0
              END AS is_expired
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

/**
 * Update Blood Unit in Inventory
 * PATCH /api/inventory/:id or PATCH /api/blood-units/:id
 */
async function updateBloodUnit(req, res, next) {
  try {
    const unitId = req.params.id;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN';

    // Retrieve unit if not already attached by checkResourceOwnership
    let unit = req.resource;
    if (!unit) {
      const [rows] = await db.query(
        'SELECT * FROM blood_units WHERE id = ? LIMIT 1',
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
      unit = rows[0];
    }

    // Strict Cross-Organization Mutation Defense
    if (!isSuperAdmin && String(unit.organization_id) !== String(req.user.organization_id)) {
      logAuditEvent({
        userId: req.user.id,
        action: 'SECURITY_CROSS_ORG_MUTATION_ATTEMPT',
        resourceType: 'BLOOD_UNIT',
        resourceId: parseInt(unitId, 10),
        previousValue: { userOrgId: req.user.organization_id },
        newValue: { targetUnitOrgId: unit.organization_id },
        ipAddress: req.ip
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: You do not have permission to modify blood units belonging to another organization.',
          code: 'CROSS_ORGANIZATION_ACCESS_DENIED'
        }
      });
    }

    // Prevent changing organization ownership via regular update
    if (req.body.organization_id && String(req.body.organization_id) !== String(unit.organization_id)) {
      logAuditEvent({
        userId: req.user.id,
        action: 'SECURITY_CROSS_ORG_MUTATION_ATTEMPT',
        resourceType: 'BLOOD_UNIT',
        resourceId: parseInt(unitId, 10),
        previousValue: { originalOrgId: unit.organization_id },
        newValue: { attemptedNewOrgId: req.body.organization_id },
        ipAddress: req.ip
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        error: {
          message: 'Blood unit organization ownership cannot be transferred.',
          code: 'ORGANIZATION_REASSIGNMENT_FORBIDDEN'
        }
      });
    }

    const { status, expiry_date, collection_date } = req.body;
    const updates = [];
    const params = [];

    const effectiveCollectionDate = collection_date || unit.collection_date;
    const effectiveExpiryDate = expiry_date || unit.expiry_date;

    // Validate collection_date if provided
    if (collection_date) {
      if (!isValidDateString(collection_date)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'collection_date must be a valid date in YYYY-MM-DD format.',
            code: 'INVALID_DATE'
          }
        });
      }
      updates.push('collection_date = ?');
      params.push(collection_date);
    }

    // Validate expiry_date if provided
    if (expiry_date) {
      if (!isValidDateString(expiry_date)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'expiry_date must be a valid date in YYYY-MM-DD format.',
            code: 'INVALID_DATE'
          }
        });
      }
      updates.push('expiry_date = ?');
      params.push(expiry_date);
    }

    // Ensure expiry_date >= collection_date
    if (effectiveExpiryDate < effectiveCollectionDate) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'expiry_date cannot be earlier than collection_date.',
          code: 'INVALID_DATES'
        }
      });
    }

    // Validate status & transitions if provided
    if (status) {
      const cleanStatus = String(status).toUpperCase().trim();
      if (!VALID_STATUSES.includes(cleanStatus)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Invalid status '${status}'. Supported values: ${VALID_STATUSES.join(', ')}`,
            code: 'INVALID_STATUS'
          }
        });
      }

      // Terminal status rule (§14): terminal states cannot transition to other states
      if (TERMINAL_STATUSES.includes(unit.status) && unit.status !== cleanStatus) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Cannot transition blood unit from terminal status '${unit.status}' to '${cleanStatus}'.`,
            code: 'INVALID_STATUS_TRANSITION'
          }
        });
      }

      // Expired units cannot be transitioned to AVAILABLE
      const today = getTodayDateString();
      if (cleanStatus === 'AVAILABLE' && effectiveExpiryDate < today) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Expired blood unit cannot be transitioned to AVAILABLE status.',
            code: 'INVALID_STATUS_TRANSITION'
          }
        });
      }

      updates.push('status = ?');
      params.push(cleanStatus);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'No valid editable fields provided. Allowed fields: status, expiry_date, collection_date.',
          code: 'INVALID_INPUT'
        }
      });
    }

    params.push(unitId);
    await db.query(`UPDATE blood_units SET ${updates.join(', ')} WHERE id = ?`, params);

    // Record audit trail
    logAuditEvent({
      userId: req.user.id,
      action: 'INVENTORY_UNIT_UPDATE',
      resourceType: 'BLOOD_UNIT',
      resourceId: parseInt(unitId, 10),
      previousValue: {
        status: unit.status,
        expiry_date: unit.expiry_date,
        collection_date: unit.collection_date,
        organization_id: unit.organization_id
      },
      newValue: {
        status: status ? status.toUpperCase().trim() : unit.status,
        expiry_date: expiry_date || unit.expiry_date,
        collection_date: collection_date || unit.collection_date
      },
      ipAddress: req.ip
    }).catch(() => {});

    const [updatedRows] = await db.query(
      `SELECT bu.id, bu.unit_code, bu.donation_id, bu.organization_id,
              bu.blood_group, bu.component, bu.collection_date, bu.expiry_date, bu.status,
              bu.created_at, bu.updated_at,
              o.name AS organization_name, o.type AS organization_type,
              CASE
                WHEN bu.status = 'AVAILABLE' AND bu.expiry_date >= CURDATE() THEN 1
                ELSE 0
              END AS is_available,
              CASE
                WHEN bu.expiry_date < CURDATE() THEN 1
                ELSE 0
              END AS is_expired
       FROM blood_units bu
       JOIN organizations o ON bu.organization_id = o.id
       WHERE bu.id = ?
       LIMIT 1`,
      [unitId]
    );

    return res.status(200).json({
      success: true,
      data: {
        unit: updatedRows && updatedRows.length > 0 ? updatedRows[0] : { ...unit, ...req.body }
      },
      message: 'Blood unit updated successfully.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Discard / Deactivate Blood Unit
 * DELETE /api/inventory/:id or POST /api/inventory/:id/discard
 *
 * Implements non-destructive deactivation (§14):
 * Retires blood unit by transitioning status to 'DISCARDED' with audit trail,
 * preserving traceability and historical records.
 */
async function discardBloodUnit(req, res, next) {
  try {
    const unitId = req.params.id;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN';

    let unit = req.resource;
    if (!unit) {
      const [rows] = await db.query(
        'SELECT * FROM blood_units WHERE id = ? LIMIT 1',
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
      unit = rows[0];
    }

    // Ownership check
    if (!isSuperAdmin && String(unit.organization_id) !== String(req.user.organization_id)) {
      logAuditEvent({
        userId: req.user.id,
        action: 'SECURITY_CROSS_ORG_MUTATION_ATTEMPT',
        resourceType: 'BLOOD_UNIT',
        resourceId: parseInt(unitId, 10),
        previousValue: { userOrgId: req.user.organization_id },
        newValue: { targetUnitOrgId: unit.organization_id },
        ipAddress: req.ip
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: You do not have permission to discard blood units belonging to another organization.',
          code: 'CROSS_ORGANIZATION_ACCESS_DENIED'
        }
      });
    }

    if (unit.status === 'DISCARDED') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Blood unit has already been discarded.',
          code: 'ALREADY_DISCARDED'
        }
      });
    }

    if (unit.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot discard a blood unit that has already been completed/transfused.',
          code: 'INVALID_STATUS_TRANSITION'
        }
      });
    }

    const reason = req.body && req.body.reason ? String(req.body.reason).trim() : 'Manual inventory retirement';

    await db.query(
      "UPDATE blood_units SET status = 'DISCARDED' WHERE id = ?",
      [unitId]
    );

    logAuditEvent({
      userId: req.user.id,
      action: 'INVENTORY_UNIT_DISCARD',
      resourceType: 'BLOOD_UNIT',
      resourceId: parseInt(unitId, 10),
      previousValue: { status: unit.status, organization_id: unit.organization_id },
      newValue: { status: 'DISCARDED', reason },
      ipAddress: req.ip
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      data: {
        unit: {
          ...unit,
          status: 'DISCARDED',
          is_available: 0
        }
      },
      message: 'Blood unit discarded successfully.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getInventorySummary,
  listInventory,
  createBloodUnit,
  getBloodUnitById,
  updateBloodUnit,
  discardBloodUnit
};
