import { createClient } from '@supabase/supabase-js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_SECRET_TOKEN = process.env.TELEGRAM_SECRET_TOKEN || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Split on " - " (space-dash-space) so hyphenated category names
// like "Co-working" are preserved correctly.
const PART_SEPARATOR = / - /;

function getSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function parseMessage(text) {
  // Split on " - " only — preserves dashes within field values
  const parts = text.trim().split(PART_SEPARATOR);
  if (parts.length < 3) return null;

  const typeRaw = parts[0].trim().toUpperCase();
  if (!['DR', 'CR'].includes(typeRaw)) return null;

  const category = parts[1].trim();
  if (!category) return null;

  const amountRaw = parts[2].trim().replace(/,/g, '');
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // Everything from part[3] onwards is the optional note
  const note = parts.slice(3).join(' - ').trim();

  return { type: typeRaw, category, amount, note };
}

async function sendTelegramMessage(chatId, text, replyToMessageId = null) {
  if (!TELEGRAM_BOT_TOKEN) return;

  const payload = {
    chat_id: chatId,
    text,
    reply_to_message_id: replyToMessageId || undefined
  };

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

function generateOtp(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function handleLinkCommand({ supabase, chatId, telegramUserId, replyToMessageId }) {
  const token = generateOtp(6);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabase
    .from('link_tokens')
    .delete()
    .eq('telegram_user_id', telegramUserId);

  const { error } = await supabase
    .from('link_tokens')
    .insert({
      token,
      telegram_user_id: telegramUserId,
      expires_at: expiresAt
    });

  if (error) {
    await sendTelegramMessage(chatId, 'Unable to create a link code right now. Please try again later.', replyToMessageId);
    return;
  }

  const message = `Your link code is: ${token}\n\nOpen Vaultly > Settings > Telegram Bot and paste the code to link your account.`;
  await sendTelegramMessage(chatId, message, replyToMessageId);
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secretHeader = event.headers['x-telegram-bot-api-secret-token']
    || event.headers['X-Telegram-Bot-Api-Secret-Token'];

  if (!TELEGRAM_SECRET_TOKEN || secretHeader !== TELEGRAM_SECRET_TOKEN) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const message = payload.message;
  if (!message || !message.text) {
    return { statusCode: 200, body: 'No message to process' };
  }

  const chatId = message.chat?.id;
  const telegramUserId = message.from?.id;
  const telegramMessageId = message.message_id;
  const text = String(message.text || '').trim();

  if (!chatId || !telegramUserId || !telegramMessageId) {
    return { statusCode: 200, body: 'Missing metadata' };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    await sendTelegramMessage(chatId, 'Server configuration missing. Please contact the owner.', telegramMessageId);
    return { statusCode: 200, body: 'Missing Supabase config' };
  }

  const supabase = getSupabaseClient();

  if (text.toLowerCase().startsWith('/link')) {
    await handleLinkCommand({ supabase, chatId, telegramUserId, replyToMessageId: telegramMessageId });
    return { statusCode: 200, body: 'Link handled' };
  }

  const parsed = parseMessage(text);
  if (!parsed) {
    const hint = 'Format: DR - Food - 500 or CR - Salary - 5,000 - Monthly pay\n(Use spaces around dashes. Notes are optional.)';
    await sendTelegramMessage(chatId, `I could not parse that. ${hint}`, telegramMessageId);
    return { statusCode: 200, body: 'Parse failed' };
  }

  const { data: mapRow, error: mapError } = await supabase
    .from('telegram_user_map')
    .select('user_id')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();

  if (mapError || !mapRow?.user_id) {
    await sendTelegramMessage(chatId, 'Please link your account first. Send /link to get a code.', telegramMessageId);
    return { statusCode: 200, body: 'User not linked' };
  }

  const { data: existing } = await supabase
    .from('pending_transactions')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .eq('telegram_message_id', telegramMessageId)
    .maybeSingle();

  if (existing?.id) {
    return { statusCode: 200, body: 'Duplicate ignored' };
  }

  const insertPayload = {
    user_id: mapRow.user_id,
    type: parsed.type,
    category: parsed.category,
    amount: parsed.amount,
    date: new Date().toISOString().split('T')[0],
    note: parsed.note || null,
    status: 'pending',
    telegram_user_id: telegramUserId,
    telegram_message_id: telegramMessageId,
    raw_text: text
  };

  const { error: insertError } = await supabase
    .from('pending_transactions')
    .insert(insertPayload);

  if (insertError) {
    if (insertError.code === '23505') {
      return { statusCode: 200, body: 'Duplicate ignored' };
    }
    await sendTelegramMessage(chatId, 'Failed to save that entry. Please try again.', telegramMessageId);
    return { statusCode: 200, body: 'Insert failed' };
  }

  const confirmation = `✅ ${parsed.type} · ${parsed.category} · ${formatCurrency(parsed.amount)} saved for review.\n\nOpen Vaultly > Pending Entries to assign an account and approve.`;
  await sendTelegramMessage(chatId, confirmation, telegramMessageId);

  return { statusCode: 200, body: 'OK' };
}
