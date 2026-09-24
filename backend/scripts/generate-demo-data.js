const fs = require('fs');
const path = require('path');

// Organizations
const organizations = [
  {
    id: 1,
    name: "City General Hospital",
    type: "HOSPITAL",
    status: "APPROVED",
    address: "100 Medical Center Blvd, Metro City",
    phone: "+1 (555) 123-4567",
    email: "hospital.admin@bloodbank.dev",
    licenseNumber: "HOSP-MED-09121",
    totalStaff: 48,
    activeDoctors: 14,
    established: 1985,
    submittedAt: "2026-01-10T08:00:00Z",
    approvedAt: "2026-01-15T09:30:00Z"
  },
  {
    id: 2,
    name: "Metro Community Clinic",
    type: "CLINIC",
    status: "APPROVED",
    address: "45 Westside Ave, Metro City",
    phone: "+1 (555) 234-5678",
    email: "clinic.admin@bloodbank.dev",
    licenseNumber: "CLN-REG-04812",
    totalStaff: 18,
    activeDoctors: 5,
    established: 2012,
    submittedAt: "2026-02-01T10:15:00Z",
    approvedAt: "2026-02-05T11:00:00Z"
  },
  {
    id: 3,
    name: "Central Red Cross Blood Bank",
    type: "BLOOD_BANK",
    status: "APPROVED",
    address: "789 Red Cross Way, Metro City",
    phone: "+1 (555) 345-6789",
    email: "bloodbank.staff@bloodbank.dev",
    licenseNumber: "BB-FDA-77190",
    totalStaff: 32,
    activeTechnologists: 12,
    storageCapacity: 1500,
    established: 1974,
    submittedAt: "2026-01-02T07:30:00Z",
    approvedAt: "2026-01-05T08:00:00Z"
  },
  // Pending demo organizations (§15: 3-5 pending)
  {
    id: 101,
    name: "Sunrise Medical Center",
    type: "HOSPITAL",
    status: "PENDING",
    address: "550 Sunrise Blvd, Metro City",
    phone: "+1 (555) 891-2345",
    email: "contact@sunrisemed.org",
    licenseNumber: "MED-LIC-88210",
    totalStaff: 35,
    submittedAt: "2026-09-24T14:30:00Z"
  },
  {
    id: 102,
    name: "Valley Health Pavilion",
    type: "CLINIC",
    status: "PENDING",
    address: "12 Valley Green Lane, North District",
    phone: "+1 (555) 782-9012",
    email: "admin@valleypavilion.org",
    licenseNumber: "CLN-LIC-44192",
    totalStaff: 14,
    submittedAt: "2026-09-23T11:15:00Z"
  },
  {
    id: 103,
    name: "St. Jude Diagnostics & Transfusion",
    type: "BLOOD_BANK",
    status: "PENDING",
    address: "404 Harbor View Rd, Bay Area",
    phone: "+1 (555) 673-1122",
    email: "operations@stjudeblood.org",
    licenseNumber: "BB-LIC-99301",
    totalStaff: 22,
    submittedAt: "2026-09-22T16:45:00Z"
  },
  {
    id: 104,
    name: "Mercy Urgent Care Center",
    type: "CLINIC",
    status: "PENDING",
    address: "910 Mercy Ave, South Sector",
    phone: "+1 (555) 321-7788",
    email: "info@mercyurgent.org",
    licenseNumber: "CLN-LIC-55018",
    totalStaff: 16,
    submittedAt: "2026-09-21T09:00:00Z"
  }
];

// Target quantities per requirement §5:
// A+: 24, A-: 8, B+: 19, B-: 5, AB+: 7, AB-: 2, O+: 31, O-: 6 => Total 102 units!
const groupDistribution = {
  'A+': 24,
  'A-': 8,
  'B+': 19,
  'B-': 5,
  'AB+': 7,
  'AB-': 2,
  'O+': 31,
  'O-': 6
};

const components = ['WHOLE_BLOOD', 'RED_CELLS', 'PLASMA', 'PLATELETS'];
const storageLocations = [
  'Cooling Unit Alpha-1 (Shelf A)',
  'Cooling Unit Alpha-2 (Shelf B)',
  'Platelet Agitator Rack 1',
  'Deep Freeze Gamma-3 (-30°C)',
  'Cold Vault Beta-1'
];

let unitCounter = 10001;
const inventory = [];

// Generate exact units
// We need exactly:
// 85 AVAILABLE (including 5 expiring soon: 2026-09-27, 2026-09-28, 2026-09-29, 2026-09-30)
// 10 RESERVED
// 4 ISSUED
// 3 EXPIRED
// Majority in org 3 (Central Red Cross), and 4 in org 1 (City General Hospital: 2 O+, 1 O-, 1 A+)

