/**
 * ============================================================================
 * BLOOD BANK PLATFORM — JSON DEMO LOGIN SERVICE
 * ============================================================================
 * Handles lightweight, standalone demo authentication using only seeded baseline
 * accounts from demo/demo-users.json.
 *
 * CRITICAL REQUIREMENTS:
 * - Only the 8 seeded baseline accounts are permitted to authenticate in demo mode.
 * - Does NOT query MySQL, PostgreSQL, Supabase, or real backend auth APIs.
 * - Creates a client demo session (isDemo = true) in sessionStorage.
 * - No fake JWT tokens generated.
 * - Can be toggled off via DEMO_LOGIN_ENABLED = false.
 */

(function () {
  'use strict';

  const DEMO_SESSION_KEY = 'bb_demo_session';
  const DEMO_CONFIG_KEY = 'bb_demo_login_enabled';

  // Seeded baseline accounts fallback (strictly mirrors demo/demo-users.json)
  const SEEDED_FALLBACK_USERS = [
    {
      email: "admin@bloodbank.dev",
      password: "AdminDev123!",
      role: "SUPER_ADMIN",
      organization: "System Super Administrator",
      dashboard: "/dashboard/super-admin/index.html"
    },
    {
      email: "hospital.admin@bloodbank.dev",
      password: "UserDev123!",
      role: "HOSPITAL_ADMIN",
      organization: "City General Hospital",
      dashboard: "/dashboard/hospital-admin/index.html"
    },
    {
      email: "doctor.smith@bloodbank.dev",
      password: "UserDev123!",
      role: "DOCTOR",
      organization: "City General Hospital",
      dashboard: "/dashboard/doctor/index.html"
    },
    {
      email: "clinic.admin@bloodbank.dev",
      password: "UserDev123!",
      role: "CLINIC_ADMIN",
      organization: "Metro Community Clinic",
      dashboard: "/dashboard/clinic-admin/index.html"
    },
    {
      email: "bloodbank.staff@bloodbank.dev",
      password: "UserDev123!",
      role: "BLOOD_BANK_STAFF",
      organization: "Central Red Cross Blood Bank",
      dashboard: "/dashboard/blood-bank-staff/index.html"
    },
    {
      email: "donor.john@bloodbank.dev",
      password: "UserDev123!",
      role: "DONOR",
      organization: "Walk-in / Independent (O+)",
      dashboard: "/dashboard/donor/index.html"
    },
    {
      email: "donor.sarah@bloodbank.dev",
      password: "UserDev123!",
      role: "DONOR",
      organization: "Universal Donor (O-)",
      dashboard: "/dashboard/donor/index.html"
    },
    {
      email: "requester.jane@bloodbank.dev",
      password: "UserDev123!",
      role: "REQUESTER",
      organization: "Patient Representative",
      dashboard: "/dashboard/donor/index.html"
    }
  ];

  let cachedDemoUsers = null;

  const DemoAuth = {
    /**
     * Check if Demo Login is enabled in this environment.
     * Can be controlled via:
     * - window.DEMO_LOGIN_ENABLED
     * - window.ENV?.DEMO_LOGIN_ENABLED
     * - <meta name="demo-login-enabled" content="true|false">
     * - localStorage 'bb_demo_login_enabled'
     * Defaults to true in development/MVP.
     * @returns {boolean}
     */
    isEnabled() {
      if (typeof window !== 'undefined') {
        if (typeof window.DEMO_LOGIN_ENABLED !== 'undefined') {
          return Boolean(window.DEMO_LOGIN_ENABLED);
        }
        if (typeof window.ENV?.DEMO_LOGIN_ENABLED !== 'undefined') {
          return Boolean(window.ENV.DEMO_LOGIN_ENABLED);
        }
        if (typeof document !== 'undefined') {
          const meta = document.querySelector('meta[name="demo-login-enabled"]');
          if (meta && meta.content) {
            return meta.content.toLowerCase() !== 'false' && meta.content !== '0';
          }
        }
        const stored = localStorage.getItem(DEMO_CONFIG_KEY);
        if (stored !== null) {
          return stored.toLowerCase() !== 'false' && stored !== '0';
        }
      }
      return true;
    },

    /**
     * Fetch demo users directly from demo/demo-users.json.
     * Falls back to seeded baseline if file loading fails (e.g. file:// CORS).
     * @returns {Promise<Array>}
     */
    async loadDemoUsers() {
      if (cachedDemoUsers && cachedDemoUsers.length > 0) {
        return cachedDemoUsers;
      }

      const pathsToTry = [
        '/demo/demo-users.json',
        '/frontend/demo/demo-users.json',
        'demo/demo-users.json',
        '../demo/demo-users.json'
      ];

      for (const p of pathsToTry) {
        try {
          const res = await fetch(p, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.demoUsers) && data.demoUsers.length === 8) {
              cachedDemoUsers = data.demoUsers;
              return cachedDemoUsers;
            }
          }
        } catch (_) {
          // Continue trying fallback paths
        }
      }

      // Safe fallback ensuring 100% adherence to 8 seeded accounts
      cachedDemoUsers = SEEDED_FALLBACK_USERS;
      return cachedDemoUsers;
    },

    /**
     * Authenticate credentials strictly against demo/demo-users.json.
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{success: boolean, user?: object, dashboard?: string, message?: string}>}
     */
    async login(email, password) {
      if (!this.isEnabled()) {
        return {
          success: false,
          message: 'Demo login is currently disabled in this environment.'
        };
      }

      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanPass = password || '';

      if (!cleanEmail || !cleanPass) {
        return {
          success: false,
          message: 'Please enter both demo email and password.'
        };
      }

      const users = await this.loadDemoUsers();
      const matched = users.find(
        (u) => u.email.toLowerCase() === cleanEmail && u.password === cleanPass
      );

      if (!matched) {
        return {
          success: false,
          message: 'Invalid demo credentials. Please select one of the seeded demo accounts.'
        };
      }

      const userNames = {
        'admin@bloodbank.dev': 'Sarah Johnson',
        'hospital.admin@bloodbank.dev': 'David Miller',
        'doctor.smith@bloodbank.dev': 'Dr. Robert Smith',
        'clinic.admin@bloodbank.dev': 'Elena Vance',
        'bloodbank.staff@bloodbank.dev': 'Marcus Brody',
        'donor.john@bloodbank.dev': 'Johnathan Mercer',
        'donor.sarah@bloodbank.dev': 'Sarah Elizabeth Jenkins',
        'requester.jane@bloodbank.dev': 'Jane Foster'
      };

      const orgIds = {
        'hospital.admin@bloodbank.dev': 1,
        'doctor.smith@bloodbank.dev': 1,
        'clinic.admin@bloodbank.dev': 2,
        'bloodbank.staff@bloodbank.dev': 3
      };

      const cleanEmailKey = matched.email.toLowerCase();
      const displayName = userNames[cleanEmailKey] || matched.organization;
      const orgId = orgIds[cleanEmailKey] || null;

      // Build explicit demo session
      const demoSession = {
        isDemo: true,
        email: matched.email,
        role: matched.role,
        organization: matched.organization,
        dashboard: matched.dashboard,
        fullName: displayName,
        full_name: displayName,
        organization_id: orgId,
        organizationStaff: {
          role_name: matched.role,
          organization_id: orgId,
          organization_name: matched.organization,
          organization_status: 'APPROVED'
        }
      };

      try {
        // Clear any previous real auth tokens so they do not collide
        localStorage.removeItem('bb_auth_token');
        localStorage.removeItem('bb_user_profile');

        // Store demo session in sessionStorage
        sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoSession));
      } catch (e) {
        console.warn('Could not persist demo session to sessionStorage:', e);
      }

      return {
        success: true,
        user: demoSession,
        dashboard: matched.dashboard
      };
    },

    /**
     * Retrieve current demo session from sessionStorage.
     * @returns {object|null}
     */
    getSession() {
      try {
        const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && parsed.isDemo === true ? parsed : null;
      } catch (_) {
        return null;
      }
    },

    /**
     * Clear the demo session.
     */
    clearSession() {
      try {
        sessionStorage.removeItem(DEMO_SESSION_KEY);
      } catch (_) {}
    }
  };

  // Expose globally
  window.DemoAuth = DemoAuth;
})();
