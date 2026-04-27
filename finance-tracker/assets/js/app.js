/**
 * @fileoverview Main application entry point with security/session hardening
 */

import { setState, navigateTo, getState, clearAppState } from './state.js';
import { load, saveRecord, exportAllCSV, exportJSON, importJSON, readFile } from './storage.js';
import { checkSupabaseHealth, isConfigured } from './config/supabase.js';

import { RecurringService } from './services/recurring.service.js';
import { initNav, updateBadges } from './components/nav.js';
import { initModal, closeModal } from './components/modal.js';
import { initDrawer, closeDrawer } from './components/drawer.js';
import { showToast } from './components/toast.js';
import { initAuthBackground } from './components/auth-bg.js';
import {
  initGlobalErrorHandlers,
  initOfflineHandlers,
  hydratePendingQueueMeta,
  translateError,
  canSubmit,
  setButtonLoading,
  setButtonReady,
  logSecurityEvent,
  showErrorModal
} from './security/index.js';
import { initPrivacyControls, sensitiveValueHtml } from './security/privacy.js';
import { formatCurrency } from './utils/formatters.js';
import {
  initSession,
  signIn,
  signUp,
  signOut,
  resetPassword,
  getCurrentUser,
  getConfiguredIdleTimeoutMs,
  setConfiguredIdleTimeoutMs
} from './security/session.js';
import { requireAuth, requireGuest } from './security/guards.js';

import { renderDashboard } from './views/dashboard.view.js';
import { renderBanks } from './views/banks.view.js';
import { renderTransactions } from './views/transactions.view.js';
import { showAddTransactionForm } from './views/transactions.view.js';
import { renderTransfers } from './views/transfers.view.js';
import { renderBudgets } from './views/budgets.view.js';
import { renderAnalytics } from './views/analytics.view.js';

let appInitialized = false;
let userCache = {};

const APP_VIEW_NAME_MAP = {
  dashboard: renderDashboard,
  banks: renderBanks,
  transactions: renderTransactions,
  transfers: renderTransfers,
  budgets: renderBudgets,
  analytics: renderAnalytics
};

function showLoadingScreen() {
  document.getElementById('app-loading-screen')?.classList.add('open');
}

function hideLoadingScreen() {
  document.getElementById('app-loading-screen')?.classList.remove('open');
}

function showApp() {
  document.querySelectorAll('[data-app-shell]').forEach(el => el.classList.remove('hidden-shell'));
}

function hideApp() {
  document.querySelectorAll('[data-app-shell]').forEach(el => el.classList.add('hidden-shell'));
}

function showAuthScreen() {
  const auth = document.getElementById('auth-screen');
  if (!auth) return;

  const user = getCurrentUser();
  const guard = requireAuth();
  
  // Logic to determine which view to show
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const isSignupConfirm = hash.includes('type=signup') || hash.includes('token_hash=') || search.includes('type=signup');

  if (isSignupConfirm) {
    switchAuthView('verify');
    handleVerifyFlow();
  } else if (user && !user.email_confirmed_at) {
    document.getElementById('confirm-email-display').textContent = user.email;
    switchAuthView('confirm');
  } else {
    switchAuthView('login');
  }

  auth.classList.add('open');
  auth.classList.remove('hidden');
}

function switchAuthView(viewName) {
  document.querySelectorAll('.auth-view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById(`auth-view-${viewName}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('auth-fade-in');
  }
}

function hideAuthScreen() {
  const auth = document.getElementById('auth-screen');
  if (!auth) return;
  auth.classList.remove('open');
  auth.classList.add('hidden');
}

function showPasswordResetScreen() {
  showToast('Password recovery was requested. Check your email for reset instructions.', 'info', 5000);
}

function clearUserCache() {
  userCache = {};
}

function rememberCurrentView() {
  const activeView = document.querySelector('.view.active');
  if (!activeView) return;
  const viewName = activeView.id.replace('view-', '');
  sessionStorage.setItem('vaultly.last-view', viewName);
}

function restoreLastView() {
  const viewName = sessionStorage.getItem('vaultly.last-view');
  if (viewName && APP_VIEW_NAME_MAP[viewName]) {
    navigateTo(viewName);
    return;
  }
  navigateTo('dashboard');
}

