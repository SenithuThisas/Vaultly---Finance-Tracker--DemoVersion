/**
 * @fileoverview Auth module — session management, login/register/reset, profile
 */

import {
  supabase, signUp, signIn, signInWithGoogle,
  signOut, resetPassword, updatePassword, getSession, getCurrentUser, SUPABASE_URL
} from './config/supabase.js';

let _onAuthReady = null; // callback when user is authenticated
let _authReadyInFlight = null;
let _authReadyUserId = null;
let _authReadyCompletedUserId = null;

async function runAuthReadyOnce(user, reason) {
  if (!user?.id) return;

  if (_authReadyCompletedUserId === user.id) {
    console.log(`[Auth] Skipping duplicate auth bootstrap for ${reason}`);
    return;
  }

  if (_authReadyInFlight && _authReadyUserId === user.id) {
    console.log(`[Auth] Reusing in-flight auth bootstrap for ${reason}`);
    return _authReadyInFlight;
  }

  _authReadyUserId = user.id;
  _authReadyInFlight = (async () => {
    await _onAuthReady(user);
  })();

  try {
    await _authReadyInFlight;
    _authReadyCompletedUserId = user.id;
  } finally {
    _authReadyInFlight = null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise auth. Checks existing session, sets up listeners.
 * @param {Function} onAuthenticated - called with user when auth is ready
 */
export async function initAuth(onAuthenticated) {
  _onAuthReady = onAuthenticated;

  // Wire up form events
  wireAuthForms();

  // Listen for auth state changes (sign-in, sign-out, token refresh)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      showLoading();
      try {
        await runAuthReadyOnce(session.user, 'SIGNED_IN');
      } catch (error) {
        console.error('Auth ready callback failed after SIGNED_IN:', error);
        showAuth();
      }
    }
    if (event === 'SIGNED_OUT') {
      _authReadyCompletedUserId = null;
      showAuth();
    }
    if (event === 'PASSWORD_RECOVERY') {
      showAuth();
      showResetNewPassword();
    }
  });

  // Check existing session
  let session = null;
  try {
    session = await getSession();
  } catch (error) {
    console.error('Session restore check failed:', error);
  }

  if (!session) {
    session = getCachedSession();
    if (session?.user) {
      console.warn('Recovered session from localStorage cache after getSession fallback.');
    }
  }

  if (session) {
    showLoading();
    try {
      await runAuthReadyOnce(session.user, 'session restore');
    } catch (error) {
      console.error('Auth ready callback failed during session restore:', error);
      showAuth();
    }
  } else {
    hideLoading();
    showAuth();
  }
}

// ─── Show/hide helpers ────────────────────────────────────────────────────────

export function showAuth() {
  document.getElementById('auth-wrapper')?.classList.remove('hidden');
  document.getElementById('app-shell')?.classList.add('hidden');
  hideLoading();
}

export function showApp() {
  document.getElementById('auth-wrapper')?.classList.add('hidden');
  document.getElementById('app-shell')?.classList.remove('hidden');
  hideLoading();
}

function showLoading() {
  const el = document.getElementById('loading-screen');
  if (el) { el.classList.remove('hidden'); el.style.opacity = '1'; }
}

export function hideLoading() {
  const el = document.getElementById('loading-screen');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => el.classList.add('hidden'), 400);
}

// ─── Auth form wiring (once) ──────────────────────────────────────────────────

