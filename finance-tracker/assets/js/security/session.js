/**
 * @fileoverview Session lifecycle and inactivity lock management
 */

import { db } from '../config/supabase.js';
import {
  canAttemptAuth,
  recordFailedAuthAttempt,
  resetAuthAttempts,
  logSecurityEvent,
  translateError,
  setButtonLoading,
  setButtonReady
} from './index.js';
import { showToast } from '../components/toast.js';
import { requireAuth } from './guards.js';
import { setForcedPrivacyBlur } from './privacy.js';

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_TIMEOUT_KEY = 'vaultly.idle-timeout-ms';
const SESSION_CHECK_INTERVAL_MS = 240000;
const IDLE_WARNING_GRACE_MS = 60 * 1000;
const IDLE_LOGOUT_AFTER_LOCK_MS = 5 * 60 * 1000;

let currentUser = null;
let idleTimer = null;
let isLocked = false;
let lockAttempts = 0;
let lastViewBeforeLock = 'dashboard';
let authSubscription = null;
let idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS;
let lastActivityTime = 0;
let sessionCheckInterval = null;
let warningTimer = null;
let lockTimer = null;
let logoutTimer = null;
let activityDebounceTimer = null;

function getSessionStorageKeys() {
  const projectRef = (db?.supabaseUrl || '').split('//')[1]?.split('.')[0];
  return {
    legacyKey: 'supabase.auth.token',
    sdkKey: projectRef ? `sb-${projectRef}-auth-token` : null
  };
}

export function getCurrentUser() {
  return currentUser;
}

export function getConfiguredIdleTimeoutMs() {
  return idleTimeoutMs;
}

export function setConfiguredIdleTimeoutMs(value) {
  if (typeof value !== 'number' || value <= 0) {
    idleTimeoutMs = Number.MAX_SAFE_INTEGER;
    localStorage.setItem(IDLE_TIMEOUT_KEY, 'never');
    return;
  }
  idleTimeoutMs = value;
  localStorage.setItem(IDLE_TIMEOUT_KEY, String(value));
  resetIdleTimer();
}

function loadIdleTimeoutSetting() {
  const saved = localStorage.getItem(IDLE_TIMEOUT_KEY);
  if (saved === 'never') {
    idleTimeoutMs = Number.MAX_SAFE_INTEGER;
    return;
  }
  const parsed = Number(saved);
  idleTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IDLE_TIMEOUT_MS;
}

export async function initSession({
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
  showPasswordRecovery
}) {
  try {
    if (!db) {
      showAuthScreen('Supabase configuration missing. Add VITE_SUPABASE_URL and key.');
      return;
    }

    loadIdleTimeoutSetting();
    showLoadingScreen();

    const { data: { session }, error } = await db.auth.getSession();
    if (error) throw error;

    // Detect Email Confirmation Token in URL
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const isSignupConfirm = hash.includes('type=signup') || hash.includes('token_hash=') || search.includes('type=signup');

    if (isSignupConfirm) {
      currentUser = session?.user || null;
      showAuthScreen(); // This will trigger the verification view in app.js
      hideApp();
      return;
    }

    if (session) {
      currentUser = session.user;
      
      const guard = requireAuth();
      if (guard.shouldRedirect) {
        showAuthScreen(); 
        hideApp();
      } else {
        await loadUserData();
        hideAuthScreen();
        showApp();
        resetIdleTimer(true);
      }
    } else {
      showAuthScreen();
      hideApp();
    }

    setupStorageSync({ showAuthScreen, showApp, hideApp, clearAppState, showToast });
    setupIdleTracking({ showApp, showAuthScreen, hideApp, showToast, showSessionExpired, clearAppState, clearUserCache });
    setupAuthListener({
      showAuthScreen,
      hideAuthScreen,
      showApp,
      hideApp,
      loadUserData,
      clearAppState,
      clearUserCache,
      showToast,
      showSessionExpired,
      showPasswordRecovery
    });
  } catch (err) {
    handleSessionError(err, { showAuthScreen, hideApp, showToast });
  } finally {
    hideLoadingScreen();
  }
}

function handleSessionError(err, { showAuthScreen, hideApp, showToast }) {
  console.error('Session init failed:', err);
  showToast(translateError(err), 'error');
  showAuthScreen();
  hideApp();
}



function handleSessionExpired({ showSessionExpired, clearAppState, clearUserCache, showToast }) {
  clearAppState();
  clearUserCache();
  logSecurityEvent({ type: 'SESSION_EXPIRED', details: {} });
  showToast('Session expired. Please sign in again.', 'warning');
  showSessionExpired(lastViewBeforeLock);
}

