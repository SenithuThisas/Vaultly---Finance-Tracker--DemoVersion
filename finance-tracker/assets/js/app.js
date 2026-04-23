/**
 * @fileoverview Main application entry point
 */

import { setState, navigateTo, getState, clearState } from './state.js';
import { load, saveRecord, exportAllCSV, exportJSON, importJSON, readFile, isUsingCloud } from './storage.js';
import { initAuth, showApp, handleSignOut } from './auth.js';
import { RecurringService } from './services/recurring.service.js';
import { initNav, updateBadges } from './components/nav.js';
import { initModal, closeModal } from './components/modal.js';
import { initDrawer, closeDrawer } from './components/drawer.js';
import { showToast } from './components/toast.js';

// Views
import { renderDashboard } from './views/dashboard.view.js';
import { renderBanks } from './views/banks.view.js';
import { renderTransactions, showAddTransactionForm } from './views/transactions.view.js';
import { renderTransfers } from './views/transfers.view.js';
import { renderBudgets } from './views/budgets.view.js';
import { renderAnalytics } from './views/analytics.view.js';

const VIEWS = {
  dashboard: renderDashboard,
  banks: renderBanks,
  transactions: renderTransactions,
  transfers: renderTransfers,
  budgets: renderBudgets,
  analytics: renderAnalytics
};

const APP_BOOT_TIMEOUT_MS = 15000;
let shellInitialized = false;

function withTimeout(promise, label, timeoutMs = APP_BOOT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Initialize the application (called by Auth when session is ready)
 */
async function loadAndRenderApp(user) {
  const baseState = buildBootstrapState(user);
  setState(baseState);
  initializeShell(baseState);
  renderBootstrapSkeleton();

  try {
    const loaded = await withTimeout(
      load(user, {
        onProgress: (chunk) => applyBootstrapChunk(chunk, user),
        onBackgroundRefresh: (fresh) => {
          applyLoadedState(fresh, user);
          if (fresh.loadErrors?.length) {
            showToast(`Background refresh completed with ${fresh.loadErrors.length} issue(s).`, 'warning', 4000);
          }
        }
      }),
      'storage.load',
      25000
    );

    if (!loaded) return;
    applyLoadedState(loaded, user);

    if (loaded.loadErrors?.length) {
      showToast(`Loaded with ${loaded.loadErrors.length} partial data issue(s).`, 'warning', 5000);
    }

  } catch (err) {
    console.error('Failed to load app data:', err);

    if (err?.message?.startsWith('Connection issue:')) {
      showToast('Connection issue detected. Showing last known data if available.', 'error', 5000);
      rerenderActiveView();
      return;
    }

    const isTimeout = Boolean(err?.message && err.message.includes('timed out'));
    showToast(
      isTimeout
        ? 'Initial data load timed out. Showing cached/partial data.'
        : 'Failed to finish loading data. Showing what is available.',
      'warning'
    );

    rerenderActiveView();
  }
}

function buildBootstrapState(user) {
  return {
    fundSources: [],
    transactions: [],
    transfers: [],
    budgets: [],
    recurringRules: [],
    currentView: 'dashboard',
    filters: {},
    settings: {
      currency: 'LKR',
      dateFormat: 'DD/MM/YYYY',
      userName: user?.user_metadata?.full_name || 'User',
      email: user?.email || ''
    }
  };
}

function initializeShell(state) {
  if (!shellInitialized) {
    initModal();
    initDrawer();
    initNav();
    setupMobileViewport();
    registerKeyboardShortcuts();
    registerGlobalSearch();
    registerFAB();
    registerExportButton();
    registerSettings();
    registerSignOutBtn();
    shellInitialized = true;
  }

  showApp();
  renderUserProfile(state.settings);
  navigateTo(state.currentView || 'dashboard');
}

function renderBootstrapSkeleton() {
  const container = document.getElementById('view-dashboard');
  if (!container) return;

  container.innerHTML = `
    <div class="view-header">
      <h2 class="view-title">Dashboard</h2>
    </div>
    <div class="card" style="padding: 20px; margin-bottom: 20px; opacity: 0.85;">Loading account balances...</div>
    <div class="card" style="padding: 20px; margin-bottom: 20px; opacity: 0.75;">Loading transactions...</div>
    <div class="card" style="padding: 20px; opacity: 0.65;">Loading budgets and analytics...</div>
  `;
}

function applyBootstrapChunk(chunk, user) {
  if (!chunk) return;

  if (chunk.error) {
    console.warn(`[Bootstrap] ${chunk.key} failed:`, chunk.error);
    return;
  }

  const current = getState();
  const next = {
    ...current,
    settings: { ...current.settings }
  };

  if (chunk.key === 'fundSources') next.fundSources = chunk.data || [];
  if (chunk.key === 'transactions') next.transactions = chunk.data || [];
  if (chunk.key === 'transfers') next.transfers = chunk.data || [];
  if (chunk.key === 'budgets') next.budgets = chunk.data || [];
  if (chunk.key === 'recurringRules') next.recurringRules = chunk.data || [];
  if (chunk.key === 'settings' && chunk.data) {
    next.settings = {
      ...next.settings,
      ...chunk.data,
      email: next.settings.email || user?.email || ''
    };
  }

  setState(next);
  renderUserProfile(next.settings);
  updateBadges();
  rerenderActiveView();
}

function applyLoadedState(loaded, user) {
  const current = getState();
  const next = {
    ...current,
    fundSources: loaded.fundSources || current.fundSources,
    transactions: loaded.transactions || current.transactions,
    transfers: loaded.transfers || current.transfers,
    budgets: loaded.budgets || current.budgets,
    recurringRules: loaded.recurringRules || current.recurringRules,
    settings: {
      ...current.settings,
      ...(loaded.settings || {}),
      email: current.settings.email || user?.email || ''
    }
  };

  setState(next);
  renderUserProfile(next.settings);
  RecurringService.checkDue();
  updateBadges();
  rerenderActiveView();
}

function rerenderActiveView() {
  const currentView = getState().currentView || 'dashboard';
  const render = VIEWS[currentView];
  if (render) render();
}

/**
 * Mobile viewport setup — fixes iOS 100vh and handles virtual keyboard.
 */
function setupMobileViewport() {
  function setVh() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', vh + 'px');
  }
  setVh();

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(setVh, 150);
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const keyboardHeight = window.innerHeight - window.visualViewport.height;
      document.documentElement.style.setProperty('--keyboard-height', keyboardHeight + 'px');

      const drawer = document.getElementById('tx-drawer');
      if (drawer && drawer.classList.contains('open')) {
        drawer.style.paddingBottom = (keyboardHeight > 0 ? keyboardHeight : 0) + 'px';
      }
    });
  }
}