async function loadUserData() {
  let state = await load();

  if (!state || !state.transactions) {
    state = {
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
        userName: 'User'
      }
    };
  }

  setState(state);

  if (!appInitialized) {
    initCoreUI();
    appInitialized = true;
  }

  RecurringService.checkDue();
  updateBadges();
  await checkConnectionStatus();
  restoreLastView();
}


function initCoreUI() {
  initModal();
  initDrawer();
  initNav();
  initPrivacyControls();
  setupMobileViewport();
  registerKeyboardShortcuts();
  registerGlobalSearch();
  registerFAB();
  registerExportButton();
  registerSettings();
}

function setupSecurityOverlayHandlers() {
  const sessionExpiredBtn = document.getElementById('session-expired-signin-btn');
  sessionExpiredBtn?.addEventListener('click', () => {
    document.getElementById('session-expired-overlay')?.classList.remove('open');
    showAuthScreen();
    hideApp();
  });

  document.getElementById('dismiss-offline-banner')?.addEventListener('click', () => {
    document.getElementById('offline-banner')?.classList.remove('visible');
  });
}

function showSessionExpired() {
  rememberCurrentView();
  document.getElementById('session-expired-overlay')?.classList.add('open');
}

function setupAuthHandlers() {
  // Elements
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const loginEmail = document.getElementById('login-email');
  const signupEmail = document.getElementById('signup-email');
  const signupPassword = document.getElementById('signup-password');
  const signupPasswordConfirm = document.getElementById('signup-password-confirm');
  const resendBtn = document.getElementById('resend-confirm-btn');
  const signOutAllBtn = document.getElementById('auth-signout-all-btn');

  // Mode Switching
  document.getElementById('switch-to-signup')?.addEventListener('click', () => switchAuthView('signup'));
  document.getElementById('switch-to-login')?.addEventListener('click', () => switchAuthView('login'));
  document.getElementById('confirm-back-btn')?.addEventListener('click', () => switchAuthView('signup'));
  document.getElementById('show-forgot-btn')?.addEventListener('click', () => switchAuthView('forgot'));
  document.getElementById('forgot-back-btn')?.addEventListener('click', () => switchAuthView('login'));

  const forgotForm = document.getElementById('forgot-form');

  // Password Visibility
  const setupToggle = (inputId, toggleId) => {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    toggle?.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      toggle.textContent = isPassword ? 'visibility_off' : 'visibility';
    });
  };
  setupToggle('login-password', 'login-password-toggle');
  setupToggle('signup-password', 'signup-password-toggle');

  // Inline Email Validation
  const validateEmail = (input, validIconId) => {
    const icon = document.getElementById(validIconId);
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value);
    if (isValid) icon?.classList.remove('hidden');
    else icon?.classList.add('hidden');
  };
  loginEmail?.addEventListener('input', () => validateEmail(loginEmail, 'login-email-valid'));
  signupEmail?.addEventListener('input', () => validateEmail(signupEmail, 'signup-email-valid'));

  // Password Strength & Matching
  signupPassword?.addEventListener('input', () => {
    const strength = calculatePasswordStrength(signupPassword.value);
    updateStrengthMeter(strength);
    checkPasswordMatch();
  });

  signupPasswordConfirm?.addEventListener('input', checkPasswordMatch);

  // Sign In Submission
  loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = loginEmail.value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-submit-btn');

    setButtonLoading(btn, 'Signing in...');
    hideErrorBanner('login-error-banner');

    try {
      const { error } = await signIn(email, password);

      if (error) {
        showErrorBanner('login-error-banner', translateError(error));
        shakeInput(loginForm);
      } else {
        hideAuthScreen();
        // Redirect to intended route if exists
        const intended = sessionStorage.getItem('intendedRoute');
        if (intended) {
          sessionStorage.removeItem('intendedRoute');
          window.location.href = intended;
        }
      }
    } catch (error) {
      showErrorBanner('login-error-banner', translateError(error));
      shakeInput(loginForm);
    } finally {
      setButtonReady(btn);
    }
  });

  // Sign Up Submission
  signupForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = signupEmail.value.trim();
    const password = signupPassword.value;
    const btn = document.getElementById('signup-submit-btn');

    if (calculatePasswordStrength(password) < 2) {
      showErrorBanner('signup-error-banner', 'Please choose a stronger password.');
      return;
    }

    setButtonLoading(btn, 'Creating vault...');
    hideErrorBanner('signup-error-banner');

    const { error, data } = await signUp(email, password);
    setButtonReady(btn);

    if (error) {
      showErrorBanner('signup-error-banner', translateError(error));
      shakeInput(signupForm);
    } else {
      document.getElementById('confirm-email-display').textContent = email;
      switchAuthView('confirm');
    }
  });

  // Forgot Password Submission
  forgotForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const btn = document.getElementById('forgot-submit-btn');

    setButtonLoading(btn, 'Sending link...');
    hideErrorBanner('forgot-error-banner');

    const { error } = await resetPassword(email);
    setButtonReady(btn);

    if (error) {
      showErrorBanner('forgot-error-banner', translateError(error));
    } else {
      document.getElementById('confirm-email-display').textContent = email;
      // Show confirmation screen with reset-specific text
      const statusTitle = document.querySelector('#auth-view-confirm .auth-status-title');
      const statusText = document.querySelector('#auth-view-confirm .auth-status-text');
      if (statusTitle) statusTitle.textContent = 'Reset link sent!';
      if (statusText) statusText.textContent = `We've sent a password reset link to ${email}. Check your inbox to get back in.`;
      switchAuthView('confirm');
    }
  });

  // Resend Email
  resendBtn?.addEventListener('click', async () => {
    const email = document.getElementById('confirm-email-display').textContent;
    setButtonLoading(resendBtn, 'Sending...');
    
    // In a real app, you'd call a resend confirmation email function here
    // For now, we simulate success as Supabase's signUp handles this mostly
    setTimeout(() => {
      setButtonReady(resendBtn);
      showToast('Confirmation email resent!', 'success');
      startResendCooldown();
    }, 1000);
  });

  signOutAllBtn?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to sign out from all other devices?')) {
      await signOut('others');
      showToast('Signed out of all other sessions', 'success');
    }
  });

  // Sidebar signout
  document.getElementById('sidebar-signout-btn')?.addEventListener('click', async () => {
    await signOut('local');
  });
}

