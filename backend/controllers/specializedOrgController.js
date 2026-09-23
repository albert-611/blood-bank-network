/**
 * ============================================================================
 * BLOOD BANK PLATFORM — SPECIALIZED ORGANIZATION CONTROLLER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9, §16, §18, §21)
 *
 * Implements specialized endpoints for querying hospitals, clinics, and blood banks:
 * - GET /api/hospitals, GET /api/hospitals/:id
 * - GET /api/clinics, GET /api/clinics/:id
 * - GET /api/blood-banks, GET /api/blood-banks/:id
 *
 * Defaults to returning APPROVED facilities for public / operational consumers per §21.
 * Platform Super Admins can query all statuses via ?status= or ?all=true.
 */

const db = require('../config/db');

/**
 * List Hospitals
 * GET /api/hospitals
 */
async function listHospitals(req, res, next) {
  try {
    const isSuperAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN');
    const { status, city } = req.query;

    let query = `
      SELECT o.id, o.name, o.type, o.email, o.phone, o.address, o.city, o.country,
             o.license_number, o.status, o.created_at, o.updated_at,
             h.bed_count
      FROM organizations o
      JOIN hospitals h ON o.id = h.organization_id
      WHERE o.type = 'HOSPITAL'
    `;
    const params = [];

    if (isSuperAdmin && status) {
      query += ' AND o.status = ?';
      params.push(status.toUpperCase().trim());
    } else if (!isSuperAdmin || !req.query.all) {
      // General/active directory only returns APPROVED organizations per §21
      query += ' AND o.status = "APPROVED"';
    }

    if (city) {
      query += ' AND o.city LIKE ?';
      params.push(`%${city.trim()}%`);
    }

    query += ' ORDER BY o.name ASC';

    const [hospitals] = await db.query(query, params);

    return res.status(200).json({
      success: true,
      data: {
        total: hospitals.length,
        hospitals
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Hospital by ID
 * GET /api/hospitals/:id
 */
async function getHospitalById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);

    const [rows] = await db.query(
      `SELECT o.id, o.name, o.type, o.email, o.phone, o.address, o.city, o.country,
              o.license_number, o.status, o.created_at, o.updated_at,
              h.bed_count
       FROM organizations o
       JOIN hospitals h ON o.id = h.organization_id
       WHERE o.id = ? AND o.type = 'HOSPITAL'
       LIMIT 1`,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Hospital not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        hospital: rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List Clinics
 * GET /api/clinics
 */
async function listClinics(req, res, next) {
  try {
    const isSuperAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN');
    const { status, city } = req.query;

    let query = `
      SELECT o.id, o.name, o.type, o.email, o.phone, o.address, o.city, o.country,
             o.license_number, o.status, o.created_at, o.updated_at
      FROM organizations o
      JOIN clinics c ON o.id = c.organization_id
      WHERE o.type = 'CLINIC'
    `;
    const params = [];

    if (isSuperAdmin && status) {
      query += ' AND o.status = ?';
      params.push(status.toUpperCase().trim());
    } else if (!isSuperAdmin || !req.query.all) {
      query += ' AND o.status = "APPROVED"';
    }

    if (city) {
      query += ' AND o.city LIKE ?';
      params.push(`%${city.trim()}%`);
    }

    query += ' ORDER BY o.name ASC';

    const [clinics] = await db.query(query, params);

    return res.status(200).json({
      success: true,
      data: {
        total: clinics.length,
        clinics
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Clinic by ID
 * GET /api/clinics/:id
 */
async function getClinicById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);

    const [rows] = await db.query(
      `SELECT o.id, o.name, o.type, o.email, o.phone, o.address, o.city, o.country,
              o.license_number, o.status, o.created_at, o.updated_at
       FROM organizations o
       JOIN clinics c ON o.id = c.organization_id
       WHERE o.id = ? AND o.type = 'CLINIC'
       LIMIT 1`,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Clinic not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        clinic: rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List Blood Banks
 * GET /api/blood-banks
 */
async function listBloodBanks(req, res, next) {
  try {
    const isSuperAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.global_role === 'SUPER_ADMIN');
    const { status, city } = req.query;

    let query = `
      SELECT o.id, o.name, o.type, o.email, o.phone, o.address, o.city, o.country,
             o.license_number, o.status, o.created_at, o.updated_at,
             bb.storage_capacity_units
      FROM organizations o
      JOIN blood_banks bb ON o.id = bb.organization_id
      WHERE o.type = 'BLOOD_BANK'
    `;
    const params = [];

    if (isSuperAdmin && status) {
      query += ' AND o.status = ?';
      params.push(status.toUpperCase().trim());
    } else if (!isSuperAdmin || !req.query.all) {
      query += ' AND o.status = "APPROVED"';
    }

    if (city) {
      query += ' AND o.city LIKE ?';
      params.push(`%${city.trim()}%`);
    }

    query += ' ORDER BY o.name ASC';

    const [bloodBanks] = await db.query(query, params);

    return res.status(200).json({
      success: true,
      data: {
        total: bloodBanks.length,
        blood_banks: bloodBanks
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Blood Bank by ID
 * GET /api/blood-banks/:id
 */
async function getBloodBankById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);

    const [rows] = await db.query(
      `SELECT o.id, o.name, o.type, o.email, o.phone, o.address, o.city, o.country,
              o.license_number, o.status, o.created_at, o.updated_at,
              bb.storage_capacity_units
       FROM organizations o
       JOIN blood_banks bb ON o.id = bb.organization_id
       WHERE o.id = ? AND o.type = 'BLOOD_BANK'
       LIMIT 1`,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Blood bank not found.',
          code: 'NOT_FOUND'
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        blood_bank: rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listHospitals,
  getHospitalById,
  listClinics,
  getClinicById,
  listBloodBanks,
  getBloodBankById
};