function renderUserProfile(settings) {
  const footer = document.querySelector('.sidebar-footer');
  if (!footer) return;

  const initials = (settings.userName || 'U').substring(0, 2).toUpperCase();

  // We append user profile before settings
  let userProfile = document.getElementById('sidebar-user-profile');
  if (!userProfile) {
    userProfile = document.createElement('div');
    userProfile.id = 'sidebar-user-profile';
    userProfile.className = 'sidebar-user-profile';
    userProfile.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-bottom: 8px; border-bottom: 1px solid var(--border);';
    footer.insertBefore(userProfile, footer.firstChild);
  }

  userProfile.innerHTML = `
    <div class="up-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: var(--gold-dark); color: var(--bg-void); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0;">
    </div>
    <div style="overflow: hidden; flex: 1;">
      <div class="up-name" style="font-size: 13px; font-weight: 600; color: var(--text-main); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;"></div>
      <div class="up-email" style="font-size: 11px; color: var(--text-muted); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;"></div>
    </div>
  `;
  
  userProfile.querySelector('.up-avatar').textContent = initials;
  userProfile.querySelector('.up-name').textContent = settings.userName;
  userProfile.querySelector('.up-email').textContent = settings.email || '';
}

function registerSignOutBtn() {
  const footer = document.querySelector('.sidebar-footer');
  if (!footer) return;

  let btn = document.getElementById('signout-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'signout-btn';
    btn.className = 'nav-link';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      <span class="nav-link-text">Sign Out</span>
    `;
    footer.appendChild(btn);

    btn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to sign out?')) {
        await handleSignOut();
        clearState();
      }
    });
  }
}

function registerKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    const shortcuts = {
      '1': 'dashboard',
      '2': 'banks',
      '3': 'transactions',
      '4': 'transfers',
      '5': 'budgets',
      '6': 'analytics'
    };

    if (shortcuts[e.key]) {
      e.preventDefault();
      navigateTo(shortcuts[e.key]);
    } else if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (getState().fundSources.some(fs => fs.isActive !== false)) {
        showAddTransactionForm();
      } else {
        showToast('Please add an account first', 'warning');
      }
    } else if (e.key === 'Escape') {
      closeModal();
      closeDrawer();
      closeSearchOverlay();
    } else if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openSearchOverlay();
    }
  });
}

function registerGlobalSearch() {
  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', openSearchOverlay);
  }

  const searchOverlay = document.getElementById('search-overlay');
  const searchInput = document.getElementById('search-input');

  if (searchOverlay && searchInput) {
    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) {
        closeSearchOverlay();
      }
    });

    searchInput.addEventListener('input', () => {
      performSearch(searchInput.value);
    });
  }
}

function openSearchOverlay() {
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  if (overlay) {
    overlay.classList.add('open');
    setTimeout(() => input?.focus(), 100);
  }
}

function closeSearchOverlay() {
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  if (overlay) {
    overlay.classList.remove('open');
    if (input) input.value = '';
    const results = document.getElementById('search-results');
    if (results) results.innerHTML = '';
  }
}

function performSearch(query) {
  const results = document.getElementById('search-results');
  if (!results) return;

  if (!query.trim()) {
    results.innerHTML = '';
    return;
  }

  const state = getState();
  const q = query.toLowerCase();

  const matchedTxs = state.transactions.filter(tx =>
    tx.title.toLowerCase().includes(q) ||
    tx.note?.toLowerCase().includes(q) ||
    tx.category.toLowerCase().includes(q)
  ).slice(0, 5);

  const matchedFs = state.fundSources.filter(fs =>
    fs.name.toLowerCase().includes(q) &&
    fs.isActive !== false
  ).slice(0, 3);

  let html = '';

  if (matchedTxs.length > 0) {
    html += `<div style="padding: 8px 20px; color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Transactions</div>`;
    matchedTxs.forEach(tx => {
      const fs = state.fundSources.find(f => f.id === tx.fundSourceId);
      html += `
        <div class="search-result-item" onclick="window.searchResultClick('tx', '${tx.id}')">
          <div style="font-weight: 500;">${tx.title}</div>
          <div style="font-size: 12px; color: var(--text-muted);">
            ${new Date(tx.date).toLocaleDateString()} · ${fs?.name || '[Deleted]'} · ${tx.type === 'CR' ? '+' : '-'}${tx.amount.toLocaleString()}
          </div>
        </div>
      `;
    });
  }

  if (matchedFs.length > 0) {
    html += `<div style="padding: 8px 20px; color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Accounts</div>`;
    matchedFs.forEach(fs => {
      html += `
        <div class="search-result-item" onclick="window.searchResultClick('fs', '${fs.id}')">
          <div style="font-weight: 500;">${fs.name}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${fs.type} · ${fs.balance?.toLocaleString()}</div>
        </div>
      `;
    });
  }

  if (!html) {
    html = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No results found</div>';
  }

  results.innerHTML = html;
}

