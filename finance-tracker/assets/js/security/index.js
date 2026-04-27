/**
 * @fileoverview Security, validation, error handling, and resiliency helpers
 */

import { CATEGORIES, CURRENCIES, FUND_SOURCE_TYPES } from '../data/seed.js';
import { showToast } from '../components/toast.js';

const CATEGORY_IDS = CATEGORIES.map(c => c.id);
const CURRENCY_CODES = CURRENCIES.map(c => c.code);
const FUND_SOURCE_TYPES_IDS = FUND_SOURCE_TYPES.map(t => t.id);

const MAX_SECURITY_LOG_SIZE = 100;
const securityLog = [];
const submissionTracker = {};

const AUTH_ATTEMPT_LIMIT = 5;
const AUTH_LOCKOUT_MS = 15 * 60 * 1000;
let authAttempts = 0;
let authLockoutUntil = 0;

let isOnline = navigator.onLine;
let pendingQueue = [];
const PENDING_QUEUE_KEY = 'vaultly.pending.queue';

export const ERROR_MESSAGES = {
  'Invalid login credentials': 'Wrong email or password. Please try again.',
  'Email not confirmed': 'Please check your email and click the confirmation link.',
  'User already registered': 'An account with this email already exists. Try signing in.',
  'Password should be at least 6 characters': 'Password must be at least 8 characters long.',
  'Too many requests': 'Too many attempts. Please wait 60 seconds and try again.',
  'Email rate limit exceeded': 'Too many emails sent. Please wait before requesting another.',
  'Invalid email': 'Please enter a valid email address.',
  'Signup requires a valid password': 'Please enter a valid password.',
  'JWT expired': 'Your session has expired. Please sign in again.',
  'refresh_token_not_found': 'Session not found. Please sign in again.',
  PGRST301: 'Authentication required. Please sign in.',
  PGRST116: 'Record not found.',
  '23505': 'This record already exists.',
  '23503': 'Cannot delete - this record is referenced elsewhere.',
  '22P02': 'Invalid data format. Please check your inputs.',
  'Failed to fetch': 'Connection error. Please check your internet connection.',
  NetworkError: 'Network unavailable. Working in offline mode.',
  default: 'Something went wrong. Please try again.'
};

export const VALIDATORS = {
  transaction: {
    title: v => (typeof v === 'string' && v.length >= 2 && v.length <= 80) || 'Title must be 2-80 characters',
    amount: v => (Number.isFinite(v) && v > 0 && v <= 99999999) || 'Amount must be between 0 and 99,999,999',
    type: v => ['CR', 'DR'].includes(v) || 'Type must be CR or DR',
    category: v => CATEGORY_IDS.includes(v) || 'Invalid category selected',
    fundSourceId: v => Boolean(v) || 'Please select a fund source',
    date: v => {
      const dt = new Date(v);
      const maxFuture = Date.now() + 86400000 * 730;
      return (!Number.isNaN(dt.getTime()) && dt.getTime() <= maxFuture) || 'Invalid date';
    }
  },
  fundSource: {
    name: v => (typeof v === 'string' && v.length >= 2 && v.length <= 60) || 'Name must be 2-60 characters',
    type: v => FUND_SOURCE_TYPES_IDS.includes(v) || 'Invalid account type',
    currency: v => CURRENCY_CODES.includes(v) || 'Invalid currency',
    initialBalance: v => (Number.isFinite(v) && v >= 0) || 'Balance must be 0 or greater'
  },
  budget: {
    category: v => CATEGORY_IDS.includes(v) || 'Invalid category',
    limit: v => (Number.isFinite(v) && v > 0) || 'Limit must be greater than 0',
    period: v => ['weekly', 'monthly'].includes(v) || 'Invalid period'
  },
  profile: {
    fullName: v => (typeof v === 'string' && v.length >= 2 && v.length <= 60) || 'Name must be 2-60 characters',
    currency: v => CURRENCY_CODES.includes(v) || 'Invalid currency'
  }
};

export function logSecurityEvent(event) {
  securityLog.push({
    type: event.type,
    timestamp: new Date().toISOString(),
    details: event.details || {},
    userAgent: navigator.userAgent,
    url: window.location.href
  });
  if (securityLog.length > MAX_SECURITY_LOG_SIZE) {
    securityLog.shift();
  }
}

export function getSecurityLog() {
  return [...securityLog];
}

export function logError(event) {
  logSecurityEvent({
    type: 'APP_ERROR',
    details: {
      errorType: event.type,
      message: event.message,
      code: event.code || null,
      stack: event.stack || null
    }
  });
}

export function isAuthError(error) {
  const msg = error?.message || '';
  return error?.status === 401 || msg.includes('JWT') || msg.includes('session') || error?.code === 'PGRST301';
}

