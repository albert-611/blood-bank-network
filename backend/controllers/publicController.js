/**
 * ============================================================================
 * BLOOD BANK PLATFORM — PUBLIC BLOOD SEARCH CONTROLLER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§8, §18, §25)
 *
 * Implements public blood availability discovery:
 * - Publicly accessible without authentication
 * - Strictly aggregates across APPROVED organizations only
 * - NEVER leaks donor PII, staff details, patient records, or internal notes
 */

const db = require('../config/db');

/**
 * Public Blood Availability Search
 * GET /api/public/blood-availability
 */
async function getPublicBloodAvailability(req, res, next) {
  try {
    const { blood_group, component, city } = req.query;

    let query = `
      SELECT o.id AS organization_id, 
             o.name AS organization_name, 
             o.type AS organization_type, 
             o.city,
             o.phone AS organization_phone,
             bu.blood_group, 
             bu.component, 
             COUNT(bu.id) AS available_units
      FROM blood_units bu
      JOIN organizations o ON bu.organization_id = o.id
      WHERE bu.status = 'AVAILABLE' 
        AND o.status = 'APPROVED'
        AND bu.expiry_date >= CURRENT_DATE
    `;

    const params = [];

    if (blood_group) {
      query += ' AND bu.blood_group = ?';
      params.push(blood_group.toUpperCase());
    }

    if (component) {
      query += ' AND bu.component = ?';
      params.push(component.toUpperCase());
    }

    if (city) {
      query += ' AND LOWER(o.city) = LOWER(?)';
      params.push(city.trim());
    }

    query += `
      GROUP BY o.id, o.name, o.type, o.city, o.phone, bu.blood_group, bu.component
      ORDER BY o.name ASC, bu.blood_group ASC
    `;

    const [rows] = await db.query(query, params);

    return res.status(200).json({
      success: true,
      data: {
        totalResults: rows.length,
        results: rows.map((row) => ({
          organization: {
            id: row.organization_id,
            name: row.organization_name,
            type: row.organization_type,
            city: row.city,
            contactPhone: row.organization_phone
          },
          bloodGroup: row.blood_group,
          component: row.component,
          availableUnits: parseInt(row.available_units, 10)
        }))
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPublicBloodAvailability
};
