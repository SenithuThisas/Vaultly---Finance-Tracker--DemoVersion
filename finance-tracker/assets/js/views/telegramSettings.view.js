/**
 * @fileoverview Telegram account linking settings
 *
 * UX improvements:
 *  - Linked status badge (green = linked, grey = not linked)
 *  - Unlink button that deletes the telegram_user_map row
 *  - Clearer instructions when not linked
 */

import { db, isConfigured } from '../config/supabase.js';
import { showToast } from '../components/toast.js';
import { setButtonLoading, setButtonReady, translateError, showErrorModal } from '../security/index.js';

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
  const linkedDate = isLinked
    ? new Date(linkRow.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  container.innerHTML = `
    <div class="card" style="margin-top: 16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <h4 style="margin:0;">Telegram Bot</h4>
        <span class="tg-status-badge ${isLinked ? 'tg-status-linked' : 'tg-status-unlinked'}">
          ${isLinked ? '● Linked' : '○ Not linked'}
        </span>
      </div>

      ${isLinked ? `
        <div class="tg-linked-info">
          <div class="form-hint" style="margin-bottom:4px;">
            Telegram ID: <strong>${linkRow.telegram_user_id}</strong>
          </div>
          <div class="form-hint" style="margin-bottom:12px;">
            Linked on ${linkedDate}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
            <button class="btn btn-danger btn-sm" id="telegram-unlink-btn">Unlink Account</button>
          </div>
          <hr style="border:none;border-top:1px solid var(--border);margin:0 0 16px;">
          <div class="form-hint" style="margin-bottom:8px;">
            Want to link a different Telegram account? Generate a new code from that account first, then enter it below.
          </div>
        </div>
      ` : `
        <div class="form-hint" style="margin-bottom:12px;">
          Link your Telegram account to log transactions on the go. Open your bot and send <code>/link</code> to receive a 6-character code.
        </div>
        <div class="form-hint" style="margin-bottom:16px;font-style:italic;">
          Bot message format: <strong>DR - Coffee - 350</strong> or <strong>CR - Salary - 50,000 - August</strong>
        </div>
      `}

      <div class="form-group">
        <label class="form-label">Link Code</label>
        <input type="text" class="form-input" id="telegram-link-code"
          placeholder="Enter 6-char code from bot" maxlength="6" autocomplete="off"
          style="text-transform:uppercase;letter-spacing:0.15em;">
        <div class="form-hint">Code expires in 10 minutes.</div>
      </div>

      <button class="btn btn-secondary" id="telegram-link-submit">
        ${isLinked ? 'Relink Telegram' : 'Link Telegram'}
      </button>
    </div>
  `;

  // Link / Relink
  const submitBtn = document.getElementById('telegram-link-submit');
  submitBtn?.addEventListener('click', async () => {
    const codeInput = document.getElementById('telegram-link-code');
    const token = codeInput?.value?.trim().toUpperCase() || '';

    if (token.length !== 6) {
      showToast('Enter the 6-character code from your Telegram bot.', 'warning');
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

      showToast('Telegram account linked successfully. ✅', 'success');
      await renderTelegramSettings();
    } catch (error) {
      showToast(translateError(error), 'error');
    } finally {
      setButtonReady(submitBtn);
    }
  });

  // Unlink
  const unlinkBtn = document.getElementById('telegram-unlink-btn');
  unlinkBtn?.addEventListener('click', () => {
    showErrorModal({
      title: 'Unlink Telegram?',
      message: 'This will disconnect your Telegram account from Vaultly. Bot messages will no longer be accepted until you re-link.',
      actions: [
        {
          label: 'Yes, Unlink',
          style: 'danger',
          onClick: async () => {
            try {
              const { error } = await db
                .from('telegram_user_map')
                .delete()
                .eq('user_id', userId);

              if (error) throw error;

              showToast('Telegram account unlinked.', 'info');
              await renderTelegramSettings();
            } catch (err) {
              showToast(translateError(err), 'error');
            }
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
