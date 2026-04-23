/**
 * @fileoverview Supabase client (SDK) + auth helper functions
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials not set in .env');
}

/** Supabase client instance */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true         // catches email confirm + password reset redirects
  },
  global: {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  }
});

/** Check if Supabase is configured */
export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Sign up a new user with email/password
 */
export async function signUp(email, password, fullName, currency = 'LKR') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }        // goes to raw_user_meta_data
    }
  });
  if (error) throw error;

  // Update profile with currency preference (trigger already created the row)
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      full_name: fullName,
      currency
    });
  }

  return data;
}

/**
 * Sign in with email + password
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Google OAuth sign in
 */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) throw error;
}

/**
 * Sign out
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Send password reset email
 */
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}?type=recovery`
  });
  if (error) throw error;
}

/**
 * Update password (when user has a valid session, e.g. from reset link)
 */
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * Get the current user synchronously from cache, or null
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

/**
 * Get the current session
 */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Health check (lightweight)
 */
export async function checkSupabaseHealth() {
  if (!isConfigured()) return false;
  try {
    const session = await getSession();
    return Boolean(session);
  } catch {
    return false;
  }
}