// Specific expiring soon assignments:
// 1 unit in A+, 1 in A-, 1 in B+, 2 in O+
const expiringAssignments = {
  'A+': ['2026-09-27'],
  'A-': ['2026-09-28'],
  'B+': ['2026-09-30'],
  'O+': ['2026-09-27', '2026-09-29']
};

// Reserved count per group:
// A+: 2, A-: 1, B+: 2, B-: 1, AB+: 1, AB-: 0, O+: 2, O-: 1 => Total 10
const reservedAssignments = {
  'A+': 2,
  'A-': 1,
  'B+': 2,
  'B-': 1,
  'AB+': 1,
  'AB-': 0,
  'O+': 2,
  'O-': 1
};

// Issued count per group:
// A+: 1, A-: 1, B+: 1, O+: 1 => Total 4
const issuedAssignments = {
  'A+': 1,
  'A-': 1,
  'B+': 1,
  'O+': 1
};

// Expired count per group:
// A+: 1, B+: 1, O+: 1 => Total 3
const expiredAssignments = {
  'A+': 1,
  'B+': 1,
  'O+': 1
};

Object.entries(groupDistribution).forEach(([bloodGroup, count]) => {
  const expiringDates = expiringAssignments[bloodGroup] ? [...expiringAssignments[bloodGroup]] : [];
  let reservedLeft = reservedAssignments[bloodGroup] || 0;
  let issuedLeft = issuedAssignments[bloodGroup] || 0;
  let expiredLeft = expiredAssignments[bloodGroup] || 0;

  for (let i = 0; i < count; i++) {
    const unitId = `UNIT-${unitCounter++}`;
    const comp = components[(unitCounter + i) % components.length];

    // Determine status
    let status = 'AVAILABLE';
    let expiryDate = '2026-10-25';
    let collectionDate = '2026-09-12';

    if (expiredLeft > 0) {
      status = 'EXPIRED';
      collectionDate = '2026-08-05';
      expiryDate = '2026-09-16'; // expired
      expiredLeft--;
    } else if (issuedLeft > 0) {
      status = 'ISSUED';
      collectionDate = '2026-09-01';
      expiryDate = '2026-10-15';
      issuedLeft--;
    } else if (reservedLeft > 0) {
      status = 'RESERVED';
      collectionDate = '2026-09-10';
      expiryDate = '2026-10-22';
      reservedLeft--;
    } else if (expiringDates.length > 0) {
      status = 'AVAILABLE';
      expiryDate = expiringDates.pop();
      collectionDate = '2026-08-16';
    } else {
      status = 'AVAILABLE';
      const dayOffset = (i * 3) % 25;
      collectionDate = `2026-09-${String(5 + (i % 15)).padStart(2, '0')}`;
      expiryDate = `2026-10-${String(15 + (i % 15)).padStart(2, '0')}`;
    }

    // Assign City General Hospital (org 1) 4 in-stock units
    let organizationId = 3;
    if (bloodGroup === 'O+' && (i === 0 || i === 1)) organizationId = 1;
    if (bloodGroup === 'O-' && i === 0) organizationId = 1;
    if (bloodGroup === 'A+' && i === 0) organizationId = 1;

    let storage = storageLocations[i % storageLocations.length];
    if (organizationId === 1) {
      storage = 'Hospital Surgical Cold Bank (Bay 2)';
    }

    inventory.push({
      id: unitId,
      organizationId,
      bloodGroup,
      component: comp,
      status,
      collectionDate,
      expiryDate,
      storageLocation: storage
    });
  }
});