export function isNetworkError(error) {
  const msg = error?.message || '';
  return !navigator.onLine || error instanceof TypeError || msg.includes('fetch') || msg.includes('network');
}

export function isDatabaseError(error) {
  const code = String(error?.code || '');
  return code.startsWith('PGRST') || code.startsWith('22') || code.startsWith('23');
}

export function isRateLimitError(error) {
  const msg = error?.message || '';
  return error?.status === 429 || msg.includes('rate limit') || msg.includes('too many requests');
}

export function translateError(error) {
  const message = error?.message || error?.error_description || String(error || '');
  for (const [key, friendly] of Object.entries(ERROR_MESSAGES)) {
    if (key !== 'default' && message.includes(key)) {
      return friendly;
    }
  }
  return ERROR_MESSAGES.default;
}

export function initGlobalErrorHandlers(handlers = {}) {
  window.addEventListener('error', event => {
    console.error('Global error:', event.error);
    logError({
      type: 'uncaught_error',
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      stack: event.error?.stack
    });
    showToast('Something went wrong. Please refresh.', 'error');
  });

  window.addEventListener('unhandledrejection', event => {
    console.error('Unhandled rejection:', event.reason);
    logError({
      type: 'unhandled_promise',
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack
    });
    event.preventDefault();
    handleUnhandledError(event.reason, handlers);
  });
}

export function handleUnhandledError(error, handlers = {}) {
  if (isAuthError(error)) {
    handlers.handleAuthError?.(error);
    return;
  }
  if (isNetworkError(error)) {
    handlers.handleNetworkError?.(error);
    return;
  }
  if (isDatabaseError(error)) {
    handlers.handleDatabaseError?.(error);
    return;
  }
  showToast('Unexpected error. Your data is safe.', 'error');
}

export function showFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  if (!input) return;

  clearFieldError(fieldId);
  input.classList.add('error');

  const err = document.createElement('div');
  err.className = 'form-error inline-field-error';
  err.dataset.fieldError = fieldId;
  err.textContent = message;
  input.insertAdjacentElement('afterend', err);

  input.addEventListener('input', () => clearFieldError(fieldId), { once: true });
}

export function clearFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  if (input) {
    input.classList.remove('error');
  }
  const errorEl = document.querySelector(`[data-field-error="${fieldId}"]`);
  if (errorEl) {
    errorEl.remove();
  }
}

export function displayFormErrors(errors) {
  Object.entries(errors).forEach(([field, message]) => {
    showFieldError(field, message);
  });
}

export function showErrorModal({ title, message, actions = [] }) {
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const cancelBtn = document.getElementById('modal-cancel');
  const confirmBtn = document.getElementById('modal-confirm');

  if (!overlay || !titleEl || !bodyEl || !cancelBtn || !confirmBtn) {
    showToast(message, 'error');
    return;
  }

  titleEl.textContent = title;
  bodyEl.innerHTML = `<p style="line-height:1.6;">${message}</p>`;

  const primary = actions[0] || { label: 'Dismiss', onClick: () => overlay.classList.remove('open') };
  const secondary = actions[1] || { label: 'Dismiss', onClick: () => overlay.classList.remove('open') };

  confirmBtn.textContent = primary.label;
  cancelBtn.textContent = secondary.label;
  confirmBtn.classList.toggle('btn-primary', primary.style !== 'ghost');
  confirmBtn.classList.toggle('btn-secondary', primary.style === 'ghost');

  confirmBtn.onclick = () => {
    primary.onClick?.();
    overlay.classList.remove('open');
  };
  cancelBtn.onclick = () => {
    secondary.onClick?.();
    overlay.classList.remove('open');
  };

  overlay.classList.add('open');
}

export function sanitizeText(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .slice(0, 500);
}

export function sanitizeFormData(data) {
  const clean = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    if (typeof value === 'string') {
      clean[key] = sanitizeText(value);
    } else if (typeof value === 'number') {
      clean[key] = Number.isFinite(value) ? value : 0;
    } else if (value instanceof Date) {
      clean[key] = value.toISOString();
    } else {
      clean[key] = value;
    }
  });
  return clean;
}

export function sanitizeAccountNumber(number) {
  return String(number || '').replace(/\D/g, '').slice(0, 24);
}

export function maskAccountNumber(number) {
  if (!number) return '';
  const str = String(number).replace(/\D/g, '');
  if (!str) return '';
  if (str.length <= 4) return str;
  return `•••• ${str.slice(-4)}`;
}