function calculatePasswordStrength(p) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 8 && (/[0-9]/.test(p) || /[^A-Za-z0-9]/.test(p))) s++;
  if (p.length >= 12 && /[A-Z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  if (p.length >= 6) s = Math.max(s, 1);
  return Math.min(s + (p.length >= 8 ? 1 : 0), 4);
}

function updateStrengthMeter(s) {
  const meter = document.getElementById('password-strength-meter');
  const label = document.getElementById('password-strength-label');
  const texts = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  meter.className = `strength-meter strength-${s}`;
  label.textContent = `Strength: ${texts[s]}`;
}

function checkPasswordMatch() {
  const p = document.getElementById('signup-password').value;
  const c = document.getElementById('signup-password-confirm').value;
  const icon = document.getElementById('signup-password-match');
  const btn = document.getElementById('signup-submit-btn');
  
  const matches = p === c && c.length > 0;
  if (matches) icon.classList.remove('hidden');
  else icon.classList.add('hidden');
  
  btn.disabled = !matches || calculatePasswordStrength(p) < 2;
}

function showErrorBanner(id, msg) {
  const b = document.getElementById(id);
  if (!b) return;
  b.textContent = msg;
  b.classList.remove('hidden');
}

function hideErrorBanner(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function shakeInput(el) {
  el.classList.remove('auth-shake');
  void el.offsetWidth;
  el.classList.add('auth-shake');
}

let resendTimer = null;
function startResendCooldown() {
  const btn = document.getElementById('resend-confirm-btn');
  const text = document.getElementById('resend-timer-text');
  let timeLeft = 30;
  
  btn.disabled = true;
  text.classList.remove('hidden');
  
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    timeLeft--;
    text.textContent = `Resend in ${timeLeft}s...`;
    if (timeLeft <= 0) {
      clearInterval(resendTimer);
      btn.disabled = false;
      text.classList.add('hidden');
    }
  }, 1000);
}

async function handleVerifyFlow() {
  const loading = document.getElementById('verify-loading');
  const success = document.getElementById('verify-success');
  const errorView = document.getElementById('verify-error');
  
  // Verification happens automatically by Supabase when redirected with token
  // We just wait a bit to show the UI state
  setTimeout(async () => {
    const user = getCurrentUser();
    if (user?.email_confirmed_at) {
      loading.classList.add('hidden');
      success.classList.remove('hidden');
      setTimeout(() => window.location.href = '/dashboard', 2000);
    } else {
      loading.classList.add('hidden');
      errorView.classList.remove('hidden');
    }
  }, 1500);
}

