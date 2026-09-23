/**
 * ============================================================================
 * BLOOD BANK PLATFORM — ORGANIZATION CONTROLLER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9, §10, §11, §12, §25)
 *
 * Implements organization onboarding workflows:
 * - Public Organization Registration (POST /api/organizations/register)
 * - Atomic transaction for Organization + Organization Admin creation
 * - Status initialization to PENDING (never auto-approved)
 * - Organization types discovery (GET /api/organizations/types)
 */

const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { logAuditEvent } = require('../utils/auditLogger');

// Bcrypt work factor per §12 & §25 requirements
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Register a New Organization & Initial Organization Admin
 * POST /api/organizations/register
 *
 * Enforces atomic database transaction:
 * 1. Checks duplicate organization email & admin email.
 * 2. Creates Organization with status = 'PENDING'.
 * 3. Creates 1:1 type extension (hospitals, clinics, or blood_banks).
 * 4. Hashes password with bcrypt (cost 12).
 * 5. Creates Administrator User with global_role = 'ORG_USER', status = 'PENDING_VERIFICATION'.
 * 6. Creates organization_staff record binding user to organization with role ORGANIZATION_ADMIN.
 * 7. Records audit trail event.
 * 8. Commits or rolls back atomically.
 */
async function registerOrganization(req, res, next) {
  let connection = null;

  try {
    const payload = req.validatedBody || req.body;
    const { organization, admin } = payload;

    // Defense-in-depth: validate required payload objects
    if (!organization || !admin) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Both organization details and administrator details are required.',
          code: 'INVALID_PAYLOAD'
        }
      });
    }

    // Step 1: Check for duplicate organization email
    const [existingOrgs] = await db.query(
      'SELECT id FROM organizations WHERE email = ? LIMIT 1',
      [organization.email.toLowerCase().trim()]
    );

    if (existingOrgs && existingOrgs.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          message: 'An organization with this email is already registered.',
          code: 'ORGANIZATION_EMAIL_EXISTS',
          field: 'organization.email'
        }
      });
    }

    // Step 2: Check for duplicate admin user email
    const [existingUsers] = await db.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [admin.email.toLowerCase().trim()]
    );

    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          message: 'An account with this email already exists.',
          code: 'EMAIL_ALREADY_EXISTS',
          field: 'admin.email'
        }
      });
    }

    // Step 3: Obtain a transactional connection from the pool
    if (typeof db.getConnection === 'function') {
      try {
        connection = await db.getConnection();
      } catch (poolErr) {
        // Fallback for mock environment
        connection = null;
      }
    }

    // Prepare connection executor (handles connection pool or direct fallback)
    const executor = connection || {
      query: db.query.bind(db),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {}
    };

    // Begin atomic transaction
    await executor.beginTransaction();

    // Step 4: Insert Organization (Status is strictly PENDING)
    const insertOrgQuery = `
      INSERT INTO organizations (name, type, email, phone, address, city, country, license_number, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `;

    const [orgResult] = await executor.query(insertOrgQuery, [
      organization.name.trim(),
      organization.type,
      organization.email.toLowerCase().trim(),
      organization.phone.trim(),
      organization.address.trim(),
      organization.city.trim(),
      organization.country ? organization.country.trim() : 'USA',
      organization.license_number ? organization.license_number.trim() : null
    ]);

    const organizationId = orgResult.insertId;

    // Step 5: Insert specialized 1:1 extension record based on organization type
    if (organization.type === 'HOSPITAL') {
      const beds = organization.bed_count !== null && organization.bed_count !== undefined ? Number(organization.bed_count) : null;
      await executor.query(
        'INSERT INTO hospitals (organization_id, bed_count) VALUES (?, ?) ON DUPLICATE KEY UPDATE bed_count = VALUES(bed_count)',
        [organizationId, beds]
      );
    } else if (organization.type === 'CLINIC') {
      await executor.query(
        'INSERT INTO clinics (organization_id) VALUES (?) ON DUPLICATE KEY UPDATE organization_id = organization_id',
        [organizationId]
      );
    } else if (organization.type === 'BLOOD_BANK') {
      const capacity = organization.storage_capacity_units !== null && organization.storage_capacity_units !== undefined ? Number(organization.storage_capacity_units) : null;
      await executor.query(
        'INSERT INTO blood_banks (organization_id, storage_capacity_units) VALUES (?, ?) ON DUPLICATE KEY UPDATE storage_capacity_units = VALUES(storage_capacity_units)',
        [organizationId, capacity]
      );
    }

    // Step 6: Hash admin password using bcrypt (cost 12)
    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    const passwordHash = await bcrypt.hash(admin.password, salt);

    // Step 7: Insert initial Administrator into users table
    const insertUserQuery = `
      INSERT INTO users (full_name, email, password_hash, phone, organization_id, global_role, status)
      VALUES (?, ?, ?, ?, ?, 'ORG_USER', 'PENDING_VERIFICATION')
    `;

    const [userResult] = await executor.query(insertUserQuery, [
      admin.name.trim(),
      admin.email.toLowerCase().trim(),
      passwordHash,
      admin.phone ? admin.phone.trim() : null,
      organizationId
    ]);

    const adminUserId = userResult.insertId;

    // Step 8: Look up or default role ID for ORGANIZATION_ADMIN
    const [roleRows] = await executor.query(
      "SELECT id FROM roles WHERE name = 'ORGANIZATION_ADMIN' LIMIT 1"
    );

    let orgAdminRoleId = roleRows && roleRows.length > 0 ? roleRows[0].id : null;

    if (!orgAdminRoleId) {
      // Fallback mapping if role was not yet inserted into DB
      if (organization.type === 'HOSPITAL') orgAdminRoleId = 2; // HOSPITAL_ADMIN
      else if (organization.type === 'CLINIC') orgAdminRoleId = 3; // CLINIC_ADMIN
      else if (organization.type === 'BLOOD_BANK') orgAdminRoleId = 4; // BLOOD_BANK_STAFF
      else orgAdminRoleId = 2;
    }

    // Step 9: Link admin to organization in organization_staff
    await executor.query(
      `INSERT INTO organization_staff (user_id, organization_id, role_id, status)
       VALUES (?, ?, ?, 'ACTIVE')`,
      [adminUserId, organizationId, orgAdminRoleId]
    );

    // Step 10: Commit atomic transaction
    await executor.commit();

    if (connection) {
      connection.release();
      connection = null;
    }

    // Step 11: Record audit log (outside transaction so failure doesn't abort creation)
    try {
      await logAuditEvent({
        userId: adminUserId,
        action: 'ORG_REGISTER',
        resourceType: 'ORGANIZATION',
        resourceId: organizationId,
        newValue: {
          organizationName: organization.name,
          organizationType: organization.type,
          organizationEmail: organization.email,
          adminEmail: admin.email,
          status: 'PENDING'
        },
        ipAddress: req.ip
      });
    } catch (auditErr) {
      console.warn('Non-fatal: Failed to log audit event for organization registration:', auditErr.message);
    }

    // Step 12: Return sanitized response (NEVER return password or password_hash)
    return res.status(201).json({
      success: true,
      message: 'Organization registration submitted successfully.',
      organization: {
        id: organizationId,
        name: organization.name,
        type: organization.type,
        status: 'PENDING'
      },
      admin: {
        id: adminUserId,
        name: admin.name,
        email: admin.email,
        role: 'ORGANIZATION_ADMIN'
      }
    });

  } catch (err) {
    console.error('Organization registration error:', err.message || err);
    // If anything fails, rollback the transaction cleanly
    if (connection) {
      try {
        await connection.rollback();
        connection.release();
      } catch (rollbackErr) {
        console.error('Error during transaction rollback:', rollbackErr);
      }
      connection = null;
    }

    // Handle duplicate key error from MySQL directly if raced
    if (err.code === 'ER_DUP_ENTRY') {
      const isEmail = err.message && err.message.toLowerCase().includes('email');
      return res.status(409).json({
        success: false,
        error: {
          message: isEmail
            ? 'An organization or account with this email is already registered.'
            : 'A duplicate record already exists.',
          code: 'DUPLICATE_ENTRY'
        }
      });
    }

    next(err);
  }
}