// Blood Requests (16 requests across organizations)
const requests = [
  {
    id: "REQ-1001",
    organizationId: 1,
    organizationName: "City General Hospital",
    requesterName: "Dr. Robert Smith",
    bloodGroup: "O+",
    component: "WHOLE_BLOOD",
    units: 2,
    priority: "NORMAL",
    status: "PENDING",
    purpose: "Elective orthopedic knee arthroplasty",
    patientRef: "PT-9402",
    createdAt: "2026-09-24T10:15:00Z"
  },
  {
    id: "REQ-1002",
    organizationId: 1,
    organizationName: "City General Hospital",
    requesterName: "Dr. Robert Smith",
    bloodGroup: "O-",
    component: "RED_CELLS",
    units: 4,
    priority: "CRITICAL",
    status: "PENDING",
    purpose: "Trauma ICU emergency severe hemorrhage",
    patientRef: "PT-9418",
    createdAt: "2026-09-24T18:20:00Z"
  },
  {
    id: "REQ-1003",
    organizationId: 2,
    organizationName: "Metro Community Clinic",
    requesterName: "Nurse Elena Vance",
    bloodGroup: "A+",
    component: "PLASMA",
    units: 2,
    priority: "NORMAL",
    status: "APPROVED",
    purpose: "Outpatient severe coagulation support",
    patientRef: "PT-8821",
    createdAt: "2026-09-24T11:50:00Z"
  },
  {
    id: "REQ-1004",
    organizationId: 1,
    organizationName: "City General Hospital",
    requesterName: "Dr. Sarah Chen",
    bloodGroup: "A+",
    component: "PLATELETS",
    units: 3,
    priority: "CRITICAL",
    status: "APPROVED",
    purpose: "Emergency labor complications with thrombocytopenia",
    patientRef: "PT-9425",
    createdAt: "2026-09-24T17:45:00Z"
  },
  {
    id: "REQ-1005",
    organizationId: 2,
    organizationName: "Metro Community Clinic",
    requesterName: "Dr. Marcus Brody",
    bloodGroup: "B-",
    component: "WHOLE_BLOOD",
    units: 2,
    priority: "CRITICAL",
    status: "PENDING",
    purpose: "Urgent acute stabilization prior to hospital transfer",
    patientRef: "PT-8835",
    createdAt: "2026-09-24T19:10:00Z"
  },
  {
    id: "REQ-1006",
    organizationId: 1,
    organizationName: "City General Hospital",
    requesterName: "Dr. Robert Smith",
    bloodGroup: "B+",
    component: "RED_CELLS",
    units: 2,
    priority: "HIGH",
    status: "FULFILLED",
    purpose: "Vascular bypass graft surgery",
    patientRef: "PT-9380",
    createdAt: "2026-09-23T14:20:00Z"
  },
  {
    id: "REQ-1007",
    organizationId: 1,
    organizationName: "City General Hospital",
    requesterName: "Dr. Robert Smith",
    bloodGroup: "AB-",
    component: "RED_CELLS",
    units: 2,
    priority: "CRITICAL",
    status: "FULFILLED",
    purpose: "Cardiothoracic valve repair emergency",
    patientRef: "PT-9366",
    createdAt: "2026-09-22T22:30:00Z"
  },
  {
    id: "REQ-1008",
    organizationId: 2,
    organizationName: "Metro Community Clinic",
    requesterName: "Nurse Elena Vance",
    bloodGroup: "B+",
    component: "PLASMA",
    units: 2,
    priority: "NORMAL",
    status: "FULFILLED",
    purpose: "Chronic renal patient plasma exchange",
    patientRef: "PT-8799",
    createdAt: "2026-09-22T08:45:00Z"
  },
  {
    id: "REQ-1009",
    organizationId: 1,
    organizationName: "City General Hospital",
    requesterName: "Dr. Sarah Chen",
    bloodGroup: "O+",
    component: "RED_CELLS",
    units: 3,
    priority: "HIGH",
    status: "APPROVED",
    purpose: "General surgical oncology resection",
    patientRef: "PT-9411",
    createdAt: "2026-09-24T09:00:00Z"
  },
  {
    id: "REQ-1010",
    organizationId: 2,
    organizationName: "Metro Community Clinic",
    requesterName: "Dr. Marcus Brody",
    bloodGroup: "A-",
    component: "WHOLE_BLOOD",
    units: 1,
    priority: "NORMAL",
    status: "CANCELLED",
    purpose: "Patient condition stabilized without transfusion",
    patientRef: "PT-8812",
    createdAt: "2026-09-21T16:00:00Z"
  },
  {
    id: "REQ-1011",
    organizationId: 1,
    organizationName: "City General Hospital",
    requesterName: "Dr. Sarah Chen",
    bloodGroup: "AB+",
    component: "PLASMA",
    units: 2,
    priority: "NORMAL",
    status: "FULFILLED",
    purpose: "Post-op liver resection supportive care",
    patientRef: "PT-9345",
    createdAt: "2026-09-20T11:20:00Z"
  },
  {
    id: "REQ-1012",
    organizationId: 2,
    organizationName: "Metro Community Clinic",
    requesterName: "Nurse Elena Vance",
    bloodGroup: "O+",
    component: "WHOLE_BLOOD",
    units: 1,
    priority: "NORMAL",
    status: "REJECTED",
    purpose: "Cross-matching antibody incompatibility",
    patientRef: "PT-8750",
    createdAt: "2026-09-19T13:10:00Z"
  },
  {
    id: "REQ-1013",
    organizationId: 1,
    organizationName: "City General Hospital",
    requesterName: "Dr. Robert Smith",
    bloodGroup: "O-",
    component: "RED_CELLS",
    units: 2,
    priority: "HIGH",
    status: "FULFILLED",
    purpose: "Pediatric cardiac catheterization standby",
    patientRef: "PT-9310",
    createdAt: "2026-09-18T15:30:00Z"
  },
  {
    id: "REQ-1014",
    organizationId: 1,
    organizationName: "City General Hospital",
    requesterName: "Dr. Sarah Chen",
    bloodGroup: "A+",
    component: "WHOLE_BLOOD",
    units: 2,
    priority: "NORMAL",
    status: "FULFILLED",
    purpose: "Spinal fusion reconstruction",
    patientRef: "PT-9290",
    createdAt: "2026-09-17T09:40:00Z"
  },
  {
    id: "REQ-1015",
    organizationId: 2,
    organizationName: "Metro Community Clinic",
    requesterName: "Dr. Marcus Brody",
    bloodGroup: "B+",
    component: "RED_CELLS",
    units: 2,
    priority: "NORMAL",
    status: "PENDING",
    purpose: "Severe iron deficiency anemia refractory to infusion",
    patientRef: "PT-8840",
    createdAt: "2026-09-24T15:00:00Z"
  },
  {
    id: "REQ-1016",
    organizationId: 1,
    organizationName: "City General Hospital",
    requesterName: "Dr. Robert Smith",
    bloodGroup: "A-",
    component: "PLATELETS",
    units: 1,
    priority: "NORMAL",
    status: "APPROVED",
    purpose: "Chemotherapy-induced bone marrow suppression",
    patientRef: "PT-9430",
    createdAt: "2026-09-24T16:10:00Z"
  }
];

