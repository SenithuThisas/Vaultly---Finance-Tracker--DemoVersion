/**
 * @fileoverview Route guards for authentication states
 */

import { db } from '../config/supabase.js';

/**
 * Checks if a session exists in sessionStorage for Supabase
 * Synchronous helper for guards
 */
function getAuthUser() {
  try {
    const projectRef = (db?.supabaseUrl || '').split('//')[1]?.split('.')[0];
    const storageKey = projectRef ? `sb-${projectRef}-auth-token` : 'supabase.auth.token';
    const sessionStr = sessionStorage.getItem(storageKey);
    
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      if (!session?.expires_at || session.expires_at < Math.floor(Date.now() / 1000)) return null;
      return session?.user || null;
    }
  } catch (e) {
    console.error('Guard: Failed to parse auth token', e);
  }
  return null;
}

/**
 * Ensures the user is authenticated.
 * Used for protecting app views.
 */
export function requireAuth() {
  const user = getAuthUser();
  if (!user) {
    return { shouldRedirect: true, target: 'login' };
  }
  
  if (!user.email_confirmed_at) {
    return { shouldRedirect: true, target: 'confirm' };
  }

  return { shouldRedirect: false };
}

/**
 * Ensures the user is a guest.
 * Used for login/signup pages to redirect authenticated users.
 */
export function requireGuest() {
  const user = getAuthUser();
  if (user && user.email_confirmed_at) {
    return { shouldRedirect: true, target: 'dashboard' };
  }
  return { shouldRedirect: false };
}