function setupAuthListener({ showAuthScreen, hideAuthScreen, showApp, hideApp, loadUserData, clearAppState, clearUserCache, showToast, showSessionExpired, showPasswordRecovery }) {
  if (!db) return;
  if (authSubscription) {
    authSubscription.subscription?.unsubscribe();
  }

  authSubscription = db.auth.onAuthStateChange(async (event, session) => {
    switch (event) {
      case 'SIGNED_IN':
        currentUser = session?.user || null;
        await loadUserData();
        hideAuthScreen();
        showApp();
        resetIdleTimer(true);
        resetAuthAttempts();
        logSecurityEvent({ type: 'LOGIN_SUCCESS', details: { email: currentUser?.email } });
        break;
      case 'SIGNED_OUT':
        clearSessionCheckInterval();
        currentUser = null;
        clearAppState();
        clearUserCache();
        showAuthScreen();
        hideApp();
        logSecurityEvent({ type: 'LOGOUT', details: {} });
        break;
      case 'TOKEN_REFRESHED':
        currentUser = session?.user || null;
        break;
      case 'USER_UPDATED':
        currentUser = session?.user || null;
        showToast('Profile updated successfully', 'success');
        break;
      case 'PASSWORD_RECOVERY':
        showPasswordRecovery?.();
        break;
      case 'MFA_CHALLENGE_VERIFIED':
        break;
      default:
        break;
    }
  });

  startPeriodicSessionCheck({ showSessionExpired });
}

function clearSessionCheckInterval() {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
}

function isSessionExpired(session) {
  const now = Math.floor(Date.now() / 1000);
  return !session?.expires_at || session.expires_at < now;
}

function startPeriodicSessionCheck({ showSessionExpired }) {
  clearSessionCheckInterval();

  sessionCheckInterval = setInterval(async () => {
    if (!db || !currentUser) return;

    try {
      const { data: { session } } = await db.auth.getSession();
      if (!session || isSessionExpired(session)) {
        showSessionExpired(lastViewBeforeLock);
        await signOut('local');
      }
    } catch (error) {
      console.error('Periodic session check failed:', error);
      showSessionExpired(lastViewBeforeLock);
      await signOut('local');
    }
  }, SESSION_CHECK_INTERVAL_MS);
}

function setupStorageSync({ showAuthScreen, showApp, hideApp, clearAppState, showToast }) {
  const keys = getSessionStorageKeys();

  window.addEventListener('storage', event => {
    const authKeyTouched = event.key === keys.legacyKey || event.key === keys.sdkKey;
    if (!authKeyTouched) return;

    if (!event.newValue) {
      clearAppState();
      showAuthScreen();
      hideApp();
      showToast('Signed out from another tab', 'info');
    } else if (!currentUser) {
      window.location.reload();
    }
  });
}

function setupIdleTracking(context) {
  const debouncedActivityHandler = () => {
    clearTimeout(activityDebounceTimer);
    activityDebounceTimer = setTimeout(() => {
      handleUserActivity();
    }, 180);
  };

  const events = ['mousemove', 'mousedown', 'click', 'keypress', 'touchstart'];
  events.forEach(evt => {
    document.addEventListener(evt, debouncedActivityHandler, { passive: true });
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && db && currentUser) {
      const { data: { session } } = await db.auth.getSession();
      if (!session) {
        handleSessionExpired(context);
      } else {
        setForcedPrivacyBlur(false);
        resetIdleTimer(true);
      }
    }
  });

  const unlockBtn = document.getElementById('lock-unlock-btn');
  const signOutBtn = document.getElementById('lock-signout-btn');
  const lockInput = document.getElementById('lock-secret-input');

  unlockBtn?.addEventListener('click', async () => {
    const secret = lockInput?.value || '';
    await unlockApp(secret, context);
  });

  lockInput?.addEventListener('keydown', async event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await unlockApp(lockInput.value || '', context);
    }
  });

  signOutBtn?.addEventListener('click', async () => {
    await db?.auth.signOut();
  });

  resetIdleTimer();
}

function resetIdleTimer(force = false) {
  if (isLocked || idleTimeoutMs === Number.MAX_SAFE_INTEGER) return;
  
  const now = Date.now();
  if (!force && now - lastActivityTime < 700) return;
  lastActivityTime = now;

  clearInactivityStageTimers();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => onInactivityWarning(), idleTimeoutMs);
}

function clearInactivityStageTimers() {
  clearTimeout(warningTimer);
  clearTimeout(lockTimer);
  clearTimeout(logoutTimer);
  warningTimer = null;
  lockTimer = null;
  logoutTimer = null;
}

function handleUserActivity() {
  if (!currentUser || isLocked) return;

  setForcedPrivacyBlur(false);
  resetIdleTimer();
}

function onInactivityWarning() {
  if (!currentUser || isLocked) return;

  setForcedPrivacyBlur(true);
  warningTimer = null;
  showToast('Session idle: sensitive values are blurred. Activity will keep you signed in.', 'warning', 3200);

  clearTimeout(lockTimer);
  lockTimer = setTimeout(() => {
    lockApp();
  }, IDLE_WARNING_GRACE_MS);

  clearTimeout(logoutTimer);
  logoutTimer = setTimeout(() => {
    onInactivityLogout();
  }, IDLE_WARNING_GRACE_MS + IDLE_LOGOUT_AFTER_LOCK_MS);
}

async function onInactivityLogout() {
  if (!currentUser) return;
  showToast('Signed out after extended inactivity.', 'warning', 3000);
  await signOut('local');
}

