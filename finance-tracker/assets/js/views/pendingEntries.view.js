/**
 * @fileoverview Pending entries view (Telegram bot inbox)
 */

import { db, isConfigured } from '../config/supabase.js';
import { registerViewRenderer } from '../state.js';
import { formatCurrency } from '../components/charts.js';
import { showToast } from '../components/toast.js';
import { setButtonLoading, setButtonReady, translateError } from '../security/index.js';

let pendingEntries = [];
let editingId = null;
let realtimeChannel = null;

export async function renderPendingEntries() {
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
    </div>
    <div class="pending-list" id="pending-list"></div>
    <div class="empty-state" id="pending-empty" style="display:none;">
      <div class="empty-icon">📨</div>
      <div class="empty-text">No pending entries. Send a message to your Telegram bot to get started.</div>
    </div>
  `;

  await loadPendingEntries();
  renderPendingList();
  setupRealtime();
}

async function loadPendingEntries() {
  const { data, error } = await db
    .from('pending_transactions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

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

function renderEntryCard(entry) {
  const isEditing = editingId === entry.id;
  const typeClass = entry.type === 'CR' ? 'badge-cr' : 'badge-dr';
  const formattedAmount = formatCurrency(Number(entry.amount || 0));
  const safeCategory = escapeHtml(entry.category);
  const safeNote = escapeHtml(entry.note || '-');
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
      rejectEntry(id, button);
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
  setButtonLoading(button, 'Approving');

  const optimistic = pendingEntries.filter(entry => entry.id !== id);
  pendingEntries = optimistic;
  renderPendingList();

  const { error } = await db.rpc('approve_pending_transaction', { p_pending_id: id });

  setButtonReady(button);

  if (error) {
    showToast(translateError(error), 'error');
    await loadPendingEntries();
    renderPendingList();
    return;
  }

  showToast('Entry approved and moved to transactions.', 'success');
}

async function rejectEntry(id, button) {
  setButtonLoading(button, 'Rejecting');

  const optimistic = pendingEntries.filter(entry => entry.id !== id);
  pendingEntries = optimistic;
  renderPendingList();

  const { error } = await db
    .from('pending_transactions')
    .update({ status: 'rejected' })
    .eq('id', id);

  setButtonReady(button);

  if (error) {
    showToast(translateError(error), 'error');
    await loadPendingEntries();
    renderPendingList();
    return;
  }

  showToast('Entry rejected.', 'info');
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
    })
    .subscribe();
}

registerViewRenderer('pending', renderPendingEntries);