// Dedicated Emergency Requests dataset (§7)
const emergencyRequests = [
  {
    id: "EMG-001",
    organizationId: 1,
    organizationName: "City General Hospital",
    department: "Trauma ICU / Emergency",
    bloodGroup: "O-",
    component: "RED_CELLS",
    units: 4,
    priority: "CRITICAL",
    status: "PENDING",
    createdAt: "2026-09-24T18:20:00Z",
    estimatedNeedWithin: "30 mins",
    doctorName: "Dr. Robert Smith",
    clinicalSummary: "Multiple motor vehicle collision victim with active pelvic fracture hemorrhage"
  },
  {
    id: "EMG-002",
    organizationId: 1,
    organizationName: "City General Hospital",
    department: "Obstetrics / Labor & Delivery",
    bloodGroup: "A+",
    component: "PLATELETS",
    units: 3,
    priority: "CRITICAL",
    status: "APPROVED",
    createdAt: "2026-09-24T17:45:00Z",
    estimatedNeedWithin: "45 mins",
    doctorName: "Dr. Sarah Chen",
    clinicalSummary: "Acute HELLP syndrome with profound platelet consumption"
  },
  {
    id: "EMG-003",
    organizationId: 2,
    organizationName: "Metro Community Clinic",
    department: "Urgent Care Observation",
    bloodGroup: "B-",
    component: "WHOLE_BLOOD",
    units: 2,
    priority: "CRITICAL",
    status: "PENDING",
    createdAt: "2026-09-24T19:10:00Z",
    estimatedNeedWithin: "60 mins",
    doctorName: "Dr. Marcus Brody",
    clinicalSummary: "Acute GI variceal bleed requiring immediate whole blood resuscitation"
  },
  {
    id: "EMG-004",
    organizationId: 1,
    organizationName: "City General Hospital",
    department: "Cardiothoracic Surgical Suite",
    bloodGroup: "AB-",
    component: "RED_CELLS",
    units: 2,
    priority: "CRITICAL",
    status: "FULFILLED",
    createdAt: "2026-09-22T22:30:00Z",
    estimatedNeedWithin: "Immediate",
    doctorName: "Dr. Robert Smith",
    clinicalSummary: "Emergency coronary artery rupture intraoperative transfusion successfully infused"
  }
];