window.searchResultClick = function(type, id) {
  closeSearchOverlay();
  if (type === 'tx') {
    navigateTo('transactions');
  } else if (type === 'fs') {
    navigateTo('banks');
  }
};

function registerFAB() {
  const fab = document.getElementById('add-fab');
  if (fab) {
    fab.addEventListener('click', () => {
      const state = getState();
      if (state.fundSources.some(fs => fs.isActive !== false)) {
        showAddTransactionForm();
      } else {
        showToast('Please add an account first', 'warning');
      }
    });
  }
}

function registerExportButton() {
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const state = getState();
      exportAllCSV(state.transactions, state.fundSources);
      showToast('Exported ' + state.transactions.length + ' transactions', 'success');
    });
  }
}

function registerSettings() {
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', showSettingsModal);
  }
}

function showSettingsModal() {
  const state = getState();

  const modal = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const confirm = document.getElementById('modal-confirm');

  title.textContent = 'Settings & Profile';
  confirm.textContent = 'Save';

  body.innerHTML = `
    <div class="form-group">
      <label class="form-label">Email</label>
      <input type="text" class="form-input" value="${state.settings?.email || ''}" disabled style="opacity: 0.6; cursor: not-allowed;">
    </div>
    <div class="form-group">
      <label class="form-label">Your Name</label>
      <input type="text" class="form-input" id="settings-name" value="${state.settings?.userName || 'User'}">
    </div>
    <div class="form-group">
      <label class="form-label">Default Currency</label>
      <select class="form-input form-select" id="settings-currency">
        <option value="LKR" ${state.settings?.currency === 'LKR' ? 'selected' : ''}>LKR - Sri Lankan Rupee</option>
        <option value="USD" ${state.settings?.currency === 'USD' ? 'selected' : ''}>USD - US Dollar</option>
        <option value="EUR" ${state.settings?.currency === 'EUR' ? 'selected' : ''}>EUR - Euro</option>
        <option value="GBP" ${state.settings?.currency === 'GBP' ? 'selected' : ''}>GBP - British Pound</option>
        <option value="INR" ${state.settings?.currency === 'INR' ? 'selected' : ''}>INR - Indian Rupee</option>
        <option value="SGD" ${state.settings?.currency === 'SGD' ? 'selected' : ''}>SGD - Singapore Dollar</option>
      </select>
    </div>
    <hr style="border: none; border-top: 1px solid var(--border); margin: 24px 0;">
    <div class="form-group">
      <label class="form-label">Export Data</label>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-secondary" id="export-json-btn">Export JSON</button>
        <button class="btn btn-secondary" id="export-csv-btn">Export CSV</button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Import Data</label>
      <input type="file" class="form-input" id="import-file" accept=".json" style="padding: 8px;">
      <div id="import-error" style="color: var(--accent-red); font-size: 12px; margin-top: 8px; display: none;"></div>
    </div>
  `;

  document.getElementById('export-json-btn')?.addEventListener('click', () => {
    exportJSON(getState());
    showToast('JSON exported', 'success');
  });

  document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    const state = getState();
    exportAllCSV(state.transactions, state.fundSources);
    showToast('CSV exported', 'success');
  });

  document.getElementById('import-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const content = await readFile(file);
      const result = importJSON(content);
      if (result instanceof Error) {
        document.getElementById('import-error').textContent = result.message;
        document.getElementById('import-error').style.display = 'block';
      } else {
        // TODO: Map IDs and save to Supabase. This may be complex as an import.
        showToast('Local import loaded. Note: Remote sync for imports is not fully supported yet.', 'info');
        setState(result);
        closeModal();
        location.reload();
      }
    } catch (err) {
      document.getElementById('import-error').textContent = 'Failed to read file';
      document.getElementById('import-error').style.display = 'block';
    }
  });

  const newConfirm = confirm.cloneNode(true);
  confirm.parentNode.replaceChild(newConfirm, confirm);

  newConfirm.addEventListener('click', () => {
    const name = document.getElementById('settings-name')?.value;
    const currency = document.getElementById('settings-currency')?.value;

    setState({
      ...getState(),
      settings: { ...getState().settings, userName: name, currency }
    });
    
    // Save to profiles
    saveRecord('UPDATE_SETTINGS', getState().settings);

    // Update the Sidebar visually immediately
    renderUserProfile(getState().settings);

    showToast('Settings saved', 'success');
    closeModal();
  });

  modal.classList.add('open');
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Pass loadAndRenderApp to auth so it can execute once session is confirmed
  initAuth(loadAndRenderApp).catch((error) => {
    console.error('App initialization failed:', error);
    window.alert('CRITICAL INIT ERROR:\n' + error.message + '\n\n' + error.stack);
    
    const text = document.getElementById('loading-text');
    if (text) {
      text.style.color = '#F85149';
      text.textContent = 'App init error: ' + (error.stack || error.message);
    }
  });
});

window.navigateTo = navigateTo;