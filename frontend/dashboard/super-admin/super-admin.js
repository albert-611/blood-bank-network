/**
 * ============================================================================
 * BLOOD BANK PLATFORM — SUPER ADMIN SAAS DASHBOARD CONTROLLER SCRIPT
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§5, §11, §13, §18, §19, §29)
 *
 * Implements real-time platform governance for Super Admin:
 * - Role authentication and user profile resolution
 * - Real-time KPI metrics with smooth initial 0 -> target counter animation
 * - Chart.js Organization Overview Donut Chart with center total text
 * - Chart.js Organization Growth Trend Chart (Hospitals, Clinics, Blood Banks)
 * - Centralized 3-Tab Platform Management:
 *     * Tab 1: Pending List (30/page, newest first, review/approve/reject)
 *     * Tab 2: All Platform Organizations (30/page, search & status filter)
 *     * Tab 3: Platform Activity Audit Trail (30/page, immutable security log)
 * - Independent pagination controls for all 3 tabs
 * - Fixed sidebar layout with viewport pinned navigation
 * - Responsive mobile sidebar drawer, profile dropdown, notification preview
 * - STRICT CONSTRAINT: ZERO EMOJIS. Lucide icons throughout entire UI.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // --------------------------------------------------------------------------
  // Helper: Lucide Icons Re-render
  // --------------------------------------------------------------------------
  function renderLucide() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // --------------------------------------------------------------------------
  // 1. Role Security Check
  // --------------------------------------------------------------------------
  if (window.BloodBankAuth && typeof window.BloodBankAuth.requireRole === 'function') {
    const isAuthed = window.BloodBankAuth.requireRole('SUPER_ADMIN');
    if (!isAuthed) return;
  }

  // --------------------------------------------------------------------------
  // 2. DOM Elements Selection
  // --------------------------------------------------------------------------
  // Main scroll container
  const mainContentContainer = document.querySelector('main.main-content');

  // Top Navbar Elements
  const currentDateDisplay = document.getElementById('currentDateDisplay');
  const pageHeaderDate = document.getElementById('pageHeaderDate');
  const globalSearchInput = document.getElementById('globalSearchInput');
  const notificationBellBtn = document.getElementById('notificationBellBtn');
  const notificationDropdown = document.getElementById('notificationDropdown');
  const profileDropdownBtn = document.getElementById('profileDropdownBtn');
  const profileDropdownMenu = document.getElementById('profileDropdownMenu');
  const mobileMenuToggleBtn = document.getElementById('mobileMenuToggleBtn');
  const closeMobileSidebarBtn = document.getElementById('closeMobileSidebarBtn');
  const sidebarNav = document.getElementById('sidebarNav');
  const mobileSidebarBackdrop = document.getElementById('mobileSidebarBackdrop');

  // User Profile Displays
  const welcomeAdminName = document.getElementById('welcomeAdminName');
  const adminUserName = document.getElementById('adminUserName');
  const userAvatar = document.getElementById('userAvatar');
  const dropdownUserFullName = document.getElementById('dropdownUserFullName');
  const dropdownUserEmail = document.getElementById('dropdownUserEmail');

  // KPI Counters
  const kpiTotalOrgs = document.getElementById('kpiTotalOrgs');
  const kpiTotalOrgsSubtitle = document.getElementById('kpiTotalOrgsSubtitle');
  const kpiPendingApprovals = document.getElementById('kpiPendingApprovals');
  const kpiActiveOrgs = document.getElementById('kpiActiveOrgs');
  const kpiTotalUsers = document.getElementById('kpiTotalUsers');
  const kpiActiveUsersSubtitle = document.getElementById('kpiActiveUsersSubtitle');

  // Overview Donut & Breakdown Elements
  const overviewHospitalsCount = document.getElementById('overviewHospitalsCount');
  const overviewHospitalsBar = document.getElementById('overviewHospitalsBar');
  const overviewClinicsCount = document.getElementById('overviewClinicsCount');
  const overviewClinicsBar = document.getElementById('overviewClinicsBar');
  const overviewBloodBanksCount = document.getElementById('overviewBloodBanksCount');
  const overviewBloodBanksBar = document.getElementById('overviewBloodBanksBar');

  const statusApprovedCount = document.getElementById('statusApprovedCount');
  const statusPendingCount = document.getElementById('statusPendingCount');
  const statusRejectedCount = document.getElementById('statusRejectedCount');
  const statusSuspendedCount = document.getElementById('statusSuspendedCount');

  // Quick Platform Stats Elements
  const quickActiveUsers = document.getElementById('quickActiveUsers');
  const quickOrgsThisMonth = document.getElementById('quickOrgsThisMonth');
  const quickReportsGenerated = document.getElementById('quickReportsGenerated');

  // Sidebar Badges
  const sidebarTotalOrgsBadge = document.getElementById('sidebarTotalOrgsBadge');
  const sidebarPendingBadge = document.getElementById('sidebarPendingBadge');
  const sidebarUsersBadge = document.getElementById('sidebarUsersBadge');
  const pendingAlertsBadge = document.getElementById('pendingAlertsBadge');

  // Refresh Dashboard Button
  const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
  const refreshSpinner = document.getElementById('refreshSpinner');

  // Platform Management Section & Tab Controls
  const platformManagementSection = document.getElementById('platformManagementSection');
  const tabBtnPending = document.getElementById('tabBtnPending');
  const tabBtnAllOrgs = document.getElementById('tabBtnAllOrgs');
  const tabBtnActivity = document.getElementById('tabBtnActivity');

  const tabPanePending = document.getElementById('tabPanePending');
  const tabPaneAllOrgs = document.getElementById('tabPaneAllOrgs');
  const tabPaneActivity = document.getElementById('tabPaneActivity');

  const tabPendingBadge = document.getElementById('tabPendingBadge');
  const tabAllOrgsBadge = document.getElementById('tabAllOrgsBadge');
  const tabActivityBadge = document.getElementById('tabActivityBadge');

  // Tab 1: Pending List Elements
  const pendingTableBody = document.getElementById('pendingTableBody');
  const pendingShowingInfo = document.getElementById('pendingShowingInfo');
  const pendingPaginationSummary = document.getElementById('pendingPaginationSummary');
  const pendingPrevBtn = document.getElementById('pendingPrevBtn');
  const pendingNextBtn = document.getElementById('pendingNextBtn');
  const pendingPageNumbers = document.getElementById('pendingPageNumbers');

  // Tab 2: All Platform Organizations Elements
  const orgTableBody = document.getElementById('orgTableBody');
  const orgSearchInput = document.getElementById('orgSearchInput');
  const statusFilterPills = document.querySelectorAll('[data-status-filter]');
  const allOrgsPaginationSummary = document.getElementById('allOrgsPaginationSummary');
  const allOrgsPrevBtn = document.getElementById('allOrgsPrevBtn');
  const allOrgsNextBtn = document.getElementById('allOrgsNextBtn');
  const allOrgsPageNumbers = document.getElementById('allOrgsPageNumbers');

  // Tab 3: Platform Activity Elements
  const platformActivityTimeline = document.getElementById('platformActivityTimeline');
  const refreshActivityBtn = document.getElementById('refreshActivityBtn');
  const activityPaginationSummary = document.getElementById('activityPaginationSummary');
  const activityPrevBtn = document.getElementById('activityPrevBtn');
  const activityNextBtn = document.getElementById('activityNextBtn');
  const activityPageNumbers = document.getElementById('activityPageNumbers');

  // Modals
  const viewModal = document.getElementById('viewOrgModal');
  const closeViewModalBtn = document.getElementById('closeViewModalBtn');
  const rejectModal = document.getElementById('rejectOrgModal');
  const closeRejectModalBtn = document.getElementById('closeRejectModalBtn');
  const cancelRejectBtn = document.getElementById('cancelRejectBtn');
  const confirmRejectBtn = document.getElementById('confirmRejectBtn');
  const rejectReasonInput = document.getElementById('rejectReasonInput');
  const rejectOrgNameEl = document.getElementById('rejectOrgName');

  // Toast
  const toast = document.getElementById('adminToast');
  const toastMessage = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  // --------------------------------------------------------------------------
  // State Management
  // --------------------------------------------------------------------------
  let dashboardStats = null;
  let statsAnimated = false; // Flag to guarantee counter animation runs ONCE on initial load
  const orgCache = new Map(); // Global cache of organizations by ID for modal lookup

  const tabState = {
    activeTab: 'pending',
    pending: {
      page: 1,
      limit: 30,
      total: 0,
      totalPages: 1,
      items: [],
      loaded: false
    },
    allOrgs: {
      page: 1,
      limit: 30,
      total: 0,
      totalPages: 1,
      status: 'ALL',
      search: '',
      items: [],
      loaded: false
    },
    activity: {
      page: 1,
      limit: 30,
      total: 0,
      totalPages: 1,
      items: [],
      loaded: false
    }
  };

  let activeRejectOrgId = null;
  let activeRejectOrgName = '';

  // Chart Instances
  let donutChartInstance = null;
  let growthChartInstance = null;

  // --------------------------------------------------------------------------
  // 3. Date & Time Display
  // --------------------------------------------------------------------------
  function initDateDisplay() {
    const now = new Date();
    const formatted = now.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    if (currentDateDisplay) currentDateDisplay.textContent = formatted;
    if (pageHeaderDate) pageHeaderDate.textContent = formatted;
  }
  initDateDisplay();

  // --------------------------------------------------------------------------
  // 4. Smooth JS 0 -> Target Counter Animation (Runs ONCE on initial load)
  // --------------------------------------------------------------------------
  function animateCounter(el, target, duration = 900) {
    if (!el) return;
    const end = parseInt(target, 10);
    if (isNaN(end)) {
      el.textContent = target;
      return;
    }

    if (statsAnimated) {
      el.textContent = end.toLocaleString();
      return;
    }

    const start = 0;
    const startTime = performance.now();

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * ease);
      el.textContent = current.toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = end.toLocaleString();
      }
    }

    requestAnimationFrame(step);
  }

  // --------------------------------------------------------------------------
  // 5. Toast Notification System (Lucide Icons, Zero Emojis)
  // --------------------------------------------------------------------------
  let toastTimer = null;
  function showToast(message, type = 'success') {
    if (!toast) return;
    clearTimeout(toastTimer);

    toastMessage.textContent = message;
    if (type === 'success') {
      toast.className = 'fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-950/90 text-white shadow-xl backdrop-blur-md border border-emerald-500/30 transition-all duration-300 translate-y-0 opacity-100';
      if (toastIcon) toastIcon.innerHTML = '<i data-lucide="circle-check" class="w-5 h-5 text-emerald-400"></i>';
    } else if (type === 'error') {
      toast.className = 'fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-rose-950/90 text-white shadow-xl backdrop-blur-md border border-rose-500/30 transition-all duration-300 translate-y-0 opacity-100';
      if (toastIcon) toastIcon.innerHTML = '<i data-lucide="circle-x" class="w-5 h-5 text-rose-400"></i>';
    } else {
      toast.className = 'fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/90 text-white shadow-xl backdrop-blur-md border border-slate-700/50 transition-all duration-300 translate-y-0 opacity-100';
      if (toastIcon) toastIcon.innerHTML = '<i data-lucide="triangle-alert" class="w-5 h-5 text-amber-400"></i>';
    }

    renderLucide();

    toastTimer = setTimeout(() => {
      toast.classList.add('translate-y-12', 'opacity-0');
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 4500);
  }

  // --------------------------------------------------------------------------
  // 6. User Profile Resolution
  // --------------------------------------------------------------------------
  async function loadUserProfile() {
    try {
      let user = null;
      if (window.BloodBankAuth && typeof window.BloodBankAuth.getUser === 'function') {
        user = window.BloodBankAuth.getUser();
      }

      if (!user && window.BloodBankAPI) {
        const res = await window.BloodBankAPI.getMe().catch(() => null);
        if (res && res.success && res.data?.user) {
          user = res.data.user;
        }
      }

      if (user) {
        const name = user.full_name || 'Sarah Johnson';
        const email = user.email || 'admin@bloodbank.dev';
        if (welcomeAdminName) welcomeAdminName.textContent = name;
        if (adminUserName) adminUserName.textContent = name;
        if (dropdownUserFullName) dropdownUserFullName.textContent = name;
        if (dropdownUserEmail) dropdownUserEmail.textContent = email;

        const initials = name
          .split(' ')
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() || 'SJ';
        if (userAvatar) userAvatar.textContent = initials;
      }
    } catch (err) {
      console.warn('Could not load user profile:', err);
    }
  }

  // --------------------------------------------------------------------------
  // 7. KPI Metrics & Overview Telemetry
  // --------------------------------------------------------------------------
  async function loadDashboardStats() {
    try {
      const statsRes = await window.BloodBankAPI.getDashboardStats().catch(() => null);
      if (statsRes && statsRes.success && statsRes.data) {
        dashboardStats = statsRes.data;
      } else {
        // Fallback default structure
        dashboardStats = {
          kpis: {
            total_organizations: 0,
            pending_approvals: 0,
            active_organizations: 0,
            total_users: 0,
            active_users: 0,
            orgs_this_month: 0,
            reports_generated: 12
          },
          organization_breakdown: {
            by_type: { hospitals: 0, clinics: 0, blood_banks: 0 },
            by_status: { approved: 0, pending: 0, rejected: 0, suspended: 0 }
          },
          growth_timeline: []
        };
      }

      renderKPICards();
      renderOverviewCharts();
      renderQuickStats();

      // Mark stats animation as completed
      statsAnimated = true;
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    }
  }

  function renderKPICards() {
    if (!dashboardStats) return;
    const k = dashboardStats.kpis || {};

    const totalOrgs = k.total_organizations || 0;
    const pending = k.pending_approvals || 0;
    const activeOrgs = k.active_organizations || 0;
    const totalUsers = k.total_users || 0;
    const activeUsers = k.active_users || 0;
    const orgsThisMonth = k.orgs_this_month || 0;

    // KPI Counters (animated on first load)
    animateCounter(kpiTotalOrgs, totalOrgs);
    animateCounter(kpiPendingApprovals, pending);
    animateCounter(kpiActiveOrgs, activeOrgs);
    animateCounter(kpiTotalUsers, totalUsers);

    if (kpiTotalOrgsSubtitle) {
      kpiTotalOrgsSubtitle.textContent = `+${orgsThisMonth} registered this month`;
    }
    if (kpiActiveUsersSubtitle) {
      kpiActiveUsersSubtitle.textContent = `${activeUsers} active · Staff & donors`;
    }

    // Sidebar & Notification Badges
    if (sidebarTotalOrgsBadge) sidebarTotalOrgsBadge.textContent = totalOrgs;
    if (sidebarUsersBadge) sidebarUsersBadge.textContent = totalUsers;
    if (sidebarPendingBadge) {
      sidebarPendingBadge.textContent = pending;
      if (pending > 0) {
        sidebarPendingBadge.classList.remove('hidden');
      } else {
        sidebarPendingBadge.classList.add('hidden');
      }
    }
    if (pendingAlertsBadge) {
      pendingAlertsBadge.textContent = `${pending} pending`;
    }
    if (tabPendingBadge) {
      tabPendingBadge.textContent = pending;
    }
    if (tabAllOrgsBadge) {
      tabAllOrgsBadge.textContent = totalOrgs;
    }
  }

  function renderQuickStats() {
    if (!dashboardStats) return;
    const k = dashboardStats.kpis || {};
    animateCounter(quickActiveUsers, k.active_users || 0);
    animateCounter(quickOrgsThisMonth, k.orgs_this_month || 0);
    if (quickReportsGenerated) {
      animateCounter(quickReportsGenerated, k.reports_generated || 12);
    }
  }

  // --------------------------------------------------------------------------
  // 8. Overview Donut & Growth Charts (Chart.js)
  // --------------------------------------------------------------------------
  function renderOverviewCharts() {
    if (!dashboardStats) return;
    const byType = dashboardStats.organization_breakdown?.by_type || { hospitals: 0, clinics: 0, blood_banks: 0 };
    const byStatus = dashboardStats.organization_breakdown?.by_status || { approved: 0, pending: 0, rejected: 0, suspended: 0 };
    const total = dashboardStats.kpis?.total_organizations || 1;

    // Subtype counters & percentage bars
    animateCounter(overviewHospitalsCount, byType.hospitals);
    if (overviewHospitalsBar) {
      const pct = total > 0 ? Math.round((byType.hospitals / total) * 100) : 0;
      overviewHospitalsBar.style.width = `${pct}%`;
    }

    animateCounter(overviewClinicsCount, byType.clinics);
    if (overviewClinicsBar) {
      const pct = total > 0 ? Math.round((byType.clinics / total) * 100) : 0;
      overviewClinicsBar.style.width = `${pct}%`;
    }

    animateCounter(overviewBloodBanksCount, byType.blood_banks);
    if (overviewBloodBanksBar) {
      const pct = total > 0 ? Math.round((byType.blood_banks / total) * 100) : 0;
      overviewBloodBanksBar.style.width = `${pct}%`;
    }

    // Status breakdown pills
    animateCounter(statusApprovedCount, byStatus.approved);
    animateCounter(statusPendingCount, byStatus.pending);
    animateCounter(statusRejectedCount, byStatus.rejected);
    animateCounter(statusSuspendedCount, byStatus.suspended);

    if (typeof Chart === 'undefined') {
      console.warn('Chart.js library is not available.');
      return;
    }

    // Donut Chart with Center Total Text
    const donutCanvas = document.getElementById('orgOverviewChart');
    if (donutCanvas) {
      if (donutChartInstance) donutChartInstance.destroy();

      const centerTextPlugin = {
        id: 'centerTextPlugin',
        beforeDraw(chart) {
          const { width, height, ctx } = chart;
          ctx.restore();
          ctx.font = 'bold 24px Inter, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#111827';
          const text = String(total);
          const textX = Math.round((width - ctx.measureText(text).width) / 2);
          const textY = height / 2 - 8;
          ctx.fillText(text, textX, textY);

          ctx.font = '600 11px Inter, sans-serif';
          ctx.fillStyle = '#6B7280';
          const subtext = 'Total Organizations';
          const subtextX = Math.round((width - ctx.measureText(subtext).width) / 2);
          const subtextY = height / 2 + 12;
          ctx.fillText(subtext, subtextX, subtextY);
          ctx.save();
        }
      };

      donutChartInstance = new Chart(donutCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Hospitals', 'Clinics', 'Blood Banks'],
          datasets: [
            {
              data: [byType.hospitals, byType.clinics, byType.blood_banks],
              backgroundColor: ['#2563EB', '#7C3AED', '#DC2626'],
              borderColor: '#ffffff',
              borderWidth: 2,
              hoverOffset: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#111827',
              titleFont: { family: 'Inter', size: 12, weight: 'bold' },
              bodyFont: { family: 'Inter', size: 11 },
              padding: 10,
              cornerRadius: 8
            }
          }
        },
        plugins: [centerTextPlugin]
      });
    }

    // Growth Trend Chart
    const growthCanvas = document.getElementById('orgGrowthChart');
    if (growthCanvas) {
      if (growthChartInstance) growthChartInstance.destroy();

      const rawTimeline = dashboardStats.growth_timeline || [];
      const monthMap = {};

      if (Array.isArray(rawTimeline)) {
        rawTimeline.forEach((item) => {
          const m = item.month || '2026-09';
          if (!monthMap[m]) monthMap[m] = { hospitals: 0, clinics: 0, blood_banks: 0 };
          if (item.type === 'HOSPITAL') monthMap[m].hospitals += item.count || 0;
          else if (item.type === 'CLINIC') monthMap[m].clinics += item.count || 0;
          else if (item.type === 'BLOOD_BANK') monthMap[m].blood_banks += item.count || 0;
          else if (item.HOSPITAL !== undefined) {
            monthMap[m].hospitals = item.HOSPITAL;
            monthMap[m].clinics = item.CLINIC;
            monthMap[m].blood_banks = item.BLOOD_BANK;
          }
        });
      }

      let labels = Object.keys(monthMap).sort();
      if (labels.length === 0) {
        labels = ['2026-06', '2026-07', '2026-08', '2026-09'];
        monthMap['2026-06'] = { hospitals: 1, clinics: 0, blood_banks: 0 };
        monthMap['2026-07'] = { hospitals: 2, clinics: 1, blood_banks: 1 };
        monthMap['2026-08'] = { hospitals: 5, clinics: 2, blood_banks: 2 };
        monthMap['2026-09'] = { hospitals: byType.hospitals, clinics: byType.clinics, blood_banks: byType.blood_banks };
      }

      const formattedLabels = labels.map((l) => {
        const [y, m] = l.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const idx = parseInt(m, 10) - 1;
        return `${monthNames[idx] || m} '${(y || '26').slice(-2)}`;
      });

      const hospitalsData = labels.map((l) => monthMap[l]?.hospitals || 0);
      const clinicsData = labels.map((l) => monthMap[l]?.clinics || 0);
      const bloodBanksData = labels.map((l) => monthMap[l]?.blood_banks || 0);

      growthChartInstance = new Chart(growthCanvas, {
        type: 'bar',
        data: {
          labels: formattedLabels,
          datasets: [
            {
              label: 'Hospitals',
              data: hospitalsData,
              backgroundColor: '#2563EB',
              borderRadius: 4
            },
            {
              label: 'Clinics',
              data: clinicsData,
              backgroundColor: '#7C3AED',
              borderRadius: 4
            },
            {
              label: 'Blood Banks',
              data: bloodBanksData,
              backgroundColor: '#DC2626',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              stacked: true,
              grid: { display: false },
              ticks: { font: { family: 'Inter', size: 10 }, color: '#6B7280' }
            },
            y: {
              stacked: true,
              beginAtZero: true,
              ticks: { precision: 0, font: { family: 'Inter', size: 10 }, color: '#6B7280' },
              grid: { color: '#F1F5F9' }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#111827',
              padding: 10,
              cornerRadius: 8,
              titleFont: { family: 'Inter', size: 11, weight: 'bold' },
              bodyFont: { family: 'Inter', size: 11 }
            }
          }
        }
      });
    }
  }

  // --------------------------------------------------------------------------
  // 9. Generic Pagination Controls Renderer
  // --------------------------------------------------------------------------
  function renderPaginationUI({
    page,
    limit,
    total,
    totalPages,
    summaryEl,
    prevBtn,
    nextBtn,
    pageNumbersEl,
    onPageChange
  }) {
    if (summaryEl) {
      if (total === 0) {
        summaryEl.textContent = 'Showing 0 records';
      } else {
        const start = (page - 1) * limit + 1;
        const end = Math.min(page * limit, total);
        summaryEl.textContent = `Showing ${start}–${end} of ${total} records`;
      }
    }

    if (prevBtn) {
      prevBtn.disabled = page <= 1;
      prevBtn.onclick = () => {
        if (page > 1) onPageChange(page - 1);
      };
    }

    if (nextBtn) {
      nextBtn.disabled = page >= totalPages;
      nextBtn.onclick = () => {
        if (page < totalPages) onPageChange(page + 1);
      };
    }

    if (pageNumbersEl) {
      pageNumbersEl.innerHTML = '';
      if (totalPages <= 1) return;

      const maxButtons = 5;
      let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
      let endPage = Math.min(totalPages, startPage + maxButtons - 1);
      if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }

      for (let p = startPage; p <= endPage; p++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = p;
        if (p === page) {
          btn.className = 'w-8 h-8 rounded-lg text-xs font-bold bg-red-600 text-white shadow-2xs cursor-default';
        } else {
          btn.className = 'w-8 h-8 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer';
          btn.onclick = () => onPageChange(p);
        }
        pageNumbersEl.appendChild(btn);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 10. TAB 1: Pending List Controller (30/page, Newest First)
  // --------------------------------------------------------------------------
  async function loadPendingList(page = 1) {
    tabState.pending.page = page;
    if (pendingTableBody) {
      pendingTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-12 text-center text-slate-400">
            <div class="flex flex-col items-center justify-center gap-2">
              <i data-lucide="refresh-cw" class="w-5 h-5 text-red-500 animate-spin"></i>
              <span class="text-xs font-semibold">Loading pending organizations...</span>
            </div>
          </td>
        </tr>
      `;
      renderLucide();
    }

    try {
      const res = await window.BloodBankAPI.getOrganizations({
        status: 'PENDING',
        page: tabState.pending.page,
        limit: tabState.pending.limit
      });

      let items = [];
      let total = 0;
      let totalPages = 1;

      if (res && res.success) {
        if (Array.isArray(res.data?.organizations)) {
          items = res.data.organizations;
          total = res.data.pagination?.total ?? res.data?.total ?? items.length;
          totalPages = res.data.pagination?.totalPages ?? res.data?.totalPages ?? 1;
        } else if (Array.isArray(res.data)) {
          items = res.data.filter((o) => (o.status || '').toUpperCase() === 'PENDING');
          total = items.length;
          totalPages = Math.ceil(total / tabState.pending.limit) || 1;
        }
      }

      tabState.pending.items = items;
      tabState.pending.total = total;
      tabState.pending.totalPages = totalPages;
      tabState.pending.loaded = true;

      // Cache orgs for modals
      items.forEach((org) => orgCache.set(String(org.id), org));

      // Badges sync
      if (tabPendingBadge) tabPendingBadge.textContent = total;
      if (sidebarPendingBadge) {
        sidebarPendingBadge.textContent = total;
        if (total > 0) sidebarPendingBadge.classList.remove('hidden');
        else sidebarPendingBadge.classList.add('hidden');
      }
      if (pendingAlertsBadge) pendingAlertsBadge.textContent = `${total} pending`;
      if (pendingShowingInfo) {
        pendingShowingInfo.textContent = total > 0 ? `${total} awaiting review` : 'All caught up';
      }

      renderPendingTable();
    } catch (err) {
      console.error('Error loading pending organizations:', err);
      if (pendingTableBody) {
        pendingTableBody.innerHTML = `
          <tr>
            <td colspan="6" class="px-6 py-10 text-center text-rose-500 text-xs">
              Failed to load pending organizations. Please refresh.
            </td>
          </tr>
        `;
      }
    }
  }

  function renderPendingTable() {
    if (!pendingTableBody) return;
    const { items, total, page, limit, totalPages } = tabState.pending;

    if (items.length === 0) {
      pendingTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-12 text-center text-slate-400">
            <div class="flex flex-col items-center justify-center gap-2">
              <i data-lucide="inbox" class="w-10 h-10 text-slate-300"></i>
              <p class="font-bold text-slate-700 text-sm">No pending organizations</p>
              <p class="text-xs text-slate-400">All tenant registration applications have been reviewed.</p>
            </div>
          </td>
        </tr>
      `;
      renderPaginationUI({
        page,
        limit,
        total: 0,
        totalPages: 1,
        summaryEl: pendingPaginationSummary,
        prevBtn: pendingPrevBtn,
        nextBtn: pendingNextBtn,
        pageNumbersEl: pendingPageNumbers,
        onPageChange: loadPendingList
      });
      renderLucide();
      return;
    }

    pendingTableBody.innerHTML = items
      .map((org) => {
        return `
          <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
            <!-- Organization Column -->
            <td class="px-5 py-3.5">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 text-amber-800 border border-amber-200 font-bold text-xs flex items-center justify-center flex-shrink-0">
                  ${org.name ? escapeHtml(org.name.substring(0, 2).toUpperCase()) : 'OR'}
                </div>
                <div class="min-w-0">
                  <div class="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5 flex-wrap">
                    <span class="truncate">${escapeHtml(org.name || 'Unnamed')}</span>
                    ${org.license_number ? `
                      <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-500" title="License Number">
                        ${escapeHtml(org.license_number)}
                      </span>
                    ` : ''}
                  </div>
                  <div class="text-[11px] text-slate-400 truncate">${escapeHtml(org.email || 'No email')}</div>
                </div>
              </div>
            </td>

            <!-- Type Column -->
            <td class="px-4 py-3.5 whitespace-nowrap">
              ${getTypeBadge(org.type)}
            </td>

            <!-- Location Column -->
            <td class="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">
              <div class="font-medium text-slate-900">${escapeHtml(org.city || '—')}</div>
              <div class="text-[10px] text-slate-400">${escapeHtml(org.country || 'USA')}</div>
            </td>

            <!-- Submitted Date Column -->
            <td class="px-4 py-3.5 whitespace-nowrap text-xs text-slate-500">
              <div>${formatDate(org.created_at)}</div>
              <div class="text-[10px] text-slate-400">${getRelativeTime(org.created_at)}</div>
            </td>

            <!-- Status Column -->
            <td class="px-4 py-3.5 whitespace-nowrap">
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                <i data-lucide="clock-3" class="w-3.5 h-3.5 text-amber-600"></i>
                Pending Review
              </span>
            </td>

            <!-- Actions Column -->
            <td class="px-5 py-3.5 whitespace-nowrap text-right">
              <div class="flex items-center justify-end gap-1.5">
                <!-- Review Button -->
                <button
                  type="button"
                  data-action="review"
                  data-org-id="${org.id}"
                  title="Review Details"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <i data-lucide="eye" class="w-3.5 h-3.5 text-slate-500"></i>
                  <span>Review</span>
                </button>

                <!-- Approve Button -->
                <button
                  type="button"
                  data-action="approve"
                  data-org-id="${org.id}"
                  data-org-name="${escapeHtml(org.name)}"
                  title="Approve Organization"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <i data-lucide="check" class="w-3.5 h-3.5"></i>
                  <span>Approve</span>
                </button>

                <!-- Reject Button -->
                <button
                  type="button"
                  data-action="reject"
                  data-org-id="${org.id}"
                  data-org-name="${escapeHtml(org.name)}"
                  title="Reject Organization"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 hover:border-rose-300 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <i data-lucide="x" class="w-3.5 h-3.5"></i>
                  <span>Reject</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    bindActionButtons();
    renderPaginationUI({
      page,
      limit,
      total,
      totalPages,
      summaryEl: pendingPaginationSummary,
      prevBtn: pendingPrevBtn,
      nextBtn: pendingNextBtn,
      pageNumbersEl: pendingPageNumbers,
      onPageChange: loadPendingList
    });
    renderLucide();
  }

  // --------------------------------------------------------------------------
  // 11. TAB 2: All Platform Organizations Controller (30/page, Newest First)
  // --------------------------------------------------------------------------
  async function loadAllOrgs(page = 1) {
    tabState.allOrgs.page = page;
    if (orgTableBody) {
      orgTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-12 text-center text-slate-400">
            <div class="flex flex-col items-center justify-center gap-2">
              <i data-lucide="refresh-cw" class="w-5 h-5 text-red-500 animate-spin"></i>
              <span class="text-xs font-semibold">Loading organizations...</span>
            </div>
          </td>
        </tr>
      `;
      renderLucide();
    }

    try {
      const params = {
        page: tabState.allOrgs.page,
        limit: tabState.allOrgs.limit
      };
      if (tabState.allOrgs.status !== 'ALL') {
        params.status = tabState.allOrgs.status;
      }
      if (tabState.allOrgs.search.trim()) {
        params.search = tabState.allOrgs.search.trim();
      }

      const res = await window.BloodBankAPI.getOrganizations(params);

      let items = [];
      let total = 0;
      let totalPages = 1;

      if (res && res.success) {
        if (Array.isArray(res.data?.organizations)) {
          items = res.data.organizations;
          total = res.data.pagination?.total ?? res.data?.total ?? items.length;
          totalPages = res.data.pagination?.totalPages ?? res.data?.totalPages ?? 1;
        } else if (Array.isArray(res.data)) {
          items = res.data;
          total = items.length;
          totalPages = Math.ceil(total / tabState.allOrgs.limit) || 1;
        }
      }

      tabState.allOrgs.items = items;
      tabState.allOrgs.total = total;
      tabState.allOrgs.totalPages = totalPages;
      tabState.allOrgs.loaded = true;

      // Cache orgs for modals
      items.forEach((org) => orgCache.set(String(org.id), org));

      if (tabAllOrgsBadge && tabState.allOrgs.status === 'ALL' && !tabState.allOrgs.search) {
        tabAllOrgsBadge.textContent = total;
      }

      renderAllOrgsTable();
    } catch (err) {
      console.error('Error loading all organizations:', err);
      if (orgTableBody) {
        orgTableBody.innerHTML = `
          <tr>
            <td colspan="6" class="px-6 py-10 text-center text-rose-500 text-xs">
              Failed to load organizations. Please refresh.
            </td>
          </tr>
        `;
      }
    }
  }

  function renderAllOrgsTable() {
    if (!orgTableBody) return;
    const { items, total, page, limit, totalPages } = tabState.allOrgs;

    if (items.length === 0) {
      orgTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-12 text-center text-slate-400 text-xs">
            <div class="flex flex-col items-center justify-center gap-2">
              <i data-lucide="inbox" class="w-8 h-8 text-slate-300"></i>
              <p class="font-bold text-slate-700 text-sm">No organizations match filter</p>
              <p class="text-slate-400">Try selecting another status pill or clearing your search term.</p>
            </div>
          </td>
        </tr>
      `;
      renderPaginationUI({
        page,
        limit,
        total: 0,
        totalPages: 1,
        summaryEl: allOrgsPaginationSummary,
        prevBtn: allOrgsPrevBtn,
        nextBtn: allOrgsNextBtn,
        pageNumbersEl: allOrgsPageNumbers,
        onPageChange: loadAllOrgs
      });
      renderLucide();
      return;
    }

    orgTableBody.innerHTML = items
      .map((org) => {
        const isPending = (org.status || '').toUpperCase() === 'PENDING';
        return `
          <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
            <!-- Organization Column -->
            <td class="px-5 py-3.5">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs flex items-center justify-center flex-shrink-0">
                  ${org.name ? escapeHtml(org.name.substring(0, 2).toUpperCase()) : 'OR'}
                </div>
                <div class="min-w-0">
                  <div class="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5 flex-wrap">
                    <span class="truncate">${escapeHtml(org.name || 'Unnamed')}</span>
                    ${org.license_number ? `
                      <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                        ${escapeHtml(org.license_number)}
                      </span>
                    ` : ''}
                  </div>
                  <div class="text-[11px] text-slate-400 truncate">${escapeHtml(org.email || 'No email')}</div>
                </div>
              </div>
            </td>

            <!-- Type Column -->
            <td class="px-4 py-3.5 whitespace-nowrap">
              ${getTypeBadge(org.type)}
            </td>

            <!-- Location Column -->
            <td class="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">
              <div class="font-medium text-slate-900">${escapeHtml(org.city || '—')}</div>
              <div class="text-[10px] text-slate-400">${escapeHtml(org.country || 'USA')}</div>
            </td>

            <!-- Status Column -->
            <td class="px-4 py-3.5 whitespace-nowrap">
              ${getStatusBadge(org.status)}
            </td>

            <!-- Created Date Column -->
            <td class="px-4 py-3.5 whitespace-nowrap text-xs text-slate-500">
              <div>${formatDate(org.created_at)}</div>
              <div class="text-[10px] text-slate-400">${getRelativeTime(org.created_at)}</div>
            </td>

            <!-- Actions Column -->
            <td class="px-5 py-3.5 whitespace-nowrap text-right">
              <div class="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  data-action="review"
                  data-org-id="${org.id}"
                  title="View Organization Details"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <i data-lucide="eye" class="w-3.5 h-3.5 text-slate-500"></i>
                  <span>View</span>
                </button>
                ${isPending ? `
                  <button
                    type="button"
                    data-action="approve"
                    data-org-id="${org.id}"
                    data-org-name="${escapeHtml(org.name)}"
                    title="Approve Organization"
                    class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <i data-lucide="check" class="w-3.5 h-3.5"></i>
                    <span>Approve</span>
                  </button>
                  <button
                    type="button"
                    data-action="reject"
                    data-org-id="${org.id}"
                    data-org-name="${escapeHtml(org.name)}"
                    title="Reject Organization"
                    class="px-2 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <i data-lucide="x" class="w-3.5 h-3.5"></i>
                    <span>Reject</span>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    bindActionButtons();
    renderPaginationUI({
      page,
      limit,
      total,
      totalPages,
      summaryEl: allOrgsPaginationSummary,
      prevBtn: allOrgsPrevBtn,
      nextBtn: allOrgsNextBtn,
      pageNumbersEl: allOrgsPageNumbers,
      onPageChange: loadAllOrgs
    });
    renderLucide();
  }

  // --------------------------------------------------------------------------
  // 12. TAB 3: Platform Activity Controller (30/page, Newest First)
  // --------------------------------------------------------------------------
  async function loadPlatformActivity(page = 1) {
    tabState.activity.page = page;
    if (platformActivityTimeline) {
      platformActivityTimeline.innerHTML = `
        <div class="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
          <i data-lucide="refresh-cw" class="w-5 h-5 text-red-500 animate-spin"></i>
          <span>Loading platform audit log...</span>
        </div>
      `;
      renderLucide();
    }

    try {
      const res = await window.BloodBankAPI.getAdminAuditLogs({
        page: tabState.activity.page,
        limit: tabState.activity.limit
      });

      let items = [];
      let total = 0;
      let totalPages = 1;

      if (res && res.success) {
        if (Array.isArray(res.data?.logs)) {
          items = res.data.logs;
          total = res.data.pagination?.total ?? res.data?.total ?? items.length;
          totalPages = res.data.pagination?.totalPages ?? res.data?.totalPages ?? 1;
        } else if (Array.isArray(res.data)) {
          items = res.data;
          total = items.length;
          totalPages = Math.ceil(total / tabState.activity.limit) || 1;
        }
      }

      tabState.activity.items = items;
      tabState.activity.total = total;
      tabState.activity.totalPages = totalPages;
      tabState.activity.loaded = true;

      if (tabActivityBadge) {
        tabActivityBadge.textContent = total;
      }

      renderActivityTimeline();
    } catch (err) {
      console.error('Error loading audit activity:', err);
      if (platformActivityTimeline) {
        platformActivityTimeline.innerHTML = `
          <div class="p-6 text-center text-rose-500 text-xs">
            Failed to load audit activity. Please refresh.
          </div>
        `;
      }
    }
  }

  function renderActivityTimeline() {
    if (!platformActivityTimeline) return;
    const { items, total, page, limit, totalPages } = tabState.activity;

    if (items.length === 0) {
      platformActivityTimeline.innerHTML = `
        <div class="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
          <i data-lucide="inbox" class="w-8 h-8 text-slate-300"></i>
          <span>No recent audit logs available.</span>
        </div>
      `;
      renderPaginationUI({
        page,
        limit,
        total: 0,
        totalPages: 1,
        summaryEl: activityPaginationSummary,
        prevBtn: activityPrevBtn,
        nextBtn: activityNextBtn,
        pageNumbersEl: activityPageNumbers,
        onPageChange: loadPlatformActivity
      });
      renderLucide();
      return;
    }

    platformActivityTimeline.innerHTML = items
      .map((log) => {
        const actionInfo = formatAuditAction(log);
        return `
          <div class="flex items-start gap-3 text-xs pt-3 first:pt-0">
            <div class="w-8 h-8 rounded-xl ${actionInfo.bg} ${actionInfo.color} flex items-center justify-center flex-shrink-0 mt-0.5 border ${actionInfo.border}">
              ${actionInfo.icon}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="font-bold text-slate-900 truncate">${actionInfo.title}</span>
                <span class="text-[10px] text-slate-400 whitespace-nowrap">${getRelativeTime(log.created_at)}</span>
              </div>
              <p class="text-slate-600 text-[11px] mt-0.5">${escapeHtml(actionInfo.desc)}</p>
              <div class="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                <span>By: ${escapeHtml(log.user_email || log.user_name || 'System / Applicant')}</span>
                ${log.ip_address ? `<span>• IP: ${escapeHtml(log.ip_address)}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    renderPaginationUI({
      page,
      limit,
      total,
      totalPages,
      summaryEl: activityPaginationSummary,
      prevBtn: activityPrevBtn,
      nextBtn: activityNextBtn,
      pageNumbersEl: activityPageNumbers,
      onPageChange: loadPlatformActivity
    });
    renderLucide();
  }

  function formatAuditAction(log) {
    const act = (log.action || '').toUpperCase();

    if (act === 'ORGANIZATION_CREATED') {
      return {
        icon: '<i data-lucide="building-2" class="w-4 h-4"></i>',
        bg: 'bg-blue-50',
        color: 'text-blue-700',
        border: 'border-blue-200',
        title: 'New Organization Submitted',
        desc: `New organization registration created with ID #${log.resource_id || '--'}`
      };
    }
    if (act === 'ORGANIZATION_APPROVED' || (act === 'ADMIN_ORG_STATUS_UPDATE' && log.new_value?.status === 'APPROVED')) {
      return {
        icon: '<i data-lucide="circle-check" class="w-4 h-4"></i>',
        bg: 'bg-emerald-50',
        color: 'text-emerald-700',
        border: 'border-emerald-200',
        title: 'Organization Approved',
        desc: `Super Admin approved organization #${log.resource_id} and activated initial admin account`
      };
    }
    if (act === 'ORGANIZATION_REJECTED' || (act === 'ADMIN_ORG_STATUS_UPDATE' && log.new_value?.status === 'REJECTED')) {
      const reason = log.new_value?.reason ? ` Reason: "${log.new_value.reason}"` : '';
      return {
        icon: '<i data-lucide="circle-x" class="w-4 h-4"></i>',
        bg: 'bg-rose-50',
        color: 'text-rose-700',
        border: 'border-rose-200',
        title: 'Organization Rejected',
        desc: `Application for organization #${log.resource_id} was rejected.${reason}`
      };
    }
    if (act === 'AUTH_REGISTER') {
      return {
        icon: '<i data-lucide="user-plus" class="w-4 h-4"></i>',
        bg: 'bg-purple-50',
        color: 'text-purple-700',
        border: 'border-purple-200',
        title: 'New User Registered',
        desc: 'New platform donor or requester account registered'
      };
    }
    if (act === 'AUTH_LOGIN') {
      return {
        icon: '<i data-lucide="shield-check" class="w-4 h-4"></i>',
        bg: 'bg-slate-50',
        color: 'text-slate-700',
        border: 'border-slate-200',
        title: 'User Authenticated',
        desc: `Session authorized for user #${log.resource_id || log.user_id}`
      };
    }
    if (act === 'AUTH_LOGOUT') {
      return {
        icon: '<i data-lucide="shield-check" class="w-4 h-4"></i>',
        bg: 'bg-slate-50',
        color: 'text-slate-600',
        border: 'border-slate-200',
        title: 'User Signed Out',
        desc: 'Active session cleanly terminated'
      };
    }
    if (act === 'STAFF_CREATED') {
      return {
        icon: '<i data-lucide="users" class="w-4 h-4"></i>',
        bg: 'bg-indigo-50',
        color: 'text-indigo-700',
        border: 'border-indigo-200',
        title: 'Organization Staff Added',
        desc: 'New authorized staff member linked to organization'
      };
    }

    return {
      icon: '<i data-lucide="activity" class="w-4 h-4"></i>',
      bg: 'bg-slate-50',
      color: 'text-slate-700',
      border: 'border-slate-200',
      title: act.replace(/_/g, ' '),
      desc: `Platform audit event recorded on ${log.resource_type || 'SYSTEM'} #${log.resource_id || ''}`
    };
  }

  // --------------------------------------------------------------------------
  // 13. Tab Switching Mechanism
  // --------------------------------------------------------------------------
  function switchTab(tabKey) {
    if (!['pending', 'all-orgs', 'activity'].includes(tabKey)) return;
    tabState.activeTab = tabKey;

    // Tab buttons styles
    const tabButtons = [
      { key: 'pending', btn: tabBtnPending, pane: tabPanePending },
      { key: 'all-orgs', btn: tabBtnAllOrgs, pane: tabPaneAllOrgs },
      { key: 'activity', btn: tabBtnActivity, pane: tabPaneActivity }
    ];

    tabButtons.forEach(({ key, btn, pane }) => {
      const isActive = key === tabKey;
      if (btn) {
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        if (isActive) {
          btn.className = 'tab-btn px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer bg-white text-slate-900 flex items-center gap-2';
        } else {
          btn.className = 'tab-btn px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-slate-600 hover:text-slate-900 flex items-center gap-2';
        }
      }
      if (pane) {
        if (isActive) {
          pane.classList.remove('hidden');
          pane.classList.add('block');
        } else {
          pane.classList.add('hidden');
          pane.classList.remove('block');
        }
      }
    });

    // Lazy load tab data if not already loaded
    if (tabKey === 'pending' && !tabState.pending.loaded) {
      loadPendingList(1);
    } else if (tabKey === 'all-orgs' && !tabState.allOrgs.loaded) {
      loadAllOrgs(1);
    } else if (tabKey === 'activity' && !tabState.activity.loaded) {
      loadPlatformActivity(1);
    }

    renderLucide();
  }

  if (tabBtnPending) tabBtnPending.addEventListener('click', () => switchTab('pending'));
  if (tabBtnAllOrgs) tabBtnAllOrgs.addEventListener('click', () => switchTab('all-orgs'));
  if (tabBtnActivity) tabBtnActivity.addEventListener('click', () => switchTab('activity'));

  // --------------------------------------------------------------------------
  // 14. Action Button Event Delegation (Approve, Reject, Review)
  // --------------------------------------------------------------------------
  function bindActionButtons() {
    document.querySelectorAll('[data-action="review"]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-org-id');
        openViewModal(id);
      };
    });

    document.querySelectorAll('[data-action="approve"]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-org-id');
        const name = btn.getAttribute('data-org-name');
        handleApproveOrganization(id, name, btn);
      };
    });

    document.querySelectorAll('[data-action="reject"]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-org-id');
        const name = btn.getAttribute('data-org-name');
        openRejectModal(id, name);
      };
    });
  }

  async function handleApproveOrganization(orgId, orgName, btnEl = null) {
    const confirmed = confirm(
      `Approve "${orgName}"?\n\nThis grants the organization active tenant status and activates the initial administrator account.`
    );
    if (!confirmed) return;

    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5 animate-spin"></i><span>Approving...</span>';
      renderLucide();
    }

    try {
      const res = await window.BloodBankAPI.approveOrganization(orgId);
      if (res && res.success) {
        showToast(`"${orgName}" approved successfully! Initial admin activated.`, 'success');

        closeModal(viewModal);

        // Refresh pending list, all-orgs, activity, and telemetry
        await Promise.all([
          loadPendingList(tabState.pending.page),
          loadAllOrgs(tabState.allOrgs.page),
          loadPlatformActivity(1),
          loadDashboardStats()
        ]);
      } else {
        throw new Error(res?.error?.message || 'Approval failed');
      }
    } catch (err) {
      console.error('Approval failed:', err);
      showToast(err.message || 'Failed to approve organization', 'error');
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i><span>Approve</span>';
        renderLucide();
      }
    }
  }

  function openRejectModal(orgId, orgName) {
    activeRejectOrgId = orgId;
    activeRejectOrgName = orgName;
    if (rejectOrgNameEl) rejectOrgNameEl.textContent = orgName;
    if (rejectReasonInput) rejectReasonInput.value = '';
    openModal(rejectModal);
  }

  if (confirmRejectBtn) {
    confirmRejectBtn.addEventListener('click', async () => {
      if (!activeRejectOrgId) return;
      const reason = rejectReasonInput ? rejectReasonInput.value.trim() : '';

      confirmRejectBtn.disabled = true;
      confirmRejectBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5 animate-spin"></i><span>Rejecting...</span>';
      renderLucide();

      try {
        const res = await window.BloodBankAPI.rejectOrganization(activeRejectOrgId, reason);
        if (res && res.success) {
          showToast(`"${activeRejectOrgName}" application has been rejected.`, 'info');

          closeModal(rejectModal);
          closeModal(viewModal);

          // Refresh pending, all-orgs, activity, and telemetry
          await Promise.all([
            loadPendingList(tabState.pending.page),
            loadAllOrgs(tabState.allOrgs.page),
            loadPlatformActivity(1),
            loadDashboardStats()
          ]);
        } else {
          throw new Error(res?.error?.message || 'Rejection failed');
        }
      } catch (err) {
        console.error('Rejection failed:', err);
        showToast(err.message || 'Failed to reject organization', 'error');
      } finally {
        confirmRejectBtn.disabled = false;
        confirmRejectBtn.innerHTML = '<i data-lucide="x" class="w-3.5 h-3.5"></i><span>Confirm Rejection</span>';
        renderLucide();
      }
    });
  }

  if (cancelRejectBtn) cancelRejectBtn.addEventListener('click', () => closeModal(rejectModal));
  if (closeRejectModalBtn) closeRejectModalBtn.addEventListener('click', () => closeModal(rejectModal));

  // --------------------------------------------------------------------------
  // 15. View Details Modal
  // --------------------------------------------------------------------------
  async function openViewModal(orgId) {
    let org = orgCache.get(String(orgId));

    if (!org) {
      try {
        const res = await window.BloodBankAPI.getOrganization(orgId).catch(() => null);
        if (res && res.success && res.data?.organization) {
          org = res.data.organization;
          orgCache.set(String(org.id), org);
        }
      } catch (err) {
        console.warn('Error fetching single org:', err);
      }
    }

    if (!org) {
      showToast('Organization details not found', 'error');
      return;
    }

    if (document.getElementById('viewModalOrgName')) {
      document.getElementById('viewModalOrgName').textContent = org.name || 'Unnamed Organization';
    }
    if (document.getElementById('viewModalStatusBadge')) {
      document.getElementById('viewModalStatusBadge').innerHTML = getStatusBadge(org.status);
    }
    if (document.getElementById('viewModalTypeBadge')) {
      document.getElementById('viewModalTypeBadge').innerHTML = getTypeBadge(org.type);
    }
    if (document.getElementById('viewModalId')) {
      document.getElementById('viewModalId').textContent = org.id;
    }
    if (document.getElementById('viewModalEmail')) {
      document.getElementById('viewModalEmail').textContent = org.email || 'N/A';
    }
    if (document.getElementById('viewModalPhone')) {
      document.getElementById('viewModalPhone').textContent = org.phone || 'N/A';
    }
    if (document.getElementById('viewModalAddress')) {
      document.getElementById('viewModalAddress').textContent = org.address || 'N/A';
    }
    if (document.getElementById('viewModalCityCountry')) {
      document.getElementById('viewModalCityCountry').textContent = `${org.city || '—'}, ${org.country || 'USA'}`;
    }
    if (document.getElementById('viewModalLicense')) {
      document.getElementById('viewModalLicense').textContent = org.license_number || 'None provided';
    }
    if (document.getElementById('viewModalCreated')) {
      document.getElementById('viewModalCreated').textContent = formatDate(org.created_at);
    }
    if (document.getElementById('viewModalType')) {
      document.getElementById('viewModalType').textContent = (org.type || 'HOSPITAL').replace(/_/g, ' ');
    }
    if (document.getElementById('viewModalStatus')) {
      document.getElementById('viewModalStatus').textContent = org.status || 'PENDING';
    }

    // Subtype section
    const subtypeContainer = document.getElementById('viewModalSubtypeContainer');
    const subtypeContent = document.getElementById('viewModalSubtypeContent');
    const cleanType = (org.type || '').toUpperCase();

    if (cleanType === 'HOSPITAL') {
      subtypeContainer?.classList.remove('hidden');
      const beds = org.bed_count !== null && org.bed_count !== undefined ? org.bed_count : 'Not specified';
      if (subtypeContent) {
        subtypeContent.innerHTML = `
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-500 font-medium">Inpatient Bed Capacity:</span>
            <span class="font-bold text-slate-800">${beds} Beds</span>
          </div>
        `;
      }
    } else if (cleanType === 'BLOOD_BANK') {
      subtypeContainer?.classList.remove('hidden');
      const cap = org.storage_capacity_units !== null && org.storage_capacity_units !== undefined ? org.storage_capacity_units : 'Not specified';
      if (subtypeContent) {
        subtypeContent.innerHTML = `
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-500 font-medium">Refrigerated Storage Capacity:</span>
            <span class="font-bold text-slate-800">${cap} Units</span>
          </div>
        `;
      }
    } else if (cleanType === 'CLINIC') {
      subtypeContainer?.classList.remove('hidden');
      if (subtypeContent) {
        subtypeContent.innerHTML = `
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-500 font-medium">Facility Classification:</span>
            <span class="font-bold text-slate-800">Outpatient Care & Blood Request Partner</span>
          </div>
        `;
      }
    } else {
      subtypeContainer?.classList.add('hidden');
    }

    const modalPendingActions = document.getElementById('viewModalPendingActions');
    const modalApproveBtn = document.getElementById('viewModalApproveBtn');
    const modalRejectBtn = document.getElementById('viewModalRejectBtn');

    if ((org.status || '').toUpperCase() === 'PENDING') {
      modalPendingActions?.classList.remove('hidden');
      if (modalApproveBtn) {
        modalApproveBtn.onclick = () => handleApproveOrganization(org.id, org.name);
      }
      if (modalRejectBtn) {
        modalRejectBtn.onclick = () => openRejectModal(org.id, org.name);
      }
    } else {
      modalPendingActions?.classList.add('hidden');
    }

    openModal(viewModal);
    renderLucide();
  }

  if (closeViewModalBtn) closeViewModalBtn.addEventListener('click', () => closeModal(viewModal));

  // --------------------------------------------------------------------------
  // 16. Helper Formatters (Zero Emojis, Lucide Icons)
  // --------------------------------------------------------------------------
  function formatDate(iso) {
    if (!iso) return 'N/A';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return iso;
    }
  }

  function getRelativeTime(iso) {
    if (!iso) return '';
    try {
      const diffMs = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return '';
    }
  }

  function getTypeBadge(type) {
    const t = (type || 'HOSPITAL').toUpperCase();
    if (t === 'HOSPITAL') {
      return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
        <i data-lucide="hospital" class="w-3.5 h-3.5"></i> Hospital
      </span>`;
    }
    if (t === 'CLINIC') {
      return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
        <i data-lucide="stethoscope" class="w-3.5 h-3.5"></i> Clinic
      </span>`;
    }
    if (t === 'BLOOD_BANK') {
      return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
        <i data-lucide="droplets" class="w-3.5 h-3.5"></i> Blood Bank
      </span>`;
    }
    return `<span class="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">${escapeHtml(t)}</span>`;
  }

  function getStatusBadge(status) {
    const s = (status || 'PENDING').toUpperCase();
    if (s === 'APPROVED') {
      return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <i data-lucide="circle-check" class="w-3.5 h-3.5 text-emerald-600"></i> Active
      </span>`;
    }
    if (s === 'PENDING') {
      return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <i data-lucide="clock-3" class="w-3.5 h-3.5 text-amber-600"></i> Pending
      </span>`;
    }
    if (s === 'REJECTED') {
      return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
        <i data-lucide="circle-x" class="w-3.5 h-3.5 text-rose-600"></i> Rejected
      </span>`;
    }
    if (s === 'SUSPENDED') {
      return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
        <i data-lucide="ban" class="w-3.5 h-3.5 text-slate-500"></i> Suspended
      </span>`;
    }
    return `<span class="px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700">${escapeHtml(s)}</span>`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function openModal(el) {
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
    document.body.classList.add('overflow-hidden');
  }

  function closeModal(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
  }

  // Backdrop modal closes
  [viewModal, rejectModal].forEach((m) => {
    if (m) {
      m.addEventListener('click', (e) => {
        if (e.target === m) closeModal(m);
      });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(viewModal);
      closeModal(rejectModal);
      if (notificationDropdown) notificationDropdown.classList.add('hidden');
      if (profileDropdownMenu) profileDropdownMenu.classList.add('hidden');
    }
  });

  // --------------------------------------------------------------------------
  // 17. Navigation, Dropdowns, Search & Filter Listeners
  // --------------------------------------------------------------------------
  // Notifications Dropdown Toggle
  if (notificationBellBtn && notificationDropdown) {
    notificationBellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notificationDropdown.classList.toggle('hidden');
      if (profileDropdownMenu) profileDropdownMenu.classList.add('hidden');
    });
  }

  // Profile Dropdown Toggle
  if (profileDropdownBtn && profileDropdownMenu) {
    profileDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      profileDropdownMenu.classList.toggle('hidden');
      if (notificationDropdown) notificationDropdown.classList.add('hidden');
    });
  }

  // Click outside to close dropdowns
  document.addEventListener('click', () => {
    if (notificationDropdown) notificationDropdown.classList.add('hidden');
    if (profileDropdownMenu) profileDropdownMenu.classList.add('hidden');
  });

  // Mobile Hamburger Sidebar Toggle
  if (mobileMenuToggleBtn && sidebarNav && mobileSidebarBackdrop) {
    const toggleMobileNav = () => {
      sidebarNav.classList.toggle('-translate-x-full');
      mobileSidebarBackdrop.classList.toggle('hidden');
    };

    mobileMenuToggleBtn.addEventListener('click', toggleMobileNav);
    if (closeMobileSidebarBtn) closeMobileSidebarBtn.addEventListener('click', toggleMobileNav);
    mobileSidebarBackdrop.addEventListener('click', toggleMobileNav);
  }

  // Global Search Shortcuts (Cmd+K / Ctrl+K)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (globalSearchInput) globalSearchInput.focus();
    }
  });

  // Debounced search for organizations
  let searchDebounceTimer = null;
  function handleSearchInput(val) {
    tabState.allOrgs.search = val;
    if (orgSearchInput && orgSearchInput.value !== val) orgSearchInput.value = val;
    if (globalSearchInput && globalSearchInput.value !== val) globalSearchInput.value = val;

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      switchTab('all-orgs');
      loadAllOrgs(1);
    }, 250);
  }

  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', (e) => handleSearchInput(e.target.value));
  }
  if (orgSearchInput) {
    orgSearchInput.addEventListener('input', (e) => handleSearchInput(e.target.value));
  }

  // Status Filter Pills for Tab 2
  statusFilterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const selected = pill.getAttribute('data-status-filter') || 'ALL';
      tabState.allOrgs.status = selected;

      statusFilterPills.forEach((p) => {
        if (p.getAttribute('data-status-filter') === selected) {
          p.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer bg-red-600 text-white shadow-red-600/20';
        } else {
          p.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer bg-white hover:bg-slate-100 text-slate-600 border border-slate-200';
        }
      });

      loadAllOrgs(1);
    });
  });

  // Sidebar Links & Notification Links Wireup
  document.querySelectorAll('[data-nav-target]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = link.getAttribute('data-nav-target');
      if (!target) return;

      if (target === 'overview') {
        if (mainContentContainer) {
          mainContentContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else if (target === 'organizations') {
        e.preventDefault();
        switchTab('all-orgs');
        if (platformManagementSection) {
          platformManagementSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else if (target === 'pending') {
        e.preventDefault();
        switchTab('pending');
        if (platformManagementSection) {
          platformManagementSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else if (target === 'activity' || target === 'audit') {
        e.preventDefault();
        switchTab('activity');
        if (platformManagementSection) {
          platformManagementSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      // Close mobile sidebar if open
      if (sidebarNav && !sidebarNav.classList.contains('-translate-x-full') && window.innerWidth < 768) {
        sidebarNav.classList.add('-translate-x-full');
        if (mobileSidebarBackdrop) mobileSidebarBackdrop.classList.add('hidden');
      }
    });
  });

  // Refresh Dashboard Button
  if (refreshDashboardBtn) {
    refreshDashboardBtn.addEventListener('click', async () => {
      if (refreshSpinner) refreshSpinner.classList.add('animate-spin');
      try {
        await Promise.all([
          loadDashboardStats(),
          loadPendingList(tabState.pending.page),
          loadAllOrgs(tabState.allOrgs.page),
          loadPlatformActivity(tabState.activity.page)
        ]);
        showToast('Dashboard data refreshed successfully.', 'info');
      } catch (err) {
        console.error('Refresh error:', err);
      } finally {
        if (refreshSpinner) {
          setTimeout(() => refreshSpinner.classList.remove('animate-spin'), 400);
        }
      }
    });
  }

  // Refresh Activity Button
  if (refreshActivityBtn) {
    refreshActivityBtn.addEventListener('click', async () => {
      await loadPlatformActivity(1);
      showToast('Activity log updated.', 'info');
    });
  }

  // --------------------------------------------------------------------------
  // 18. Initial Orchestration
  // --------------------------------------------------------------------------
  await loadUserProfile();
  await loadDashboardStats();
  // Load initial tab: Pending List
  await loadPendingList(1);
  // Also preload All Organizations & Activity in background so switching is instant
  loadAllOrgs(1);
  loadPlatformActivity(1);

  renderLucide();
});