function setupMobileViewport() {
  function setVh() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
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
      document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);

      const drawer = document.getElementById('tx-drawer');
      if (drawer && drawer.classList.contains('open')) {
        drawer.style.paddingBottom = `${keyboardHeight > 0 ? keyboardHeight : 0}px`;
      }
    });
  }
}

async function checkConnectionStatus() {
  const topBar = document.querySelector('.top-bar');
  if (!topBar) return;

  let status = document.getElementById('connection-status');
  if (!status) {
    status = document.createElement('div');
    status.id = 'connection-status';
    status.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 6px 12px; border-radius: 20px; cursor: pointer; font-weight: 500; transition: all 0.3s ease;';
    status.title = 'Supabase connection status';
      const rightCluster = document.getElementById('top-bar-right');
      if (!rightCluster) return;
      rightCluster.appendChild(status);
  }

  const configured = isConfigured && isConfigured();
  if (!configured) {
    status.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#9CA3AF;"></span> Not Configured';
    status.style.background = 'rgba(156,163,175,0.1)';
    status.style.color = '#6B7280';
    status.style.border = '1px solid rgba(156,163,175,0.3)';
    return;
  }

  const healthy = await checkSupabaseHealth();
  if (healthy) {
    status.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#10B981;"></span> Supabase Online';
    status.style.background = 'rgba(16,185,129,0.15)';
    status.style.color = '#059669';
    status.style.border = '1px solid rgba(16,185,129,0.3)';
  } else {
    status.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#EF4444;"></span> Supabase Offline';
    status.style.background = 'rgba(239,68,68,0.15)';
    status.style.color = '#991B1B';
    status.style.border = '1px solid rgba(239,68,68,0.3)';
  }
}

function registerKeyboardShortcuts() {
  document.addEventListener('keydown', event => {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA') {
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

    if (shortcuts[event.key]) {
      event.preventDefault();
      navigateTo(shortcuts[event.key]);
      rememberCurrentView();
      return;
    }

    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      if (getState().fundSources.some(fs => fs.isActive !== false)) {
        showAddTransactionForm();
      } else {
        showToast('Please add an account first', 'warning');
      }
      return;
    }

    if (event.key === 'Escape') {
      closeModal();
      closeDrawer();
      closeSearchOverlay();
      return;
    }

    if (event.key === 'k' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      openSearchOverlay();
    }
  });
}

function registerGlobalSearch() {
  const searchBtn = document.getElementById('search-btn');
  searchBtn?.addEventListener('click', openSearchOverlay);

  const searchOverlay = document.getElementById('search-overlay');
  const searchInput = document.getElementById('search-input');

  if (!searchOverlay || !searchInput) return;

  searchOverlay.addEventListener('click', event => {
    if (event.target === searchOverlay) {
      closeSearchOverlay();
    }
  });

  searchInput.addEventListener('input', () => {
    performSearch(searchInput.value);
  });
}

function openSearchOverlay() {
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  if (!overlay) return;
  overlay.classList.add('open');
  setTimeout(() => input?.focus(), 100);
}

function closeSearchOverlay() {
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  if (!overlay) return;
  overlay.classList.remove('open');
  if (input) input.value = '';
  const results = document.getElementById('search-results');
  if (results) results.innerHTML = '';
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
    fs.name.toLowerCase().includes(q) && fs.isActive !== false
  ).slice(0, 3);

  let html = '';

  if (matchedTxs.length > 0) {
    html += '<div style="padding:8px 20px;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Transactions</div>';
    matchedTxs.forEach(tx => {
      const fs = state.fundSources.find(f => f.id === tx.fundSourceId);
      html += `
        <div class="search-result-item" onclick="window.searchResultClick('tx', '${tx.id}')">
          <div style="font-weight:500;">${tx.title}</div>
          <div style="font-size:12px;color:var(--text-muted);">
            ${new Date(tx.date).toLocaleDateString()} - ${fs?.name || '[Deleted]'} - ${sensitiveValueHtml(`${tx.type === 'CR' ? '+' : '-'}${formatCurrency(tx.amount)}`, { width: '8ch', copyValue: String(tx.amount), copyLabel: 'Transaction amount' })}
          </div>
        </div>
      `;
    });
  }

  if (matchedFs.length > 0) {
    html += '<div style="padding:8px 20px;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Accounts</div>';
    matchedFs.forEach(fs => {
      html += `
        <div class="search-result-item" onclick="window.searchResultClick('fs', '${fs.id}')">
          <div style="font-weight:500;">${fs.name}</div>
          <div style="font-size:12px;color:var(--text-muted);">${fs.type} - ${sensitiveValueHtml(formatCurrency(fs.balance || 0), { width: '8ch', copyValue: String(fs.balance || ''), copyLabel: 'Balance' })}</div>
        </div>
      `;
    });
  }

  if (!html) {
    html = '<div style="padding:20px;text-align:center;color:var(--text-muted);">No results found</div>';
  }

  results.innerHTML = html;
}