function lockApp() {
  if (!currentUser || isLocked) return;

  const activeView = document.querySelector('.view.active');
  lastViewBeforeLock = activeView?.id?.replace('view-', '') || 'dashboard';
  isLocked = true;
  lockAttempts = 0;
  setForcedPrivacyBlur(true);

  const lock = document.getElementById('lock-screen');
  if (lock) {
    lock.classList.add('open');
    const input = document.getElementById('lock-secret-input');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 80);
    }
  }

  logSecurityEvent({ type: 'APP_LOCKED', details: { reason: 'idle' } });
}

async function unlockApp(passwordOrPin, { showToast }) {
  if (!currentUser) return;
  if (!canAttemptAuth(showToast)) return;

  const unlockBtn = document.getElementById('lock-unlock-btn');
  setButtonLoading(unlockBtn, 'Unlocking...');

  try {
    const { error } = await db.auth.signInWithPassword({
      email: currentUser.email,
      password: passwordOrPin
    });

    if (error) {
      lockAttempts += 1;
      recordFailedAuthAttempt(showToast);
      showLockError('Incorrect password');
      shakeLockInput();
      if (lockAttempts >= 3) {
        await db.auth.signOut();
      }
      return;
    }

    isLocked = false;
    lockAttempts = 0;
    resetAuthAttempts();
    hideLockScreen();
    setForcedPrivacyBlur(false);
    resetIdleTimer();
    showToast('Welcome back!', 'success');
    logSecurityEvent({ type: 'APP_UNLOCKED', details: {} });
  } finally {
    setButtonReady(unlockBtn);
  }
}

function hideLockScreen() {
  const lock = document.getElementById('lock-screen');
  if (lock) {
    lock.classList.remove('open');
  }
  const errorEl = document.getElementById('lock-error');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
  }
}

function showLockError(message) {
  const errorEl = document.getElementById('lock-error');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.add('visible');
}

function shakeLockInput() {
  const input = document.getElementById('lock-secret-input');
  if (!input) return;
  input.classList.remove('shake');
  // Trigger reflow so animation restarts.
  // eslint-disable-next-line no-unused-expressions
  input.offsetWidth;
  input.classList.add('shake');
}

export async function signIn(email, password) {
  if (!db) {
    return { error: new Error('Supabase is not configured.') };
  }
  if (!canAttemptAuth()) {
    return { error: new Error('Authentication temporarily locked.') };
  }

  let result;
  try {
    // session scope controlled at client level via sessionStorage
    result = await Promise.race([
      db.auth.signInWithPassword({
        email,
        password
      }),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Sign in timed out. Check your internet connection and try again.'));
        }, 12000);
      })
    ]);
  } catch (error) {
    logSecurityEvent({ type: 'LOGIN_FAILED', details: { reason: error?.message || 'Sign in threw unexpectedly' } });
    recordFailedAuthAttempt();
    return { error };
  }

  if (result.error) {
    logSecurityEvent({ type: 'LOGIN_FAILED', details: { reason: result.error.message } });
    recordFailedAuthAttempt();
  } else {
    resetAuthAttempts();
    logSecurityEvent({ type: 'LOGIN_SUCCESS', details: { email } });
  }
  return result;
}

export async function signUp(email, password) {
  if (!db) {
    return { error: new Error('Supabase is not configured.') };
  }
  if (!canAttemptAuth()) {
    return { error: new Error('Authentication temporarily locked.') };
  }

  const result = await db.auth.signUp({ email, password });
  if (result.error) {
    logSecurityEvent({ type: 'SIGNUP_FAILED', details: { reason: result.error.message } });
    recordFailedAuthAttempt();
  } else {
    resetAuthAttempts();
    logSecurityEvent({ type: 'SIGNUP_SUCCESS', details: { email } });
  }
  return result;
}

export async function signOut(scope = 'local') {
  let remoteSignOutFailed = false;

  try {
    if (db) {
      await db.auth.signOut({ scope });
    }
  } catch (error) {
    remoteSignOutFailed = true;
    console.error('Sign out error:', error);
  }

  clearLocalSession();

  if (remoteSignOutFailed) {
    showToast('Sign out may be incomplete — please close your browser', 'warning');
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
    return;
  }

  window.location.href = '/';
}

export function clearLocalSession() {
  const keys = getSessionStorageKeys();

  if (keys.legacyKey) {
    sessionStorage.removeItem(keys.legacyKey);
  }

  if (keys.sdkKey) {
    sessionStorage.removeItem(keys.sdkKey);
    sessionStorage.removeItem(`${keys.sdkKey}-code-verifier`);
    sessionStorage.removeItem(`${keys.sdkKey}-user`);
  }

  currentUser = null;
  isLocked = false;
  lockAttempts = 0;
  lastActivityTime = 0;

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  clearInactivityStageTimers();
  if (activityDebounceTimer) {
    clearTimeout(activityDebounceTimer);
    activityDebounceTimer = null;
  }

  setForcedPrivacyBlur(false);

  clearSessionCheckInterval();
}

export async function resetPassword(email) {
  if (!db) return { error: new Error('Supabase not configured') };
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/#type=recovery`
  });
  return { error };
}
