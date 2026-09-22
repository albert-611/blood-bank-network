const fs = require('fs');
const path = require('path');
const vm = require('vm');

const authCode = fs.readFileSync(path.join(__dirname, '../../frontend/js/auth.js'), 'utf8');

function createMockEnv(pathname, bodyAttrs = {}, localStorageData = {}) {
  const store = { ...localStorageData };
  const mockLocalStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };

  const elements = {};
  const mockDoc = {
    body: {
      getAttribute: (attr) => bodyAttrs[attr] || null
    },
    querySelectorAll: (sel) => {
      if (!elements[sel]) elements[sel] = [];
      return elements[sel];
    },
    getElementById: (id) => elements['#' + id] || null,
    addEventListener: () => {}
  };

  const mockWindow = {
    location: {
      pathname,
      href: pathname,
      search: ''
    },
    localStorage: mockLocalStorage,
    document: mockDoc,
    BloodBankAPI: {
      checkHealth: async () => ({ success: true, latencyMs: 5, data: {} })
    }
  };

  return { mockWindow, mockDoc, mockLocalStorage };
}

const stakeholders = [
  { role: 'DOCTOR', email: 'doctor.smith@bloodbank.dev', pass: 'UserDev123!', expectedDash: '/dashboard/doctor/index.html' },
  { role: 'HOSPITAL_ADMIN', email: 'hospital.admin@bloodbank.dev', pass: 'UserDev123!', expectedDash: '/dashboard/hospital-admin/index.html' },
  { role: 'BLOOD_BANK_STAFF', email: 'bloodbank.staff@bloodbank.dev', pass: 'UserDev123!', expectedDash: '/dashboard/blood-bank-staff/index.html' },
  { role: 'DONOR', email: 'donor.john@bloodbank.dev', pass: 'UserDev123!', expectedDash: '/dashboard/donor/index.html' },
  { role: 'REQUESTER', email: 'requester.jane@bloodbank.dev', pass: 'UserDev123!', expectedDash: '/dashboard/donor/index.html' },
  { role: 'SUPER_ADMIN', email: 'admin@bloodbank.dev', pass: 'AdminDev123!', expectedDash: '/dashboard/super-admin/index.html' },
  { role: 'CLINIC_ADMIN', email: 'clinic.admin@bloodbank.dev', pass: 'UserDev123!', expectedDash: '/dashboard/clinic-admin/index.html' }
];

(async () => {
  console.log('=== VERIFYING CLIENT-SIDE AUTH & NAVIGATION BEHAVIOR ===\n');
  let allPass = true;

  for (const s of stakeholders) {
    // 1. Log in via API
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: s.email, password: s.pass })
    });
    const data = await res.json();
    if (!data.success) {
      console.error('Failed login for', s.role);
      allPass = false;
      continue;
    }
    const token = data.data.token;
    const user = data.data.user;

    // 2. Test in mock environment
    const { mockWindow } = createMockEnv('/', {}, {
      'bb_auth_token': token,
      'bb_user_profile': JSON.stringify(user)
    });

    const context = vm.createContext({
      window: mockWindow,
      document: mockWindow.document,
      localStorage: mockWindow.localStorage,
      console: console,
      fetch: fetch,
      setTimeout: setTimeout
    });

    vm.runInContext(authCode, context);
    const BloodBankAuth = context.BloodBankAuth || context.window.BloodBankAuth;

    // Test getDashboardUrl
    const url = BloodBankAuth.getDashboardUrl(user);
    const urlMatch = (url === s.expectedDash);

    // Test route guard on target dashboard
    const dashFile = path.join(__dirname, '../../frontend', s.expectedDash);
    const dashHtml = fs.readFileSync(dashFile, 'utf8');
    const allowedRolesMatch = dashHtml.match(/data-allowed-roles="([^"]+)"/);
    const allowedRoles = allowedRolesMatch ? allowedRolesMatch[1].split(',') : [];

    const userRole = (user.role || user.globalRole || '').toUpperCase();
    const staffRole = (user.organizationStaff?.role_name || '').toUpperCase();
    const accessPermitted = allowedRoles.some(r => 
      r === userRole || 
      r === staffRole || 
      (r === 'STAFF' && staffRole === 'BLOOD_BANK_STAFF') || 
      (r === 'ORGANIZATION_ADMIN' && staffRole === 'HOSPITAL_ADMIN') || 
      ((r === 'DONOR' || r === 'REQUESTER') && (userRole === 'DONOR' || userRole === 'REQUESTER'))
    );

    // Check dashboard has 'Main Page' button
    const hasMainPage = dashHtml.includes('Main Page');

    console.log('[' + s.role + ']');
    console.log('  -> Destination URL: ' + url + ' (matches expected: ' + urlMatch + ')');
    console.log('  -> Allowed on Dashboard (' + allowedRoles.join(',') + '): ' + accessPermitted);
    console.log('  -> Dashboard has "Main Page" link: ' + hasMainPage);

    if (!urlMatch || !accessPermitted || !hasMainPage) allPass = false;
  }

  console.log('\n=== END VERIFICATION: ' + (allPass ? 'SUCCESS (ALL PASSED!)' : 'FAILED') + ' ===');
  process.exit(allPass ? 0 : 1);
})();
