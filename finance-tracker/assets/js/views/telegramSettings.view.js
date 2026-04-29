/**
 * @fileoverview Telegram account linking settings
 */

import { db, isConfigured } from '../config/supabase.js';
import { showToast } from '../components/toast.js';
import { setButtonLoading, setButtonReady, translateError } from '../security/index.js';

export async function renderTelegramSettings() {
  const container = document.getElementById('telegram-settings-panel');
  if (!container) return;

  if (!isConfigured() || !db) {
    container.innerHTML = `
      <div class="card" style="margin-top: 16px;">
        <h4>Telegram Bot</h4>
        <div class="form-hint">Supabase is not configured.</div>
      </div>
    `;
    return;
  }

  const { data: sessionData } = await db.auth.getSession();
  const accessToken = sessionData?.session?.access_token || null;
  const userId = sessionData?.session?.user?.id || null;

  if (!userId) {
    container.innerHTML = `
      <div class="card" style="margin-top: 16px;">
        <h4>Telegram Bot</h4>
        <div class="form-hint">Sign in to link your Telegram account.</div>
      </div>
    `;
    return;
  }

  const { data: linkRow } = await db
    .from('telegram_user_map')
    .select('telegram_user_id, created_at')
    .eq('user_id', userId)
    .maybeSingle();

  const isLinked = Boolean(linkRow?.telegram_user_id);

  container.innerHTML = `
    <div class="card" style="margin-top: 16px;">
      <h4>Telegram Bot</h4>
      <div class="form-hint" style="margin-bottom: 12px;">
        ${isLinked ? 'Linked to Telegram ID ' + linkRow.telegram_user_id : 'Not linked yet. Send /link to your bot to get a code.'}
      </div>

      <div class="form-group">
        <label class="form-label">Link Code</label>
        <input type="text" class="form-input" id="telegram-link-code" placeholder="Enter 6-char code" maxlength="6" autocomplete="off">
        <div class="form-hint">Code expires in 10 minutes.</div>
      </div>

      <button class="btn btn-secondary" id="telegram-link-submit">${isLinked ? 'Relink Telegram' : 'Link Telegram'}</button>
    </div>
  `;

  const submitBtn = document.getElementById('telegram-link-submit');
  submitBtn?.addEventListener('click', async () => {
    const codeInput = document.getElementById('telegram-link-code');
    const token = codeInput?.value?.trim().toUpperCase() || '';

    if (token.length !== 6) {
      showToast('Enter the 6-character code from Telegram.', 'warning');
      return;
    }

    if (!accessToken) {
      showToast('Missing session. Please sign in again.', 'error');
      return;
    }

    setButtonLoading(submitBtn, 'Linking');

    try {
      const response = await fetch('/.netlify/functions/telegram-link-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ token })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to link');
      }

      showToast('Telegram account linked successfully.', 'success');
      await renderTelegramSettings();
    } catch (error) {
      showToast(translateError(error), 'error');
    } finally {
      setButtonReady(submitBtn);
    }
  });
}
