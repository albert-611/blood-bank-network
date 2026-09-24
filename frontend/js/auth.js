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
const DEMO_SESSION_KEY = 'bb_demo_session';

const BloodBankAuth = {
  /**
   * Check if active session is a client demo session.
   * @returns {boolean}
   */
  isDemoSession() {
    try {
      const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed && parsed.isDemo === true);
    } catch {
      return false;
    }
  },

  /**
   * Retrieve active demo session details.
   * @returns {object|null}
   */
  getDemoSession() {
    try {
      const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.isDemo === true ? parsed : null;
    } catch {
      return null;
    }
  },

  /**
   * Retrieve active JWT access token from localStorage.
   * Note: Demo sessions intentionally do NOT generate fake JWTs.
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
   * Resolves demo session user when isDemoSession is true.
   * @returns {object|null}
   */
  getUser() {
    if (this.isDemoSession()) {
      return this.getDemoSession();
    }
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
   * Check if user is currently authenticated (either real JWT or demo session).
   * @returns {boolean}
   */
  isAuthenticated() {
    return Boolean(this.getToken()) || this.isDemoSession();
  },

  /**
   * Clear local auth state and cache.
   */
  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    try {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
    } catch (_) {}
  },

  /**
   * Perform client-side logout and notify server.
   */
  async logout() {
    const isDemo = this.isDemoSession();
    try {
      if (!isDemo && window.BloodBankAPI && typeof window.BloodBankAPI.logout === 'function') {
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
   * Require specific role on dashboard (used by super-admin.js).
   * @param {string} requiredRole
   * @returns {boolean}
   */
  requireRole(requiredRole) {
    if (!this.isAuthenticated()) {
      window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
      return false;
    }
    const user = this.getUser();
    const userRole = (user?.role || user?.globalRole || user?.global_role || user?.organizationStaff?.role_name || '').toUpperCase();
    if (requiredRole && userRole !== requiredRole.toUpperCase()) {
      const destination = this.getDashboardUrl(user);
      if (window.location.pathname !== destination) {
        window.location.href = destination;
      }
      return false;
    }
    return true;
  },

  /**
   * Get the dashboard/profile URL corresponding to the user's role.
   * @param {object} user
   * @returns {string}
   */
  getDashboardUrl(user) {
    if (!user) return '/login.html';
    // If explicit dashboard route is attached (e.g. from demo/demo-users.json)
    if (user.dashboard) {
      return user.dashboard;
    }
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
    } else if (role === 'HOSPITAL_ADMIN' || staffRole === 'HOSPITAL_ADMIN' || (staffRole === 'ORGANIZATION_ADMIN' && orgType === 'HOSPITAL') || (!staff && emailPrefix.includes('hospital'))) {
      return '/dashboard/hospital-admin/index.html';
    } else if (role === 'DOCTOR' || staffRole === 'DOCTOR' || staffRole === 'MEDICAL_STAFF' || (!staff && emailPrefix.includes('doctor'))) {
      return '/dashboard/doctor/index.html';
    } else if (role === 'CLINIC_ADMIN' || staffRole === 'CLINIC_ADMIN' || (staffRole === 'ORGANIZATION_ADMIN' && orgType === 'CLINIC') || (!staff && emailPrefix.includes('clinic'))) {
      return '/dashboard/clinic-admin/index.html';
    } else if (role === 'BLOOD_BANK_STAFF' || staffRole === 'BLOOD_BANK_STAFF' || (staffRole === 'ORGANIZATION_ADMIN' && orgType === 'BLOOD_BANK') || (!staff && (emailPrefix.includes('bloodbank') || emailPrefix.includes('staff')))) {
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
    if (this.isDemoSession()) {
      return this.getUser();
    }
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

    // If authenticated as ORG_USER but missing organizationStaff (e.g. legacy cache), refresh from server (real auth only)
    if (isAuthed && !this.isDemoSession() && user && (user.globalRole === 'ORG_USER' || user.global_role === 'ORG_USER') && !user.organizationStaff) {
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
        if (allowed === 'ORGANIZATION_ADMIN' && ['HOSPITAL_ADMIN', 'CLINIC_ADMIN', 'ORGANIZATION_ADMIN'].includes(userRole)) return true;
        if (allowed === 'ORGANIZATION_ADMIN' && ['HOSPITAL_ADMIN', 'CLINIC_ADMIN', 'ORGANIZATION_ADMIN'].includes(staffRole)) return true;
        if (allowed === 'STAFF' && ['STAFF', 'BLOOD_BANK_STAFF'].includes(userRole)) return true;
        if (allowed === 'STAFF' && ['STAFF', 'BLOOD_BANK_STAFF'].includes(staffRole)) return true;
        if (allowed === 'DOCTOR' && ['DOCTOR', 'MEDICAL_STAFF'].includes(userRole)) return true;
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
      const orgName = orgStaff?.organization_name || user.organization || (user.globalRole === 'SUPER_ADMIN' ? 'Platform Administration' : 'BloodLink Network');
      const orgStatus = orgStaff?.organization_status || (this.isDemoSession() ? 'APPROVED' : null);

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

      // Render Demo Badge if currently running in demo session
      if (this.isDemoSession() && !document.getElementById('demo-session-badge')) {
        const badgeTargets = document.querySelectorAll('[data-demo-badge-target], [data-auth-only]');
        if (badgeTargets.length > 0) {
          const badge = document.createElement('span');
          badge.id = 'demo-session-badge';
          badge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 uppercase tracking-wider ml-1.5';
          badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Demo';
          badgeTargets[0].appendChild(badge);
        }
      }

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

