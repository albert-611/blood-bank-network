/**
 * ============================================================================
 * BLOOD BANK PLATFORM — CLIENT API SERVICE
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§18)
 *
 * Centralized HTTP client for interacting with Express REST API endpoints.
 * Automatically attaches Authorization header if JWT token is stored.
 */

/**
 * Configurable API Base URL (§18)
 * Resolves in order of priority:
 * 1. window.__API_URL__ (runtime global)
 * 2. window.ENV?.API_URL (environment config)
 * 3. <meta name="api-base-url" content="..."> in document head
 * 4. localStorage 'bloodbank_api_url' (dynamic debug/override)
 * 5. window.location.origin (default for co-located deployment)
 */
function resolveApiBaseUrl() {
  if (typeof window !== 'undefined') {
    if (window.__API_URL__ && typeof window.__API_URL__ === 'string') {
      return window.__API_URL__.replace(/\/+$/, '');
    }
    if (window.ENV?.API_URL && typeof window.ENV.API_URL === 'string') {
      return window.ENV.API_URL.replace(/\/+$/, '');
    }
    if (typeof document !== 'undefined') {
      const meta = document.querySelector('meta[name="api-base-url"]');
      if (meta && meta.content && !meta.content.startsWith('%')) {
        return meta.content.replace(/\/+$/, '');
      }
    }
    const stored = localStorage.getItem('bloodbank_api_url');
    if (stored && typeof stored === 'string') {
      return stored.replace(/\/+$/, '');
    }
    return window.location.origin;
  }
  return 'http://localhost:5000';
}

