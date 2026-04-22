/**
 * @fileoverview Supabase client configuration
 */

const env = import.meta.env;

const SUPABASE_URL = env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_PUBLISHABLE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_API_KEY = SUPABASE_ANON_KEY || SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_API_KEY) {
  if (import.meta.env.DEV) console.warn('Supabase not configured...');
}

const supabaseUrl = SUPABASE_URL ? SUPABASE_URL.replace(/\/$/, '') : '';
let authRejected = false;
let healthCheckPromise = null;
let cachedHealthResult = null;

function isJwtLikeKey(key) {
  return typeof key === 'string' && key.split('.').length === 3;
}

export function getSupabaseHeaders(withJsonContentType = false) {
  const headers = {
    'apikey': SUPABASE_API_KEY
  };

  // Publishable keys (sb_publishable_*) are not JWTs, so skip Bearer for those.
  if (isJwtLikeKey(SUPABASE_API_KEY)) {
    headers.Authorization = `Bearer ${SUPABASE_API_KEY}`;
  }

  if (withJsonContentType) {
    headers['Content-Type'] = 'application/json';
    headers.Prefer = 'return=representation';
  }

  return headers;
}

export const supabase = {
  url: supabaseUrl,
  anonKey: SUPABASE_API_KEY
};

export async function checkSupabaseHealth() {
  if (cachedHealthResult !== null) {
    return cachedHealthResult;
  }

  if (!isConfigured() || authRejected) {
    cachedHealthResult = false;
    return false;
  }

  if (healthCheckPromise) {
    return healthCheckPromise;
  }

  healthCheckPromise = (async () => {
    try {
      // The /rest/v1/ root endpoint requires elevated privileges and returns 401 for anon keys.
      // Query an actual table with limit=0 — returns 200 even with RLS active.
      const response = await fetch(`${supabaseUrl}/rest/v1/fund_sources?select=id&limit=0`, {
        method: 'GET',
        headers: getSupabaseHeaders()
      });
      if (response.status === 401 || response.status === 403) {
        authRejected = true;
      }
      // 200 means connected; also accept 406 (table exists but header mismatch)
      cachedHealthResult = response.ok || response.status === 406;
      return cachedHealthResult;
    } catch (error) {
      console.error('Supabase health check failed:', error);
      cachedHealthResult = false;
      return false;
    } finally {
      healthCheckPromise = null;
    }
  })();

  return healthCheckPromise;
}

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_API_KEY);
}