// Donors data (§8)
const donors = {
  "donor.john@bloodbank.dev": {
    email: "donor.john@bloodbank.dev",
    fullName: "Johnathan Mercer",
    bloodGroup: "O+",
    rhFactor: "Positive",
    donorId: "DNR-8401",
    totalDonations: 6,
    totalUnitsDonated: 6,
    lastDonationDate: "2026-07-15",
    nextEligibleDate: "2026-09-15",
    eligibilityStatus: "ELIGIBLE_NOW",
    estimatedLivesSaved: 18,
    preferredCenter: "Central Red Cross Blood Bank",
    donations: [
      {
        donationId: "DON-8812",
        donationDate: "2026-07-15",
        donationType: "WHOLE_BLOOD",
        unitsCollected: 1,
        facilityName: "Central Red Cross Blood Bank",
        organizationId: 3,
        status: "COMPLETED",
        screeningResult: "CLEAR / VERIFIED"
      },
      {
        donationId: "DON-7921",
        donationDate: "2026-05-10",
        donationType: "WHOLE_BLOOD",
        unitsCollected: 1,
        facilityName: "Central Red Cross Blood Bank",
        organizationId: 3,
        status: "COMPLETED",
        screeningResult: "CLEAR / VERIFIED"
      },
      {
        donationId: "DON-6510",
        donationDate: "2026-03-02",
        donationType: "RED_CELLS",
        unitsCollected: 1,
        facilityName: "City General Hospital Donor Station",
        organizationId: 1,
        status: "COMPLETED",
        screeningResult: "CLEAR / VERIFIED"
      },
      {
        donationId: "DON-5204",
        donationDate: "2025-12-18",
        donationType: "WHOLE_BLOOD",
        unitsCollected: 1,
        facilityName: "Central Red Cross Blood Bank",
        organizationId: 3,
        status: "COMPLETED",
        screeningResult: "CLEAR / VERIFIED"
      },
      {
        donationId: "DON-4119",
        donationDate: "2025-09-25",
        donationType: "WHOLE_BLOOD",
        unitsCollected: 1,
        facilityName: "Central Red Cross Blood Bank",
        organizationId: 3,
        status: "COMPLETED",
        screeningResult: "CLEAR / VERIFIED"
      },
      {
        donationId: "DON-3011",
        donationDate: "2025-06-14",
        donationType: "WHOLE_BLOOD",
        unitsCollected: 1,
        facilityName: "Central Red Cross Blood Bank",
        organizationId: 3,
        status: "COMPLETED",
        screeningResult: "CLEAR / VERIFIED"
      }
    ],
    upcomingDonation: {
      organization: "Central Red Cross Blood Bank",
      date: "2026-10-05",
      time: "10:30 AM",
      status: "CONFIRMED"
    }
  },
  "donor.sarah@bloodbank.dev": {
    email: "donor.sarah@bloodbank.dev",
    fullName: "Sarah Elizabeth Jenkins",
    bloodGroup: "O-",
    rhFactor: "Negative",
    donorId: "DNR-9102",
    universalDonor: true,
    totalDonations: 9,
    totalUnitsDonated: 12,
    lastDonationDate: "2026-08-01",
    nextEligibleDate: "2026-10-01",
    eligibilityStatus: "ELIGIBLE_IN_7_DAYS",
    estimatedLivesSaved: 36,
    preferredCenter: "Central Red Cross Blood Bank",
    donations: [
      {
        donationId: "DON-9102",
        donationDate: "2026-08-01",
        donationType: "RED_CELLS",
        unitsCollected: 2,
        facilityName: "Central Red Cross Blood Bank",
        organizationId: 3,
        status: "COMPLETED",
        screeningResult: "CLEAR / VERIFIED"
      },
      {
        donationId: "DON-8411",
        donationDate: "2026-05-22",
        donationType: "RED_CELLS",
        unitsCollected: 2,
        facilityName: "Central Red Cross Blood Bank",
        organizationId: 3,
        status: "COMPLETED",
        screeningResult: "CLEAR / VERIFIED"
      },
      {
        donationId: "DON-7501",
        donationDate: "2026-03-14",
        donationType: "WHOLE_BLOOD",
        unitsCollected: 1,
        facilityName: "City General Hospital Donor Station",
        organizationId: 1,
        status: "COMPLETED",
        screeningResult: "CLEAR / VERIFIED"
      },
      {
        donationId: "DON-6129",
        donationDate: "2025-12-28",
        donationType: "RED_CELLS",
        unitsCollected: 2,
        facilityName: "Central Red Cross Blood Bank",
        organizationId: 3,
        status: "COMPLETED",
        screeningResult: "CLEAR / VERIFIED"
      },
      {
        donationId: "DON-5014",
        donationDate: "2025-10-10",
        donationType: "WHOLE_BLOOD",
        unitsCollected: 1,
        facilityName: "Central Red Cross Blood Bank",
        organizationId: 3,
        status: "COMPLETED",
        screeningResult: "CLEAR / VERIFIED"
      }
    ],
    upcomingDonation: {
      organization: "Central Red Cross Blood Bank",
      date: "2026-10-12",
      time: "02:00 PM",
      status: "SCHEDULED"
    }
  }
};