export function validate(schema, data) {
  const errors = {};
  Object.entries(schema).forEach(([field, validator]) => {
    if (data[field] !== undefined) {
      const result = validator(data[field]);
      if (result !== true) {
        errors[field] = result;
      }
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

export function canSubmit(formId, limitMs = 1000) {
  const last = submissionTracker[formId] || 0;
  const now = Date.now();
  if (now - last < limitMs) {
    showToast('Slow down! Please wait a moment.', 'warning');
    return false;
  }
  submissionTracker[formId] = now;
  return true;
}

export function canAttemptAuth(showAuthError = showToast) {
  if (Date.now() < authLockoutUntil) {
    const remaining = Math.ceil((authLockoutUntil - Date.now()) / 60000);
    showAuthError(`Too many failed attempts. Try again in ${remaining} minutes.`, 'error');
    return false;
  }
  return true;
}

export function recordFailedAuthAttempt(showAuthError = showToast) {
  authAttempts += 1;
  if (authAttempts >= 3) {
    logSecurityEvent({ type: 'MULTIPLE_FAILED_LOGINS', details: { count: authAttempts } });
  }
  if (authAttempts >= AUTH_ATTEMPT_LIMIT) {
    authLockoutUntil = Date.now() + AUTH_LOCKOUT_MS;
    authAttempts = 0;
    logSecurityEvent({ type: 'AUTH_LOCKOUT', details: { attempts: AUTH_ATTEMPT_LIMIT } });
    showAuthError('Account temporarily locked after 5 failed attempts. Try again in 15 minutes.', 'error');
  }
}

export function resetAuthAttempts() {
  authAttempts = 0;
  authLockoutUntil = 0;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry(fn, maxRetries = 3, delay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isAuthError(error) || error?.status === 400) {
        throw error;
      }

      if (attempt < maxRetries) {
        await sleep(delay * Math.pow(2, attempt - 1));
        showToast(`Retrying... (${attempt}/${maxRetries})`, 'info', 1800);
      }
    }
  }
  throw lastError;
}

export function setButtonLoading(btn, loadingText) {
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.dataset.originalText = btn.textContent;
  btn.innerHTML = `<span class="spinner"></span> ${loadingText}`;
}

export function setButtonReady(btn) {
  if (!btn) return;
  btn.disabled = false;
  if (btn.dataset.originalText) {
    btn.textContent = btn.dataset.originalText;
  }
}

function saveQueueToLocalStorage() {
  try {
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(pendingQueue.map(item => ({
      id: item.id,
      timestamp: item.timestamp,
      meta: item.meta || null
    }))));
  } catch {
    // Ignore quota/storage errors.
  }
}

export function hydratePendingQueueMeta() {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      pendingQueue = parsed.map(item => ({
        id: item.id,
        timestamp: item.timestamp,
        meta: item.meta,
        operation: null
      }));
    }
  } catch {
    pendingQueue = [];
  }
}

export function queueOperation(operation, meta = null) {
  pendingQueue.push({
    operation,
    timestamp: Date.now(),
    id: crypto.randomUUID(),
    meta
  });
  saveQueueToLocalStorage();
  showToast('Saved locally. Will sync when online.', 'warning');
}

export async function processPendingQueue() {
  if (pendingQueue.length === 0) return;

  showToast(`Syncing ${pendingQueue.length} pending changes...`, 'info');
  const failed = [];

  for (const item of pendingQueue) {
    if (typeof item.operation !== 'function') {
      failed.push(item);
      continue;
    }
    try {
      await item.operation();
    } catch {
      failed.push(item);
    }
  }

  pendingQueue = failed;
  saveQueueToLocalStorage();

  if (failed.length === 0) {
    showToast('All changes synced!', 'success');
  } else {
    showToast(`${failed.length} changes failed to sync`, 'error');
  }
}

export function initOfflineHandlers() {
  window.addEventListener('online', async () => {
    isOnline = true;
    hideOfflineBanner();
    showToast('Back online! Syncing...', 'success');
    await processPendingQueue();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    showOfflineBanner();
  });

  if (!isOnline) {
    showOfflineBanner();
  }
}

export async function runOnlineAware(operation, meta = null) {
  if (!navigator.onLine) {
    queueOperation(operation, meta);
    return null;
  }
  return operation();
}

export function showOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  banner.classList.add('visible');
}

export function hideOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  banner.classList.remove('visible');
}

export function detectRapidEntries(transactions = []) {
  const now = Date.now();
  const recentTx = transactions.filter(tx => {
    const created = new Date(tx.createdAt || tx.created_at || tx.date).getTime();
    return now - created < 60000;
  });
  if (recentTx.length > 20) {
    logSecurityEvent({ type: 'RAPID_ENTRY_DETECTED', details: { count: recentTx.length } });
  }
}