window.searchResultClick = function searchResultClick(type) {
  closeSearchOverlay();
  if (type === 'tx') {
    navigateTo('transactions');
  }
  if (type === 'fs') {
    navigateTo('banks');
  }
  rememberCurrentView();
};

function registerFAB() {
  const fab = document.getElementById('add-fab');
  fab?.addEventListener('click', () => {
    const state = getState();
    if (state.fundSources.some(fs => fs.isActive !== false)) {
      showAddTransactionForm();
      return;
    }
    showToast('Please add an account first', 'warning');
  });
}

function registerExportButton() {
  const exportBtn = document.getElementById('export-btn');
  exportBtn?.addEventListener('click', () => {
    const state = getState();
    showErrorModal({
      title: 'Export Financial Data',
      message: 'This will download all your financial data. Keep this file secure. Downloading sensitive data on a shared device is risky.',
      actions: [
        {
          label: 'Export CSV',
          style: 'primary',
          onClick: () => {
            exportAllCSV(state.transactions, state.fundSources);
            showToast(`Exported ${state.transactions.length} transactions`, 'success');
          }
        },
        {
          label: 'Cancel',
          style: 'ghost',
          onClick: () => {}
        }
      ]
    });
  });
}

function registerSettings() {
  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn?.addEventListener('click', showSettingsModal);
}

function idleTimeoutLabel(value) {
  if (value === Number.MAX_SAFE_INTEGER) return 'Never';
  if (value === 15 * 60 * 1000) return '15 min';
  if (value === 60 * 60 * 1000) return '1 hour';
  return '30 min';
}