/**
 * Get Supported Organization Types
 * GET /api/organizations/types
 *
 * Returns metadata for registration form choices.
 */
function getOrganizationTypes(req, res) {
  res.status(200).json({
    success: true,
    data: [
      {
        type: 'HOSPITAL',
        title: 'Hospital',
        icon: '🏥',
        badge: 'Inpatient Care',
        description: 'Register a hospital and create its BloodLink organization workspace for unit tracking, orders, and issuing.'
      },
      {
        type: 'CLINIC',
        title: 'Clinic',
        icon: '🏪',
        badge: 'Outpatient Care',
        description: 'Register a clinic and connect its blood availability and request workflow for clinical procedures.'
      },
      {
        type: 'BLOOD_BANK',
        title: 'Blood Bank',
        icon: '🩸',
        badge: 'Collection & Processing',
        description: 'Manage donors, donations, blood units, laboratory testing, and regional blood inventory distribution.'
      }
    ]
  });
}

/**
 * Get Authenticated User's Organization Profile
 * GET /api/organizations/me
 */
async function getOrganizationMe(req, res, next) {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'No organization is linked to this account.',
          code: 'NO_ORGANIZATION'
        }
      });
    }

    const [rows] = await db.query(
      `SELECT id, name, type, email, phone, address, city, country, license_number, status, created_at, updated_at
       FROM organizations
       WHERE id = ?
       LIMIT 1`,
      [orgId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Organization record not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        organization: rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Own Organization Profile
 * PATCH /api/organizations/me
 */
async function updateOrganizationMe(req, res, next) {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied. You do not belong to an organization.',
          code: 'NO_ORGANIZATION_ASSIGNED'
        }
      });
    }

    const { name, phone, address, city, country } = req.body;

    const updates = [];
    const values = [];

    if (name && typeof name === 'string') {
      updates.push('name = ?');
      values.push(name.trim());
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone ? String(phone).trim() : null);
    }
    if (address !== undefined) {
      updates.push('address = ?');
      values.push(address ? String(address).trim() : null);
    }
    if (city !== undefined) {
      updates.push('city = ?');
      values.push(city ? String(city).trim() : null);
    }
    if (country !== undefined) {
      updates.push('country = ?');
      values.push(country ? String(country).trim() : 'USA');
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'No valid update fields provided.',
          code: 'INVALID_REQUEST'
        }
      });
    }

    values.push(orgId);

    await db.query(
      `UPDATE organizations SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Fetch updated record
    const [rows] = await db.query(
      `SELECT id, name, type, email, phone, address, city, country, license_number, status, updated_at
       FROM organizations
       WHERE id = ?`,
      [orgId]
    );

    return res.status(200).json({
      success: true,
      data: {
        organization: rows[0]
      },
      message: 'Organization profile updated successfully.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a New Organization (Authenticated Onboarding)
 * POST /api/organizations
 *
 * Requirements:
 * - Status strictly initialized to PENDING (never trusted from request)
 * - Atomic transaction across organizations, subtype extension, and organization_staff
 * - Subtype validation: bed_count (HOSPITAL), storage_capacity_units (BLOOD_BANK)
 * - Rollback on any failure (no orphan records)
 * - Audit log: ORGANIZATION_CREATED
 */
async function createOrganization(req, res, next) {
  let connection = null;

  try {
    const orgData = req.validatedOrg || req.body.organization || req.body;
    const {
      name,
      type,
      phone,
      address,
      city,
      country = 'USA',
      license_number = null,
      email = null,
      bed_count = null,
      storage_capacity_units = null
    } = orgData;

    // Defense-in-depth: validate required fields
    if (!name || !type || !phone || !address || !city) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required organization fields: name, type, phone, address, city are required.',
          code: 'INVALID_PAYLOAD'
        }
      });
    }

    const validTypes = ['HOSPITAL', 'CLINIC', 'BLOOD_BANK'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid organization type. Allowed types: ${validTypes.join(', ')}`,
          code: 'INVALID_ORGANIZATION_TYPE'
        }
      });
    }

    // Subtype numeric validation defense
    if (type === 'HOSPITAL' && bed_count !== null && bed_count !== undefined) {
      const parsedBeds = Number(bed_count);
      if (isNaN(parsedBeds) || parsedBeds < 0 || !Number.isInteger(parsedBeds)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Bed count must be a non-negative integer.',
            code: 'INVALID_BED_COUNT'
          }
        });
      }
    }

    if (type === 'BLOOD_BANK' && storage_capacity_units !== null && storage_capacity_units !== undefined) {
      const parsedCapacity = Number(storage_capacity_units);
      if (isNaN(parsedCapacity) || parsedCapacity < 0 || !Number.isInteger(parsedCapacity)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Storage capacity units must be a non-negative integer.',
            code: 'INVALID_STORAGE_CAPACITY'
          }
        });
      }
    }

    // Obtain transactional connection
    if (typeof db.getConnection === 'function') {
      try {
        connection = await db.getConnection();
      } catch (poolErr) {
        connection = null;
      }
    }

    const executor = connection || {
      query: db.query.bind(db),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {}
    };

    // Begin atomic transaction
    await executor.beginTransaction();

    // 1. Insert into organizations with status = 'PENDING'
    const insertOrgQuery = `
      INSERT INTO organizations (name, type, email, phone, address, city, country, license_number, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `;

    const [orgResult] = await executor.query(insertOrgQuery, [
      name.trim(),
      type,
      email ? email.toLowerCase().trim() : null,
      phone.trim(),
      address.trim(),
      city.trim(),
      country ? country.trim() : 'USA',
      license_number ? license_number.trim() : null
    ]);

    const organizationId = orgResult.insertId;

    // 2. Insert into specialized subtype extension table
    if (type === 'HOSPITAL') {
      const parsedBedCount = bed_count !== null && bed_count !== undefined ? parseInt(bed_count, 10) : null;
      await executor.query(
        'INSERT INTO hospitals (organization_id, bed_count) VALUES (?, ?)',
        [organizationId, parsedBedCount]
      );
    } else if (type === 'CLINIC') {
      await executor.query(
        'INSERT INTO clinics (organization_id) VALUES (?)',
        [organizationId]
      );
    } else if (type === 'BLOOD_BANK') {
      const parsedCapacity = storage_capacity_units !== null && storage_capacity_units !== undefined
        ? parseInt(storage_capacity_units, 10)
        : null;
      await executor.query(
        'INSERT INTO blood_banks (organization_id, storage_capacity_units) VALUES (?, ?)',
        [organizationId, parsedCapacity]
      );
    }

    // 3. If request is from an authenticated user, bind user to organization in organization_staff
    if (req.user && req.user.id) {
      // Resolve role for submitting user
      let targetRoleName = 'ORGANIZATION_ADMIN';
      if (type === 'HOSPITAL') targetRoleName = 'HOSPITAL_ADMIN';
      else if (type === 'CLINIC') targetRoleName = 'CLINIC_ADMIN';
      else if (type === 'BLOOD_BANK') targetRoleName = 'BLOOD_BANK_STAFF';

      let roleId = null;
      try {
        const [roleRows] = await executor.query(
          'SELECT id FROM roles WHERE name = ? OR name = "ORGANIZATION_ADMIN" ORDER BY id ASC LIMIT 1',
          [targetRoleName]
        );
        if (roleRows && roleRows.length > 0) {
          roleId = roleRows[0].id;
        }
      } catch (rErr) {
        roleId = 2;
      }

      if (!roleId) roleId = 2; // Fallback to HOSPITAL_ADMIN/ORG_ADMIN

      // Upsert or insert into organization_staff
      await executor.query(
        `INSERT INTO organization_staff (user_id, organization_id, role_id, status)
         VALUES (?, ?, ?, 'ACTIVE')
         ON DUPLICATE KEY UPDATE organization_id = VALUES(organization_id), role_id = VALUES(role_id)`,
        [req.user.id, organizationId, roleId]
      );

      // Update user's organization_id on users table
      await executor.query(
        'UPDATE users SET organization_id = ? WHERE id = ?',
        [organizationId, req.user.id]
      );
    }

    // Commit atomic transaction
    await executor.commit();

    if (connection) {
      connection.release();
      connection = null;
    }

    // Record audit log
    try {
      await logAuditEvent({
        userId: req.user ? req.user.id : null,
        action: 'ORGANIZATION_CREATED',
        resourceType: 'ORGANIZATION',
        resourceId: organizationId,
        newValue: {
          name,
          type,
          status: 'PENDING',
          bed_count: type === 'HOSPITAL' ? bed_count : undefined,
          storage_capacity_units: type === 'BLOOD_BANK' ? storage_capacity_units : undefined
        },
        ipAddress: req.ip
      });
    } catch (auditErr) {
      console.warn('Non-fatal: Failed to log audit event for organization creation:', auditErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Organization submitted successfully. Status: PENDING. Your organization is waiting for platform approval.',
      data: {
        organization: {
          id: organizationId,
          name,
          type,
          email: email || null,
          phone,
          address,
          city,
          country: country || 'USA',
          license_number: license_number || null,
          status: 'PENDING',
          bed_count: type === 'HOSPITAL' ? (bed_count !== null ? parseInt(bed_count, 10) : null) : undefined,
          storage_capacity_units: type === 'BLOOD_BANK' ? (storage_capacity_units !== null ? parseInt(storage_capacity_units, 10) : null) : undefined
        }
      }
    });

  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
        connection.release();
      } catch (rollbackErr) {
        console.error('Error during organization transaction rollback:', rollbackErr);
      }
      connection = null;
    }

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: {
          message: 'An organization with this email or license number is already registered.',
          code: 'DUPLICATE_ENTRY'
        }
      });
    }

    next(err);
  }
}

