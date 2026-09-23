/**
 * ============================================================================
 * BLOOD BANK PLATFORM — SPECIALIZED ORGANIZATION ROUTES
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§16, §18)
 *
 * Defines dedicated route handlers for:
 * - GET /api/hospitals, GET /api/hospitals/:id
 * - GET /api/clinics, GET /api/clinics/:id
 * - GET /api/blood-banks, GET /api/blood-banks/:id
 */

const express = require('express');
const {
  listHospitals,
  getHospitalById,
  listClinics,
  getClinicById,
  listBloodBanks,
  getBloodBankById
} = require('../controllers/specializedOrgController');

// Hospital Router
const hospitalRouter = express.Router();
hospitalRouter.get('/', listHospitals);
hospitalRouter.get('/:id', getHospitalById);

// Clinic Router
const clinicRouter = express.Router();
clinicRouter.get('/', listClinics);
clinicRouter.get('/:id', getClinicById);

// Blood Bank Router
const bloodBankRouter = express.Router();
bloodBankRouter.get('/', listBloodBanks);
bloodBankRouter.get('/:id', getBloodBankById);

module.exports = {
  hospitalRouter,
  clinicRouter,
  bloodBankRouter
};