// Requester data (§9)
const requesters = {
  "requester.jane@bloodbank.dev": {
    email: "requester.jane@bloodbank.dev",
    fullName: "Jane Foster",
    role: "Patient Representative / Family Liaison",
    relationship: "Family Member Care Coordinator",
    requests: [
      {
        id: "REQ-9901",
        bloodGroup: "O+",
        component: "RED_CELLS",
        units: 2,
        priority: "HIGH",
        status: "FULFILLED",
        createdDate: "2026-09-18",
        organization: "City General Hospital",
        recipient: "Family Member (Post-operative recovery)",
        trackingStage: "Fulfilled"
      },
      {
        id: "REQ-9902",
        bloodGroup: "O-",
        component: "WHOLE_BLOOD",
        units: 1,
        priority: "CRITICAL",
        status: "PENDING",
        createdDate: "2026-09-24",
        organization: "City General Hospital",
        recipient: "Pediatric Inpatient Unit",
        trackingStage: "Under Review"
      },
      {
        id: "REQ-9903",
        bloodGroup: "A+",
        component: "PLATELETS",
        units: 2,
        priority: "NORMAL",
        status: "APPROVED",
        createdDate: "2026-09-22",
        organization: "Central Red Cross Blood Bank",
        recipient: "Oncology Care Clinic",
        trackingStage: "Reserved"
      }
    ]
  }
};

// Platform Activity (§16: at least 15-20 records, newest first)
const platformActivity = [
  {
    id: "ACT-01",
    type: "EMERGENCY_REQUEST",
    description: "Emergency order EMG-001 created: 4 units O- Red Cells for City General Hospital Trauma ICU",
    organization: "City General Hospital",
    timestamp: "2026-09-24T18:20:00Z",
    status: "CRITICAL"
  },
  {
    id: "ACT-02",
    type: "INVENTORY_ALERT",
    description: "Cold storage advisory: 5 units approaching 7-day expiration threshold in cooling unit Alpha-1",
    organization: "Central Red Cross Blood Bank",
    timestamp: "2026-09-24T17:30:00Z",
    status: "WARNING"
  },
  {
    id: "ACT-03",
    type: "REQUEST_FULFILLED",
    description: "Cross-matched request REQ-1006 fulfilled: 2 units B+ Red Cells delivered to surgical theater",
    organization: "City General Hospital",
    timestamp: "2026-09-24T16:45:00Z",
    status: "SUCCESS"
  },
  {
    id: "ACT-04",
    type: "ORG_SUBMISSION",
    description: "Hospital registration submitted: Sunrise Medical Center (License MED-LIC-88210)",
    organization: "Sunrise Medical Center",
    timestamp: "2026-09-24T14:30:00Z",
    status: "PENDING"
  },
  {
    id: "ACT-05",
    type: "DONATION_RECORDED",
    description: "Voluntary donation processed: 1 unit O+ Whole Blood from Johnathan Mercer passed initial vitals",
    organization: "Central Red Cross Blood Bank",
    timestamp: "2026-09-24T13:15:00Z",
    status: "SUCCESS"
  },
  {
    id: "ACT-06",
    type: "REQUEST_APPROVED",
    description: "Outpatient blood order REQ-1003 approved for Metro Community Clinic: 2 units A+ Plasma",
    organization: "Metro Community Clinic",
    timestamp: "2026-09-24T11:50:00Z",
    status: "APPROVED"
  },
  {
    id: "ACT-07",
    type: "INVENTORY_ADDED",
    description: "Batch release: 12 units Red Cells verified and added to cold vault after NAT viral clearance",
    organization: "Central Red Cross Blood Bank",
    timestamp: "2026-09-24T10:00:00Z",
    status: "SUCCESS"
  },
  {
    id: "ACT-08",
    type: "USER_REGISTERED",
    description: "New voluntary universal donor profile verified with digital donor credentials",
    organization: "Platform",
    timestamp: "2026-09-24T08:30:00Z",
    status: "INFO"
  },
  {
    id: "ACT-09",
    type: "UNIT_RESERVED",
    description: "Unit UNIT-10022 (B- Whole Blood) reserved for trauma surgical standby",
    organization: "City General Hospital",
    timestamp: "2026-09-23T21:15:00Z",
    status: "INFO"
  },
  {
    id: "ACT-10",
    type: "ORG_SUBMISSION",
    description: "Clinic registration submitted: Valley Health Pavilion (License CLN-LIC-44192)",
    organization: "Valley Health Pavilion",
    timestamp: "2026-09-23T11:15:00Z",
    status: "PENDING"
  },
  {
    id: "ACT-11",
    type: "UNIT_EXPIRED",
    description: "Quality assurance quarantine: 1 unit UNIT-10098 reached expiration and transferred to bio-hazard hold",
    organization: "Central Red Cross Blood Bank",
    timestamp: "2026-09-23T09:00:00Z",
    status: "WARNING"
  },
  {
    id: "ACT-12",
    type: "ORG_APPROVED",
    description: "Central Red Cross Blood Bank regional distribution accreditation renewed by Super Administrator",
    organization: "Central Red Cross Blood Bank",
    timestamp: "2026-09-22T17:00:00Z",
    status: "APPROVED"
  },
  {
    id: "ACT-13",
    type: "ORG_SUBMISSION",
    description: "Blood bank registration submitted: St. Jude Diagnostics & Transfusion (License BB-LIC-99301)",
    organization: "St. Jude Diagnostics",
    timestamp: "2026-09-22T16:45:00Z",
    status: "PENDING"
  },
  {
    id: "ACT-14",
    type: "EMERGENCY_FULFILLED",
    description: "Emergency order EMG-004 fulfilled: 2 units AB- Red Cells successfully transfused in OR Suite",
    organization: "City General Hospital",
    timestamp: "2026-09-22T14:10:00Z",
    status: "SUCCESS"
  },
  {
    id: "ACT-15",
    type: "DISPATCH_ISSUED",
    description: "Temperature-controlled refrigerated courier dispatched with 6 cross-matched O+ units",
    organization: "Central Red Cross Blood Bank",
    timestamp: "2026-09-22T10:30:00Z",
    status: "SUCCESS"
  },
  {
    id: "ACT-16",
    type: "LAB_TESTING",
    description: "ELISA & Nucleic Acid Testing completed for donor cohort #204: 100% non-reactive",
    organization: "Central Red Cross Blood Bank",
    timestamp: "2026-09-21T15:20:00Z",
    status: "SUCCESS"
  },
  {
    id: "ACT-17",
    type: "ORG_SUBMISSION",
    description: "Clinic registration submitted: Mercy Urgent Care Center (License CLN-LIC-55018)",
    organization: "Mercy Urgent Care",
    timestamp: "2026-09-21T09:00:00Z",
    status: "PENDING"
  },
  {
    id: "ACT-18",
    type: "INVENTORY_AUDIT",
    description: "Automated cold chain RFID audit verified 102 units in monitored climate-controlled vaults",
    organization: "Central Red Cross Blood Bank",
    timestamp: "2026-09-20T23:59:00Z",
    status: "INFO"
  }
];

