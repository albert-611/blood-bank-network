/**
 * ============================================================================
 * BLOOD BANK PLATFORM — DEMO DATA LOADER & CALCULATION ENGINE
 * ============================================================================
 * Architecture Reference: DEMO DATA SPECIFICATION (§4 - §27)
 *
 * CRITICAL RULE:
 * - Standalone demo data engine isolated from MySQL, PostgreSQL, Supabase, JWT.
 * - Dynamically loads and parses demo/demo-data.json.
 * - Computes all metrics, summaries, inventories, and requests on the fly.
 * - Powers count-up animations (0 -> target value).
 * - Provides seamless integration for all 8 seeded demo accounts.
 */

(function () {
  'use strict';

  let cachedDemoData = null;
  let loadPromise = null;

  // In-memory runtime modifications for demo session (e.g. approve/reject without DB write)
  const runtimeOverrides = {
    approvedOrgIds: new Set(),
    rejectedOrgIds: new Map(), // id -> reason
    createdRequests: []
  };

  const DemoDataLoader = {
    /**
     * Check if current session is demo mode
     */
    isDemo() {
      return Boolean(window.BloodBankAuth && typeof window.BloodBankAuth.isDemoSession === 'function' && window.BloodBankAuth.isDemoSession());
    },

    /**
     * Load demo-data.json from candidate paths with fallback
     * @returns {Promise<Object>}
     */
    async loadData() {
      if (cachedDemoData) {
        return cachedDemoData;
      }
      if (loadPromise) {
        return loadPromise;
      }

      const pathsToTry = [
        '/demo/demo-data.json',
        '/frontend/demo/demo-data.json',
        'demo/demo-data.json',
        '../demo/demo-data.json',
        '../../demo/demo-data.json'
      ];

      loadPromise = (async () => {
        for (const p of pathsToTry) {
          try {
            const res = await fetch(p, { cache: 'no-store' });
            if (res.ok) {
              const json = await res.json();
              if (json && json.organizations && json.inventory) {
                cachedDemoData = json;
                return cachedDemoData;
              }
            }
          } catch (_) {
            // Try next path
          }
        }

        console.warn('[DemoDataLoader] Could not fetch demo-data.json via HTTP. Using baseline fallback.');
        cachedDemoData = this.getFallbackData();
        return cachedDemoData;
      })();

      return loadPromise;
    },

    /**
     * Fallback minimal schema if JSON cannot be reached over network
     */
    getFallbackData() {
      return {
        organizations: [
          { id: 1, name: "City General Hospital", type: "HOSPITAL", status: "APPROVED", address: "100 Medical Center Blvd, Metro City" },
          { id: 2, name: "Metro Community Clinic", type: "CLINIC", status: "APPROVED", address: "45 Westside Ave, Metro City" },
          { id: 3, name: "Central Red Cross Blood Bank", type: "BLOOD_BANK", status: "APPROVED", address: "789 Red Cross Way, Metro City" }
        ],
        inventory: [],
        requests: [],
        emergencyRequests: [],
        donors: {},
        requesters: {},
        platformActivity: [],
        notifications: {}
      };
    },

    /**
     * Calculate dynamic inventory statistics (§5, §18, §22)
     * @param {number|null} orgId Optional organization ID filter
     */
    async getInventoryStats(orgId = null) {
      const data = await this.loadData();
      let units = data.inventory || [];
      if (orgId !== null && orgId !== undefined) {
        units = units.filter(u => Number(u.organizationId) === Number(orgId));
      }

      const totalUnits = units.length;
      const availableUnits = units.filter(u => u.status === 'AVAILABLE').length;
      const reservedUnits = units.filter(u => u.status === 'RESERVED').length;
      const issuedUnits = units.filter(u => u.status === 'ISSUED').length;
      const expiredUnits = units.filter(u => u.status === 'EXPIRED').length;

      // Expiring soon: available units with expiry <= 7 days from now (or reference date 2026-09-24)
      const refDate = new Date('2026-09-24T00:00:00Z');
      const expiringList = units.filter(u => {
        if (u.status !== 'AVAILABLE') return false;
        const exp = new Date(u.expiryDate);
        const diffTime = exp.getTime() - refDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7;
      }).map(u => {
        const exp = new Date(u.expiryDate);
        const diffDays = Math.ceil((exp.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
        return { ...u, daysRemaining: diffDays };
      }).sort((a, b) => a.daysRemaining - b.daysRemaining);

      const expiringSoonUnits = expiringList.length;

      // Group distribution by standard 8 groups
      const allGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
      const byBloodGroup = {};
      const criticalGroups = [];

      allGroups.forEach(bg => {
        const groupUnits = units.filter(u => u.bloodGroup === bg);
        const groupAvailable = groupUnits.filter(u => u.status === 'AVAILABLE').length;
        const groupReserved = groupUnits.filter(u => u.status === 'RESERVED').length;

        // Stock status categorization
        let status = 'Available';
        let statusClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
        let barClass = 'bg-emerald-500';

        if (groupAvailable === 0) {
          status = 'Depleted';
          statusClass = 'text-slate-700 bg-slate-100 border-slate-200';
          barClass = 'bg-slate-400';
          criticalGroups.push(bg);
        } else if (groupAvailable <= 3) {
          status = 'Critical';
          statusClass = 'text-rose-700 bg-rose-50 border-rose-200';
          barClass = 'bg-rose-500';
          criticalGroups.push(bg);
        } else if (groupAvailable <= 7) {
          status = 'Low Stock';
          statusClass = 'text-amber-700 bg-amber-50 border-amber-200';
          barClass = 'bg-amber-500';
        }

        // Percentage based on max typical capacity (35 units)
        const pct = Math.min(Math.round((groupAvailable / 35) * 100), 100);

        byBloodGroup[bg] = {
          total: groupUnits.length,
          available: groupAvailable,
          reserved: groupReserved,
          status,
          statusClass,
          barClass,
          percentage: pct
        };
      });

      return {
        totalUnits,
        availableUnits,
        reservedUnits,
        issuedUnits,
        expiredUnits,
        expiringSoonUnits,
        expiringList,
        byBloodGroup,
        criticalGroups,
        unitsList: units
      };
    },

    /**
     * Calculate dynamic request statistics (§6, §10, §11, §12)
     * @param {number|null} orgId Optional organization ID filter
     */
    async getRequestStats(orgId = null) {
      const data = await this.loadData();
      let reqs = [...(data.requests || []), ...runtimeOverrides.createdRequests];

      if (orgId !== null && orgId !== undefined) {
        reqs = reqs.filter(r => Number(r.organizationId) === Number(orgId));
      }

      const total = reqs.length;
      const pending = reqs.filter(r => r.status === 'PENDING').length;
      const approved = reqs.filter(r => r.status === 'APPROVED').length;
      const fulfilled = reqs.filter(r => r.status === 'FULFILLED').length;
      const rejected = reqs.filter(r => r.status === 'REJECTED').length;
      const cancelled = reqs.filter(r => r.status === 'CANCELLED').length;
      const critical = reqs.filter(r => r.priority === 'CRITICAL').length;

      // Sort newest first
      const sorted = [...reqs].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      return {
        total,
        pending,
        approved,
        fulfilled,
        rejected,
        cancelled,
        critical,
        requestsList: sorted
      };
    },

    /**
     * Dedicated emergency requests statistics (§7)
     * @param {number|null} orgId
     */
    async getEmergencyRequests(orgId = null) {
      const data = await this.loadData();
      let emg = data.emergencyRequests || [];

      if (orgId !== null && orgId !== undefined) {
        emg = emg.filter(e => Number(e.organizationId) === Number(orgId));
      }

      const sorted = [...emg].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const pendingCount = emg.filter(e => e.status === 'PENDING').length;

      return {
        total: emg.length,
        pending: pendingCount,
        list: sorted
      };
    },

    /**
     * Platform-wide telemetry for Super Admin (§14, §15, §18)
     */
    async getPlatformStats() {
      const data = await this.loadData();
      const orgs = (data.organizations || []).map(o => {
        if (runtimeOverrides.approvedOrgIds.has(o.id)) {
          return { ...o, status: 'APPROVED' };
        }
        if (runtimeOverrides.rejectedOrgIds.has(o.id)) {
          return { ...o, status: 'REJECTED', reason: runtimeOverrides.rejectedOrgIds.get(o.id) };
        }
        return o;
      });

      const totalOrgs = orgs.length;
      const approvedOrgs = orgs.filter(o => o.status === 'APPROVED').length;
      const pendingOrgs = orgs.filter(o => o.status === 'PENDING').length;
      const rejectedOrgs = orgs.filter(o => o.status === 'REJECTED').length;
      const suspendedOrgs = orgs.filter(o => o.status === 'SUSPENDED').length;

      const hospitals = orgs.filter(o => o.type === 'HOSPITAL').length;
      const clinics = orgs.filter(o => o.type === 'CLINIC').length;
      const bloodBanks = orgs.filter(o => o.type === 'BLOOD_BANK').length;

      const inv = await this.getInventoryStats();
      const req = await this.getRequestStats();
      const emg = await this.getEmergencyRequests();

      return {
        kpis: {
          total_organizations: totalOrgs,
          pending_approvals: pendingOrgs,
          active_organizations: approvedOrgs,
          total_users: 58,
          active_users: 42,
          orgs_this_month: 4,
          reports_generated: 14,
          total_blood_units: inv.totalUnits,
          total_requests: req.total,
          critical_requests: emg.total
        },
        organization_breakdown: {
          by_type: {
            hospitals,
            clinics,
            blood_banks: bloodBanks
          },
          by_status: {
            approved: approvedOrgs,
            pending: pendingOrgs,
            rejected: rejectedOrgs,
            suspended: suspendedOrgs
          }
        },
        growth_timeline: [
          { month: 'Apr 2026', hospitals: 1, clinics: 1, blood_banks: 1 },
          { month: 'May 2026', hospitals: 1, clinics: 1, blood_banks: 1 },
          { month: 'Jun 2026', hospitals: 1, clinics: 1, blood_banks: 1 },
          { month: 'Jul 2026', hospitals: 1, clinics: 1, blood_banks: 1 },
          { month: 'Aug 2026', hospitals: 1, clinics: 1, blood_banks: 1 },
          { month: 'Sep 2026', hospitals: 2, clinics: 3, blood_banks: 2 }
        ]
      };
    },

    /**
     * Get organizations for Super Admin table filtering & pagination
     */
    async getOrganizations(params = {}) {
      const data = await this.loadData();
      let list = (data.organizations || []).map(o => {
        if (runtimeOverrides.approvedOrgIds.has(o.id)) {
          return { ...o, status: 'APPROVED' };
        }
        if (runtimeOverrides.rejectedOrgIds.has(o.id)) {
          return { ...o, status: 'REJECTED', reason: runtimeOverrides.rejectedOrgIds.get(o.id) };
        }
        return o;
      });

      const statusFilter = (params.status || 'ALL').toUpperCase();
      if (statusFilter !== 'ALL') {
        list = list.filter(o => o.status === statusFilter);
      }

      const search = (params.search || '').trim().toLowerCase();
      if (search) {
        list = list.filter(o =>
          (o.name && o.name.toLowerCase().includes(search)) ||
          (o.email && o.email.toLowerCase().includes(search)) ||
          (o.licenseNumber && o.licenseNumber.toLowerCase().includes(search)) ||
          (o.type && o.type.toLowerCase().includes(search))
        );
      }

      const page = parseInt(params.page, 10) || 1;
      const limit = parseInt(params.limit, 10) || 30;
      const total = list.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const paginated = list.slice(startIndex, startIndex + limit);

      return {
        success: true,
        data: paginated,
        pagination: {
          total,
          page,
          limit,
          totalPages
        }
      };
    },

    /**
     * Get specific organization by ID
     */
    async getOrganizationById(id) {
      const data = await this.loadData();
      const org = (data.organizations || []).find(o => String(o.id) === String(id));
      if (!org) return { success: false, message: 'Organization not found' };

      let currentStatus = org.status;
      if (runtimeOverrides.approvedOrgIds.has(org.id)) currentStatus = 'APPROVED';
      if (runtimeOverrides.rejectedOrgIds.has(org.id)) currentStatus = 'REJECTED';

      return {
        success: true,
        data: {
          ...org,
          status: currentStatus,
          reason: runtimeOverrides.rejectedOrgIds.get(org.id) || null
        }
      };
    },

    /**
     * In-memory approve organization (Super Admin)
     */
    async approveOrganization(id) {
      const numId = Number(id);
      runtimeOverrides.approvedOrgIds.add(numId);
      runtimeOverrides.rejectedOrgIds.delete(numId);
      return { success: true, message: `Organization ID ${id} approved in demo mode.` };
    },

    /**
     * In-memory reject organization (Super Admin)
     */
    async rejectOrganization(id, reason = '') {
      const numId = Number(id);
      runtimeOverrides.rejectedOrgIds.set(numId, reason);
      runtimeOverrides.approvedOrgIds.delete(numId);
      return { success: true, message: `Organization ID ${id} rejected in demo mode.` };
    },

    /**
     * Platform activity records (§16)
     */
    async getActivities(orgId = null, limit = 20) {
      const data = await this.loadData();
      let acts = data.platformActivity || [];

      if (orgId !== null && orgId !== undefined) {
        // Find org name
        const org = (data.organizations || []).find(o => Number(o.id) === Number(orgId));
        if (org) {
          acts = acts.filter(a => a.organization === org.name || a.organization === 'Platform');
        }
      }

      return acts.slice(0, limit);
    },

    /**
     * Role-specific notifications (§17)
     */
    async getNotifications(role = 'SUPER_ADMIN') {
      const data = await this.loadData();
      const nMap = data.notifications || {};
      const cleanRole = (role || 'SUPER_ADMIN').toUpperCase();
      return nMap[cleanRole] || nMap['SUPER_ADMIN'] || [];
    },

    /**
     * Donor specific history and stats (§8)
     */
    async getDonorData(email = 'donor.john@bloodbank.dev') {
      const data = await this.loadData();
      const cleanEmail = (email || '').toLowerCase().trim();
      const donors = data.donors || {};
      return donors[cleanEmail] || donors['donor.john@bloodbank.dev'] || null;
    },

    /**
     * Requester specific history and stats (§9)
     */
    async getRequesterData(email = 'requester.jane@bloodbank.dev') {
      const data = await this.loadData();
      const cleanEmail = (email || '').toLowerCase().trim();
      const requesters = data.requesters || {};
      return requesters[cleanEmail] || requesters['requester.jane@bloodbank.dev'] || null;
    },

    /**
     * Discover registered treatment facilities (hospitals and clinics) in demo dataset (§Section 2 & 3)
     */
    async getFacilities(params = {}) {
      const data = await this.loadData();
      const orgs = data.organizations || [];
      const search = (params.search || params.q || '').toLowerCase().trim();
      const type = (params.type || '').toUpperCase().trim();

      const filtered = orgs.filter(o => {
        const isApproved = o.status === 'APPROVED' && !runtimeOverrides.rejectedOrgIds.has(o.id);
        const isEligibleType = o.type === 'HOSPITAL' || o.type === 'CLINIC';
        if (!isApproved || !isEligibleType) return false;
        if (type && o.type !== type) return false;
        if (search) {
          const matchName = (o.name || '').toLowerCase().includes(search);
          const matchCity = (o.city || o.address || '').toLowerCase().includes(search);
          return matchName || matchCity;
        }
        return true;
      });

      const facilities = filtered.map(o => ({
        id: o.id,
        name: o.name,
        type: o.type,
        city: o.city || '',
        address: o.address || '',
        location: o.city ? (o.address ? `${o.city} (${o.address})` : o.city) : (o.address || 'Regional Facility')
      }));

      return {
        success: true,
        data: facilities,
        total: facilities.length
      };
    },

    /**
     * Submit a demo requisition with preferred treatment facility
     */
    async createRequest(payload = {}) {
      const data = await this.loadData();
      const nextIdNum = 9904 + runtimeOverrides.createdRequests.length;
      const reqId = `REQ-${nextIdNum}`;

      let preferredFacility = null;
      if (payload.preferred_organization_id) {
        const orgs = data.organizations || [];
        const match = orgs.find(o => Number(o.id) === Number(payload.preferred_organization_id));
        if (match) {
          preferredFacility = {
            id: match.id,
            name: match.name,
            type: match.type,
            location: match.city ? `${match.city} (${match.address || ''})` : (match.address || 'Regional Facility'),
            is_manual: false
          };
        }
      } else if (payload.preferred_facility_name) {
        preferredFacility = {
          id: null,
          name: payload.preferred_facility_name,
          type: 'UNREGISTERED',
          location: payload.preferred_facility_location || 'Manual Entry',
          is_manual: true
        };
      }

      const newReq = {
        id: reqId,
        bloodGroup: payload.blood_group || 'O-',
        component: payload.component || 'PACKED_RBC',
        units: Number(payload.quantity || payload.units || 1),
        priority: payload.priority || 'ROUTINE',
        status: 'PENDING',
        createdDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        organization: 'Central Red Cross Blood Bank',
        recipient: payload.notes || 'Inpatient Surgery',
        trackingStage: 'Submitted',
        preferredFacility
      };

      runtimeOverrides.createdRequests.unshift(newReq);

      // Also append to requesters in data
      if (data.requesters && data.requesters['requester.jane@bloodbank.dev']) {
        if (!data.requesters['requester.jane@bloodbank.dev'].requests) {
          data.requesters['requester.jane@bloodbank.dev'].requests = [];
        }
        data.requesters['requester.jane@bloodbank.dev'].requests.unshift(newReq);
      }

      return {
        success: true,
        message: 'Requisition submitted successfully.',
        data: {
          request: newReq
        }
      };
    },

    /**
     * Update request in demo mode with 6-hour edit window enforcement
     * @param {string|number} id
     * @param {Object} payload
     */
    async updateRequest(id, payload) {
      const data = await this.loadData();
      let req = runtimeOverrides.createdRequests.find(r => String(r.id) === String(id));
      if (!req && data.requests) {
        req = data.requests.find(r => String(r.id) === String(id));
      }
      if (!req && data.requesters) {
        for (const user of Object.values(data.requesters)) {
          if (user.requests) {
            const found = user.requests.find(r => String(r.id) === String(id));
            if (found) { req = found; break; }
          }
        }
      }

      if (!req) {
        throw new Error('Requisition not found.');
      }

      if (req.status === 'CANCELLED') {
        throw new Error('Cannot edit a cancelled blood request.');
      }
      if (req.status === 'ISSUED' || req.status === 'COMPLETED') {
        throw new Error('Cannot edit a requisition that has already been issued or completed.');
      }

      // Check 6-hour window from original submission timestamp
      const createdMs = new Date(req.createdAt || req.created_at || Date.now()).getTime();
      const diffHours = (Date.now() - createdMs) / (1000 * 60 * 60);
      if (diffHours > 6) {
        const err = new Error('The 6-hour editing window has expired. Requisitions cannot be modified after 6 hours from original submission.');
        err.code = 'EDIT_WINDOW_EXPIRED';
        throw err;
      }

      // Update fields
      if (payload.blood_group) req.bloodGroup = payload.blood_group;
      if (payload.component) req.component = payload.component;
      if (payload.quantity || payload.units) req.units = Number(payload.quantity || payload.units);
      if (payload.priority) req.priority = payload.priority;
      if (payload.notes !== undefined) req.recipient = payload.notes;

      if (payload.preferred_organization_id || payload.preferred_facility_name) {
        req.preferredFacility = {
          name: payload.preferred_facility_name || 'Selected Treatment Facility',
          type: payload.preferred_facility_name ? 'UNREGISTERED' : 'REGISTERED',
          location: payload.preferred_facility_location || 'General Ward'
        };
      }

      req.updatedAt = new Date().toISOString();
      return {
        success: true,
        message: 'Requisition updated successfully.',
        data: req
      };
    },

    /**
     * Cancel request in demo mode (anytime cancellation)
     * @param {string|number} id
     * @param {string} reason
     */
    async cancelRequest(id, reason = '') {
      const data = await this.loadData();
      let req = runtimeOverrides.createdRequests.find(r => String(r.id) === String(id));
      if (!req && data.requests) {
        req = data.requests.find(r => String(r.id) === String(id));
      }
      if (!req && data.requesters) {
        for (const user of Object.values(data.requesters)) {
          if (user.requests) {
            const found = user.requests.find(r => String(r.id) === String(id));
            if (found) { req = found; break; }
          }
        }
      }

      if (!req) {
        throw new Error('Requisition not found.');
      }

      if (req.status === 'CANCELLED') {
        throw new Error('This blood request is already cancelled.');
      }
      if (req.status === 'ISSUED' || req.status === 'COMPLETED') {
        throw new Error('Cannot cancel a blood request that has already been issued or completed. Physical units have already been dispatched. Please contact blood bank staff directly.');
      }

      req.status = 'CANCELLED';
      req.cancellation_reason = reason || 'Cancelled by requester';
      req.cancelled_at = new Date().toISOString();
      req.trackingStage = 'Cancelled';

      return {
        success: true,
        message: 'Requisition cancelled successfully.',
        data: req
      };
    },

    /**
     * Requisition statistics for demo session
     */
    async getRequestStats() {
      const data = await this.loadData();
      const user = window.BloodBankAuth?.getUser();
      const email = user?.email || 'requester.jane@bloodbank.dev';
      const reqData = await this.getRequesterData(email);
      const list = (reqData?.requests || []).concat(runtimeOverrides.createdRequests);
      const total = list.length;
      const active = list.filter(r => ['PENDING', 'VERIFIED', 'SEARCHING', 'PARTIALLY_FULFILLED', 'RESERVED', 'Under Review'].includes(r.status || r.trackingStage)).length;
      const readyForCollection = list.filter(r => ['RESERVED', 'Ready for Collection'].includes(r.status || r.trackingStage)).length;
      const completed = list.filter(r => ['ISSUED', 'COMPLETED', 'FULFILLED', 'Fulfilled'].includes(r.status || r.trackingStage)).length;
      const cancelled = list.filter(r => ['CANCELLED', 'Cancelled'].includes(r.status || r.trackingStage)).length;
      const rejected = list.filter(r => ['REJECTED', 'EXPIRED'].includes(r.status || r.trackingStage)).length;
      return {
        total,
        active,
        readyForCollection,
        completed,
        cancelled,
        rejected,
        requestsList: list
      };
    },

    /**
     * Hospital clinical staff (§10)
     */
    async getHospitalStaff() {
      const data = await this.loadData();
      return data.hospitalStaff || [];
    },

    /**
     * Connected blood banks (§12)
     */
    async getConnectedBloodBanks() {
      const data = await this.loadData();
      return data.connectedBloodBanks || [];
    },

    /**
     * Smooth 0 -> Target Counter Animation (§20)
     * @param {HTMLElement} el
     * @param {number|string} target
     * @param {number} duration ms
     */
    animateCounter(el, target, duration = 850) {
      if (!el) return;
      const end = parseInt(target, 10);
      if (isNaN(end)) {
        el.textContent = target;
        return;
      }

      const start = 0;
      const startTime = performance.now();

      function step(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // Ease out cubic
        const current = Math.round(start + (end - start) * ease);
        el.textContent = current.toLocaleString();

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          el.textContent = end.toLocaleString();
        }
      }

      requestAnimationFrame(step);
    },

    /**
     * Render sleek DEMO MODE indicator badge (§26)
     * @param {HTMLElement|string} target
     */
    injectDemoBadge(target = null) {
      if (document.getElementById('demo-mode-indicator-badge')) return;

      const badge = document.createElement('div');
      badge.id = 'demo-mode-indicator-badge';
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs select-none';
      badge.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
        <span>DEMO MODE</span>
      `;

      let container = null;
      if (typeof target === 'string') {
        container = document.querySelector(target);
      } else if (target instanceof HTMLElement) {
        container = target;
      }

      if (!container) {
        container = document.querySelector('header .flex.items-center.gap-2\\.5, header .flex.items-center.gap-3, [data-demo-badge-target]');
      }

      if (container) {
        container.insertBefore(badge, container.firstChild);
      }
    }
  };

  // Expose globally
  window.DemoDataLoader = DemoDataLoader;

  // Auto-run badge insertion on DOM ready if demo session
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (DemoDataLoader.isDemo()) {
        DemoDataLoader.injectDemoBadge();
      }
    });
  }
})();
