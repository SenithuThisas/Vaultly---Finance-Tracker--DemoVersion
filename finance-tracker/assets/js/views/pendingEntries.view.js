/**
 * @fileoverview Pending entries view (Telegram bot inbox)
 *
 * Bugs fixed:
 *  - Account selector added to every pending card (fund_source_id was missing)
 *  - approveEntry now passes fund_source_id to the RPC and dispatches
 *    ADD_TRANSACTION to update in-memory state immediately
 *  - rejectEntry now shows a confirmation dialog before acting
 *
 * UX improvements:
 *  - Improved empty state with full bot command syntax
 *  - Optimistic list updates with rollback on error
 *  - Clear toast messages on every outcome
 */

import { db, isConfigured } from '../config/supabase.js';
import { getState, dispatch, registerViewRenderer } from '../state.js';
import { formatCurrency } from '../utils/formatters.js';
import { showToast } from '../components/toast.js';
import { setButtonLoading, setButtonReady, translateError, showErrorModal } from '../security/index.js';
import { updatePendingBadge, markNavVisited } from '../components/nav.js';

let pendingEntries = [];
let editingId = null;
let realtimeChannel = null;

export async function renderPendingEntries() {
  // Mark this section as visited — clears the nav badge immediately
  markNavVisited('pending');

  const container = document.getElementById('view-pending');
  if (!container) return;

  if (!isConfigured() || !db) {
    container.innerHTML = `
      <div class="view-header">
        <h2 class="view-title">Pending Entries</h2>
      </div>
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-text">Supabase is not configured.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="view-header">
      <h2 class="view-title">Pending Entries</h2>
      <div class="view-subtitle">Review transactions sent from your Telegram bot</div>
    </div>
    <div class="pending-list" id="pending-list"></div>
    <div class="empty-state" id="pending-empty" style="display:none;">
      <div class="empty-icon">📨</div>
      <div class="empty-text">No pending entries yet.</div>
      <div class="empty-hint">
        Send a message to your Telegram bot in this format:<br>
        <code class="bot-syntax">DR - Food - 250</code>
        <code class="bot-syntax">CR - Salary - 50,000 - August</code>
        <span class="bot-syntax-note">DR = debit/expense · CR = credit/income · Notes are optional</span>
      </div>
    </div>
  `;

  await loadPendingEntries();
  renderPendingList();
  setupRealtime();
}

async function loadPendingEntries() {
  const { data: sessionData } = await db.auth.getSession();
  const userId = sessionData?.session?.user?.id || null;

  const query = db
    .from('pending_transactions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  // Scope to current user if session is available (belt-and-suspenders alongside RLS)
  if (userId) query.eq('user_id', userId);

  const { data, error } = await query;

  if (error) {
    showToast(translateError(error), 'error');
    pendingEntries = [];
    return;
  }

  pendingEntries = data || [];
}

function renderPendingList() {
  const list = document.getElementById('pending-list');
  const empty = document.getElementById('pending-empty');
  if (!list || !empty) return;

  if (pendingEntries.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = pendingEntries.map(entry => renderEntryCard(entry)).join('');

  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn));
  });
}

function buildAccountOptions(selectedId = null) {
  const { fundSources } = getState();
  const active = fundSources.filter(fs => fs.isActive !== false);

  if (active.length === 0) {
    return `<option value="">— No accounts found —</option>`;
  }

  const opts = active.map(fs =>
    `<option value="${escapeHtml(fs.id)}" ${fs.id === selectedId ? 'selected' : ''}>${escapeHtml(fs.name)}</option>`
  );
  return `<option value="">Select account…</option>` + opts.join('');
}