// Notifications (§17)
const notifications = {
  SUPER_ADMIN: [
    { id: "N-SA-1", type: "warning", message: "4 organizations are awaiting Super Admin verification and license review.", timestamp: "2026-09-24T14:35:00Z", unread: true },
    { id: "N-SA-2", type: "error", message: "A new critical emergency blood request (EMG-001) was submitted by City General Hospital.", timestamp: "2026-09-24T18:21:00Z", unread: true },
    { id: "N-SA-3", type: "info", message: "Cold chain telemetry nominal across all 3 certified regional facilities.", timestamp: "2026-09-24T12:00:00Z", unread: false }
  ],
  HOSPITAL_ADMIN: [
    { id: "N-HA-1", type: "info", message: "2 O- units are currently available in the connected regional blood bank.", timestamp: "2026-09-24T18:00:00Z", unread: true },
    { id: "N-HA-2", type: "error", message: "A critical blood request (REQ-1002) requires attention from surgical coordinator.", timestamp: "2026-09-24T18:22:00Z", unread: true },
    { id: "N-HA-3", type: "success", message: "Surgical transfusion REQ-1006 was successfully completed and logged.", timestamp: "2026-09-24T16:50:00Z", unread: false }
  ],
  BLOOD_BANK_STAFF: [
    { id: "N-BS-1", type: "warning", message: "5 blood units expire within the next 7 days. Review for priority cross-matching.", timestamp: "2026-09-24T17:35:00Z", unread: true },
    { id: "N-BS-2", type: "error", message: "A new emergency request (EMG-001) has arrived from City General Hospital.", timestamp: "2026-09-24T18:23:00Z", unread: true },
    { id: "N-BS-3", type: "info", message: "Platelet agitator storage temperature stable at 22.0°C.", timestamp: "2026-09-24T15:00:00Z", unread: false }
  ],
  DOCTOR: [
    { id: "N-DOC-1", type: "error", message: "Emergency order EMG-001 (4 units O-) logged and priority dispatched.", timestamp: "2026-09-24T18:25:00Z", unread: true },
    { id: "N-DOC-2", type: "info", message: "In-house hospital inventory: 4 units available (2 O+, 1 O-, 1 A+).", timestamp: "2026-09-24T14:00:00Z", unread: false },
    { id: "N-DOC-3", type: "success", message: "Elective surgery reservation REQ-1001 confirmed for OR Suite #3.", timestamp: "2026-09-24T10:30:00Z", unread: false }
  ],
  CLINIC_ADMIN: [
    { id: "N-CA-1", type: "success", message: "Connected to Central Red Cross Blood Bank (Active · < 30 mins courier window).", timestamp: "2026-09-24T08:00:00Z", unread: false },
    { id: "N-CA-2", type: "info", message: "Outpatient blood order REQ-1003 approved for dialysis patient support.", timestamp: "2026-09-24T11:55:00Z", unread: true },
    { id: "N-CA-3", type: "warning", message: "Emergency outpatient request EMG-003 pending confirmation from regional bank.", timestamp: "2026-09-24T19:12:00Z", unread: true }
  ],
  DONOR: [
    { id: "N-DNR-1", type: "success", message: "Your demo donation history has been updated. You have helped save up to 18 lives!", timestamp: "2026-09-24T09:00:00Z", unread: true },
    { id: "N-DNR-2", type: "info", message: "Your blood group is verified with biological confirmation.", timestamp: "2026-09-24T09:00:00Z", unread: false }
  ],
  REQUESTER: [
    { id: "N-REQ-1", type: "warning", message: "Your blood request REQ-9902 is currently Under Review by the medical coordinator.", timestamp: "2026-09-24T18:30:00Z", unread: true },
    { id: "N-REQ-2", type: "success", message: "Previous request REQ-9901 has been fulfilled.", timestamp: "2026-09-18T16:00:00Z", unread: false }
  ]
};