const BloodBankAPI = {
  /**
   * Retrieve active API base URL
   * @returns {string}
   */
  getBaseUrl() {
    return resolveApiBaseUrl();
  },

  /**
   * Manually override API base URL at runtime
   * @param {string} url
   */
  setBaseUrl(url) {
    if (url && typeof url === 'string') {
      const cleanUrl = url.replace(/\/+$/, '');
      window.__API_URL__ = cleanUrl;
      localStorage.setItem('bloodbank_api_url', cleanUrl);
    }
  },

  /**
   * Internal generic fetch wrapper
   * @private
   */
  async _request(endpoint, options = {}) {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${endpoint}`;
    const headers = {
      'Accept': 'application/json',
      ...options.headers
    };

    // Automatically attach Bearer token if user is logged in
    if (window.BloodBankAuth && typeof window.BloodBankAuth.getToken === 'function') {
      const token = window.BloodBankAuth.getToken();
      if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json().catch(() => ({
        success: false,
        error: { message: `HTTP Error ${response.status}`, code: 'HTTP_ERROR' }
      }));

      if (!response.ok) {
        // If 401 Unauthorized occurs on protected call, clear invalid session
        if (response.status === 401 && endpoint !== '/api/auth/login') {
          if (window.BloodBankAuth) {
            window.BloodBankAuth.clearSession();
          }
        }

        const errorMessage =
          data.error?.message ||
          (data.error?.details && data.error.details.join(', ')) ||
          `Request failed with status ${response.status}`;

        const err = new Error(errorMessage);
        err.status = response.status;
        err.code = data.error?.code;
        err.details = data.error?.details;
        throw err;
      }

      return data;
    } catch (err) {
      if (!err.status) {
        err.message = 'Unable to connect to the server. Please check your connection.';
      }
      throw err;
    }
  },

  /**
   * Check backend API status
   */
  async checkHealth() {
    const startTime = performance.now();
    try {
      const response = await fetch(`${this.getBaseUrl()}/api/health`);
      const latencyMs = Math.round(performance.now() - startTime);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return { success: true, data, latencyMs };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      return { success: false, error: err.message, latencyMs };
    }
  },

  // ==========================================================================
  // AUTHENTICATION ENDPOINTS (§12)
  // ==========================================================================

  /**
   * Register a new user (DONOR or REQUESTER)
   * @param {Object} userData
   */
  async register(userData) {
    return this._request('/api/auth/register', {
      method: 'POST',
      body: userData
    });
  },

  /**
   * Log in user with email and password
   * @param {Object} credentials { email, password }
   */
  async login(credentials) {
    return this._request('/api/auth/login', {
      method: 'POST',
      body: credentials
    });
  },

  /**
   * Log out currently authenticated user
   */
  async logout() {
    return this._request('/api/auth/logout', {
      method: 'POST'
    });
  },

  /**
   * Retrieve current user profile
   */
  async getMe() {
    return this._request('/api/auth/me', {
      method: 'GET'
    });
  },

  /**
   * Request password reset token
   * @param {string} email
   */
  async forgotPassword(email) {
    return this._request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email }
    });
  },

  /**
   * Complete password reset
   * @param {string} token
   * @param {string} password
   */
  async resetPassword(token, password) {
    return this._request('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password }
    });
  },

  // ==========================================================================
  // ORGANIZATION & STAFF ENDPOINTS (§10, §11, §25)
  // ==========================================================================

  /**
   * Retrieve authenticated user's organization details
   */
  async getOrganizationMe() {
    return this._request('/api/organizations/me', { method: 'GET' });
  },

  /**
   * Update authenticated organization profile
   */
  async updateOrganizationMe(data) {
    return this._request('/api/organizations/me', {
      method: 'PATCH',
      body: data
    });
  },

  /**
   * List staff members in user's organization
   */
  async getOrganizationStaff() {
    return this._request('/api/organization/staff', { method: 'GET' });
  },

  /**
   * Add a new staff member within user's organization
   */
  async createOrganizationStaff(staffData) {
    return this._request('/api/organization/staff', {
      method: 'POST',
      body: staffData
    });
  },

  // ==========================================================================
  // INVENTORY & BLOOD UNITS ENDPOINTS (§9.10, §11)
  // ==========================================================================

  /**
   * List blood units in user's organization
   */
  async getInventory(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this._request(`/api/inventory${query ? `?${query}` : ''}`, { method: 'GET' });
  },

  /**
   * Add blood unit to organization inventory
   */
  async createInventoryUnit(unitData) {
    return this._request('/api/inventory', {
      method: 'POST',
      body: unitData
    });
  },

  /**
   * Get specific blood unit by ID
   */
  async getBloodUnit(unitId) {
    return this._request(`/api/inventory/${unitId}`, { method: 'GET' });
  },

  // ==========================================================================
  // PUBLIC DISCOVERY ENDPOINTS (§8, §18)
  // ==========================================================================

  /**
   * Search public blood availability
   */
  async getPublicBloodAvailability(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this._request(`/api/public/blood-availability${query ? `?${query}` : ''}`, { method: 'GET' });
  },

  // ==========================================================================
  // SUPER ADMIN PLATFORM & SAAS TENANT ENDPOINTS (§5, §11, §13, §18)
  // ==========================================================================

  /**
   * List platform organizations (Super Admin: all; Org Staff: own tenant)
   */
  async getOrganizations(params = {}) {
    // Automatically delegate to DemoDataLoader if in demo session (§27)
    if (window.BloodBankAuth && typeof window.BloodBankAuth.isDemoSession === 'function' && window.BloodBankAuth.isDemoSession()) {
      if (window.DemoDataLoader) {
        return window.DemoDataLoader.getOrganizations(params);
      }
    }

    const query = new URLSearchParams(params).toString();
    try {
      return await this._request(`/api/organizations${query ? `?${query}` : ''}`, { method: 'GET' });
    } catch (err) {
      if (err.status === 404) {
        const adminRes = await this._request(`/api/admin/organizations${query ? `?${query}` : ''}`, { method: 'GET' });
        if (adminRes && adminRes.success && adminRes.data?.organizations) {
          return { success: true, data: adminRes.data.organizations };
        }
        return adminRes;
      }
      throw err;
    }
  },

  /**
   * Get specific organization by ID
   */
  async getOrganizationById(orgId) {
    if (window.BloodBankAuth && typeof window.BloodBankAuth.isDemoSession === 'function' && window.BloodBankAuth.isDemoSession()) {
      if (window.DemoDataLoader) {
        return window.DemoDataLoader.getOrganizationById(orgId);
      }
    }

    try {
      return await this._request(`/api/organizations/${orgId}`, { method: 'GET' });
    } catch (err) {
      if (err.status === 404) {
        const orgs = await this.getOrganizations();
        const found = Array.isArray(orgs.data) ? orgs.data.find((o) => String(o.id) === String(orgId)) : null;
        if (found) return { success: true, data: { organization: found } };
      }
      throw err;
    }
  },

  /**
   * Approve organization (Super Admin only)
   */
  async approveOrganization(orgId) {
    if (window.BloodBankAuth && typeof window.BloodBankAuth.isDemoSession === 'function' && window.BloodBankAuth.isDemoSession()) {
      if (window.DemoDataLoader) {
        return window.DemoDataLoader.approveOrganization(orgId);
      }
    }

    try {
      return await this._request(`/api/organizations/${orgId}/approve`, {
        method: 'PATCH'
      });
    } catch (err) {
      if (err.status === 404) {
        return await this._request(`/api/admin/organizations/${orgId}/status`, {
          method: 'PATCH',
          body: { status: 'APPROVED' }
        });
      }
      throw err;
    }
  },

  /**
   * Reject organization (Super Admin only)
   */
  async rejectOrganization(orgId, reason = '') {
    if (window.BloodBankAuth && typeof window.BloodBankAuth.isDemoSession === 'function' && window.BloodBankAuth.isDemoSession()) {
      if (window.DemoDataLoader) {
        return window.DemoDataLoader.rejectOrganization(orgId, reason);
      }
    }

    try {
      return await this._request(`/api/organizations/${orgId}/reject`, {
        method: 'PATCH',
        body: reason ? { reason } : {}
      });
    } catch (err) {
      if (err.status === 404) {
        return await this._request(`/api/admin/organizations/${orgId}/status`, {
          method: 'PATCH',
          body: { status: 'REJECTED', reason }
        });
      }
      throw err;
    }
  },

  /**
   * List all platform organizations (Super Admin legacy alias)
   */
  async getAdminOrganizations(params = {}) {
    return this.getOrganizations(params);
  },

  /**
   * Approve, reject, or suspend organization (legacy endpoint alias)
   */
  async updateOrganizationStatus(orgId, status, reason = '') {
    return this._request(`/api/admin/organizations/${orgId}/status`, {
      method: 'PATCH',
      body: { status, reason }
    });
  },

  /**
   * List platform users
   */
  async getAdminUsers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this._request(`/api/admin/users${query ? `?${query}` : ''}`, { method: 'GET' });
  },

  /**
   * View system audit logs
   */
  async getAdminAuditLogs(params = {}) {
    if (window.BloodBankAuth && typeof window.BloodBankAuth.isDemoSession === 'function' && window.BloodBankAuth.isDemoSession()) {
      if (window.DemoDataLoader) {
        const acts = await window.DemoDataLoader.getActivities();
        return {
          success: true,
          data: {
            logs: acts,
            pagination: { total: acts.length, page: 1, limit: 30, totalPages: 1 }
          }
        };
      }
    }

    const query = new URLSearchParams(params).toString();
    return this._request(`/api/admin/audit-logs${query ? `?${query}` : ''}`, { method: 'GET' });
  },

  /**
   * Get Super Admin dashboard aggregated metrics and telemetry
   */
  async getDashboardStats() {
    if (window.BloodBankAuth && typeof window.BloodBankAuth.isDemoSession === 'function' && window.BloodBankAuth.isDemoSession()) {
      if (window.DemoDataLoader) {
        const stats = await window.DemoDataLoader.getPlatformStats();
        return { success: true, data: stats };
      }
    }

    return this._request('/api/admin/stats', { method: 'GET' });
  }
};

window.BloodBankAPI = BloodBankAPI;

