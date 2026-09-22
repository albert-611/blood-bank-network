/**
 * ============================================================================
 * BLOOD BANK PLATFORM — CLIENT AUTHENTICATION STATE SERVICE
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§12 & §20)
 *
 * Manages client-side token storage, session state, and navigation guards.
 */

const TOKEN_KEY = 'bb_auth_token';
const USER_KEY = 'bb_user_profile';

const BloodBankAuth = {
  /**
   * Retrieve active JWT access token from localStorage.
   * @returns {string|null}
   */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  /**
   * Save JWT access token.
   * @param {string} token
   */
  setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
  },

  /**
   * Retrieve cached user profile.
   * @returns {object|null}
   */
  getUser() {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  /**
   * Cache user profile in localStorage.
   * @param {object} user
   */
  setUser(user) {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  },

  /**
   * Check if user is currently authenticated.
   * @returns {boolean}
   */
  isAuthenticated() {
    return Boolean(this.getToken());
  },

  /**
   * Clear local auth state and cache.
   */
  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  /**
   * Perform client-side logout and notify server.
   */
  async logout() {
    try {
      if (window.BloodBankAPI && typeof window.BloodBankAPI.logout === 'function') {
        await window.BloodBankAPI.logout();
      }
    } catch (err) {
      console.warn('Server logout notification failed:', err.message);
    } finally {
      this.clearSession();
      window.location.href = '/login.html';
    }
  },

  /**
   * Get the dashboard/profile URL corresponding to the user's role.
   * @param {object} user
   * @returns {string}
   */
  getDashboardUrl(user) {
    if (!user) return '/login.html';
    const role = (user.globalRole || user.global_role || user.role || '').toUpperCase();
    const staff = user.organizationStaff || null;
    const staffRole = (staff?.role_name || '').toUpperCase();
    const orgType = (staff?.organization_type || '').toUpperCase();
    const email = (user.email || '').toLowerCase();
    const emailPrefix = email.split('@')[0];

    if (role === 'SUPER_ADMIN') {
      return '/dashboard/super-admin/index.html';
    } else if (role === 'DONOR' || role === 'REQUESTER' || emailPrefix.includes('donor') || emailPrefix.includes('requester')) {
      return '/dashboard/donor/index.html';
    } else if (staffRole === 'DOCTOR' || staffRole === 'MEDICAL_STAFF' || (!staff && emailPrefix.includes('doctor'))) {
      return '/dashboard/doctor/index.html';
    } else if (staffRole === 'HOSPITAL_ADMIN' || (staffRole === 'ORGANIZATION_ADMIN' && orgType === 'HOSPITAL') || (!staff && emailPrefix.includes('hospital'))) {
      return '/dashboard/hospital-admin/index.html';
    } else if (staffRole === 'CLINIC_ADMIN' || (staffRole === 'ORGANIZATION_ADMIN' && orgType === 'CLINIC') || (!staff && emailPrefix.includes('clinic'))) {
      return '/dashboard/clinic-admin/index.html';
    } else if (staffRole === 'BLOOD_BANK_STAFF' || (staffRole === 'ORGANIZATION_ADMIN' && orgType === 'BLOOD_BANK') || (!staff && (emailPrefix.includes('bloodbank') || emailPrefix.includes('staff')))) {
      return '/dashboard/blood-bank-staff/index.html';
    } else if (orgType === 'CLINIC') {
      return '/dashboard/clinic-admin/index.html';
    } else if (orgType === 'BLOOD_BANK') {
      return '/dashboard/blood-bank-staff/index.html';
    } else if (orgType === 'HOSPITAL') {
      return '/dashboard/hospital-admin/index.html';
    } else {
      return '/dashboard/donor/index.html';
    }
  },

  /**
   * Route user to their appropriate destination based on role.
   * @param {object} user
   */
  async redirectAfterLogin(user) {
    if (!user) {
      window.location.href = '/';
      return;
    }
    // If ORG_USER is missing organizationStaff, attempt an immediate server refresh before navigating
    if ((user.globalRole === 'ORG_USER' || user.global_role === 'ORG_USER') && !user.organizationStaff) {
      try {
        const refreshed = await this.refreshUser();
        if (refreshed) user = refreshed;
      } catch (e) {
        console.warn('Profile refresh before redirect skipped:', e.message);
      }
    }
    window.location.href = this.getDashboardUrl(user);
  },

  /**
   * Automatically bind all logout buttons on the page.
   */
  bindLogoutButtons() {
    const logoutElements = document.querySelectorAll('[data-logout-btn], .logout-btn, #nav-logout-btn, #logout-btn');
    logoutElements.forEach((btn) => {
      btn.removeEventListener('click', this._boundLogoutHandler);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.logout();
      });
    });
  },

  /**
   * Initialize Auth UI on any page.
  /**
   * Refresh current user profile from server.
   */
  async refreshUser() {
    try {
      if (window.BloodBankAPI && typeof window.BloodBankAPI.getMe === 'function') {
        const res = await window.BloodBankAPI.getMe();
        if (res && res.data && res.data.user) {
          this.setUser(res.data.user);
          return res.data.user;
        }
      }
    } catch (err) {
      if (err.status === 401) {
        this.clearSession();
      }
    }
    return null;
  },

  /**
   * Initialize Auth UI on any page.
   * Updates user info, validates role access, and displays logout buttons when logged in.
   */
  async initAuthUI() {
    const isAuthed = this.isAuthenticated();
    let user = this.getUser();

    // If authenticated as ORG_USER but missing organizationStaff (e.g. legacy cache), refresh from server
    if (isAuthed && user && (user.globalRole === 'ORG_USER' || user.global_role === 'ORG_USER') && !user.organizationStaff) {
      try {
        const refreshed = await this.refreshUser();
        if (refreshed) user = refreshed;
      } catch (e) {
        console.warn('Unable to refresh user profile:', e.message);
      }
    }

    // Check if page requires authentication
    if (document.body.getAttribute('data-auth-required') === 'true' && !isAuthed) {
      window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    // Role-based route protection guard (§13 & §14)
    const allowedRolesAttr = document.body.getAttribute('data-allowed-roles');
    if (isAuthed && allowedRolesAttr && user) {
      const allowedRoles = allowedRolesAttr
        .split(',')
        .map((r) => r.trim().toUpperCase());

      const userRole = (user.role || user.globalRole || user.global_role || '').toUpperCase();
      const staffRole = (user.organizationStaff?.role_name || '').toUpperCase();

      // Check role match with alias recognition
      const hasAccess = allowedRoles.some((allowed) => {
        if (allowed === userRole || allowed === staffRole) return true;
        if (allowed === 'ORGANIZATION_ADMIN' && ['HOSPITAL_ADMIN', 'CLINIC_ADMIN', 'ORGANIZATION_ADMIN'].includes(staffRole)) return true;
        if (allowed === 'STAFF' && ['STAFF', 'BLOOD_BANK_STAFF'].includes(staffRole)) return true;
        if (allowed === 'DOCTOR' && ['DOCTOR', 'MEDICAL_STAFF'].includes(staffRole)) return true;
        if ((allowed === 'DONOR' || allowed === 'REQUESTER') && (userRole === 'DONOR' || userRole === 'REQUESTER')) return true;
        return false;
      });

      if (!hasAccess) {
        console.warn(`Access denied: User role [${staffRole || userRole}] not permitted on this dashboard.`);
        const destination = this.getDashboardUrl(user);
        if (window.location.pathname !== destination) {
          window.location.href = destination;
        } else {
          window.location.href = '/';
        }
        return;
      }
    }

    // Populate user details where placeholder attributes exist
    if (isAuthed && user) {
      const dashboardUrl = this.getDashboardUrl(user);
      const roleName = user.organizationStaff?.role_name || user.role || user.globalRole || 'User';

      // Update Profile Icon buttons to point to the user's workspace profile
      document.querySelectorAll('#nav-profile-btn, [data-profile-link]').forEach((el) => {
        el.href = dashboardUrl;
        el.setAttribute('title', `Go to Profile (${user.fullName || user.email})`);
        el.onclick = (e) => {
          e.preventDefault();
          const currentUser = BloodBankAuth.getUser() || user;
          window.location.href = BloodBankAuth.getDashboardUrl(currentUser);
        };
      });

      const userRole = (user.role || user.globalRole || user.global_role || '').toUpperCase();
      if (userRole === 'REQUESTER') {
        document.querySelectorAll('[data-portal-badge]').forEach((el) => {
          el.textContent = 'Requester Portal';
        });
        document.querySelectorAll('[data-role-badge]').forEach((el) => {
          el.textContent = 'Patient Blood Requester';
        });
        document.querySelectorAll('[data-metric-title]').forEach((el) => {
          el.textContent = 'Active Requests';
        });
      }

      const orgStaff = user.organizationStaff || null;
      const orgName = orgStaff?.organization_name || (user.globalRole === 'SUPER_ADMIN' ? 'Platform Administration' : 'BloodLink Network');
      const orgStatus = orgStaff?.organization_status || null;

      document.querySelectorAll('[data-user-name]').forEach((el) => {
        el.textContent = user.fullName || user.full_name || user.email;
      });
      document.querySelectorAll('[data-user-email]').forEach((el) => {
        el.textContent = user.email;
      });
      document.querySelectorAll('[data-user-role]').forEach((el) => {
        el.textContent = orgStaff?.role_name || user.role || user.globalRole || user.global_role || 'User';
      });
      document.querySelectorAll('[data-user-org]').forEach((el) => {
        el.textContent = orgName;
      });
      document.querySelectorAll('[data-org-status]').forEach((el) => {
        el.textContent = orgStatus || 'ACTIVE';
      });

      // Render Pending Organization Notice if applicable (§12 & §13)
      if (orgStatus === 'PENDING' && !document.getElementById('org-pending-banner')) {
        const banner = document.createElement('div');
        banner.id = 'org-pending-banner';
        banner.className = 'w-full bg-amber-500 text-white px-4 py-2.5 text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm sticky top-16 z-20';
        banner.innerHTML = `
          <span>⚠️</span>
          <span><strong>Organization Verification Pending:</strong> Your organization workspace is awaiting Super Admin verification. Inventory and clinical fulfillment actions are restricted until approved.</span>
        `;
        document.body.insertBefore(banner, document.body.firstChild.nextSibling);
      }

      // Show elements marked as authed-only
      document.querySelectorAll('[data-auth-only]').forEach((el) => {
        el.classList.remove('hidden');
      });

      // Hide elements marked as guest-only
      document.querySelectorAll('[data-guest-only]').forEach((el) => {
        el.classList.add('hidden');
      });
    } else {
      // Hide elements marked as authed-only
      document.querySelectorAll('[data-auth-only]').forEach((el) => {
        el.classList.add('hidden');
      });

      // Show elements marked as guest-only
      document.querySelectorAll('[data-guest-only]').forEach((el) => {
        el.classList.remove('hidden');
      });
    }

    // Bind logout buttons
    this.bindLogoutButtons();
  }
};

window.BloodBankAuth = BloodBankAuth;

// Automatically initialize auth state on document ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    BloodBankAuth.initAuthUI();
  });
}