// Connected blood banks for clinics
const connectedBloodBanks = [
  {
    id: 3,
    name: "Central Red Cross Blood Bank",
    type: "BLOOD_BANK",
    distance: "4.2 miles",
    status: "ONLINE",
    availableGroups: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    totalUnitsAvailable: 83,
    responseTime: "< 30 mins",
    courierStatus: "Active Dispatch Available",
    phone: "+1 (555) 345-6789",
    contactPerson: "Dr. Alicia Vance"
  }
];

// Clinical staff for Hospital Admin
const hospitalStaff = [
  { id: 1, name: "Dr. Robert Smith", role: "DOCTOR", department: "Trauma Surgery", status: "ON_DUTY", email: "doctor.smith@bloodbank.dev", phone: "+1 (555) 123-4401" },
  { id: 2, name: "Dr. Sarah Chen", role: "DOCTOR", department: "Obstetrics & Gynecology", status: "ON_DUTY", email: "sarah.chen@hospital.dev", phone: "+1 (555) 123-4402" },
  { id: 3, name: "Elena Vance, RN", role: "STAFF", department: "Blood Transfusion Coordinator", status: "ON_DUTY", email: "elena.vance@hospital.dev", phone: "+1 (555) 123-4403" },
  { id: 4, name: "Dr. Kevin Patel", role: "DOCTOR", department: "Cardiothoracic Surgery", status: "OFF_DUTY", email: "kevin.patel@hospital.dev", phone: "+1 (555) 123-4404" }
];

// Final master demo object
const demoData = {
  version: "1.0.0",
  lastUpdated: "2026-09-24T20:00:00Z",
  environment: "DEMO_ISOLATED",
  organizations,
  inventory,
  requests,
  emergencyRequests,
  donors,
  requesters,
  platformActivity,
  notifications,
  connectedBloodBanks,
  hospitalStaff
};

// Write to demo/demo-data.json
const rootDemoPath = path.resolve(__dirname, '../../demo/demo-data.json');
const frontendDemoPath = path.resolve(__dirname, '../../frontend/demo/demo-data.json');

fs.mkdirSync(path.dirname(rootDemoPath), { recursive: true });
fs.mkdirSync(path.dirname(frontendDemoPath), { recursive: true });

fs.writeFileSync(rootDemoPath, JSON.stringify(demoData, null, 2), 'utf8');
fs.writeFileSync(frontendDemoPath, JSON.stringify(demoData, null, 2), 'utf8');

console.log('Successfully generated demo/demo-data.json and frontend/demo/demo-data.json!');
console.log('Total inventory units:', inventory.length);
console.log('Total organizations:', organizations.length);
console.log('Total requests:', requests.length);
console.log('Total emergency requests:', emergencyRequests.length);
console.log('Total activities:', platformActivity.length);
