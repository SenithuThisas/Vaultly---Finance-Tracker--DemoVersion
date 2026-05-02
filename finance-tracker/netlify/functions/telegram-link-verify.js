import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify(payload)
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: 'Supabase config missing' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = tokenMatch ? tokenMatch[1] : null;

  if (!accessToken) {
    return jsonResponse(401, { error: 'Missing auth token' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const otp = String(payload.token || '').trim().toUpperCase();
  if (!otp || otp.length !== 6) {
    return jsonResponse(400, { error: 'Invalid token' });
  }

  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

  if (userError || !userData?.user?.id) {
    return jsonResponse(401, { error: 'Invalid session' });
  }

  const userId = userData.user.id;

  const { data: tokenRow, error: tokenError } = await supabase
    .from('link_tokens')
    .select('telegram_user_id, expires_at')
    .eq('token', otp)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return jsonResponse(400, { error: 'Token not found' });
  }

  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return jsonResponse(400, { error: 'Token expired' });
  }

  // UPSERT: handles both first-time linking and re-linking.
  // If this telegram_user_id is already mapped (even to another user), we
  // overwrite it — the OTP flow already validated ownership via the code.
  const { error: upsertError } = await supabase
    .from('telegram_user_map')
    .upsert(
      { telegram_user_id: tokenRow.telegram_user_id, user_id: userId, created_at: new Date().toISOString() },
      { onConflict: 'telegram_user_id' }
    );

  if (upsertError) {
    return jsonResponse(500, { error: 'Failed to link account' });
  }

  await supabase
    .from('link_tokens')
    .delete()
    .eq('token', otp);

  return jsonResponse(200, { ok: true });
}
