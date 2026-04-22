/**
 * @fileoverview Main application entry point
 */

import { setState, navigateTo, getState } from './state.js';
import { load, save, exportAllCSV, exportJSON, importJSON, readFile, isUsingCloud } from './storage.js';
import { checkSupabaseHealth, isConfigured } from './config/supabase.js';
import { getSeedData } from './data/seed.js';
import { RecurringService } from './services/recurring.service.js';
import { initNav, updateBadges } from './components/nav.js';
import { initModal, closeModal } from './components/modal.js';
import { initDrawer, closeDrawer } from './components/drawer.js';
import { showToast } from './components/toast.js';

// Views
import { renderDashboard } from './views/dashboard.view.js';
import { renderBanks } from './views/banks.view.js';
import { renderTransactions } from './views/transactions.view.js';
import { showAddTransactionForm } from './views/transactions.view.js';
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

/**
 * Initialize the application
 */
async function init() {
  // Load saved state or use seed data
  let state = await load();

  if (!state || !state.transactions || state.transactions.length === 0) {
    const seed = getSeedData();
    state = {
      fundSources: seed.fundSources,
      transactions: seed.transactions,
      transfers: seed.transfers,
      budgets: seed.budgets,
      recurringRules: seed.recurringRules,
      currentView: 'dashboard',
      filters: {},
      settings: {
        currency: 'LKR',
        dateFormat: 'DD/MM/YYYY',
        userName: 'User'
      }
    };
    save(state);
  }

  setState(state);

  // Initialize components
  initModal();
  initDrawer();
  initNav();

  // Register keyboard shortcuts
  registerKeyboardShortcuts();

  // Register global search (Ctrl+K)
  registerGlobalSearch();

  // Register FAB button
  registerFAB();

  // Register export button
  registerExportButton();

  // Register settings
  registerSettings();

  // Check recurring due
  RecurringService.checkDue();
  updateBadges();

  // Show connection status
  await checkConnectionStatus();

  // Navigate to dashboard
  navigateTo('dashboard');
}

async function checkConnectionStatus() {
  const topBar = document.querySelector('.top-bar');
  if (!topBar) return;

  let status = document.getElementById('connection-status');
  if (!status) {
    status = document.createElement('div');
    status.id = 'connection-status';
    status.style.cssText = 'margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 6px 12px; border-radius: 20px; cursor: pointer; font-weight: 500; transition: all 0.3s ease;';
    status.title = 'Click to see Supabase config';
    status.onclick = () => {
      const env = import.meta.env;
      console.log('Supabase URL:', env.VITE_SUPABASE_URL || 'Not set');
      const selectedKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
      console.log('Active Key Type:', env.VITE_SUPABASE_ANON_KEY ? 'anon' : env.VITE_SUPABASE_PUBLISHABLE_KEY ? 'publishable' : 'missing');
      console.log('Active Key:', selectedKey ? '***' + selectedKey.slice(-10) : 'Not set');
    };
    topBar.appendChild(status);
  }

  async function updateStatus() {
    const configured = isConfigured && isConfigured();
    
    if (!configured) {
      status.innerHTML = '<span style="width: 8px; height: 8px; border-radius: 50%; background: #9CA3AF;\"></span> Not Configured';
      status.style.background = 'rgba(156, 163, 175, 0.1)';
      status.style.color = '#6B7280';
      status.style.border = '1px solid rgba(156, 163, 175, 0.3)';
      return;
    }

    const healthy = await checkSupabaseHealth();
    
    if (healthy) {
      status.innerHTML = '<span style="width: 8px; height: 8px; border-radius: 50%; background: #10B981;\"></span> Supabase Online';
      status.style.background = 'rgba(16, 185, 129, 0.15)';
      status.style.color = '#059669';
      status.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    } else {
      status.innerHTML = '<span style="width: 8px; height: 8px; border-radius: 50%; background: #EF4444;\"></span> Supabase Offline';
      status.style.background = 'rgba(239, 68, 68, 0.15)';
      status.style.color = '#991B1B';
      status.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    }
  }

  // Initial check
  await updateStatus();
  
  // Poll every 30 seconds for status changes
  setInterval(updateStatus, 30000);
}

function registerKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in input
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

  // Search transactions
  const matchedTxs = state.transactions.filter(tx =>
    tx.title.toLowerCase().includes(q) ||
    tx.note?.toLowerCase().includes(q) ||
    tx.category.toLowerCase().includes(q)
  ).slice(0, 5);

  // Search fund sources
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

  title.textContent = 'Settings';
  confirm.textContent = 'Save';

  body.innerHTML = `
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
    <hr style="border: none; border-top: 1px solid var(--border); margin: 24px 0;">
    <div style="background: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.3); border-radius: 8px; padding: 16px;">
      <div style="color: var(--accent-red); font-weight: 600; margin-bottom: 8px;">Danger Zone</div>
      <button class="btn btn-danger" id="reset-data-btn">Reset All Data</button>
    </div>
  `;

  // Setup handlers
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
        showToast('Data imported successfully', 'success');
        closeModal();
        location.reload();
      }
    } catch (err) {
      document.getElementById('import-error').textContent = 'Failed to read file';
      document.getElementById('import-error').style.display = 'block';
    }
  });

  document.getElementById('reset-data-btn')?.addEventListener('click', () => {
    const confirmReset = confirm('Are you sure you want to reset all data? This action cannot be undone.');
    if (confirmReset) {
      localStorage.removeItem('finflow_v3');
      location.reload();
    }
  });

  // Setup confirm handler
  const newConfirm = confirm.cloneNode(true);
  confirm.parentNode.replaceChild(newConfirm, confirm);

  newConfirm.addEventListener('click', () => {
    const name = document.getElementById('settings-name')?.value;
    const currency = document.getElementById('settings-currency')?.value;

    setState({
      ...getState(),
      settings: { ...getState().settings, userName: name, currency }
    });
    save(getState());

    showToast('Settings saved', 'success');
    closeModal();
  });

  modal.classList.add('open');
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('App initialization failed:', error);
  });
});

// Make navigateTo available globally for nav.js
window.navigateTo = navigateTo;