function wireAuthForms() {
  // Tab switching
  onClick('show-register', () => switchView('auth-register'));
  onClick('show-login', () => switchView('auth-login'));
  onClick('show-login-2', () => switchView('auth-login'));
  onClick('show-forgot', () => switchView('auth-forgot'));
  onClick('back-to-login', () => switchView('auth-login'));

  // Login form
  onSubmit('login-form', handleLogin);

  // Register form
  onSubmit('register-form', handleRegister);

  // Forgot password form
  onSubmit('forgot-form', handleForgot);

  // Reset new password form
  onSubmit('reset-pw-form', handleResetNewPassword);

  // Google
  onClick('google-login-btn', handleGoogle);
  onClick('google-register-btn', handleGoogle);

  // Password visibility toggles
  document.querySelectorAll('.auth-pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? '🙈' : '👁️';
    });
  });

  // Password strength meter (register)
  const regPw = document.getElementById('register-password');
  if (regPw) regPw.addEventListener('input', () => updateStrengthMeter(regPw.value));

  // Confirm password match
  const regPwConfirm = document.getElementById('register-password-confirm');
  if (regPwConfirm) {
    regPwConfirm.addEventListener('input', () => {
      const match = regPw.value === regPwConfirm.value;
      const el = document.getElementById('pw-match-indicator');
      if (el) {
        el.textContent = regPwConfirm.value ? (match ? '✓ Passwords match' : '✗ Passwords do not match') : '';
        el.className = 'pw-match ' + (match ? 'match' : 'no-match');
      }
    });
  }

  // Resend email
  onClick('resend-email-btn', handleResendEmail);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  const email = val('login-email');
  const password = val('login-password');
  const btn = document.getElementById('login-submit');

  hideAlert('login-alert');
  setLoading(btn, true, 'Signing in...');

  try {
    await signIn(email, password);
    // onAuthStateChange handles the rest
  } catch (err) {
    showAlert('login-alert', mapError(err.message), 'error');
    setLoading(btn, false, 'Sign In to Vault');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = val('register-name');
  const email = val('register-email');
  const pw = val('register-password');
  const pwConfirm = val('register-password-confirm');
  const currency = val('register-currency');
  const btn = document.getElementById('register-submit');

  hideAlert('register-alert');

  if (name.length < 2) return showAlert('register-alert', 'Name must be at least 2 characters', 'error');
  if (pw.length < 8) return showAlert('register-alert', 'Password must be at least 8 characters', 'error');
  if (pw !== pwConfirm) return showAlert('register-alert', 'Passwords do not match', 'error');

  setLoading(btn, true, 'Creating your vault...');

  try {
    const data = await signUp(email, pw, name, currency);
    // If email confirmation is required, user won't be signed in yet
    if (data.user && !data.session) {
      // Show email verification screen
      document.getElementById('confirm-email-address').textContent = email;
      switchView('auth-confirm');
      setLoading(btn, false, 'Create My Vault');
    }
    // If auto-confirmed, onAuthStateChange handles it
  } catch (err) {
    showAlert('register-alert', mapError(err.message), 'error');
    setLoading(btn, false, 'Create My Vault');
  }
}

async function handleForgot(e) {
  e.preventDefault();
  const email = val('forgot-email');
  const btn = document.getElementById('forgot-submit');

  hideAlert('forgot-alert');
  setLoading(btn, true, 'Sending...');

  try {
    await resetPassword(email);
    showAlert('forgot-alert', '✉️ Reset link sent! Check your inbox.', 'success');
    setLoading(btn, false, 'Send Reset Link');
  } catch (err) {
    showAlert('forgot-alert', mapError(err.message), 'error');
    setLoading(btn, false, 'Send Reset Link');
  }
}

async function handleResetNewPassword(e) {
  e.preventDefault();
  const pw = val('reset-new-password');
  const pwConfirm = val('reset-new-password-confirm');
  const btn = document.getElementById('reset-pw-submit');

  hideAlert('reset-pw-alert');

  if (pw.length < 8) return showAlert('reset-pw-alert', 'Password must be at least 8 characters', 'error');
  if (pw !== pwConfirm) return showAlert('reset-pw-alert', 'Passwords do not match', 'error');

  setLoading(btn, true, 'Updating...');

  try {
    await updatePassword(pw);
    showAlert('reset-pw-alert', '✅ Password updated! Redirecting...', 'success');
    setTimeout(() => {
      switchView('auth-login');
      setLoading(btn, false, 'Update Password');
    }, 2000);
  } catch (err) {
    showAlert('reset-pw-alert', mapError(err.message), 'error');
    setLoading(btn, false, 'Update Password');
  }
}

async function handleGoogle() {
  try {
    await signInWithGoogle();
  } catch (err) {
    showAlert('login-alert', 'Google sign-in is not configured yet. Please use email/password.', 'info');
  }
}

