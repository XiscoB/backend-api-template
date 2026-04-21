/**
 * Internal Admin Viewer - Read-Only Application
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠️  THIS IS A READ-ONLY VIEWER — NO WRITE OPERATIONS  ⚠️
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Security:
 * - JWT kept in memory only (lost on refresh)
 * - Only calls GET endpoints
 * - No localStorage, no cookies, no sessions
 * - All requests go through existing admin API guards
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // State (in-memory only, lost on refresh)
  // ─────────────────────────────────────────────────────────────────────────────

  const state = {
    jwt: null,
    privilege: null,
    tables: [],
    currentTable: null,
    records: [],
    currentRecord: null,
    pagination: {
      offset: 0,
      limit: 50,
      total: 0,
    },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────────────────────

  // API base URL (relative to current origin)
  const API_BASE = '/api/internal/admin';

  // ─────────────────────────────────────────────────────────────────────────────
  // DOM Elements
  // ─────────────────────────────────────────────────────────────────────────────

  const elements = {
    // Auth
    authSection: document.getElementById('auth-section'),
    mainSection: document.getElementById('main-section'),
    jwtInput: document.getElementById('jwt-input'),
    connectBtn: document.getElementById('connect-btn'),
    disconnectBtn: document.getElementById('disconnect-btn'),
    authError: document.getElementById('auth-error'),

    // Sidebar
    tableList: document.getElementById('table-list'),
    privilegeDisplay: document.getElementById('privilege-display'),

    // Views
    emptyState: document.getElementById('empty-state'),
    tableView: document.getElementById('table-view'),
    recordView: document.getElementById('record-view'),
    loading: document.getElementById('loading'),
    errorDisplay: document.getElementById('error-display'),

    // Table View
    currentTableName: document.getElementById('current-table-name'),
    recordCount: document.getElementById('record-count'),
    recordsThead: document.getElementById('records-thead'),
    recordsTbody: document.getElementById('records-tbody'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    paginationInfo: document.getElementById('pagination-info'),

    // Record View
    backBtn: document.getElementById('back-btn'),
    recordTitle: document.getElementById('record-title'),
    recordJson: document.getElementById('record-json'),

    // Error
    errorMessage: document.getElementById('error-message'),
    retryBtn: document.getElementById('retry-btn'),
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // API Client (READ-ONLY)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Make a GET request to the admin API.
   * Only GET requests are allowed — no POST, PUT, DELETE.
   */
  async function apiGet(path) {
    if (!state.jwt) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${state.jwt}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;

      try {
        const body = await response.json();
        error.message = body.message || error.message;
      } catch (e) {
        // Ignore JSON parse errors
      }

      throw error;
    }

    return response.json();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UI State Management
  // ─────────────────────────────────────────────────────────────────────────────

  function showLoading() {
    elements.loading.hidden = false;
  }

  function hideLoading() {
    elements.loading.hidden = true;
  }

  function showError(message) {
    elements.emptyState.hidden = true;
    elements.tableView.hidden = true;
    elements.recordView.hidden = true;
    elements.errorDisplay.hidden = false;
    elements.errorMessage.textContent = message;
  }

  function hideError() {
    elements.errorDisplay.hidden = true;
  }

  function showAuthError(message) {
    elements.authError.textContent = message;
    elements.authError.hidden = false;
  }

  function hideAuthError() {
    elements.authError.hidden = true;
  }

  function showAuthSection() {
    elements.authSection.hidden = false;
    elements.mainSection.hidden = true;
    state.jwt = null;
    state.privilege = null;
    elements.jwtInput.value = '';
  }

  function showMainSection() {
    elements.authSection.hidden = true;
    elements.mainSection.hidden = false;
  }

  function showEmptyState() {
    elements.emptyState.hidden = false;
    elements.tableView.hidden = true;
    elements.recordView.hidden = true;
    hideError();
  }

  function showTableView() {
    elements.emptyState.hidden = true;
    elements.tableView.hidden = false;
    elements.recordView.hidden = true;
    hideError();
  }

  function showRecordView() {
    elements.emptyState.hidden = true;
    elements.tableView.hidden = true;
    elements.recordView.hidden = false;
    hideError();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────────────────────────────────────

  async function connect() {
    const jwt = elements.jwtInput.value.trim();

    if (!jwt) {
      showAuthError('Please enter a JWT token');
      return;
    }

    // Store JWT in memory (not localStorage!)
    state.jwt = jwt;
    hideAuthError();

    try {
      showLoading();

      // Validate by fetching tables
      const response = await apiGet('/tables');
      // Controller returns {data: [...]}, @SkipResponseWrap prevents double-wrap
      state.tables = response.data || [];

      // Try to get privilege from health endpoint
      try {
        const healthResponse = await apiGet('/health');
        // Controller returns {data: {privilege}}, @SkipResponseWrap prevents double-wrap
        state.privilege = healthResponse.data?.privilege || 'ADMIN_READ';
      } catch (e) {
        state.privilege = 'ADMIN_READ';
      }

      hideLoading();
      showMainSection();
      renderTableList();
      showEmptyState();
    } catch (error) {
      hideLoading();
      state.jwt = null;

      if (error.status === 401) {
        showAuthError('Invalid or expired token');
      } else if (error.status === 403) {
        showAuthError('Access denied. Token may lack ADMIN_READ privilege.');
      } else if (error.status === 429) {
        showAuthError('Rate limit exceeded. Please wait before retrying.');
      } else {
        showAuthError(`Connection failed: ${error.message}`);
      }
    }
  }

  function disconnect() {
    // Clear all state
    state.jwt = null;
    state.privilege = null;
    state.tables = [];
    state.currentTable = null;
    state.records = [];
    state.currentRecord = null;
    state.pagination = { offset: 0, limit: 50, total: 0 };

    showAuthSection();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Table List
  // ─────────────────────────────────────────────────────────────────────────────

  function renderTableList() {
    elements.tableList.innerHTML = '';

    // Safely handle empty or null tables array
    const tables = state.tables || [];
    for (const table of tables) {
      const li = document.createElement('li');
      li.dataset.table = table.name;
      li.innerHTML = `
        <span class="table-icon">${table.writable ? '✏️' : '👁️'}</span>
        <span>${table.name}</span>
      `;
      li.addEventListener('click', () => selectTable(table.name));
      elements.tableList.appendChild(li);
    }

    // Update privilege display
    elements.privilegeDisplay.textContent = state.privilege || 'ADMIN_READ';
  }

  function selectTable(tableName) {
    // Update active state in sidebar
    const items = elements.tableList.querySelectorAll('li');
    items.forEach((li) => {
      li.classList.toggle('active', li.dataset.table === tableName);
    });

    state.currentTable = tableName;
    state.pagination.offset = 0;
    loadTableRecords();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Table Records
  // ─────────────────────────────────────────────────────────────────────────────

  async function loadTableRecords() {
    if (!state.currentTable) return;

    showLoading();
    hideError();

    try {
      const { offset, limit } = state.pagination;
      const response = await apiGet(
        `/query?table=${encodeURIComponent(state.currentTable)}&limit=${limit}&offset=${offset}`,
      );

      // Controller returns {data: [...], meta: {...}}, @SkipResponseWrap prevents double-wrap
      state.records = response.data || [];
      state.pagination.total = response.meta?.total || 0;

      hideLoading();
      renderTableRecords();
      showTableView();
    } catch (error) {
      hideLoading();
      handleApiError(error);
    }
  }

  function renderTableRecords() {
    // Update header
    elements.currentTableName.textContent = state.currentTable;
    elements.recordCount.textContent = `${state.pagination.total} records`;

    // Clear table
    elements.recordsThead.innerHTML = '';
    elements.recordsTbody.innerHTML = '';

    if (state.records.length === 0) {
      elements.recordsTbody.innerHTML = '<tr><td colspan="100">No records found</td></tr>';
      updatePagination();
      return;
    }

    // Get columns from first record
    const columns = Object.keys(state.records[0]);

    // Render header
    const headerRow = document.createElement('tr');
    columns.forEach((col) => {
      const th = document.createElement('th');
      th.textContent = col;
      headerRow.appendChild(th);
    });
    elements.recordsThead.appendChild(headerRow);

    // Render rows
    state.records.forEach((record) => {
      const row = document.createElement('tr');
      row.dataset.id = record.id;

      columns.forEach((col) => {
        const td = document.createElement('td');
        const value = record[col];

        if (value === null || value === undefined) {
          td.textContent = '—';
          td.style.color = 'var(--text-muted)';
        } else if (typeof value === 'object') {
          td.textContent = JSON.stringify(value);
        } else {
          td.textContent = String(value);
        }

        row.appendChild(td);
      });

      row.addEventListener('click', () => loadRecord(record.id));
      elements.recordsTbody.appendChild(row);
    });

    updatePagination();
  }

  function updatePagination() {
    const { offset, limit, total } = state.pagination;
    const start = total === 0 ? 0 : offset + 1;
    const end = Math.min(offset + state.records.length, total);

    elements.paginationInfo.textContent = `${start}–${end} of ${total}`;
    elements.prevBtn.disabled = offset === 0;
    elements.nextBtn.disabled = offset + limit >= total;
  }

  function prevPage() {
    state.pagination.offset = Math.max(0, state.pagination.offset - state.pagination.limit);
    loadTableRecords();
  }

  function nextPage() {
    state.pagination.offset += state.pagination.limit;
    loadTableRecords();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Record Detail
  // ─────────────────────────────────────────────────────────────────────────────

  async function loadRecord(id) {
    if (!state.currentTable) return;

    showLoading();
    hideError();

    try {
      const response = await apiGet(
        `/record/${encodeURIComponent(state.currentTable)}/${encodeURIComponent(id)}`,
      );

      // Controller returns {data: {...}}, @SkipResponseWrap prevents double-wrap
      state.currentRecord = response.data;

      hideLoading();
      renderRecordDetail();
      showRecordView();
    } catch (error) {
      hideLoading();
      handleApiError(error);
    }
  }

  function renderRecordDetail() {
    elements.recordTitle.textContent = `Record: ${state.currentRecord?.id || 'Unknown'}`;
    elements.recordJson.textContent = JSON.stringify(state.currentRecord, null, 2);
  }

  function backToList() {
    state.currentRecord = null;
    showTableView();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Error Handling
  // ─────────────────────────────────────────────────────────────────────────────

  function handleApiError(error) {
    let message = 'An error occurred';

    if (error.status === 401) {
      message = 'Session expired. Please reconnect.';
    } else if (error.status === 403) {
      message = 'Access denied. Insufficient privileges.';
    } else if (error.status === 404) {
      message = 'Resource not found. Table may not be allowlisted.';
    } else if (error.status === 429) {
      message = 'Rate limit exceeded. Please wait before retrying.';
    } else {
      message = error.message || 'Unknown error';
    }

    showError(message);
  }

  function retry() {
    if (state.currentRecord) {
      void loadRecord(state.currentRecord.id);
    } else if (state.currentTable) {
      void loadTableRecords();
    } else {
      showEmptyState();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Listeners
  // ─────────────────────────────────────────────────────────────────────────────

  function init() {
    // Auth
    elements.connectBtn.addEventListener('click', () => void connect());
    elements.disconnectBtn.addEventListener('click', disconnect);

    // Allow Enter key to connect
    elements.jwtInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void connect();
      }
    });

    // Pagination
    elements.prevBtn.addEventListener('click', prevPage);
    elements.nextBtn.addEventListener('click', nextPage);

    // Record detail
    elements.backBtn.addEventListener('click', backToList);

    // Retry
    elements.retryBtn.addEventListener('click', retry);

    // Start in auth state
    showAuthSection();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