function renderEntryCard(entry) {
  const isEditing = editingId === entry.id;
  const typeClass = entry.type === 'CR' ? 'badge-cr' : 'badge-dr';
  const formattedAmount = formatCurrency(Number(entry.amount || 0));
  const safeCategory = escapeHtml(entry.category);
  const safeNote = escapeHtml(entry.note || '—');
  const dateValue = entry.date || new Date().toISOString().split('T')[0];

  return `
    <div class="card pending-card" data-id="${entry.id}">
      <div class="pending-card-header">
        <span class="badge ${typeClass}">${entry.type}</span>
        <div class="pending-card-title">${safeCategory}</div>
        <div class="pending-card-amount">${formattedAmount}</div>
      </div>
      <div class="pending-card-meta">
        <div><span class="meta-label">Date</span> ${dateValue}</div>
        <div><span class="meta-label">Note</span> ${safeNote}</div>
      </div>

      <!-- Account selector — always visible, required before approving -->
      <div class="form-group pending-account-select" style="margin-top:12px;">
        <label class="form-label">Account <span style="color:var(--accent-red);">*</span></label>
        <select class="form-input form-select" data-field="fund_source_id">
          ${buildAccountOptions(entry.fund_source_id)}
        </select>
        <div class="form-hint">Required before approving.</div>
      </div>

      ${isEditing ? `
        <div class="pending-edit">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Category</label>
              <input type="text" class="form-input" data-field="category" value="${escapeHtml(entry.category)}">
            </div>
            <div class="form-group">
              <label class="form-label">Amount</label>
              <input type="number" class="form-input" data-field="amount" value="${Number(entry.amount || 0)}" min="0.01" step="0.01">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Date</label>
              <input type="date" class="form-input" data-field="date" value="${dateValue}">
            </div>
            <div class="form-group">
              <label class="form-label">Note</label>
              <input type="text" class="form-input" data-field="note" value="${escapeHtml(entry.note || '')}">
            </div>
          </div>
        </div>
      ` : ''}

      <div class="pending-actions">
        ${isEditing ? `
          <button class="btn btn-sm btn-secondary" data-action="cancel" data-id="${entry.id}">Cancel</button>
          <button class="btn btn-sm btn-primary" data-action="save" data-id="${entry.id}">Save</button>
        ` : `
          <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${entry.id}">Edit</button>
          <button class="btn btn-sm btn-primary" data-action="approve" data-id="${entry.id}">Approve</button>
          <button class="btn btn-sm btn-danger" data-action="reject" data-id="${entry.id}">Reject</button>
        `}
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function handleAction(button) {
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!action || !id) return;

  switch (action) {
    case 'edit':
      editingId = id;
      renderPendingList();
      break;
    case 'cancel':
      editingId = null;
      renderPendingList();
      break;
    case 'save':
      saveEntry(id, button);
      break;
    case 'approve':
      approveEntry(id, button);
      break;
    case 'reject':
      confirmReject(id, button);
      break;
  }
}

async function saveEntry(id, button) {
  const card = button.closest('.pending-card');
  if (!card) return;

  const payload = {
    category: card.querySelector('[data-field="category"]')?.value?.trim() || '',
    amount: Number(card.querySelector('[data-field="amount"]')?.value || 0),
    date: card.querySelector('[data-field="date"]')?.value || new Date().toISOString().split('T')[0],
    note: card.querySelector('[data-field="note"]')?.value?.trim() || null
  };

  if (!payload.category || !Number.isFinite(payload.amount) || payload.amount <= 0) {
    showToast('Category and amount are required.', 'warning');
    return;
  }

  setButtonLoading(button, 'Saving');

  const { error } = await db
    .from('pending_transactions')
    .update(payload)
    .eq('id', id);

  setButtonReady(button);

  if (error) {
    showToast(translateError(error), 'error');
    return;
  }

  const idx = pendingEntries.findIndex(entry => entry.id === id);
  if (idx !== -1) {
    pendingEntries[idx] = { ...pendingEntries[idx], ...payload };
  }

  editingId = null;
  renderPendingList();
  showToast('Pending entry updated.', 'success');
}

async function approveEntry(id, button) {
  // Find the account selector BEFORE any DOM changes
  const card = button.closest('.pending-card');
  const fundSourceId = card?.querySelector('[data-field="fund_source_id"]')?.value || '';

  if (!fundSourceId) {
    showToast('Please select an account before approving.', 'warning');
    card?.querySelector('[data-field="fund_source_id"]')?.focus();
    return;
  }

  // Lock the button BEFORE touching the DOM (so ref stays valid)
  setButtonLoading(button, 'Approving');

  const entry = pendingEntries.find(e => e.id === id);
  if (!entry) {
    setButtonReady(button);
    showToast('Entry not found.', 'error');
    return;
  }

  try {
    // 1 — Insert the approved transaction
    const { data: sessionData } = await db.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) throw new Error('Not authenticated');

    const txId = crypto.randomUUID();
    const { error: txError } = await db.from('transactions').insert({
      id: txId,
      user_id: userId,
      title: `Telegram · ${entry.category}`,
      amount: Number(entry.amount),
      type: entry.type,
      category: entry.category,
      fund_source_id: fundSourceId,
      date: entry.date || new Date().toISOString().split('T')[0],
      note: entry.note || null,
      reference: null,
      tags: [],
      is_recurring: false,
      recurring_period: null
    });

    if (txError) throw txError;

    // 2 — Update fund source balance (increment/decrement)
    const { fundSources } = getState();
    const fs = fundSources.find(f => f.id === fundSourceId);
    if (fs) {
      const delta = entry.type === 'CR' ? Number(entry.amount) : -Number(entry.amount);
      const newBalance = Number((fs.balance || 0) + delta).toFixed(2);
      const { error: fsError } = await db
        .from('fund_sources')
        .update({ balance: newBalance })
        .eq('id', fundSourceId)
        .eq('user_id', userId);

      if (fsError) {
        // Non-fatal — balance will re-sync on next load
        console.warn('Balance update failed:', fsError.message);
      }
    }

    // 3 — Mark pending row as approved
    const { error: statusError } = await db
      .from('pending_transactions')
      .update({ status: 'approved', fund_source_id: fundSourceId })
      .eq('id', id);

    if (statusError) {
      // Non-fatal — transaction was already saved
      console.warn('Status update failed:', statusError.message);
    }

    // 4 — Optimistic removal from pending list
    pendingEntries = pendingEntries.filter(e => e.id !== id);
    renderPendingList();

    // 5 — Sync in-memory state so Transactions view updates immediately
    dispatch('ADD_TRANSACTION', {
      id: txId,
      title: `Telegram · ${entry.category}`,
      amount: Number(entry.amount),
      type: entry.type,
      category: entry.category,
      fundSourceId,
      date: entry.date || new Date().toISOString().split('T')[0],
      note: entry.note || '',
      reference: '',
      tags: [],
      isRecurring: false,
      recurringPeriod: null,
      createdAt: new Date().toISOString()
    });

    if (fs) {
      const delta = entry.type === 'CR' ? Number(entry.amount) : -Number(entry.amount);
      dispatch('EDIT_FUND_SOURCE', { ...fs, balance: (fs.balance || 0) + delta });
    }

    showToast('Entry approved and moved to transactions. ✅', 'success');
    updatePendingBadge();

  } catch (err) {
    console.error('Approve failed:', err);
    showToast(err?.message || 'Approval failed. Please try again.', 'error');
  } finally {
    setButtonReady(button);
  }
}

function confirmReject(id, button) {
  const entry = pendingEntries.find(e => e.id === id);
  const label = entry ? `${entry.type} · ${entry.category} · ${formatCurrency(Number(entry.amount))}` : 'this entry';

  showErrorModal({
    title: 'Reject Entry?',
    message: `Are you sure you want to reject <strong>${escapeHtml(label)}</strong>? This cannot be undone.`,
    actions: [
      {
        label: 'Yes, Reject',
        style: 'danger',
        onClick: () => rejectEntry(id, button)
      },
      {
        label: 'Cancel',
        style: 'ghost',
        onClick: () => {}
      }
    ]
  });
}

async function rejectEntry(id, button) {
  // Optimistic removal
  const snapshot = [...pendingEntries];
  pendingEntries = pendingEntries.filter(e => e.id !== id);
  renderPendingList();

  const { error } = await db
    .from('pending_transactions')
    .update({ status: 'rejected' })
    .eq('id', id);

  if (error) {
    pendingEntries = snapshot;
    renderPendingList();
    showToast(translateError(error), 'error');
    return;
  }

  showToast('Entry rejected.', 'info');
  updatePendingBadge();
}

function setupRealtime() {
  if (!db) return;

  if (realtimeChannel) {
    db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = db
    .channel('pending-transactions')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'pending_transactions'
    }, async () => {
      await loadPendingEntries();
      renderPendingList();
      updatePendingBadge();
    })
    .subscribe();
}

registerViewRenderer('pending', renderPendingEntries);