let _resendCooldown = 0;
async function handleResendEmail() {
  if (_resendCooldown > 0) return;
  const emailEl = document.getElementById('confirm-email-address');
  const email = emailEl?.textContent;
  if (!email) return;

  const btn = document.getElementById('resend-email-btn');
  btn.disabled = true;
  _resendCooldown = 60;

  try {
    await supabase.auth.resend({ type: 'signup', email });
  } catch { /* ignore */ }

  const interval = setInterval(() => {
    _resendCooldown--;
    btn.textContent = _resendCooldown > 0 ? `Resend in ${_resendCooldown}s` : 'Resend Email';
    if (_resendCooldown <= 0) {
      btn.disabled = false;
      clearInterval(interval);
    }
  }, 1000);
}

// ─── View switching ───────────────────────────────────────────────────────────

function switchView(viewId) {
  document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId)?.classList.add('active');
}

function showResetNewPassword() {
  switchView('auth-reset-pw');
}

// ─── Password strength ───────────────────────────────────────────────────────

function updateStrengthMeter(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (pw.length >= 12 && /[^a-zA-Z0-9]/.test(pw)) score++;

  const labels = ['', 'Weak', 'Fair', 'Strong', 'Great'];
  const classes = ['', 'weak', 'fair', 'strong', 'great'];

  document.querySelectorAll('.pw-strength-seg').forEach((seg, i) => {
    seg.className = 'pw-strength-seg' + (i < score ? ` active ${classes[score]}` : '');
  });

  const label = document.getElementById('pw-strength-label');
  if (label) {
    label.textContent = pw.length > 0 ? labels[score] : '';
    label.className = 'pw-strength-label ' + classes[score];
  }
}

// ─── Error mapping ────────────────────────────────────────────────────────────

function mapError(msg) {
  if (!msg) return 'An unknown error occurred';
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email or password. Try again.';
  if (m.includes('email not confirmed')) return 'Please verify your email first. Check your inbox.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'This email is already registered. Try signing in.';
  if (m.includes('too many') || m.includes('rate limit')) return 'Too many attempts. Please wait a moment.';
  if (m.includes('password') && m.includes('characters')) return 'Password must be at least 8 characters.';
  if (m.includes('invalid email')) return 'Please enter a valid email address.';
  return msg;
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function val(id) { return document.getElementById(id)?.value?.trim() || ''; }

function onClick(id, fn) {
  document.getElementById(id)?.addEventListener('click', fn);
}

function onSubmit(id, fn) {
  document.getElementById(id)?.addEventListener('submit', fn);
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `auth-alert visible ${type}`;
}

function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.className = 'auth-alert';
}

function setLoading(btn, loading, text) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span class="auth-spinner"></span>`
    : text;
}

// ─── Sign out (called from app) ───────────────────────────────────────────────

export async function handleSignOut() {
  try {
    await signOut();
  } catch (err) {
    console.error('Sign out error:', err);
  }
}

// ─── Get user display info ────────────────────────────────────────────────────

export async function getUserProfile(providedUser = null) {
  const user = providedUser || await getCurrentUser();
  if (!user) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return {
    id: user.id,
    email: user.email,
    fullName: data?.full_name || user.user_metadata?.full_name || 'User',
    avatarUrl: data?.avatar_url || '',
    currency: data?.currency || 'LKR',
    dateFormat: data?.date_format || 'DD/MM/YYYY',
    createdAt: user.created_at
  };
}

function getCachedSession() {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const explicitProjectRef = (SUPABASE_URL || '').match(/https:\/\/([^.]+)/)?.[1];
    const preferredKey = explicitProjectRef ? `sb-${explicitProjectRef}-auth-token` : null;
    const candidateKeys = [];

    if (preferredKey) candidateKeys.push(preferredKey);
    candidateKeys.push(
      ...Object.keys(window.localStorage).filter((key) => key.startsWith('sb-') && key.endsWith('-auth-token'))
    );

    for (const key of candidateKeys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const session = normalizeCachedSession(parsed);
      if (!session || !session.user) continue;

      if (session.expires_at && Date.now() >= session.expires_at * 1000) {
        continue;
      }

      return session;
    }
  } catch (error) {
    console.warn('Failed to parse cached Supabase session:', error);
  }

  return null;
}

function normalizeCachedSession(value) {
  if (!value) return null;
  if (value.currentSession) return value.currentSession;
  if (Array.isArray(value)) {
    return value.find((entry) => entry?.access_token && entry?.user) || value[0] || null;
  }
  if (value.access_token && value.user) return value;
  return null;
}
