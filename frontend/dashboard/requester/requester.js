/**
 * ============================================================================
 * BLOOD BANK PLATFORM — REQUESTER DASHBOARD INTERACTIVITY & ROUTING
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§8, §9, §10, §11, §14, §18)
 *
 * Powers the complete Requester Dashboard:
 * 1. Client-side hash routing between 7 core workspace views
 * 2. Real-time KPI summary calculation and data hydration
 * 3. Searchable regional blood availability with "Request This Blood" prefill
 * 4. Multi-section blood requisition creation with facility combobox
 * 5. Requisition table with filter tabs, priority filter, search, and sorting
 * 6. Live 6-stage clinical progress tracking stepper
 * 7. Authoritative 6-hour editing window with real-time countdown timer
 * 8. Anytime safe cancellation with inventory release safeguards
 * 9. Persistent notification center with read/unread status management
 * 10. Profile management with protected role and security integrity
 * 11. Fully responsive drawer navigation and accessible modal dialogs
 */

(function () {
  'use strict';

  // ==========================================================================
  // DASHBOARD STATE
  // ==========================================================================
  const State = {
    user: null,
    requests: [],
    summary: {
      total: 0,
      active: 0,
      readyForCollection: 0,
      completed: 0,
      cancelled: 0,
      rejected: 0
    },
    notifications: [],
    unreadNotificationsCount: 0,
    facilities: [],
    selectedFacility: null,
    facilityMode: 'REGISTERED', // 'REGISTERED' | 'MANUAL'
    activeTab: 'ALL', // 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'REJECTED'
    requestsSearchQuery: '',
    requestsPriorityFilter: '',
    requestsSortOrder: 'newest',
    notificationsFilter: 'all', // 'all' | 'unread'
    activeEditingRequestId: null,
    activeCancellingRequestId: null,
    activeViewingRequestId: null,
    countdownTimerId: null,
    facilityDebounceTimer: null
  };

  // 6-hour edit window constant (in milliseconds)
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  // Recognized workflow status stages
  const ACTIVE_STATUSES = [
    'PENDING',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'SEARCHING_STOCK',
    'STOCK_RESERVED',
    'READY_FOR_COLLECTION'
  ];

  const EDITABLE_STATUSES = [
    'PENDING',
    'SUBMITTED',
    'UNDER_REVIEW',
    'SEARCHING_STOCK'
  ];

  // ==========================================================================
  // INITIALIZATION & GUARDS
  // ==========================================================================
  document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verify authentication
    if (!window.BloodBankAuth || !window.BloodBankAuth.isAuthenticated()) {
      window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    State.user = window.BloodBankAuth.getUser();

    // 2. Role verification
    const userRole = (State.user?.role || State.user?.globalRole || State.user?.global_role || '').toUpperCase();
    if (userRole && userRole !== 'REQUESTER' && !window.BloodBankAuth.isDemoSession()) {
      console.warn(`Non-requester role [${userRole}] accessed requester portal. Redirecting.`);
      window.location.href = window.BloodBankAuth.getDashboardUrl(State.user);
      return;
    }

    // 3. Hydrate User Profiles & Navigation UI
    hydrateUserProfileUI();
    setupMobileSidebar();
    setupProfileDropdown();
    setupRouting();
    setupFormListeners();
    setupModalListeners();
    setupFilterListeners();

    // 4. Start global countdown timer for 6-hour edit windows
    startGlobalCountdownTicker();

    // 5. Initial Data Hydration
    await refreshAllData();

    // 6. Handle deep-linking / hash navigation
    handleHashChange();
  });

  // ==========================================================================
  // USER PROFILE UI HYDRATION
  // ==========================================================================
  function hydrateUserProfileUI() {
    const user = State.user || {};
    const fullName = user.fullName || user.full_name || user.email || 'Jane Foster';
    const email = user.email || 'requester.jane@bloodbank.dev';
    const phone = user.phone || '';

    // Calculate initials
    const initials = fullName
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'RQ';

    // Populate top nav & sidebar
    const topAvatar = document.getElementById('topAvatarInitials');
    if (topAvatar) topAvatar.textContent = initials;

    const sidebarAvatar = document.getElementById('sidebarAvatarInitials');
    if (sidebarAvatar) sidebarAvatar.textContent = initials;

    const profileBigAvatar = document.getElementById('profileBigAvatarInitials');
    if (profileBigAvatar) profileBigAvatar.textContent = initials;

    const welcomeName = document.getElementById('overviewWelcomeName');
    if (welcomeName) welcomeName.textContent = fullName;

    const menuFullName = document.getElementById('menuFullName');
    if (menuFullName) menuFullName.textContent = fullName;

    const menuEmail = document.getElementById('menuEmail');
    if (menuEmail) menuEmail.textContent = email;

    const cardFullName = document.getElementById('profileCardFullName');
    if (cardFullName) cardFullName.textContent = fullName;

    const cardEmail = document.getElementById('profileCardEmail');
    if (cardEmail) cardEmail.textContent = email;

    // Prefill Contact Info in Create Request Form
    const contactName = document.getElementById('reqContactName');
    if (contactName) contactName.value = fullName;

    const contactEmail = document.getElementById('reqContactEmail');
    if (contactEmail) contactEmail.value = email;

    const contactPhone = document.getElementById('reqContactPhone');
    if (contactPhone && !contactPhone.value) contactPhone.value = phone;

    // Prefill Profile Settings Form
    const profileFullNameInput = document.getElementById('profileInputFullName');
    if (profileFullNameInput) profileFullNameInput.value = fullName;

    const profileEmailInput = document.getElementById('profileInputEmail');
    if (profileEmailInput) profileEmailInput.value = email;

    const profilePhoneInput = document.getElementById('profileInputPhone');
    if (profilePhoneInput) profilePhoneInput.value = phone;

    // Environment badge
    const envBadgeText = document.getElementById('envBadgeText');
    if (envBadgeText && window.BloodBankAuth && window.BloodBankAuth.isDemoSession()) {
      envBadgeText.textContent = 'DEMO SANDBOX';
    }
  }

  // ==========================================================================
  // NAVIGATION & ROUTING (§4)
  // ==========================================================================
  function setupRouting() {
    window.addEventListener('hashchange', handleHashChange);
  }

  function handleHashChange() {
    const rawHash = (window.location.hash || '#overview').replace(/^#/, '');
    const validRoutes = [
      'overview',
      'find-blood',
      'create-request',
      'my-requests',
      'active-progress',
      'notifications',
      'profile'
    ];

    const targetRoute = validRoutes.includes(rawHash) ? rawHash : 'overview';

    // 1. Hide all views
    document.querySelectorAll('.portal-view').forEach((view) => {
      view.classList.add('hidden');
    });

    // 2. Show active view
    const activeView = document.getElementById(`view-${targetRoute}`);
    if (activeView) {
      activeView.classList.remove('hidden');
    }

    // 3. Highlight sidebar active item
    document.querySelectorAll('.sidebar-nav-item').forEach((link) => {
      const route = link.getAttribute('data-route');
      if (route === targetRoute) {
        link.className =
          'sidebar-nav-item flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl transition-colors bg-red-50 text-red-700 border border-red-100 shadow-2xs';
        link.setAttribute('aria-current', 'page');
      } else {
        link.className =
          'sidebar-nav-item flex items-center justify-between px-3 py-2 text-xs font-medium rounded-xl text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors';
        link.removeAttribute('aria-current');
      }
    });

    // 4. Update breadcrumb
    const breadcrumb = document.getElementById('topBreadcrumbTitle');
    if (breadcrumb) {
      const titles = {
        'overview': 'Dashboard Overview',
        'find-blood': 'Find Available Blood',
        'create-request': 'Create Blood Request',
        'my-requests': 'My Blood Requests',
        'active-progress': 'Active Request Progress',
        'notifications': 'Notification Center',
        'profile': 'Profile & Settings'
      };
      breadcrumb.textContent = titles[targetRoute] || 'Dashboard';
    }

    // 5. Close mobile sidebar if open
    closeMobileSidebar();

    // 6. View-specific on-mount triggers
    if (targetRoute === 'find-blood') {
      loadPublicBloodAvailability();
    } else if (targetRoute === 'active-progress') {
      renderActiveProgressPage();
    } else if (targetRoute === 'my-requests') {
      renderMyRequestsTable();
    } else if (targetRoute === 'notifications') {
      renderNotificationsPage();
    }

    // Scroll smoothly to top of content
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==========================================================================
  // MOBILE DRAWER NAVIGATION (§15)
  // ==========================================================================
  function setupMobileSidebar() {
    const toggleBtn = document.getElementById('mobileSidebarToggleBtn');
    const closeBtn = document.getElementById('closeMobileSidebarBtn');
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    const sidebar = document.getElementById('portalSidebar');

    if (toggleBtn && sidebar && backdrop) {
      toggleBtn.addEventListener('click', () => {
        openMobileSidebar();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        closeMobileSidebar();
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', () => {
        closeMobileSidebar();
      });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMobileSidebar();
        closeProfileDropdown();
      }
    });
  }

  function openMobileSidebar() {
    const sidebar = document.getElementById('portalSidebar');
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    if (sidebar) {
      sidebar.classList.remove('-translate-x-full');
      sidebar.classList.add('translate-x-0');
    }
    if (backdrop) {
      backdrop.classList.remove('hidden');
    }
    document.body.classList.add('overflow-hidden');
  }

  function closeMobileSidebar() {
    const sidebar = document.getElementById('portalSidebar');
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    if (sidebar) {
      sidebar.classList.remove('translate-x-0');
      sidebar.classList.add('-translate-x-full');
    }
    if (backdrop) {
      backdrop.classList.add('hidden');
    }
    document.body.classList.remove('overflow-hidden');
  }

  // ==========================================================================
  // PROFILE DROPDOWN MENU
  // ==========================================================================
  function setupProfileDropdown() {
    const btn = document.getElementById('topProfileDropdownBtn');
    const menu = document.getElementById('topProfileMenu');

    if (btn && menu) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = btn.getAttribute('aria-expanded') === 'true';
        if (isExpanded) {
          closeProfileDropdown();
        } else {
          menu.classList.remove('hidden');
          btn.setAttribute('aria-expanded', 'true');
        }
      });

      document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !btn.contains(e.target)) {
          closeProfileDropdown();
        }
      });
    }
  }

  function closeProfileDropdown() {
    const menu = document.getElementById('topProfileMenu');
    const btn = document.getElementById('topProfileDropdownBtn');
    if (menu) menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  // ==========================================================================
  // DATA REFRESH & HYDRATION
  // ==========================================================================
  async function refreshAllData() {
    try {
      await Promise.all([
        fetchSummary(),
        fetchRequests(),
        fetchNotifications()
      ]);
      renderOverviewTab();
    } catch (err) {
      console.error('Error hydrating requester dashboard:', err);
      showToast('Error syncing dashboard data. Please check network connection.', 'error');
    }
  }

  async function fetchSummary() {
    try {
      if (window.BloodBankAPI && typeof window.BloodBankAPI.getBloodRequestsSummary === 'function') {
        const res = await window.BloodBankAPI.getBloodRequestsSummary();
        if (res && res.success && res.data) {
          State.summary = {
            total: Number(res.data.total || 0),
            active: Number(res.data.active || 0),
            readyForCollection: Number(res.data.readyForCollection || 0),
            completed: Number(res.data.completed || 0),
            cancelled: Number(res.data.cancelled || 0),
            rejected: Number(res.data.rejected || 0)
          };
        }
      }
    } catch (err) {
      console.warn('Summary fetch failed, computing from requests list:', err.message);
    }
  }

  async function fetchRequests() {
    try {
      if (window.BloodBankAPI && typeof window.BloodBankAPI.getBloodRequests === 'function') {
        const res = await window.BloodBankAPI.getBloodRequests();
        if (res && res.success && Array.isArray(res.data)) {
          State.requests = res.data;
        } else {
          State.requests = [];
        }
      }
    } catch (err) {
      console.error('Failed to load blood requests:', err);
      State.requests = [];
    }
  }

  async function fetchNotifications() {
    try {
      if (window.BloodBankAPI && typeof window.BloodBankAPI.getNotifications === 'function') {
        const res = await window.BloodBankAPI.getNotifications();
        if (res && res.success && res.data) {
          State.notifications = Array.isArray(res.data.notifications) ? res.data.notifications : [];
          State.unreadNotificationsCount = Number(res.data.unreadCount || 0);
        }
      }
    } catch (err) {
      console.warn('Failed to load notifications:', err);
      State.notifications = [];
      State.unreadNotificationsCount = 0;
    }
    updateNotificationBadges();
  }

  function updateNotificationBadges() {
    const count = State.unreadNotificationsCount;
    const topBadge = document.getElementById('topNotificationBadge');
    const sidebarBadge = document.getElementById('sidebarUnreadBadge');

    if (topBadge) {
      if (count > 0) {
        topBadge.textContent = count > 9 ? '9+' : count;
        topBadge.classList.remove('hidden');
      } else {
        topBadge.classList.add('hidden');
      }
    }

    if (sidebarBadge) {
      if (count > 0) {
        sidebarBadge.textContent = count;
        sidebarBadge.classList.remove('hidden');
      } else {
        sidebarBadge.classList.add('hidden');
      }
    }
  }

  // ==========================================================================
  // DASHBOARD OVERVIEW VIEW (§5)
  // ==========================================================================
  function renderOverviewTab() {
    // 1. Update 4 Summary Cards
    const kpiTotal = document.getElementById('kpiTotalRequests');
    if (kpiTotal) kpiTotal.textContent = State.summary.total || State.requests.length;

    const kpiActive = document.getElementById('kpiActiveRequests');
    if (kpiActive) kpiActive.textContent = State.summary.active;

    const kpiReady = document.getElementById('kpiReadyRequests');
    if (kpiReady) kpiReady.textContent = State.summary.readyForCollection;

    const kpiCompleted = document.getElementById('kpiCompletedRequests');
    if (kpiCompleted) kpiCompleted.textContent = State.summary.completed;

    // Sidebar counter badges
    const sideTotal = document.getElementById('sidebarTotalBadge');
    if (sideTotal) sideTotal.textContent = State.requests.length;

    const sideActive = document.getElementById('sidebarActiveBadge');
    if (sideActive) sideActive.textContent = State.summary.active;

    // 2. Render Active Request Progress Widget (§5.C)
    renderOverviewActiveProgressWidget();

    // 3. Render Recent Requests Table (§5.B)
    renderOverviewRecentRequestsTable();

    // 4. Render Important Notifications Preview (§5.D)
    renderOverviewNotificationsPreview();
  }

  function renderOverviewActiveProgressWidget() {
    const container = document.getElementById('overviewActiveProgressContainer');
    if (!container) return;

    // Find active requests (sorted newest first)
    const activeRequests = State.requests.filter((r) => ACTIVE_STATUSES.includes(r.status));

    if (activeRequests.length === 0) {
      container.innerHTML = `
        <div class="py-5 text-center text-slate-400">
          <div class="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          </div>
          <p class="font-semibold text-xs text-slate-700">All Requisitions Completed or Inactive</p>
          <p class="text-[11px] text-slate-400 mt-0.5">You have no blood requisitions currently in active clinical processing.</p>
          <div class="mt-3">
            <a href="#create-request" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-2xs">
              <span>Create Blood Request</span>
            </a>
          </div>
        </div>
      `;
      return;
    }

    // Take latest active request for the widget preview
    const req = activeRequests[0];
    const facilityName = getRequestFacilityName(req);
    const stepperHtml = renderCompactStepperHtml(req.status);
    const editRemaining = getRemainingEditTime(req.created_at);
    const canEdit = EDITABLE_STATUSES.includes(req.status) && editRemaining.isEligible;

    container.innerHTML = `
      <div class="space-y-4">
        <!-- Request Top Info -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div class="flex items-center gap-3">
            <span class="font-extrabold text-sm text-slate-900">Request #${req.id}</span>
            <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${getStatusBadgeClasses(req.status)}">
              ${formatStatusLabel(req.status)}
            </span>
            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getPriorityBadgeClasses(req.priority)}">
              ${req.priority || 'ROUTINE'}
            </span>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <button type="button" class="view-details-btn font-semibold text-red-600 hover:text-red-700 hover:underline cursor-pointer" data-id="${req.id}">
              View Full Details →
            </button>
          </div>
        </div>

        <!-- Requisition Specs -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50/70 p-3 rounded-xl border border-slate-100">
          <div>
            <span class="text-slate-400 text-[10px] uppercase font-bold block">Blood Group</span>
            <span class="font-extrabold text-red-700 text-sm">${req.blood_group || '—'}</span>
          </div>
          <div>
            <span class="text-slate-400 text-[10px] uppercase font-bold block">Component & Units</span>
            <span class="font-bold text-slate-800">${formatComponentLabel(req.component)} (${req.quantity} ${req.quantity === 1 ? 'unit' : 'units'})</span>
          </div>
          <div class="col-span-2">
            <span class="text-slate-400 text-[10px] uppercase font-bold block">Treatment Facility</span>
            <span class="font-semibold text-slate-800 truncate block" title="${facilityName}">${facilityName}</span>
          </div>
        </div>

        <!-- 6-Stage Visual Stepper -->
        <div class="pt-2">
          ${stepperHtml}
        </div>

        <!-- Footer Notice with 6-Hour Countdown -->
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div class="flex items-center gap-2">
            ${
              canEdit
                ? `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 live-edit-countdown" data-created="${req.created_at}" data-id="${req.id}">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>Editing available for <span class="countdown-text">${editRemaining.formatted}</span></span>
                  </span>`
                : `<span class="text-[11px] text-slate-400">Editing window closed or restricted by clinical stage</span>`
            }
          </div>

          <div class="flex items-center gap-2">
            ${
              canEdit
                ? `<button type="button" class="edit-req-btn px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer" data-id="${req.id}">
                    Edit Request
                  </button>`
                : ''
            }
            <button type="button" class="cancel-req-btn px-2.5 py-1 rounded-lg border border-rose-200 text-[11px] font-bold text-rose-600 hover:bg-rose-50 cursor-pointer" data-id="${req.id}">
              Cancel Request
            </button>
          </div>
        </div>
      </div>
    `;

    bindRequestActionButtons(container);
  }

  function renderOverviewRecentRequestsTable() {
    const tbody = document.getElementById('overviewRecentRequestsTableBody');
    const emptyNotice = document.getElementById('overviewRecentEmptyState');
    if (!tbody) return;

    if (State.requests.length === 0) {
      tbody.innerHTML = '';
      if (emptyNotice) emptyNotice.classList.remove('hidden');
      return;
    }

    if (emptyNotice) emptyNotice.classList.add('hidden');

    const recent = State.requests.slice(0, 5);

    tbody.innerHTML = recent
      .map((req) => {
        const facilityName = getRequestFacilityName(req);
        const editRemaining = getRemainingEditTime(req.created_at);
        const canEdit = EDITABLE_STATUSES.includes(req.status) && editRemaining.isEligible;
        const canCancel = !['ISSUED', 'COMPLETED', 'FULFILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(req.status);

        return `
          <tr class="hover:bg-slate-50/70 transition-colors">
            <td class="py-3 px-4 font-mono font-bold text-slate-900">#${req.id}</td>
            <td class="py-3 px-4">
              <span class="inline-flex px-2 py-0.5 rounded text-xs font-black bg-red-100 text-red-800">
                ${req.blood_group || '—'}
              </span>
            </td>
            <td class="py-3 px-4 text-slate-700 font-medium">${formatComponentLabel(req.component)}</td>
            <td class="py-3 px-4 font-bold text-slate-900">${req.quantity || 1}</td>
            <td class="py-3 px-4 max-w-[160px] truncate font-medium text-slate-800" title="${facilityName}">${facilityName}</td>
            <td class="py-3 px-4">
              <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getPriorityBadgeClasses(req.priority)}">
                ${req.priority || 'ROUTINE'}
              </span>
            </td>
            <td class="py-3 px-4">
              <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getStatusBadgeClasses(req.status)}">
                ${formatStatusLabel(req.status)}
              </span>
            </td>
            <td class="py-3 px-4 text-slate-500 text-[11px] whitespace-nowrap">${formatDate(req.created_at)}</td>
            <td class="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
              <button type="button" class="view-details-btn p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer" data-id="${req.id}" title="View Details">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              </button>
              ${
                canEdit
                  ? `<button type="button" class="edit-req-btn p-1 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors cursor-pointer" data-id="${req.id}" title="Edit Request within 6h">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>`
                  : ''
              }
              ${
                canCancel
                  ? `<button type="button" class="cancel-req-btn p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer" data-id="${req.id}" title="Cancel Request">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>`
                  : ''
              }
            </td>
          </tr>
        `;
      })
      .join('');

    bindRequestActionButtons(tbody);
  }

  function renderOverviewNotificationsPreview() {
    const container = document.getElementById('overviewNotificationsPreview');
    if (!container) return;

    if (State.notifications.length === 0) {
      container.innerHTML = `
        <div class="py-6 text-center text-slate-400 text-xs">
          <p>No recent alerts or notifications.</p>
        </div>
      `;
      return;
    }

    const latest = State.notifications.slice(0, 3);

    container.innerHTML = latest
      .map((n) => {
        return `
          <div class="py-3 flex items-start justify-between gap-3 ${!n.isRead ? 'bg-red-50/30 px-2 rounded-xl' : ''}">
            <div class="flex items-start gap-2.5">
              <span class="w-2 h-2 rounded-full mt-1.5 ${!n.isRead ? 'bg-red-600' : 'bg-slate-300'} shrink-0"></span>
              <div>
                <p class="font-bold text-xs text-slate-800">${escapeHtml(n.title)}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(n.body)}</p>
                <span class="text-[10px] text-slate-400 font-medium mt-1 block">${formatRelativeTime(n.createdAt)}</span>
              </div>
            </div>
            ${
              n.relatedEntityId
                ? `<a href="#my-requests" class="text-[11px] font-semibold text-red-600 hover:underline shrink-0">
                    View #REQ-${n.relatedEntityId}
                  </a>`
                : ''
            }
          </div>
        `;
      })
      .join('');
  }

  // ==========================================================================
  // FIND BLOOD AVAILABILITY PAGE (§6)
  // ==========================================================================
  async function loadPublicBloodAvailability() {
    const container = document.getElementById('findBloodResultsContainer');
    const emptyState = document.getElementById('findBloodEmptyState');
    const countBadge = document.getElementById('findBloodCountBadge');
    if (!container) return;

    const bloodGroup = document.getElementById('filterBloodGroup')?.value || '';
    const component = document.getElementById('filterComponent')?.value || '';
    const city = document.getElementById('filterCity')?.value || '';

    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400 text-xs">
        <svg class="w-8 h-8 mx-auto animate-spin text-red-600 mb-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span>Checking regional blood storage availability...</span>
      </div>
    `;

    try {
      const res = await window.BloodBankAPI.getPublicBloodAvailability({
        blood_group: bloodGroup,
        component: component,
        city: city
      });

      const results = res?.data?.results || [];
      State.availabilityResults = results;

      if (countBadge) {
        countBadge.textContent = `(${results.length} found)`;
      }

      if (results.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
      }

      if (emptyState) emptyState.classList.add('hidden');

      container.innerHTML = results
        .map((item, idx) => {
          const org = item.organization || {};
          const isHighStock = item.availableUnits >= 5;

          return `
            <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <span class="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700">
                    ${org.type || 'HOSPITAL'}
                  </span>
                  <span class="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <span>${org.city || 'Metro City'}</span>
                  </span>
                </div>

                <div class="mt-3">
                  <h3 class="font-extrabold text-sm text-slate-900">${escapeHtml(org.name || 'Verified Storage')}</h3>
                  ${
                    org.contactPhone
                      ? `<p class="text-[11px] text-slate-500 mt-0.5">📞 ${escapeHtml(org.contactPhone)}</p>`
                      : ''
                  }
                </div>

                <div class="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-red-600 text-white font-black text-xs flex items-center justify-center">
                      ${item.bloodGroup}
                    </span>
                    <div>
                      <span class="font-bold text-xs text-slate-800 block">${formatComponentLabel(item.component)}</span>
                      <span class="text-[10px] text-slate-400 block">Tested & Validated</span>
                    </div>
                  </div>
                  <div class="text-right">
                    <span class="text-base font-extrabold ${isHighStock ? 'text-emerald-600' : 'text-amber-600'}">
                      ${item.availableUnits}
                    </span>
                    <span class="text-[10px] text-slate-400 block font-medium">available</span>
                  </div>
                </div>
              </div>

              <div class="mt-4 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  class="request-this-blood-btn w-full py-2 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  data-idx="${idx}"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                  <span>Request This Blood</span>
                </button>
              </div>
            </div>
          `;
        })
        .join('');

      // Bind prefill buttons
      container.querySelectorAll('.request-this-blood-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          const item = State.availabilityResults[idx];
          if (item) {
            prefillCreateRequestFromAvailability(item);
          }
        });
      });
    } catch (err) {
      console.error('Failed to search blood availability:', err);
      container.innerHTML = `
        <div class="col-span-full py-8 text-center text-rose-600 text-xs">
          <p class="font-bold">Unable to fetch live blood stock availability.</p>
          <p class="text-[11px] text-slate-500 mt-1">${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  function prefillCreateRequestFromAvailability(item) {
    const bloodGroupSelect = document.getElementById('reqBloodGroup');
    if (bloodGroupSelect) bloodGroupSelect.value = item.bloodGroup || '';

    const componentSelect = document.getElementById('reqComponent');
    if (componentSelect) componentSelect.value = item.component || '';

    const org = item.organization;
    if (org && org.id) {
      // Set to Registered Facility mode
      const regRadio = document.getElementById('facilityModeRegistered');
      if (regRadio) regRadio.checked = true;
      toggleFacilityMode('REGISTERED');

      selectFacility({
        id: org.id,
        name: org.name,
        type: org.type,
        city: org.city
      });
    }

    updateCreateRequestSummary();

    // Navigate to create-request
    window.location.hash = '#create-request';
    showToast(`Prefilled requisition with ${item.bloodGroup} ${formatComponentLabel(item.component)}.`, 'info');
  }

  // ==========================================================================
  // CREATE BLOOD REQUEST PAGE (§7) & FACILITY COMBOBOX
  // ==========================================================================
  function setupFormListeners() {
    // 1. Facility Mode Radio toggle
    const radioReg = document.getElementById('facilityModeRegistered');
    const radioMan = document.getElementById('facilityModeManual');

    if (radioReg) {
      radioReg.addEventListener('change', () => {
        if (radioReg.checked) toggleFacilityMode('REGISTERED');
      });
    }

    if (radioMan) {
      radioMan.addEventListener('change', () => {
        if (radioMan.checked) toggleFacilityMode('MANUAL');
      });
    }

    // 2. Searchable Facility Combobox
    const combobox = document.getElementById('facilitySearchCombobox');
    const dropdown = document.getElementById('facilityDropdownMenu');
    const clearBtn = document.getElementById('clearFacilityComboboxBtn');
    const changeFacilityBtn = document.getElementById('changeSelectedFacilityBtn');

    if (combobox) {
      combobox.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (clearBtn) {
          clearBtn.classList.toggle('hidden', query.length === 0);
        }

        clearTimeout(State.facilityDebounceTimer);
        State.facilityDebounceTimer = setTimeout(() => {
          searchFacilities(query);
        }, 250);
      });

      combobox.addEventListener('focus', () => {
        searchFacilities(combobox.value.trim());
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!combobox.contains(e.target) && dropdown && !dropdown.contains(e.target)) {
          dropdown.classList.add('hidden');
        }
      });
    }

    if (clearBtn && combobox) {
      clearBtn.addEventListener('click', () => {
        combobox.value = '';
        clearBtn.classList.add('hidden');
        searchFacilities('');
      });
    }

    if (changeFacilityBtn) {
      changeFacilityBtn.addEventListener('click', () => {
        clearSelectedFacility();
      });
    }

    // 3. Live Form Summary Preview listeners
    const summaryWatchIds = [
      'reqPatientName',
      'reqBloodGroup',
      'reqComponent',
      'reqQuantity',
      'reqPriority'
    ];

    summaryWatchIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', updateCreateRequestSummary);
        el.addEventListener('change', updateCreateRequestSummary);
      }
    });

    // 4. Create Request Form Submission (§7.F)
    const form = document.getElementById('createRequestForm');
    if (form) {
      form.addEventListener('submit', handleCreateRequestSubmit);
    }

    // 5. Profile Update Form Submission (§14)
    const profileForm = document.getElementById('profileUpdateForm');
    if (profileForm) {
      profileForm.addEventListener('submit', handleProfileUpdateSubmit);
    }
  }

  function toggleFacilityMode(mode) {
    State.facilityMode = mode;
    const regContainer = document.getElementById('registeredFacilityFieldContainer');
    const manContainer = document.getElementById('manualFacilityFieldContainer');
    const modeInput = document.getElementById('reqFacilitySelectionMode');

    if (modeInput) modeInput.value = mode;

    if (mode === 'REGISTERED') {
      if (regContainer) regContainer.classList.remove('hidden');
      if (manContainer) manContainer.classList.add('hidden');
    } else {
      if (regContainer) regContainer.classList.add('hidden');
      if (manContainer) manContainer.classList.remove('hidden');
    }
  }

  async function searchFacilities(query) {
    const dropdown = document.getElementById('facilityDropdownMenu');
    const listContainer = document.getElementById('facilityListItems');
    if (!dropdown || !listContainer) return;

    try {
      const res = await window.BloodBankAPI.getFacilities({ search: query, limit: 8 });
      const facilities = Array.isArray(res?.data) ? res.data : [];
      State.facilities = facilities;

      if (facilities.length === 0) {
        listContainer.innerHTML = `
          <div class="p-3 text-center text-slate-400 text-xs">
            No matching registered hospitals or clinics found.
          </div>
        `;
      } else {
        listContainer.innerHTML = facilities
          .map((fac) => {
            return `
              <div 
                class="facility-select-item p-3 hover:bg-red-50/50 cursor-pointer transition-colors flex items-center justify-between"
                data-id="${fac.id}"
                data-name="${escapeHtml(fac.name)}"
                data-type="${fac.type || 'HOSPITAL'}"
                data-city="${escapeHtml(fac.city || '')}"
              >
                <div>
                  <span class="font-bold text-xs text-slate-800 block">${escapeHtml(fac.name)}</span>
                  <span class="text-[11px] text-slate-500 block">${fac.type || 'HOSPITAL'} • ${escapeHtml(fac.city || 'Metro City')}</span>
                </div>
                <span class="text-[10px] font-bold uppercase text-red-600 bg-red-50 px-2 py-0.5 rounded">Select</span>
              </div>
            `;
          })
          .join('');

        // Bind clicks
        listContainer.querySelectorAll('.facility-select-item').forEach((item) => {
          item.addEventListener('click', () => {
            const id = parseInt(item.getAttribute('data-id'), 10);
            const name = item.getAttribute('data-name');
            const type = item.getAttribute('data-type');
            const city = item.getAttribute('data-city');

            selectFacility({ id, name, type, city });
          });
        });
      }

      dropdown.classList.remove('hidden');
    } catch (err) {
      console.warn('Facility search failed:', err.message);
    }
  }

  function selectFacility(fac) {
    State.selectedFacility = fac;

    const hiddenInput = document.getElementById('reqPreferredOrgId');
    if (hiddenInput) hiddenInput.value = fac.id;

    const preview = document.getElementById('selectedFacilityPreview');
    const combobox = document.getElementById('facilitySearchCombobox');
    const dropdown = document.getElementById('facilityDropdownMenu');

    if (preview) {
      document.getElementById('selectedFacilityName').textContent = fac.name;
      document.getElementById('selectedFacilityMeta').textContent = `${fac.type || 'HOSPITAL'} • ${fac.city || 'Metro City'}`;
      preview.classList.remove('hidden');
    }

    if (combobox) {
      combobox.value = fac.name;
      combobox.parentElement.classList.add('hidden');
    }

    if (dropdown) dropdown.classList.add('hidden');
  }

  function clearSelectedFacility() {
    State.selectedFacility = null;

    const hiddenInput = document.getElementById('reqPreferredOrgId');
    if (hiddenInput) hiddenInput.value = '';

    const preview = document.getElementById('selectedFacilityPreview');
    const combobox = document.getElementById('facilitySearchCombobox');

    if (preview) preview.classList.add('hidden');
    if (combobox) {
      combobox.value = '';
      combobox.parentElement.classList.remove('hidden');
      combobox.focus();
    }
  }

  function updateCreateRequestSummary() {
    const patientName = document.getElementById('reqPatientName')?.value.trim() || '—';
    const bloodGroup = document.getElementById('reqBloodGroup')?.value || '—';
    const component = document.getElementById('reqComponent')?.value;
    const units = document.getElementById('reqQuantity')?.value || '1';
    const priority = document.getElementById('reqPriority')?.value || 'ROUTINE';

    const pSummary = document.getElementById('summaryPatientPreview');
    if (pSummary) pSummary.textContent = patientName;

    const bgSummary = document.getElementById('summaryBloodGroupPreview');
    if (bgSummary) bgSummary.textContent = bloodGroup;

    const cuSummary = document.getElementById('summaryComponentUnitsPreview');
    if (cuSummary) {
      cuSummary.textContent = component ? `${formatComponentLabel(component)} (${units}u)` : '—';
    }

    const prSummary = document.getElementById('summaryPriorityPreview');
    if (prSummary) prSummary.textContent = priority;
  }

  async function handleCreateRequestSubmit(e) {
    e.preventDefault();

    const alertBox = document.getElementById('createRequestAlert');
    const submitBtn = document.getElementById('submitCreateRequestBtn');
    if (alertBox) alertBox.classList.add('hidden');

    // Extract form fields
    const patientName = document.getElementById('reqPatientName')?.value.trim();
    const medicalReference = document.getElementById('reqMedicalReference')?.value.trim();
    const bloodGroup = document.getElementById('reqBloodGroup')?.value;
    const component = document.getElementById('reqComponent')?.value;
    const quantity = parseInt(document.getElementById('reqQuantity')?.value, 10);
    const priority = document.getElementById('reqPriority')?.value || 'ROUTINE';
    const requiredDate = document.getElementById('reqRequiredDate')?.value || null;
    const requiredTime = document.getElementById('reqRequiredTime')?.value || null;
    const clinicalNotes = document.getElementById('reqClinicalNotes')?.value.trim() || '';
    const contactPhone = document.getElementById('reqContactPhone')?.value.trim();

    // Validation
    if (!patientName) {
      showAlert(alertBox, 'Please enter the patient name or medical ID.', 'error');
      return;
    }

    if (!bloodGroup) {
      showAlert(alertBox, 'Please select the required blood group.', 'error');
      return;
    }

    if (!component) {
      showAlert(alertBox, 'Please select the required blood component.', 'error');
      return;
    }

    if (isNaN(quantity) || quantity < 1 || quantity > 10) {
      showAlert(alertBox, 'Number of units must be a valid positive integer between 1 and 10.', 'error');
      return;
    }

    if (!contactPhone) {
      showAlert(alertBox, 'Contact phone number is required for operational updates.', 'error');
      return;
    }

    // Facility resolution
    let preferredOrgId = null;
    let manualFacilityName = null;
    let manualFacilityLocation = null;

    if (State.facilityMode === 'REGISTERED') {
      preferredOrgId = document.getElementById('reqPreferredOrgId')?.value;
      if (!preferredOrgId) {
        showAlert(alertBox, 'Please search and select a registered hospital or clinic.', 'error');
        return;
      }
    } else {
      manualFacilityName = document.getElementById('reqManualFacilityName')?.value.trim();
      manualFacilityLocation = document.getElementById('reqManualFacilityLocation')?.value.trim();

      if (!manualFacilityName || manualFacilityName.length < 2) {
        showAlert(alertBox, 'Please enter a valid facility name (minimum 2 characters).', 'error');
        return;
      }
    }

    // Prepare combined clinical note
    let fullNotes = clinicalNotes;
    if (medicalReference) {
      fullNotes = `[Ref: ${medicalReference}] ${fullNotes}`.trim();
    }
    if (patientName) {
      fullNotes = `[Patient: ${patientName}] ${fullNotes}`.trim();
    }
    if (requiredDate) {
      fullNotes = `${fullNotes} (Required: ${requiredDate}${requiredTime ? ' ' + requiredTime : ''})`.trim();
    }

    // Prepare payload
    const payload = {
      blood_group: bloodGroup,
      component: component,
      quantity: quantity,
      priority: priority,
      notes: fullNotes,
      preferred_organization_id: preferredOrgId ? parseInt(preferredOrgId, 10) : null,
      preferred_facility_name: manualFacilityName || null,
      preferred_facility_location: manualFacilityLocation || null
    };

    // Lock button
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span>Submitting Requisition...</span>
      `;
    }

    try {
      const res = await window.BloodBankAPI.createBloodRequest(payload);

      if (res && res.success) {
        const newId = res.data?.id || res.data?.request?.id || '—';
        showToast(`Blood requisition #${newId} submitted successfully for review!`, 'success');

        // Reset form
        document.getElementById('createRequestForm').reset();
        clearSelectedFacility();
        updateCreateRequestSummary();

        // Refresh all platform data
        await refreshAllData();

        // Redirect to Active Progress page to view status
        window.location.hash = '#active-progress';
      } else {
        throw new Error(res?.error?.message || 'Failed to submit blood request.');
      }
    } catch (err) {
      console.error('Error submitting request:', err);
      showAlert(alertBox, err.message || 'Server rejected the blood requisition. Please verify fields.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          <span>Submit Blood Request</span>
        `;
      }
    }
  }

  // ==========================================================================
  // MY REQUESTS PAGE (§8) & TAB FILTERING
  // ==========================================================================
  function setupFilterListeners() {
    // 1. My Requests Tab filtering
    document.querySelectorAll('.my-requests-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const tab = tabBtn.getAttribute('data-tab');
        State.activeTab = tab;

        // Update tab styles
        document.querySelectorAll('.my-requests-tab').forEach((b) => {
          if (b === tabBtn) {
            b.className = 'my-requests-tab py-2.5 px-3 border-b-2 border-red-600 text-red-600 cursor-pointer font-bold';
          } else {
            b.className = 'my-requests-tab py-2.5 px-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 cursor-pointer font-medium';
          }
        });

        renderMyRequestsTable();
      });
    });

    // 2. Search & Sort in My Requests
    const searchInput = document.getElementById('myRequestsSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        State.requestsSearchQuery = e.target.value.toLowerCase().trim();
        renderMyRequestsTable();
      });
    }

    const priorityFilter = document.getElementById('myRequestsPriorityFilter');
    if (priorityFilter) {
      priorityFilter.addEventListener('change', (e) => {
        State.requestsPriorityFilter = e.target.value;
        renderMyRequestsTable();
      });
    }

    const sortFilter = document.getElementById('myRequestsSortFilter');
    if (sortFilter) {
      sortFilter.addEventListener('change', (e) => {
        State.requestsSortOrder = e.target.value;
        renderMyRequestsTable();
      });
    }

    const refreshRequestsBtn = document.getElementById('refreshMyRequestsBtn');
    if (refreshRequestsBtn) {
      refreshRequestsBtn.addEventListener('click', async () => {
        refreshRequestsBtn.classList.add('animate-spin');
        await refreshAllData();
        renderMyRequestsTable();
        refreshRequestsBtn.classList.remove('animate-spin');
        showToast('Request history refreshed.', 'info');
      });
    }

    // 3. Find Blood Filters Form & Reset
    const findBloodForm = document.getElementById('findBloodFilterForm');
    if (findBloodForm) {
      findBloodForm.addEventListener('submit', (e) => {
        e.preventDefault();
        loadPublicBloodAvailability();
      });
    }

    const resetFindBloodBtn = document.getElementById('resetFindBloodFiltersBtn');
    if (resetFindBloodBtn) {
      resetFindBloodBtn.addEventListener('click', () => {
        const bg = document.getElementById('filterBloodGroup');
        const comp = document.getElementById('filterComponent');
        const city = document.getElementById('filterCity');
        if (bg) bg.value = '';
        if (comp) comp.value = '';
        if (city) city.value = '';
        loadPublicBloodAvailability();
      });
    }

    // 4. Notifications Mark All Read & Filter
    const markAllReadBtn = document.getElementById('markAllNotificationsReadBtn');
    if (markAllReadBtn) {
      markAllReadBtn.addEventListener('click', async () => {
        try {
          await window.BloodBankAPI.markAllNotificationsRead();
          State.notifications.forEach((n) => (n.isRead = true));
          State.unreadNotificationsCount = 0;
          updateNotificationBadges();
          renderNotificationsPage();
          showToast('All notifications marked as read.', 'success');
        } catch (err) {
          showToast('Failed to mark notifications as read.', 'error');
        }
      });
    }

    const notifFilterAll = document.getElementById('notifFilterAll');
    const notifFilterUnread = document.getElementById('notifFilterUnread');

    if (notifFilterAll && notifFilterUnread) {
      notifFilterAll.addEventListener('click', () => {
        State.notificationsFilter = 'all';
        notifFilterAll.className = 'font-bold text-red-600 border-b-2 border-red-600 pb-1 px-1';
        notifFilterUnread.className = 'font-medium text-slate-500 hover:text-slate-800 pb-1 px-1';
        renderNotificationsPage();
      });

      notifFilterUnread.addEventListener('click', () => {
        State.notificationsFilter = 'unread';
        notifFilterUnread.className = 'font-bold text-red-600 border-b-2 border-red-600 pb-1 px-1';
        notifFilterAll.className = 'font-medium text-slate-500 hover:text-slate-800 pb-1 px-1';
        renderNotificationsPage();
      });
    }

    // 5. Active Progress Refresh
    const refreshActiveBtn = document.getElementById('refreshActiveProgressBtn');
    if (refreshActiveBtn) {
      refreshActiveBtn.addEventListener('click', async () => {
        refreshActiveBtn.classList.add('opacity-50');
        await refreshAllData();
        renderActiveProgressPage();
        refreshActiveBtn.classList.remove('opacity-50');
        showToast('Active progress updated.', 'info');
      });
    }
  }

  function renderMyRequestsTable() {
    const tbody = document.getElementById('myRequestsTableBody');
    const emptyNotice = document.getElementById('myRequestsEmptyNotice');
    if (!tbody) return;

    // 1. Calculate tab counts
    const counts = {
      ALL: State.requests.length,
      ACTIVE: State.requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length,
      COMPLETED: State.requests.filter((r) => ['COMPLETED', 'FULFILLED', 'ISSUED'].includes(r.status)).length,
      CANCELLED: State.requests.filter((r) => r.status === 'CANCELLED').length,
      REJECTED: State.requests.filter((r) => ['REJECTED', 'EXPIRED'].includes(r.status)).length
    };

    const tabAll = document.getElementById('tabCountAll');
    if (tabAll) tabAll.textContent = counts.ALL;

    const tabActive = document.getElementById('tabCountActive');
    if (tabActive) tabActive.textContent = counts.ACTIVE;

    const tabCompleted = document.getElementById('tabCountCompleted');
    if (tabCompleted) tabCompleted.textContent = counts.COMPLETED;

    const tabCancelled = document.getElementById('tabCountCancelled');
    if (tabCancelled) tabCancelled.textContent = counts.CANCELLED;

    const tabRejected = document.getElementById('tabCountRejected');
    if (tabRejected) tabRejected.textContent = counts.REJECTED;

    // 2. Filter list by active tab
    let filtered = State.requests.filter((r) => {
      if (State.activeTab === 'ACTIVE') return ACTIVE_STATUSES.includes(r.status);
      if (State.activeTab === 'COMPLETED') return ['COMPLETED', 'FULFILLED', 'ISSUED'].includes(r.status);
      if (State.activeTab === 'CANCELLED') return r.status === 'CANCELLED';
      if (State.activeTab === 'REJECTED') return ['REJECTED', 'EXPIRED'].includes(r.status);
      return true;
    });

    // 3. Search query filter
    if (State.requestsSearchQuery) {
      const q = State.requestsSearchQuery;
      filtered = filtered.filter((r) => {
        const idMatch = String(r.id).includes(q);
        const bgMatch = (r.blood_group || '').toLowerCase().includes(q);
        const compMatch = (r.component || '').toLowerCase().includes(q);
        const facMatch = getRequestFacilityName(r).toLowerCase().includes(q);
        const notesMatch = (r.notes || '').toLowerCase().includes(q);
        return idMatch || bgMatch || compMatch || facMatch || notesMatch;
      });
    }

    // 4. Priority filter
    if (State.requestsPriorityFilter) {
      filtered = filtered.filter((r) => r.priority === State.requestsPriorityFilter);
    }

    // 5. Sorting
    filtered.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return State.requestsSortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    // 6. Render table or empty state
    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (emptyNotice) {
        emptyNotice.classList.remove('hidden');
        const emptyMsg = document.getElementById('myRequestsEmptyMessage');
        if (emptyMsg) {
          emptyMsg.textContent = State.requests.length === 0
            ? "You haven't submitted any blood requisitions yet."
            : 'No blood requests match this filter tab or search query.';
        }
      }
      return;
    }

    if (emptyNotice) emptyNotice.classList.add('hidden');

    tbody.innerHTML = filtered
      .map((req) => {
        const facilityName = getRequestFacilityName(req);
        const editRemaining = getRemainingEditTime(req.created_at);
        const canEdit = EDITABLE_STATUSES.includes(req.status) && editRemaining.isEligible;
        const canCancel = !['ISSUED', 'COMPLETED', 'FULFILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(req.status);

        return `
          <tr class="hover:bg-slate-50/70 transition-colors">
            <td class="py-3 px-4 font-mono font-bold text-slate-900">#${req.id}</td>
            <td class="py-3 px-4">
              <span class="inline-flex px-2 py-0.5 rounded text-xs font-black bg-red-100 text-red-800">
                ${req.blood_group || '—'}
              </span>
            </td>
            <td class="py-3 px-4 text-slate-700 font-medium">${formatComponentLabel(req.component)}</td>
            <td class="py-3 px-4 font-bold text-slate-900">${req.quantity || 1}</td>
            <td class="py-3 px-4 max-w-[160px] truncate font-medium text-slate-800" title="${facilityName}">${facilityName}</td>
            <td class="py-3 px-4">
              <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getPriorityBadgeClasses(req.priority)}">
                ${req.priority || 'ROUTINE'}
              </span>
            </td>
            <td class="py-3 px-4">
              <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getStatusBadgeClasses(req.status)}">
                ${formatStatusLabel(req.status)}
              </span>
            </td>
            <td class="py-3 px-4 text-slate-500 text-[11px] whitespace-nowrap">${formatDate(req.created_at)}</td>
            <td class="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
              <button type="button" class="view-details-btn p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer" data-id="${req.id}" title="View Details">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              </button>
              ${
                canEdit
                  ? `<button type="button" class="edit-req-btn p-1 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors cursor-pointer" data-id="${req.id}" title="Edit Request within 6h">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>`
                  : ''
              }
              ${
                canCancel
                  ? `<button type="button" class="cancel-req-btn p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer" data-id="${req.id}" title="Cancel Request">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>`
                  : ''
              }
            </td>
          </tr>
        `;
      })
      .join('');

    bindRequestActionButtons(tbody);
  }

  // ==========================================================================
  // ACTIVE REQUEST PROGRESS PAGE (§12 & §9)
  // ==========================================================================
  function renderActiveProgressPage() {
    const container = document.getElementById('activeProgressCardsContainer');
    const emptyState = document.getElementById('activeProgressEmptyState');
    if (!container) return;

    const activeList = State.requests.filter((r) => ACTIVE_STATUSES.includes(r.status));

    if (activeList.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = activeList
      .map((req) => {
        const facilityName = getRequestFacilityName(req);
        const editRemaining = getRemainingEditTime(req.created_at);
        const canEdit = EDITABLE_STATUSES.includes(req.status) && editRemaining.isEligible;
        const canCancel = !['ISSUED', 'COMPLETED', 'FULFILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(req.status);
        const stepperHtml = renderFullStepperHtml(req.status);

        return `
          <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div class="flex items-center gap-3">
                <span class="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
                <span class="font-extrabold text-base text-slate-900">Requisition #${req.id}</span>
                <span class="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${getStatusBadgeClasses(req.status)}">
                  ${formatStatusLabel(req.status)}
                </span>
                <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getPriorityBadgeClasses(req.priority)}">
                  ${req.priority || 'ROUTINE'}
                </span>
              </div>

              <div class="text-xs text-slate-400">
                <span>Submitted: ${formatDate(req.created_at)}</span>
              </div>
            </div>

            <!-- Details Specs Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs">
              <div>
                <span class="text-slate-400 text-[10px] uppercase font-bold block">Required Blood</span>
                <span class="text-base font-black text-red-700">${req.blood_group}</span>
                <span class="text-slate-500 text-[11px] block">${formatComponentLabel(req.component)}</span>
              </div>
              <div>
                <span class="text-slate-400 text-[10px] uppercase font-bold block">Units Required</span>
                <span class="text-base font-extrabold text-slate-900">${req.quantity} ${req.quantity === 1 ? 'Unit' : 'Units'}</span>
                <span class="text-slate-500 text-[11px] block">Fulfilled: ${req.fulfilled_quantity || 0}</span>
              </div>
              <div>
                <span class="text-slate-400 text-[10px] uppercase font-bold block">Treatment Facility</span>
                <span class="font-bold text-slate-800 block truncate" title="${facilityName}">${facilityName}</span>
                <span class="text-slate-500 text-[11px] block">${req.preferredFacilityLocation || 'Regional Center'}</span>
              </div>
              <div>
                <span class="text-slate-400 text-[10px] uppercase font-bold block">Fulfilling Blood Bank</span>
                <span class="font-bold text-slate-800 block truncate">${escapeHtml(req.fulfilling_organization_name || 'Central Regional Blood Bank')}</span>
                <span class="text-slate-500 text-[11px] block">Clinical Cross-Match</span>
              </div>
            </div>

            ${
              req.notes
                ? `<div class="p-3 rounded-xl bg-slate-50/70 border border-slate-100 text-xs text-slate-600">
                    <span class="font-bold text-slate-700">Clinical Notes:</span> ${escapeHtml(req.notes)}
                  </div>`
                : ''
            }

            <!-- 6-Stage Visual Stepper Timeline (§9 & §12) -->
            <div class="py-2">
              <h4 class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4">Lifecycle Workflow Status</h4>
              ${stepperHtml}
            </div>

            <!-- Footer: 6-Hour Editing Countdown Banner & Actions -->
            <div class="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                ${
                  canEdit
                    ? `<div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 live-edit-countdown" data-created="${req.created_at}" data-id="${req.id}">
                        <svg class="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <span class="font-bold">Authoritative 6-Hour Window: <span class="countdown-text font-mono">${editRemaining.formatted}</span> remaining</span>
                      </div>`
                    : `<span class="text-slate-400 text-[11px]">Request is locked into clinical processing; changes require blood bank coordination.</span>`
                }
              </div>

              <div class="flex items-center gap-2 self-end sm:self-auto">
                <button type="button" class="view-details-btn px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer" data-id="${req.id}">
                  View Full Details
                </button>
                ${
                  canEdit
                    ? `<button type="button" class="edit-req-btn px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors cursor-pointer" data-id="${req.id}">
                        Edit Request
                      </button>`
                    : ''
                }
                ${
                  canCancel
                    ? `<button type="button" class="cancel-req-btn px-3.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold transition-colors cursor-pointer" data-id="${req.id}">
                        Cancel Request
                      </button>`
                    : ''
                }
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    bindRequestActionButtons(container);
  }

  // ==========================================================================
  // NOTIFICATIONS PAGE (§13)
  // ==========================================================================
  function renderNotificationsPage() {
    const container = document.getElementById('notificationsListItems');
    const emptyState = document.getElementById('notificationsEmptyState');
    const countSummary = document.getElementById('notificationsCountSummary');
    if (!container) return;

    let list = State.notifications;
    if (State.notificationsFilter === 'unread') {
      list = list.filter((n) => !n.isRead);
    }

    if (countSummary) {
      countSummary.textContent = `${list.length} updates`;
    }

    if (list.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = list
      .map((n) => {
        return `
          <div class="p-4 flex items-start justify-between gap-4 hover:bg-slate-50/60 transition-colors ${!n.isRead ? 'bg-red-50/20' : ''}">
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-xl ${!n.isRead ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'} flex items-center justify-center shrink-0 mt-0.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-xs text-slate-900">${escapeHtml(n.title)}</h4>
                  ${!n.isRead ? `<span class="w-2 h-2 rounded-full bg-red-600"></span>` : ''}
                </div>
                <p class="text-xs text-slate-600 mt-1 leading-relaxed">${escapeHtml(n.body)}</p>
                <div class="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                  <span>${formatDate(n.createdAt)}</span>
                  ${
                    n.relatedEntityId
                      ? `<span>•</span><button type="button" class="view-details-btn text-red-600 hover:underline font-semibold cursor-pointer" data-id="${n.relatedEntityId}">Open Requisition #${n.relatedEntityId}</button>`
                      : ''
                  }
                </div>
              </div>
            </div>

            <div class="shrink-0 flex items-center gap-2">
              ${
                !n.isRead
                  ? `<button 
                      type="button" 
                      class="mark-single-read-btn text-[11px] font-semibold text-slate-500 hover:text-slate-800 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                      data-id="${n.id}"
                      title="Mark as read"
                    >
                      Mark Read
                    </button>`
                  : `<span class="text-[10px] text-slate-300 font-medium">Read</span>`
              }
            </div>
          </div>
        `;
      })
      .join('');

    // Bind mark read buttons
    container.querySelectorAll('.mark-single-read-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await window.BloodBankAPI.markNotificationRead(id);
          const target = State.notifications.find((x) => String(x.id) === String(id));
          if (target) target.isRead = true;
          State.unreadNotificationsCount = Math.max(0, State.unreadNotificationsCount - 1);
          updateNotificationBadges();
          renderNotificationsPage();
        } catch (err) {
          console.warn('Mark read failed:', err.message);
        }
      });
    });

    bindRequestActionButtons(container);
  }

  // ==========================================================================
  // PROFILE UPDATE (§14)
  // ==========================================================================
  async function handleProfileUpdateSubmit(e) {
    e.preventDefault();

    const alertBox = document.getElementById('profileUpdateAlert');
    const saveBtn = document.getElementById('saveProfileBtn');
    if (alertBox) alertBox.classList.add('hidden');

    const fullName = document.getElementById('profileInputFullName')?.value.trim();
    const phone = document.getElementById('profileInputPhone')?.value.trim();

    if (!fullName) {
      showAlert(alertBox, 'Full name cannot be empty.', 'error');
      return;
    }

    if (!phone) {
      showAlert(alertBox, 'Phone number is required for patient contact.', 'error');
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `
        <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span>Saving...</span>
      `;
    }

    try {
      const res = await window.BloodBankAPI.updateProfile({
        full_name: fullName,
        phone: phone
      });

      if (res && res.success) {
        // Update local session
        if (State.user) {
          State.user.fullName = fullName;
          State.user.full_name = fullName;
          State.user.phone = phone;
          if (window.BloodBankAuth) window.BloodBankAuth.setUser(State.user);
        }

        hydrateUserProfileUI();
        showAlert(alertBox, 'Profile updated successfully!', 'success');
        showToast('Profile settings saved successfully.', 'success');
      } else {
        throw new Error(res?.error?.message || 'Failed to update profile.');
      }
    } catch (err) {
      console.error('Profile update error:', err);
      showAlert(alertBox, err.message || 'Error updating profile.', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          <span>Save Profile Changes</span>
        `;
      }
    }
  }

  // ==========================================================================
  // MODALS & ACTIONS BINDINGS (§9, §10, §11)
  // ==========================================================================
  function setupModalListeners() {
    // Details Modal Close
    const closeDetailBtn = document.getElementById('closeDetailModalBtn');
    const closeDetailBottomBtn = document.getElementById('closeDetailModalBottomBtn');
    if (closeDetailBtn) closeDetailBtn.addEventListener('click', closeDetailsModal);
    if (closeDetailBottomBtn) closeDetailBottomBtn.addEventListener('click', closeDetailsModal);

    // Edit Modal Close
    const closeEditBtn = document.getElementById('closeEditModalBtn');
    const closeEditCancelBtn = document.getElementById('closeEditModalCancelBtn');
    if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditModal);
    if (closeEditCancelBtn) closeEditCancelBtn.addEventListener('click', closeEditModal);

    // Edit Modal Form Submit (§10)
    const editForm = document.getElementById('editRequestForm');
    if (editForm) {
      editForm.addEventListener('submit', handleEditRequestSubmit);
    }

    // Cancel Modal Close
    const abortCancelBtn = document.getElementById('abortCancelModalBtn');
    if (abortCancelBtn) abortCancelBtn.addEventListener('click', closeCancelModal);

    // Cancel Modal Confirmation Submit (§11)
    const confirmCancelBtn = document.getElementById('confirmCancelModalBtn');
    if (confirmCancelBtn) {
      confirmCancelBtn.addEventListener('click', handleCancelRequestSubmit);
    }

    // Cancellation Reason select dropdown: show custom input if 'Other'
    const cancelReasonSelect = document.getElementById('cancellationReasonSelect');
    const cancelCustomInput = document.getElementById('cancellationCustomReason');
    if (cancelReasonSelect && cancelCustomInput) {
      cancelReasonSelect.addEventListener('change', (e) => {
        if (e.target.value === 'Other') {
          cancelCustomInput.classList.remove('hidden');
          cancelCustomInput.focus();
        } else {
          cancelCustomInput.classList.add('hidden');
        }
      });
    }
  }

  function bindRequestActionButtons(parentContainer) {
    if (!parentContainer) return;

    // 1. View Details
    parentContainer.querySelectorAll('.view-details-btn').forEach((btn) => {
      btn.removeEventListener('click', handleViewDetailsClick);
      btn.addEventListener('click', handleViewDetailsClick);
    });

    // 2. Edit Request
    parentContainer.querySelectorAll('.edit-req-btn').forEach((btn) => {
      btn.removeEventListener('click', handleEditRequestClick);
      btn.addEventListener('click', handleEditRequestClick);
    });

    // 3. Cancel Request
    parentContainer.querySelectorAll('.cancel-req-btn').forEach((btn) => {
      btn.removeEventListener('click', handleCancelRequestClick);
      btn.addEventListener('click', handleCancelRequestClick);
    });
  }

  function handleViewDetailsClick(e) {
    const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
    openDetailsModal(id);
  }

  function handleEditRequestClick(e) {
    const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
    openEditModal(id);
  }

  function handleCancelRequestClick(e) {
    const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
    openCancelModal(id);
  }

  // --- DETAILS MODAL (§9) ---
  async function openDetailsModal(requestId) {
    const modal = document.getElementById('requestDetailsModal');
    const title = document.getElementById('modalDetailTitle');
    const content = document.getElementById('modalDetailContent');
    if (!modal || !content) return;

    State.activeViewingRequestId = requestId;
    if (title) title.textContent = `Requisition Details #REQ-${requestId}`;

    content.innerHTML = `
      <div class="py-8 text-center text-slate-400 text-xs">
        <svg class="w-6 h-6 mx-auto animate-spin text-red-600 mb-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span>Loading requisition record from database...</span>
      </div>
    `;

    modal.classList.remove('hidden');

    try {
      const res = await window.BloodBankAPI.getBloodRequestById(requestId);
      const req = res?.data;

      if (!req) {
        throw new Error('Requisition record could not be loaded.');
      }

      const facilityName = getRequestFacilityName(req);
      const stepperHtml = renderFullStepperHtml(req.status);
      const editRemaining = getRemainingEditTime(req.created_at);

      content.innerHTML = `
        <div class="space-y-4">
          <!-- Summary Header -->
          <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span class="text-[10px] text-slate-400 font-bold uppercase block">Current Workflow Status</span>
              <span class="inline-flex px-2.5 py-0.5 rounded text-xs font-black uppercase mt-1 ${getStatusBadgeClasses(req.status)}">
                ${formatStatusLabel(req.status)}
              </span>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-400 font-bold uppercase block">Clinical Priority</span>
              <span class="inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase mt-1 ${getPriorityBadgeClasses(req.priority)}">
                ${req.priority || 'ROUTINE'}
              </span>
            </div>
          </div>

          <!-- Clinical Specs -->
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-white p-3.5 rounded-xl border border-slate-100">
            <div>
              <span class="text-slate-400 text-[10px] uppercase font-bold block">Blood Group</span>
              <span class="text-base font-black text-red-700">${req.blood_group}</span>
            </div>
            <div>
              <span class="text-slate-400 text-[10px] uppercase font-bold block">Component</span>
              <span class="font-bold text-slate-800">${formatComponentLabel(req.component)}</span>
            </div>
            <div>
              <span class="text-slate-400 text-[10px] uppercase font-bold block">Units Required</span>
              <span class="font-bold text-slate-800">${req.quantity} unit(s)</span>
            </div>
            <div>
              <span class="text-slate-400 text-[10px] uppercase font-bold block">Treatment Facility</span>
              <span class="font-bold text-slate-800 block truncate" title="${facilityName}">${facilityName}</span>
              <span class="text-slate-400 text-[10px] block">${req.preferredFacilityLocation || 'Regional Center'}</span>
            </div>
            <div>
              <span class="text-slate-400 text-[10px] uppercase font-bold block">Fulfilling Blood Bank</span>
              <span class="font-bold text-slate-800 block truncate">${escapeHtml(req.fulfilling_organization_name || 'Central Regional Blood Bank')}</span>
            </div>
            <div>
              <span class="text-slate-400 text-[10px] uppercase font-bold block">Submission Time</span>
              <span class="text-slate-700 text-[11px] block">${formatDate(req.created_at)}</span>
            </div>
          </div>

          ${
            req.notes
              ? `<div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span class="text-slate-400 text-[10px] uppercase font-bold block mb-1">Clinical Notes & Reference</span>
                  <p class="text-slate-700">${escapeHtml(req.notes)}</p>
                </div>`
              : ''
          }

          ${
            req.cancellation_reason
              ? `<div class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
                  <span class="text-rose-600 text-[10px] uppercase font-extrabold block mb-0.5">Cancellation Audit Record</span>
                  <p>Reason: <strong>${escapeHtml(req.cancellation_reason)}</strong></p>
                  <span class="text-[10px] text-rose-500 mt-1 block">Cancelled at ${formatDate(req.cancelled_at)}</span>
                </div>`
              : ''
          }

          <!-- Workflow Stepper -->
          <div class="pt-2">
            <span class="text-slate-400 text-[10px] uppercase font-bold block mb-2">Audit Progress Stepper</span>
            ${stepperHtml}
          </div>

          <!-- 6-Hour Editing Countdown Banner -->
          ${
            EDITABLE_STATUSES.includes(req.status)
              ? `<div class="p-3 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 flex items-center justify-between">
                  <span class="text-[11px]">
                    ${
                      editRemaining.isEligible
                        ? `⏱ 6-Hour Edit Window Active: <strong>${editRemaining.formatted}</strong> remaining`
                        : `⏱ 6-Hour Edit Window Expired (${formatDate(req.created_at)})`
                    }
                  </span>
                  ${
                    editRemaining.isEligible
                      ? `<button type="button" class="edit-req-btn px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] cursor-pointer" data-id="${req.id}">Edit Requisition</button>`
                      : ''
                  }
                </div>`
              : ''
          }
        </div>
      `;

      bindRequestActionButtons(content);
    } catch (err) {
      content.innerHTML = `
        <div class="py-6 text-center text-rose-600 text-xs">
          <p class="font-bold">Failed to load request details.</p>
          <p class="text-[11px] text-slate-500 mt-1">${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  function closeDetailsModal() {
    const modal = document.getElementById('requestDetailsModal');
    if (modal) modal.classList.add('hidden');
    State.activeViewingRequestId = null;
  }

  // --- EDIT MODAL (§10 6-HOUR POLICY) ---
  function openEditModal(requestId) {
    const modal = document.getElementById('editRequestModal');
    const alertBox = document.getElementById('editRequestAlert');
    if (!modal) return;

    if (alertBox) alertBox.classList.add('hidden');

    const req = State.requests.find((r) => r.id === requestId);
    if (!req) {
      showToast('Requisition record not found.', 'error');
      return;
    }

    // Verify 6-hour edit window eligibility
    const editRemaining = getRemainingEditTime(req.created_at);
    if (!editRemaining.isEligible) {
      showToast('Editing window expired. Requisitions can only be edited within 6 hours of submission.', 'error');
      return;
    }

    if (!EDITABLE_STATUSES.includes(req.status)) {
      showToast(`Cannot edit request: clinical stage is ${req.status}.`, 'error');
      return;
    }

    State.activeEditingRequestId = requestId;

    // Prefill fields
    document.getElementById('editRequestId').value = req.id;
    document.getElementById('modalEditTitle').textContent = `Edit Blood Requisition #${req.id}`;

    const bg = document.getElementById('editBloodGroup');
    if (bg) bg.value = req.blood_group || '';

    const comp = document.getElementById('editComponent');
    if (comp) comp.value = req.component || '';

    const qty = document.getElementById('editQuantity');
    if (qty) qty.value = req.quantity || 1;

    const pr = document.getElementById('editPriority');
    if (pr) pr.value = req.priority || 'ROUTINE';

    const notes = document.getElementById('editNotes');
    if (notes) notes.value = req.notes || '';

    // Update countdown banner
    const countdownBanner = document.getElementById('editCountdownBanner');
    if (countdownBanner) {
      countdownBanner.textContent = `⏱ Editing available for ${editRemaining.formatted}`;
    }

    modal.classList.remove('hidden');
  }

  function closeEditModal() {
    const modal = document.getElementById('editRequestModal');
    if (modal) modal.classList.add('hidden');
    State.activeEditingRequestId = null;
  }

  async function handleEditRequestSubmit(e) {
    e.preventDefault();

    const alertBox = document.getElementById('editRequestAlert');
    const saveBtn = document.getElementById('saveEditRequestBtn');
    if (alertBox) alertBox.classList.add('hidden');

    const id = State.activeEditingRequestId;
    const req = State.requests.find((r) => r.id === id);

    if (!id || !req) {
      showAlert(alertBox, 'Active request not found.', 'error');
      return;
    }

    // Double check 6-hour window
    const editRemaining = getRemainingEditTime(req.created_at);
    if (!editRemaining.isEligible) {
      showAlert(alertBox, 'Edit rejected: The 6-hour window from submission has expired.', 'error');
      return;
    }

    const bloodGroup = document.getElementById('editBloodGroup')?.value;
    const component = document.getElementById('editComponent')?.value;
    const quantity = parseInt(document.getElementById('editQuantity')?.value, 10);
    const priority = document.getElementById('editPriority')?.value;
    const notes = document.getElementById('editNotes')?.value.trim();

    if (isNaN(quantity) || quantity < 1 || quantity > 10) {
      showAlert(alertBox, 'Number of units must be between 1 and 10.', 'error');
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving Changes...';
    }

    try {
      const res = await window.BloodBankAPI.updateBloodRequest(id, {
        blood_group: bloodGroup,
        component: component,
        quantity: quantity,
        priority: priority,
        notes: notes
      });

      if (res && res.success) {
        showToast(`Requisition #${id} successfully updated!`, 'success');
        closeEditModal();
        await refreshAllData();
        renderActiveProgressPage();
        renderMyRequestsTable();
      } else {
        throw new Error(res?.error?.message || 'Failed to update requisition.');
      }
    } catch (err) {
      console.error('Update request error:', err);
      showAlert(alertBox, err.message || 'Server rejected the update.', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    }
  }

  // --- CANCELLATION MODAL (§11) ---
  function openCancelModal(requestId) {
    const modal = document.getElementById('cancelRequestModal');
    const alertBox = document.getElementById('cancelRequestAlert');
    if (!modal) return;

    if (alertBox) alertBox.classList.add('hidden');

    const req = State.requests.find((r) => r.id === requestId);
    if (!req) {
      showToast('Requisition record not found.', 'error');
      return;
    }

    // Guard: completed / issued requisitions cannot be cancelled
    if (['ISSUED', 'COMPLETED', 'FULFILLED'].includes(req.status)) {
      showToast('Completed or issued requisitions cannot be cancelled.', 'error');
      return;
    }

    State.activeCancellingRequestId = requestId;

    const subtitle = document.getElementById('cancelRequestSubtitle');
    if (subtitle) {
      subtitle.textContent = `Requisition #${req.id} • ${req.blood_group} ${formatComponentLabel(req.component)} (${req.status})`;
    }

    const reasonSelect = document.getElementById('cancellationReasonSelect');
    if (reasonSelect) reasonSelect.value = 'Patient condition stabilized';

    const customReasonInput = document.getElementById('cancellationCustomReason');
    if (customReasonInput) {
      customReasonInput.value = '';
      customReasonInput.classList.add('hidden');
    }

    modal.classList.remove('hidden');
  }

  function closeCancelModal() {
    const modal = document.getElementById('cancelRequestModal');
    if (modal) modal.classList.add('hidden');
    State.activeCancellingRequestId = null;
  }

  async function handleCancelRequestSubmit() {
    const alertBox = document.getElementById('cancelRequestAlert');
    const confirmBtn = document.getElementById('confirmCancelModalBtn');
    if (alertBox) alertBox.classList.add('hidden');

    const id = State.activeCancellingRequestId;
    if (!id) return;

    const reasonSelect = document.getElementById('cancellationReasonSelect');
    const customReasonInput = document.getElementById('cancellationCustomReason');

    let reason = reasonSelect ? reasonSelect.value : 'Cancelled by requester';
    if (reason === 'Other' && customReasonInput && customReasonInput.value.trim()) {
      reason = customReasonInput.value.trim();
    }

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Cancelling...';
    }

    try {
      const res = await window.BloodBankAPI.cancelBloodRequest(id, reason);

      if (res && res.success) {
        showToast(`Requisition #${id} cancelled. Reserved stock released safely.`, 'success');
        closeCancelModal();
        await refreshAllData();
        renderActiveProgressPage();
        renderMyRequestsTable();
      } else {
        throw new Error(res?.error?.message || 'Failed to cancel requisition.');
      }
    } catch (err) {
      console.error('Cancellation error:', err);
      showAlert(alertBox, err.message || 'Server rejected cancellation.', 'error');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm Cancellation';
      }
    }
  }

  // ==========================================================================
  // REAL-TIME 6-HOUR COUNTDOWN TICKER (§10)
  // ==========================================================================
  function startGlobalCountdownTicker() {
    if (State.countdownTimerId) clearInterval(State.countdownTimerId);

    State.countdownTimerId = setInterval(() => {
      // 1. Update all on-page live countdown elements
      document.querySelectorAll('.live-edit-countdown').forEach((el) => {
        const createdAt = el.getAttribute('data-created');
        const textSpan = el.querySelector('.countdown-text');
        if (createdAt && textSpan) {
          const remaining = getRemainingEditTime(createdAt);
          if (remaining.isEligible) {
            textSpan.textContent = remaining.formatted;
          } else {
            textSpan.textContent = 'Expired';
            el.classList.add('opacity-50');
          }
        }
      });

      // 2. Update active edit modal banner if open
      if (State.activeEditingRequestId) {
        const req = State.requests.find((r) => r.id === State.activeEditingRequestId);
        if (req) {
          const banner = document.getElementById('editCountdownBanner');
          const remaining = getRemainingEditTime(req.created_at);
          if (banner) {
            if (remaining.isEligible) {
              banner.textContent = `⏱ Editing available for ${remaining.formatted}`;
            } else {
              banner.textContent = '⏱ 6-Hour editing window has expired';
              banner.className = 'inline-block mt-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200';
              const saveBtn = document.getElementById('saveEditRequestBtn');
              if (saveBtn) saveBtn.disabled = true;
            }
          }
        }
      }
    }, 1000);
  }

  function getRemainingEditTime(createdAtStr) {
    if (!createdAtStr) return { isEligible: false, formatted: '00:00:00', remainingMs: 0 };

    const createdTime = new Date(createdAtStr).getTime();
    if (isNaN(createdTime)) return { isEligible: false, formatted: '00:00:00', remainingMs: 0 };

    const deadline = createdTime + SIX_HOURS_MS;
    const now = Date.now();
    const remainingMs = deadline - now;

    if (remainingMs <= 0) {
      return { isEligible: false, formatted: '00:00:00', remainingMs: 0 };
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n) => String(n).padStart(2, '0');
    const formatted = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    return { isEligible: true, formatted, remainingMs };
  }

  // ==========================================================================
  // STEPPER TIMELINE BUILDERS (§9 & §12)
  // ==========================================================================
  const WORKFLOW_STEPS = [
    { key: 'SUBMITTED', title: 'Submitted', desc: 'Requisition logged' },
    { key: 'UNDER_REVIEW', title: 'Under Review', desc: 'Clinical intake & triage' },
    { key: 'SEARCHING_STOCK', title: 'Searching Stock', desc: 'Cross-matching inventory' },
    { key: 'STOCK_RESERVED', title: 'Stock Reserved', desc: 'Units reserved in bank' },
    { key: 'READY_FOR_COLLECTION', title: 'Ready for Collection', desc: 'Packaged & verified' },
    { key: 'FULFILLED', title: 'Fulfilled', desc: 'Issued to hospital team' }
  ];

  function getStepIndex(status) {
    if (status === 'PENDING') return 0;
    if (status === 'SUBMITTED') return 0;
    if (status === 'UNDER_REVIEW') return 1;
    if (status === 'APPROVED' || status === 'SEARCHING_STOCK') return 2;
    if (status === 'STOCK_RESERVED') return 3;
    if (status === 'READY_FOR_COLLECTION') return 4;
    if (status === 'FULFILLED' || status === 'COMPLETED' || status === 'ISSUED') return 5;
    return -1; // Terminal / exceptional state
  }

  function renderFullStepperHtml(currentStatus) {
    // If terminal state (CANCELLED, REJECTED, EXPIRED)
    if (['CANCELLED', 'REJECTED', 'EXPIRED'].includes(currentStatus)) {
      const config = {
        CANCELLED: { title: 'Requisition Cancelled', desc: 'Cancelled by requester; all reserved stock released safely.', color: 'rose' },
        REJECTED: { title: 'Requisition Rejected', desc: 'Clinical review determined blood could not be issued.', color: 'rose' },
        EXPIRED: { title: 'Requisition Expired', desc: 'Time limit elapsed before clinical fulfillment.', color: 'orange' }
      }[currentStatus];

      return `
        <div class="p-3.5 rounded-xl bg-${config.color}-50 border border-${config.color}-200 flex items-start gap-3 text-xs text-${config.color}-900">
          <svg class="w-5 h-5 text-${config.color}-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <div>
            <h5 class="font-extrabold text-${config.color}-800">${config.title}</h5>
            <p class="text-[11px] mt-0.5 text-${config.color}-700">${config.desc}</p>
          </div>
        </div>
      `;
    }

    const activeIndex = getStepIndex(currentStatus);

    return `
      <div class="relative">
        <div class="grid grid-cols-2 sm:grid-cols-6 gap-2">
          ${WORKFLOW_STEPS.map((step, idx) => {
            const isCompleted = idx < activeIndex;
            const isCurrent = idx === activeIndex;
            const isPending = idx > activeIndex;

            let iconHtml = '';
            let ringClass = '';
            let titleClass = '';

            if (isCompleted) {
              iconHtml = `<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>`;
              ringClass = 'bg-red-600 text-white';
              titleClass = 'text-slate-800 font-bold';
            } else if (isCurrent) {
              iconHtml = `<span class="w-2 h-2 rounded-full bg-white animate-ping"></span>`;
              ringClass = 'bg-red-600 text-white ring-4 ring-red-100';
              titleClass = 'text-red-700 font-extrabold';
            } else {
              iconHtml = `<span class="text-[10px] font-bold text-slate-400">${idx + 1}</span>`;
              ringClass = 'bg-slate-100 text-slate-400 border border-slate-200';
              titleClass = 'text-slate-400 font-medium';
            }

            return `
              <div class="p-2.5 rounded-xl ${isCurrent ? 'bg-red-50/40 border border-red-200' : 'bg-slate-50/50 border border-slate-100'} flex flex-col justify-between">
                <div class="flex items-center justify-between mb-2">
                  <div class="w-6 h-6 rounded-lg ${ringClass} flex items-center justify-center shrink-0">
                    ${iconHtml}
                  </div>
                  <span class="text-[9px] font-bold uppercase tracking-wider ${isCurrent ? 'text-red-600' : 'text-slate-400'}">
                    Step 0${idx + 1}
                  </span>
                </div>
                <div>
                  <span class="text-xs ${titleClass} block leading-snug">${step.title}</span>
                  <span class="text-[10px] text-slate-400 block mt-0.5 leading-tight">${step.desc}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderCompactStepperHtml(currentStatus) {
    const activeIndex = getStepIndex(currentStatus);
    const totalSteps = WORKFLOW_STEPS.length;
    const percent = Math.min(100, Math.round(((activeIndex + 1) / totalSteps) * 100));

    return `
      <div class="space-y-1.5">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-slate-700">Workflow Progress</span>
          <span class="font-extrabold text-red-600">${percent}% (${formatStatusLabel(currentStatus)})</span>
        </div>
        <div class="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full bg-red-600 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // HELPER FORMATTERS & UTILITIES
  // ==========================================================================
  function getRequestFacilityName(req) {
    if (!req) return 'Regional Medical Facility';
    if (req.preferred_facility && req.preferred_facility.name) {
      return req.preferred_facility.name;
    }
    if (req.preferredFacility) {
      return req.preferredFacility;
    }
    if (req.preferred_facility_name) {
      return req.preferred_facility_name;
    }
    return req.fulfilling_organization_name || 'Regional Blood Bank';
  }

  function formatComponentLabel(code) {
    const map = {
      PACKED_RBC: 'Packed Red Blood Cells (RBC)',
      WHOLE_BLOOD: 'Whole Blood',
      PLATELETS: 'Platelets (Thrombocytes)',
      PLASMA: 'Fresh Frozen Plasma (FFP)',
      CRYO: 'Cryoprecipitate'
    };
    return map[code] || code || 'Blood Component';
  }

  function formatStatusLabel(status) {
    if (!status) return 'Pending';
    return status.replace(/_/g, ' ');
  }

  function getStatusBadgeClasses(status) {
    switch (status) {
      case 'PENDING':
      case 'SUBMITTED':
        return 'bg-amber-50 text-amber-800 border border-amber-200';
      case 'UNDER_REVIEW':
        return 'bg-blue-50 text-blue-800 border border-blue-200';
      case 'APPROVED':
      case 'SEARCHING_STOCK':
        return 'bg-indigo-50 text-indigo-800 border border-indigo-200';
      case 'STOCK_RESERVED':
        return 'bg-purple-50 text-purple-800 border border-purple-200';
      case 'READY_FOR_COLLECTION':
        return 'bg-emerald-50 text-emerald-800 border border-emerald-200';
      case 'FULFILLED':
      case 'COMPLETED':
      case 'ISSUED':
        return 'bg-emerald-100 text-emerald-900 border border-emerald-300';
      case 'CANCELLED':
        return 'bg-slate-100 text-slate-700 border border-slate-300';
      case 'REJECTED':
        return 'bg-rose-50 text-rose-800 border border-rose-200';
      case 'EXPIRED':
        return 'bg-orange-50 text-orange-800 border border-orange-200';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  }

  function getPriorityBadgeClasses(priority) {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 border border-red-300';
      case 'URGENT':
        return 'bg-amber-50 text-amber-800 border border-amber-200';
      case 'ROUTINE':
      default:
        return 'bg-slate-100 text-slate-600 border border-slate-200';
    }
  }

  function formatDate(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  }

  function formatRelativeTime(isoStr) {
    if (!isoStr) return 'Recently';
    try {
      const diffMs = Date.now() - new Date(isoStr).getTime();
      const diffMins = Math.floor(diffMs / (60 * 1000));
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return 'Recently';
    }
  }

  function showAlert(alertEl, message, type = 'error') {
    if (!alertEl) return;
    alertEl.textContent = message;
    alertEl.className = type === 'error'
      ? 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 block'
      : 'p-3 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 block';
    alertEl.classList.remove('hidden');
  }

  function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const borderClass = {
      info: 'border-blue-300 bg-white text-slate-800',
      success: 'border-emerald-300 bg-white text-slate-800',
      error: 'border-rose-300 bg-white text-slate-800',
      warning: 'border-amber-300 bg-white text-slate-800'
    }[type] || 'border-slate-200 bg-white text-slate-800';

    const iconColor = {
      info: 'text-blue-600 bg-blue-50',
      success: 'text-emerald-600 bg-emerald-50',
      error: 'text-rose-600 bg-rose-50',
      warning: 'text-amber-600 bg-amber-50'
    }[type] || 'text-slate-600 bg-slate-50';

    toast.className = `p-3.5 rounded-2xl border ${borderClass} shadow-xl flex items-start gap-3 pointer-events-auto transform transition-all duration-300 translate-y-2 opacity-0 text-xs`;
    toast.innerHTML = `
      <div class="w-6 h-6 rounded-lg ${iconColor} flex items-center justify-center shrink-0">
        ${
          type === 'success'
            ? `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`
            : type === 'error'
            ? `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>`
            : `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
        }
      </div>
      <div class="flex-1 font-medium leading-relaxed">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    // Auto dismiss
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 300);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
