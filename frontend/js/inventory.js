/**
 * ============================================================================
 * BLOOD BANK PLATFORM — INVENTORY FRONTEND CONTROLLER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9.10, §14, §18)
 *
 * Implements real-time inventory management with strict tenant isolation,
 * search, filtering, pagination, KPI summaries, and lifecycle state management.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Session & Role Verification
  const auth = window.BloodBankAuth;
  const api = window.BloodBankAPI;

  if (!auth || !auth.isAuthenticated()) {
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
    return;
  }

  // Ensure JWT token is available if running under a seeded demo session
  if (auth.isDemoSession() && !auth.getToken()) {
    const demoUser = auth.getDemoSession();
    if (demoUser && demoUser.email) {
      try {
        const pass = demoUser.password || (demoUser.email === 'admin@bloodbank.dev' ? 'AdminDev123!' : 'UserDev123!');
        const loginRes = await api.login({ email: demoUser.email, password: pass });
        if (loginRes.success && loginRes.data?.token) {
          auth.setToken(loginRes.data.token);
          if (loginRes.data.user) {
            auth.setUser(loginRes.data.user);
          }
        }
      } catch (e) {
        console.warn('Auto-token exchange for demo session failed:', e.message);
      }
    }
  }

  const user = auth.getUser() || {};
  const role = user.role || user.global_role || 'REQUESTER';
  const orgName = user.organization_name || user.organization?.name || 'Organization';
  const orgId = user.organization_id || user.organizationId;

  // Determine manage permissions (Hospital Admin, Blood Bank Staff, Super Admin)
  const canManage = ['SUPER_ADMIN', 'HOSPITAL_ADMIN', 'BLOOD_BANK_STAFF'].includes(role);

  // Update navbar info
  const navUserName = document.getElementById('navUserName');
  if (navUserName) navUserName.textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Staff';

  const navUserOrg = document.getElementById('navUserOrg');
  if (navUserOrg) navUserOrg.textContent = orgName;

  const tenantBadge = document.getElementById('tenantScopeBadge');
  if (tenantBadge) {
    if (role === 'SUPER_ADMIN') {
      tenantBadge.textContent = 'Platform Super Admin Scope';
      tenantBadge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200';
    } else {
      tenantBadge.textContent = `${orgName} (ID: ${orgId || 'N/A'})`;
    }
  }

  // Set Back to Dashboard link according to role
  const backBtn = document.getElementById('backToDashboardBtn');
  if (backBtn) {
    if (role === 'SUPER_ADMIN') backBtn.href = '/dashboard/super-admin/';
    else if (role === 'HOSPITAL_ADMIN') backBtn.href = '/dashboard/hospital-admin/';
    else if (role === 'BLOOD_BANK_STAFF') backBtn.href = '/dashboard/blood-bank-staff/';
    else if (role === 'DOCTOR') backBtn.href = '/dashboard/doctor/';
    else if (role === 'CLINIC_ADMIN') backBtn.href = '/dashboard/clinic-admin/';
    else backBtn.href = '/';
  }

  // Show "Add Blood Unit" button only if user has manage permissions
  const openAddBtn = document.getElementById('openAddUnitModalBtn');
  if (openAddBtn && canManage) {
    openAddBtn.classList.remove('hidden');
  }

  // Wire up logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      auth.clearSession();
      window.location.href = '/login.html';
    });
  }

  // 2. State & Filter Management
  const state = {
    page: 1,
    limit: 20,
    search: '',
    blood_group: '',
    component: '',
    status: '',
    is_available: '',
    totalPages: 1,
    totalRecords: 0
  };

  // Toast feedback helper
  function showToast(message, type = 'success') {
    const banner = document.getElementById('toastBanner');
    if (!banner) return;
    banner.textContent = message;
    if (type === 'success') {
      banner.className = 'p-4 rounded-2xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-2';
    } else {
      banner.className = 'p-4 rounded-2xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-2';
    }
    banner.classList.remove('hidden');
    setTimeout(() => {
      banner.classList.add('hidden');
    }, 4500);
  }

  // Helper date utilities
  function getFormattedToday() {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }

  function getFormattedExpiry(daysAhead = 35) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0];
  }

  // 3. Load Inventory Summary Metrics
  async function loadSummary() {
    const kpiTotal = document.getElementById('kpiTotalUnits');
    const kpiAvail = document.getElementById('kpiAvailableUnits');
    const kpiExp = document.getElementById('kpiExpiringUnits');
    const kpiExpired = document.getElementById('kpiExpiredUnits');

    // Show loading state while data is being fetched
    [kpiTotal, kpiAvail, kpiExp, kpiExpired].forEach(el => {
      if (el) {
        el.innerHTML = '<span class="inline-block animate-pulse text-slate-400">...</span>';
      }
    });

    try {
      const res = await api.getInventorySummary();
      if (!res || !res.success || !res.data) {
        throw new Error(res?.error?.message || 'Failed to retrieve inventory summary.');
      }

      const data = res.data;

      // Map to exact required field names with fallback to legacy summary object
      const totalRecorded = Number(data.totalRecorded ?? data.summary?.totalRecorded ?? data.summary?.total ?? 0);
      const availableStock = Number(data.availableStock ?? data.summary?.availableStock ?? data.summary?.available ?? 0);
      const expiringWithin7Days = Number(data.expiringWithin7Days ?? data.summary?.expiringWithin7Days ?? data.summary?.expiringSoon ?? 0);
      const expiredOrDiscarded = Number(
        data.expiredOrDiscarded ??
        data.summary?.expiredOrDiscarded ??
        ((data.summary?.expired || 0) + (data.summary?.discarded || 0))
      );

      // Display accurate database-derived numeric totals (renders '0' if empty, never '-')
      if (kpiTotal) kpiTotal.textContent = totalRecorded.toLocaleString();
      if (kpiAvail) kpiAvail.textContent = availableStock.toLocaleString();
      if (kpiExp) kpiExp.textContent = expiringWithin7Days.toLocaleString();
      if (kpiExpired) kpiExpired.textContent = expiredOrDiscarded.toLocaleString();

      // Render Blood Group Matrix Cards
      const byBloodGroup = data.byBloodGroup || {};
      const matrixEl = document.getElementById('bloodGroupMatrix');
      if (matrixEl) {
        const groups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
        matrixEl.innerHTML = groups.map(bg => {
          const stats = byBloodGroup[bg] || { total: 0, available: 0, reserved: 0, expired: 0 };
          const isSelected = state.blood_group === bg;
          const statusClass = stats.available > 0
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : (stats.total > 0 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200');

          return `
            <button 
              type="button" 
              data-group="${bg}"
              class="group-card text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                isSelected
                  ? 'border-red-500 bg-red-50/50 ring-2 ring-red-500/20'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
              }"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="font-extrabold text-sm text-slate-900">${bg}</span>
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${statusClass}">
                  ${stats.available} Avail
                </span>
              </div>
              <div class="text-[11px] text-slate-500 flex justify-between">
                <span>Total:</span>
                <span class="font-semibold text-slate-700">${stats.total}</span>
              </div>
            </button>
          `;
        }).join('');

        // Attach click listeners to group cards
        matrixEl.querySelectorAll('.group-card').forEach(btn => {
          btn.addEventListener('click', () => {
            const grp = btn.dataset.group;
            if (state.blood_group === grp) {
              state.blood_group = '';
            } else {
              state.blood_group = grp;
            }
            const filterEl = document.getElementById('filterBloodGroup');
            if (filterEl) filterEl.value = state.blood_group;
            state.page = 1;
            loadInventory();
            loadSummary();
          });
        });
      }
    } catch (err) {
      console.error('Failed to load inventory summary:', err);
      // Show clear error state on cards rather than hanging '-'
      [kpiTotal, kpiAvail, kpiExp, kpiExpired].forEach(el => {
        if (el) {
          el.innerHTML = '<span class="text-xs font-semibold text-rose-500" title="Error loading summary">Unavailable</span>';
        }
      });
      showToast(err.message || 'Error loading inventory summary.', 'error');
    }
  }

  // 4. Load & Render Inventory Table
  async function loadInventory() {
    const tableBody = document.getElementById('inventoryTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="py-8 text-center text-slate-400">
          <div class="flex items-center justify-center gap-2">
            <svg class="animate-spin w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Fetching blood units...</span>
          </div>
        </td>
      </tr>
    `;

    try {
      const params = {
        page: state.page,
        limit: state.limit
      };

      if (state.search) params.search = state.search;
      if (state.blood_group) params.blood_group = state.blood_group;
      if (state.component) params.component = state.component;
      if (state.status) params.status = state.status;
      if (state.is_available !== '') params.is_available = state.is_available;

      const res = await api.getInventory(params);
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Failed to load inventory.');
      }

      const { units, total, totalPages, page } = res.data;
      state.totalRecords = total;
      state.totalPages = totalPages;
      state.page = page;

      // Update Pagination UI
      const paginationText = document.getElementById('paginationText');
      if (paginationText) {
        const start = total === 0 ? 0 : (page - 1) * state.limit + 1;
        const end = Math.min(page * state.limit, total);
        paginationText.textContent = `Showing ${start}–${end} of ${total} units`;
      }

      const pageIndicator = document.getElementById('pageIndicator');
      if (pageIndicator) pageIndicator.textContent = `Page ${page} of ${totalPages || 1}`;

      const prevBtn = document.getElementById('prevPageBtn');
      if (prevBtn) prevBtn.disabled = page <= 1;

      const nextBtn = document.getElementById('nextPageBtn');
      if (nextBtn) nextBtn.disabled = page >= totalPages;

      const headerSummary = document.getElementById('tableHeaderSummary');
      if (headerSummary) headerSummary.textContent = `Total units matching filters: ${total}`;

      if (!units || units.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="8" class="py-12 text-center text-slate-400">
              <div class="max-w-xs mx-auto space-y-2">
                <span class="text-3xl">🩸</span>
                <p class="font-bold text-slate-700">No blood units found</p>
                <p class="text-xs text-slate-500">No units match the applied filters, or inventory is empty for this organization.</p>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      const today = getFormattedToday();

      tableBody.innerHTML = units.map(u => {
        // Shelf status calculation (§14)
        const isExpired = u.expiry_date < today || u.status === 'EXPIRED';
        const isAvail = u.status === 'AVAILABLE' && !isExpired;

        let shelfPill = '';
        if (isExpired) {
          shelfPill = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">EXPIRED</span>`;
        } else if (isAvail) {
          shelfPill = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">AVAILABLE</span>`;
        } else {
          shelfPill = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">${u.status}</span>`;
        }

        // Status badge
        let statusBadge = '';
        switch (u.status) {
          case 'AVAILABLE':
            statusBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">AVAILABLE</span>`;
            break;
          case 'RESERVED':
            statusBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">RESERVED</span>`;
            break;
          case 'TESTING':
            statusBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">TESTING</span>`;
            break;
          case 'DONATED':
            statusBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">DONATED</span>`;
            break;
          case 'ISSUED':
            statusBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">ISSUED</span>`;
            break;
          case 'COMPLETED':
            statusBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">COMPLETED</span>`;
            break;
          case 'EXPIRED':
            statusBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">EXPIRED</span>`;
            break;
          case 'DISCARDED':
            statusBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 text-slate-800 border border-slate-300">DISCARDED</span>`;
            break;
          default:
            statusBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-50 text-slate-600 border border-slate-200">${u.status}</span>`;
        }

        // Component display
        const compDisplay = (u.component || '').replace('_', ' ');

        // Action buttons
        const isTerminal = ['COMPLETED', 'DISCARDED', 'REJECTED'].includes(u.status);

        const editBtn = canManage && !isTerminal
          ? `<button type="button" class="btn-edit-unit px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors" data-id="${u.id}" data-code="${u.unit_code}" data-status="${u.status}" data-expiry="${u.expiry_date}">Edit</button>`
          : '';

        const discardBtn = canManage && !isTerminal
          ? `<button type="button" class="btn-discard-unit px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors" data-id="${u.id}" data-code="${u.unit_code}">Discard</button>`
          : '';

        return `
          <tr class="hover:bg-slate-50/70 transition-colors">
            <td class="py-3 px-4 font-mono font-bold text-slate-900">${u.unit_code}</td>
            <td class="py-3 px-4">
              <span class="px-2 py-0.5 rounded-md font-extrabold text-xs bg-red-100 text-red-800 border border-red-200">
                ${u.blood_group}
              </span>
            </td>
            <td class="py-3 px-4 font-medium text-slate-700">${compDisplay}</td>
            <td class="py-3 px-4 text-slate-500 font-mono text-[11px]">${u.collection_date || '-'}</td>
            <td class="py-3 px-4 font-mono text-[11px] ${isExpired ? 'text-rose-600 font-bold' : 'text-slate-800'}">
              ${u.expiry_date || '-'}
            </td>
            <td class="py-3 px-4">${shelfPill}</td>
            <td class="py-3 px-4">${statusBadge}</td>
            <td class="py-3 px-4 text-right">
              <div class="flex items-center justify-end gap-1.5">
                ${editBtn}
                ${discardBtn}
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Wire up action buttons
      tableBody.querySelectorAll('.btn-edit-unit').forEach(btn => {
        btn.addEventListener('click', () => {
          openEditModal({
            id: btn.dataset.id,
            code: btn.dataset.code,
            status: btn.dataset.status,
            expiry: btn.dataset.expiry
          });
        });
      });

      tableBody.querySelectorAll('.btn-discard-unit').forEach(btn => {
        btn.addEventListener('click', () => {
          openDiscardModal({
            id: btn.dataset.id,
            code: btn.dataset.code
          });
        });
      });

    } catch (err) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="py-6 text-center text-rose-600 text-xs">
            ${err.message || 'Error loading inventory records.'}
          </td>
        </tr>
      `;
    }
  }

  // 5. Filter & Search Event Listeners
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.search = e.target.value.trim();
        state.page = 1;
        loadInventory();
      }, 300);
    });
  }

  const filterBg = document.getElementById('filterBloodGroup');
  if (filterBg) {
    filterBg.addEventListener('change', (e) => {
      state.blood_group = e.target.value;
      state.page = 1;
      loadInventory();
      loadSummary();
    });
  }

  const filterComp = document.getElementById('filterComponent');
  if (filterComp) {
    filterComp.addEventListener('change', (e) => {
      state.component = e.target.value;
      state.page = 1;
      loadInventory();
    });
  }

  const filterSt = document.getElementById('filterStatus');
  if (filterSt) {
    filterSt.addEventListener('change', (e) => {
      state.status = e.target.value;
      state.page = 1;
      loadInventory();
    });
  }

  const filterAvail = document.getElementById('filterAvailability');
  if (filterAvail) {
    filterAvail.addEventListener('change', (e) => {
      state.is_available = e.target.value;
      state.page = 1;
      loadInventory();
    });
  }

  const clearGroupBtn = document.getElementById('clearGroupFilterBtn');
  if (clearGroupBtn) {
    clearGroupBtn.addEventListener('click', () => {
      state.blood_group = '';
      if (filterBg) filterBg.value = '';
      state.page = 1;
      loadInventory();
      loadSummary();
    });
  }

  const limitSelect = document.getElementById('limitSelect');
  if (limitSelect) {
    limitSelect.addEventListener('change', (e) => {
      state.limit = parseInt(e.target.value, 10) || 20;
      state.page = 1;
      loadInventory();
    });
  }

  const prevPageBtn = document.getElementById('prevPageBtn');
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (state.page > 1) {
        state.page--;
        loadInventory();
      }
    });
  }

  const nextPageBtn = document.getElementById('nextPageBtn');
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      if (state.page < state.totalPages) {
        state.page++;
        loadInventory();
      }
    });
  }

  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadSummary();
      loadInventory();
      showToast('Inventory refreshed successfully.');
    });
  }

  // 6. Modal Handlers: Add Blood Unit
  const addModal = document.getElementById('addUnitModal');
  const closeAddBtn = document.getElementById('closeAddModalBtn');
  const cancelAddBtn = document.getElementById('cancelAddBtn');
  const addForm = document.getElementById('addUnitForm');
  const addError = document.getElementById('addModalError');

  function openAddModal() {
    if (!addModal) return;
    if (addError) addError.classList.add('hidden');
    if (addForm) {
      addForm.reset();
      const codeInput = document.getElementById('addUnitCode');
      const collInput = document.getElementById('addCollectionDate');
      const expInput = document.getElementById('addExpiryDate');

      // Auto-generate suggested code
      if (codeInput) {
        const rnd = Math.floor(1000 + Math.random() * 9000);
        codeInput.value = `BD-${new Date().getFullYear()}-${rnd}`;
      }
      if (collInput) collInput.value = getFormattedToday();
      if (expInput) expInput.value = getFormattedExpiry(35);
    }
    addModal.classList.remove('hidden');
  }

  function closeAddModal() {
    if (addModal) addModal.classList.add('hidden');
  }

  if (openAddBtn) openAddBtn.addEventListener('click', openAddModal);
  if (closeAddBtn) closeAddBtn.addEventListener('click', closeAddModal);
  if (cancelAddBtn) cancelAddBtn.addEventListener('click', closeAddModal);

  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (addError) addError.classList.add('hidden');

      const formData = new FormData(addForm);
      const payload = {
        unit_code: formData.get('unit_code')?.trim(),
        blood_group: formData.get('blood_group'),
        component: formData.get('component'),
        collection_date: formData.get('collection_date'),
        expiry_date: formData.get('expiry_date'),
        status: formData.get('status') || 'AVAILABLE'
      };

      try {
        const res = await api.createBloodUnit(payload);
        if (!res.success) {
          throw new Error(res.error?.message || 'Failed to create blood unit.');
        }

        closeAddModal();
        showToast(`Blood unit ${payload.unit_code} added successfully.`);
        loadSummary();
        loadInventory();
      } catch (err) {
        if (addError) {
          addError.textContent = err.message || 'Error creating blood unit.';
          addError.classList.remove('hidden');
        }
      }
    });
  }

  // 7. Modal Handlers: Edit Blood Unit
  const editModal = document.getElementById('editUnitModal');
  const closeEditBtn = document.getElementById('closeEditModalBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const editForm = document.getElementById('editUnitForm');
  const editError = document.getElementById('editModalError');

  function openEditModal(unit) {
    if (!editModal) return;
    if (editError) editError.classList.add('hidden');
    const sub = document.getElementById('editUnitSubtitle');
    const idInput = document.getElementById('editUnitId');
    const statusSelect = document.getElementById('editStatus');
    const expInput = document.getElementById('editExpiryDate');

    if (sub) sub.textContent = `Unit Code: ${unit.code}`;
    if (idInput) idInput.value = unit.id;
    if (statusSelect) statusSelect.value = unit.status;
    if (expInput) expInput.value = unit.expiry || '';

    editModal.classList.remove('hidden');
  }

  function closeEditModal() {
    if (editModal) editModal.classList.add('hidden');
  }

  if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditModal);
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditModal);

  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (editError) editError.classList.add('hidden');

      const id = document.getElementById('editUnitId').value;
      const status = document.getElementById('editStatus').value;
      const expiry_date = document.getElementById('editExpiryDate').value;

      try {
        const res = await api.updateBloodUnit(id, { status, expiry_date });
        if (!res.success) {
          throw new Error(res.error?.message || 'Failed to update blood unit.');
        }

        closeEditModal();
        showToast('Blood unit updated successfully.');
        loadSummary();
        loadInventory();
      } catch (err) {
        if (editError) {
          editError.textContent = err.message || 'Error updating blood unit.';
          editError.classList.remove('hidden');
        }
      }
    });
  }

  // 8. Modal Handlers: Discard Blood Unit
  const discardModal = document.getElementById('discardUnitModal');
  const cancelDiscardBtn = document.getElementById('cancelDiscardBtn');
  const discardForm = document.getElementById('discardUnitForm');
  const discardError = document.getElementById('discardModalError');

  function openDiscardModal(unit) {
    if (!discardModal) return;
    if (discardError) discardError.classList.add('hidden');
    const sub = document.getElementById('discardUnitSubtitle');
    const idInput = document.getElementById('discardUnitId');

    if (sub) sub.textContent = `Unit: ${unit.code}`;
    if (idInput) idInput.value = unit.id;

    discardModal.classList.remove('hidden');
  }

  function closeDiscardModal() {
    if (discardModal) discardModal.classList.add('hidden');
  }

  if (cancelDiscardBtn) cancelDiscardBtn.addEventListener('click', closeDiscardModal);

  if (discardForm) {
    discardForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (discardError) discardError.classList.add('hidden');

      const id = document.getElementById('discardUnitId').value;
      const reason = document.getElementById('discardReasonSelect').value;

      try {
        const res = await api.discardBloodUnit(id, reason);
        if (!res.success) {
          throw new Error(res.error?.message || 'Failed to discard blood unit.');
        }

        closeDiscardModal();
        showToast('Blood unit retired and marked as DISCARDED.');
        loadSummary();
        loadInventory();
      } catch (err) {
        if (discardError) {
          discardError.textContent = err.message || 'Error discarding blood unit.';
          discardError.classList.remove('hidden');
        }
      }
    });
  }

  // 9. Initial Page Load
  await Promise.all([loadSummary(), loadInventory()]);
});