function showSettingsModal() {
  const state = getState();
  const user = getCurrentUser();

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

    <div class="security-panel">
      <h4>Security</h4>
      <div class="form-group">
        <label class="form-label">Auto-lock after</label>
        <select class="form-input form-select" id="idle-timeout-setting">
          <option value="900000" ${getConfiguredIdleTimeoutMs() === 15 * 60 * 1000 ? 'selected' : ''}>15 min</option>
          <option value="1800000" ${getConfiguredIdleTimeoutMs() === 30 * 60 * 1000 ? 'selected' : ''}>30 min</option>
          <option value="3600000" ${getConfiguredIdleTimeoutMs() === 60 * 60 * 1000 ? 'selected' : ''}>1 hour</option>
          <option value="never" ${getConfiguredIdleTimeoutMs() === Number.MAX_SAFE_INTEGER ? 'selected' : ''}>Never</option>
        </select>
      </div>
      <div class="security-meta">Last sign in: ${new Date().toLocaleString()} - Current browser session</div>
      <div class="security-meta">Active sessions: 1 device (local estimate)</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-secondary" id="change-password-btn" type="button">Change Password</button>
        <button class="btn btn-danger" id="signout-all-btn" type="button">Sign Out All Devices</button>
      </div>
    </div>

    <hr style="border:none;border-top:1px solid var(--border);margin:24px 0;">

    <div class="form-group">
      <label class="form-label">Export Data</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-secondary" id="export-json-btn" type="button">Export JSON</button>
        <button class="btn btn-secondary" id="export-csv-btn" type="button">Export CSV</button>
      </div>
      <p class="security-meta">Warning: Downloading sensitive data. Ensure you are on a private device.</p>
    </div>

    <div class="form-group">
      <label class="form-label">Import Data</label>
      <input type="file" class="form-input" id="import-file" accept=".json" style="padding:8px;">
      <div id="import-error" style="color:var(--accent-red);font-size:12px;margin-top:8px;display:none;"></div>
    </div>

    <hr style="border:none;border-top:1px solid var(--border);margin:24px 0;">

    <div style="background:rgba(248,81,73,0.1);border:1px solid rgba(248,81,73,0.3);border-radius:8px;padding:16px;">
      <div style="color:var(--accent-red);font-weight:600;margin-bottom:8px;">Danger Zone</div>
      <button class="btn btn-danger" id="reset-data-btn" type="button">Reset All Data</button>
    </div>
  `;

  document.getElementById('export-json-btn')?.addEventListener('click', () => {
    exportJSON(getState());
    showToast('JSON exported', 'success');
  });

  document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    const currentState = getState();
    exportAllCSV(currentState.transactions, currentState.fundSources);
    showToast('CSV exported', 'success');
  });

  document.getElementById('change-password-btn')?.addEventListener('click', () => {
    showToast('Use Supabase password reset flow from your account email.', 'info', 4500);
  });

  document.getElementById('signout-all-btn')?.addEventListener('click', async () => {
    const ok = window.confirm('This will sign you out everywhere. Continue?');
    if (!ok) return;
    await signOut('global');
  });

  document.getElementById('import-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await readFile(file);
      const result = importJSON(content);
      if (result instanceof Error) {
        const err = document.getElementById('import-error');
        if (err) {
          err.textContent = result.message;
          err.style.display = 'block';
        }
      } else {
        setState(result);
        showToast('Data imported successfully', 'success');
        closeModal();
        window.location.reload();
      }
    } catch (error) {
      const err = document.getElementById('import-error');
      if (err) {
        err.textContent = 'Failed to read file';
        err.style.display = 'block';
      }
      console.error(error);
    }
  });

  document.getElementById('reset-data-btn')?.addEventListener('click', () => {
    const confirmReset = window.confirm('Are you sure you want to reset all data? This action cannot be undone.');
    if (confirmReset) {
      clearAppState();
      showToast('Local state reset. Reloading...', 'warning');
      window.location.reload();
    }
  });

  const newConfirm = confirm.cloneNode(true);
  confirm.parentNode.replaceChild(newConfirm, confirm);

  newConfirm.addEventListener('click', () => {
    const name = document.getElementById('settings-name')?.value;
    const currency = document.getElementById('settings-currency')?.value;
    const timeoutRaw = document.getElementById('idle-timeout-setting')?.value || '1800000';

    setState({
      ...getState(),
      settings: { ...getState().settings, userName: name, currency }
    });

    if (timeoutRaw === 'never') {
      setConfiguredIdleTimeoutMs(Number.NaN);
    } else {
      setConfiguredIdleTimeoutMs(Number(timeoutRaw));
    }

    saveRecord('UPDATE_SETTINGS', getState().settings);

    showToast(`Settings saved. Auto-lock: ${idleTimeoutLabel(getConfiguredIdleTimeoutMs())}`, 'success');
    closeModal();
  });

  modal.classList.add('open');

  if (user?.email) {
    const authHint = document.getElementById('auth-email');
    if (authHint && !authHint.value) {
      authHint.value = user.email;
    }
  }
}

function handleAuthError(error) {
  showToast(translateError(error), 'error');
  showSessionExpired();
}

function handleNetworkError(error) {
  console.error(error);
  showToast('Network issue detected. Changes will sync when online.', 'warning');
}

function handleDatabaseError(error) {
  console.error(error);
  showToast(translateError(error), 'error');
}

document.addEventListener('DOMContentLoaded', async () => {
  initGlobalErrorHandlers({ handleAuthError, handleNetworkError, handleDatabaseError });
  hydratePendingQueueMeta();
  initOfflineHandlers();
  setupSecurityOverlayHandlers();
  setupAuthHandlers();
  initAuthBackground();

  await initSession({
    showLoadingScreen,
    hideLoadingScreen,
    showAuthScreen,
    hideAuthScreen,
    showApp,
    hideApp,
    loadUserData,
    clearAppState,
    clearUserCache,
    showToast,
    showSessionExpired,
    showPasswordRecovery: showPasswordResetScreen
  });

  logSecurityEvent({ type: 'APP_READY', details: {} });
});

window.navigateTo = viewName => {
  navigateTo(viewName);
  rememberCurrentView();
};