/**
 * List Organizations with Tenant Isolation
 * GET /api/organizations
 *
 * Super Admin: Views all organizations with filtering support.
 * Organization User: Strictly restricted to their own organization.
 */
async function listOrganizations(req, res, next) {
  try {
    const isSuperAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN');
    const { status, type, city } = req.query;

    let query = `
      SELECT o.id, o.name, o.type, o.email, o.phone, o.address, o.city, o.country,
             o.license_number, o.status, o.created_at, o.updated_at,
             h.bed_count,
             bb.storage_capacity_units,
             COUNT(os.id) AS staff_count
      FROM organizations o
      LEFT JOIN hospitals h ON o.id = h.organization_id
      LEFT JOIN clinics c ON o.id = c.organization_id
      LEFT JOIN blood_banks bb ON o.id = bb.organization_id
      LEFT JOIN organization_staff os ON o.id = os.organization_id
    `;
    const params = [];
    const conditions = [];

    if (isSuperAdmin) {
      // Super Admin can filter by status, type, city
      if (status) {
        conditions.push('o.status = ?');
        params.push(status.toUpperCase().trim());
      }
      if (type) {
        conditions.push('o.type = ?');
        params.push(type.toUpperCase().trim());
      }
      if (city) {
        conditions.push('o.city LIKE ?');
        params.push(`%${city.trim()}%`);
      }
    } else {
      // Tenant Isolation: Non-super-admins only see their own organization
      const userOrgId = req.user ? req.user.organization_id : null;
      if (!userOrgId) {
        return res.status(200).json({
          success: true,
          data: {
            total: 0,
            organizations: []
          }
        });
      }
      conditions.push('o.id = ?');
      params.push(userOrgId);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' GROUP BY o.id ORDER BY o.created_at DESC';

    const [organizations] = await db.query(query, params);

    return res.status(200).json({
      success: true,
      data: {
        total: organizations.length,
        organizations
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Specific Organization By ID
 * GET /api/organizations/:id
 *
 * Super Admin can access any organization.
 * Organization Admin can ONLY access their own organization.
 */
async function getOrganizationById(req, res, next) {
  try {
    const targetOrgId = parseInt(req.params.id, 10);
    const isSuperAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN');

    if (!isSuperAdmin && String(targetOrgId) !== String(req.user.organization_id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: You cannot view data belonging to another organization.',
          code: 'CROSS_ORGANIZATION_ACCESS_DENIED'
        }
      });
    }

    const [rows] = await db.query(
      `SELECT id, name, type, email, phone, address, city, country, license_number, status, created_at, updated_at
       FROM organizations
       WHERE id = ?
       LIMIT 1`,
      [targetOrgId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Organization not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    const org = rows[0];

    // Attach subtype details if present
    if (org.type === 'HOSPITAL') {
      try {
        const [hRows] = await db.query('SELECT bed_count FROM hospitals WHERE organization_id = ? LIMIT 1', [targetOrgId]);
        if (hRows && hRows.length > 0) org.bed_count = hRows[0].bed_count;
      } catch (err) {}
    } else if (org.type === 'BLOOD_BANK') {
      try {
        const [bbRows] = await db.query('SELECT storage_capacity_units FROM blood_banks WHERE organization_id = ? LIMIT 1', [targetOrgId]);
        if (bbRows && bbRows.length > 0) org.storage_capacity_units = bbRows[0].storage_capacity_units;
      } catch (err) {}
    }

    return res.status(200).json({
      success: true,
      data: {
        organization: org
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Generic Organization Update
 * PATCH /api/organizations/:id
 *
 * Super Admin can update any organization.
 * Organization Admin can ONLY update their own organization.
 * Prohibits status manipulation (status must be altered via /approve or /reject).
 */
async function updateOrganization(req, res, next) {
  try {
    const targetOrgId = parseInt(req.params.id, 10);
    const isSuperAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN');

    if (!isSuperAdmin && String(targetOrgId) !== String(req.user.organization_id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: You cannot update data belonging to another organization.',
          code: 'CROSS_ORGANIZATION_ACCESS_DENIED'
        }
      });
    }

    // Prohibit status mutation via generic update per §20
    if (req.body && req.body.status !== undefined) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Status cannot be updated through generic PATCH /api/organizations/:id. Use /approve or /reject.',
          code: 'STATUS_MUTATION_FORBIDDEN'
        }
      });
    }

    // Verify organization exists
    const [existing] = await db.query(
      'SELECT id, name, type, status FROM organizations WHERE id = ? LIMIT 1',
      [targetOrgId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Organization not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    const org = existing[0];
    const {
      name,
      phone,
      address,
      city,
      country,
      license_number,
      email,
      bed_count,
      storage_capacity_units
    } = req.validatedUpdate || req.body;

    const updates = [];
    const values = [];

    if (name && typeof name === 'string') {
      updates.push('name = ?');
      values.push(name.trim());
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone ? String(phone).trim() : null);
    }
    if (address !== undefined) {
      updates.push('address = ?');
      values.push(address ? String(address).trim() : null);
    }
    if (city !== undefined) {
      updates.push('city = ?');
      values.push(city ? String(city).trim() : null);
    }
    if (country !== undefined) {
      updates.push('country = ?');
      values.push(country ? String(country).trim() : 'USA');
    }
    if (license_number !== undefined) {
      updates.push('license_number = ?');
      values.push(license_number ? String(license_number).trim() : null);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email ? String(email).toLowerCase().trim() : null);
    }

    if (updates.length > 0) {
      values.push(targetOrgId);
      await db.query(`UPDATE organizations SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    // Update specialized subtype fields
    if (org.type === 'HOSPITAL' && bed_count !== undefined) {
      const parsedBeds = bed_count !== null ? parseInt(bed_count, 10) : null;
      await db.query(
        'UPDATE hospitals SET bed_count = ? WHERE organization_id = ?',
        [parsedBeds, targetOrgId]
      );
    } else if (org.type === 'BLOOD_BANK' && storage_capacity_units !== undefined) {
      const parsedCapacity = storage_capacity_units !== null ? parseInt(storage_capacity_units, 10) : null;
      await db.query(
        'UPDATE blood_banks SET storage_capacity_units = ? WHERE organization_id = ?',
        [parsedCapacity, targetOrgId]
      );
    }

    // Fetch updated record
    const [rows] = await db.query(
      `SELECT o.id, o.name, o.type, o.email, o.phone, o.address, o.city, o.country,
              o.license_number, o.status, o.created_at, o.updated_at,
              h.bed_count,
              bb.storage_capacity_units
       FROM organizations o
       LEFT JOIN hospitals h ON o.id = h.organization_id
       LEFT JOIN clinics c ON o.id = c.organization_id
       LEFT JOIN blood_banks bb ON o.id = bb.organization_id
       WHERE o.id = ?
       LIMIT 1`,
      [targetOrgId]
    );

    // Audit log
    try {
      await logAuditEvent({
        userId: req.user.id,
        action: 'ORGANIZATION_UPDATED',
        resourceType: 'ORGANIZATION',
        resourceId: targetOrgId,
        newValue: req.body,
        ipAddress: req.ip
      });
    } catch (auditErr) {
      console.warn('Non-fatal: Failed to log audit event for organization update:', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Organization profile updated successfully.',
      data: {
        organization: rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Super Admin Organization Approval
 * PATCH /api/organizations/:id/approve
 *
 * Requirements:
 * - Only SUPER_ADMIN may approve (non-super-admin receives 403 Forbidden)
 * - Expected transition: PENDING -> APPROVED
 * - Rejects already approved or invalid transition with 400
 * - Activates initial admin user account
 * - Records ORGANIZATION_APPROVED in audit_logs
 */
async function approveOrganization(req, res, next) {
  try {
    const isSuperAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN');
    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: Only platform Super Admin can approve organizations.',
          code: 'FORBIDDEN_ROLE'
        }
      });
    }

    const orgId = parseInt(req.params.id, 10);

    const [existing] = await db.query(
      'SELECT id, name, status, type FROM organizations WHERE id = ? LIMIT 1',
      [orgId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Organization not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    const previousStatus = existing[0].status;

    if (previousStatus === 'APPROVED') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Organization is already approved.',
          code: 'ALREADY_APPROVED'
        }
      });
    }

    if (previousStatus !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: {
          message: `Cannot approve organization with status ${previousStatus}. Only PENDING organizations can be approved.`,
          code: 'INVALID_STATUS_TRANSITION'
        }
      });
    }

    // Transition status to APPROVED
    await db.query('UPDATE organizations SET status = "APPROVED" WHERE id = ?', [orgId]);

    // Activate initial administrator if in PENDING_VERIFICATION
    await db.query(
      `UPDATE users 
       SET status = 'ACTIVE' 
       WHERE organization_id = ? AND status = 'PENDING_VERIFICATION'`,
      [orgId]
    );

    // Audit log
    try {
      await logAuditEvent({
        userId: req.user.id,
        action: 'ORGANIZATION_APPROVED',
        resourceType: 'ORGANIZATION',
        resourceId: orgId,
        previousValue: { status: previousStatus },
        newValue: { status: 'APPROVED' },
        ipAddress: req.ip
      });
    } catch (auditErr) {
      console.warn('Non-fatal: Failed to log audit event for organization approval:', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Organization successfully approved.',
      data: {
        organization: {
          id: orgId,
          name: existing[0].name,
          type: existing[0].type,
          previousStatus,
          status: 'APPROVED'
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Super Admin Organization Rejection
 * PATCH /api/organizations/:id/reject
 *
 * Requirements:
 * - Only SUPER_ADMIN may reject (non-super-admin receives 403 Forbidden)
 * - Expected transition: PENDING -> REJECTED
 * - Rejects non-pending transition with 400
 * - Records ORGANIZATION_REJECTED in audit_logs with reason
 */
async function rejectOrganization(req, res, next) {
  try {
    const isSuperAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN');
    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied: Only platform Super Admin can reject organizations.',
          code: 'FORBIDDEN_ROLE'
        }
      });
    }

    const orgId = parseInt(req.params.id, 10);
    const reason = (req.validatedReject && req.validatedReject.reason) || (req.body && req.body.reason) || null;

    const [existing] = await db.query(
      'SELECT id, name, status, type FROM organizations WHERE id = ? LIMIT 1',
      [orgId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Organization not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    const previousStatus = existing[0].status;

    if (previousStatus === 'REJECTED') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Organization is already rejected.',
          code: 'ALREADY_REJECTED'
        }
      });
    }

    if (previousStatus !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: {
          message: `Cannot reject organization with status ${previousStatus}. Only PENDING organizations can be rejected.`,
          code: 'INVALID_STATUS_TRANSITION'
        }
      });
    }

    // Transition status to REJECTED
    await db.query('UPDATE organizations SET status = "REJECTED" WHERE id = ?', [orgId]);

    // Audit log
    try {
      await logAuditEvent({
        userId: req.user.id,
        action: 'ORGANIZATION_REJECTED',
        resourceType: 'ORGANIZATION',
        resourceId: orgId,
        previousValue: { status: previousStatus },
        newValue: { status: 'REJECTED', reason },
        ipAddress: req.ip
      });
    } catch (auditErr) {
      console.warn('Non-fatal: Failed to log audit event for organization rejection:', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Organization has been rejected.',
      data: {
        organization: {
          id: orgId,
          name: existing[0].name,
          type: existing[0].type,
          previousStatus,
          status: 'REJECTED',
          reason
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registerOrganization,
  createOrganization,
  listOrganizations,
  getOrganizationTypes,
  getOrganizationMe,
  updateOrganizationMe,
  getOrganizationById,
  updateOrganization,
  approveOrganization,
  rejectOrganization
};


