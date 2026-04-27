/**
 * @fileoverview Bank Accounts (Fund Sources) view
 */

import { getState, registerViewRenderer, dispatch } from '../state.js';
import { FundSourceService } from '../services/fundSource.service.js';
import { TransactionService } from '../services/transaction.service.js';
import { drawSparkline, formatCurrency } from '../components/charts.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { CATEGORIES, FUND_SOURCE_TYPES, CURRENCIES } from '../data/seed.js';
import { canSubmit, translateError } from '../security/index.js';
import { AnalyticsService } from '../services/analytics.service.js';

/**
 * Render banks/fund sources view
 */
export function renderBanks() {
  const container = document.getElementById('view-banks');
  if (!container) return;

  const state = getState();
  const activeSources = state.fundSources.filter(fs => fs.isActive !== false);
  const netWorth = AnalyticsService.getNetWorth();

  const html = `
    <div class="view-header">
      <h2 class="view-title">Fund Sources</h2>
      <button class="btn btn-primary" id="add-account-btn">+ Add Account</button>
    </div>

    <div class="net-worth-hero">
      <div class="net-worth-label">Total Net Worth</div>
      <div class="net-worth-value">${formatCurrency(netWorth)}</div>
    </div>

    <div class="grid grid-3" id="accounts-grid">
      ${activeSources.length === 0 ? `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">🏦</div>
          <div class="empty-text">No accounts yet - add one to get started</div>
        </div>
      ` : ''}
    </div>
  `;

  container.innerHTML = html;

  // Render account cards
  setTimeout(() => {
    renderAccountCards();
    setupEventListeners();
  }, 50);
}

function renderAccountCards() {
  const grid = document.getElementById('accounts-grid');
  if (!grid) return;

  const state = getState();
  const activeSources = state.fundSources.filter(fs => fs.isActive !== false);

  grid.innerHTML = activeSources.map(fs => {
    const balance = FundSourceService.getBalance(fs.id);
    const monthlyFlow = getCurrentMonthFlow(fs.id);
    const sparklineData = FundSourceService.getSparklineData(fs.id, 14);
    const balanceClass = balance >= 0 ? 'positive' : 'negative';
    const sparklineColor = balance >= 0 ? '#10B981' : '#FF6B6B';

    return `
      <div class="account-card" data-id="${fs.id}">
        <div class="account-header">
          <span class="account-name">${fs.name}</span>
          <span class="account-type">${fs.type.replace('_', ' ')}</span>
        </div>
        <div class="account-balance ${balanceClass}">${formatCurrency(balance)}</div>
        <div class="account-meta">
          ${fs.bankName ? fs.bankName + ' · ' : ''} ${fs.accountNumber ? '••••' + fs.accountNumber : ''}
        </div>
        <div class="sparkline-chart" id="sparkline-${fs.id}"></div>
        <div style="margin-top: 12px; display: flex; gap: 12px; font-size: 13px;">
          <span style="color: var(--accent-green);">CR: ${formatCurrency(monthlyFlow.cr)}</span>
          <span style="color: var(--accent-red);">DR: ${formatCurrency(monthlyFlow.dr)}</span>
        </div>
        <div class="account-actions">
          <button class="btn btn-edit" data-action="edit" data-id="${fs.id}">✏️ Edit</button>
          <button class="btn btn-delete" data-action="delete" data-id="${fs.id}">🗑️ Delete</button>
        </div>
      </div>
    `;
  }).join('');

  // Draw sparklines
  activeSources.forEach(fs => {
    const sparklineData = FundSourceService.getSparklineData(fs.id, 14);
    drawSparkline(document.getElementById(`sparkline-${fs.id}`), sparklineData, fs.color || '#10B981');
  });
}

function getCurrentMonthFlow(fundSourceId) {
  const now = new Date();
  return FundSourceService.getMonthlyFlow(fundSourceId, now.getFullYear(), now.getMonth());
}

// Import AnalyticsService for net worth calculation (moved to top)

function setupEventListeners() {
  // Add account button
  const addBtn = document.getElementById('add-account-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => showAddAccountModal());
  }

  // Event delegation for edit/delete buttons
  const grid = document.getElementById('accounts-grid');
  if (grid) {
    grid.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      const id = e.target.dataset.id;

      if (action === 'edit' && id) {
        showEditAccountModal(id);
      } else if (action === 'delete' && id) {
        showDeleteConfirmation(id);
      }
    });
  }
}

function showAddAccountModal() {
  const colorSwatches = ['#10B981', '#F4B942', '#60A5FA', '#EC4899', '#8B5CF6', '#F59E0B', '#F87171', '#A78BFA'];

  openModal('Add Account', `
    <div class="form-group">
      <label class="form-label">Account Name *</label>
      <input type="text" class="form-input" id="modal-account-name" placeholder="My Savings Account">
    </div>
    <div class="form-group">
      <label class="form-label">Account Type *</label>
      <select class="form-input form-select" id="modal-account-type">
        ${FUND_SOURCE_TYPES.map(t => `<option value="${t.id}">${t.icon} ${t.label}</option>`).join('')}
      </select>
    </div>
    <div id="bank-specific-fields">
      <div class="form-group">
        <label class="form-label">Bank Name</label>
        <input type="text" class="form-input" id="modal-bank-name" placeholder="e.g. Commercial Bank">
      </div>
      <div class="form-group">
        <label class="form-label">Account Number (last 4 digits)</label>
        <input type="text" class="form-input" id="modal-account-number" placeholder="1234" maxlength="4">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Starting Balance</label>
        <input type="number" class="form-input" id="modal-balance" value="0" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <select class="form-input form-select" id="modal-currency">
          ${CURRENCIES.map(c => `<option value="${c.code}" ${c.code === 'LKR' ? 'selected' : ''}>${c.code}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Color</label>
      <div class="color-swatches">
        ${colorSwatches.map((c, i) => `
          <div class="color-swatch ${i === 0 ? 'selected' : ''}" style="background: ${c}" data-color="${c}" onclick="selectColorSwatch(this)"></div>
        `).join('')}
      </div>
      <input type="hidden" id="modal-color" value="${colorSwatches[0]}">
    </div>
  `, () => {
    if (!canSubmit('add-account-form')) return false;

    const name = document.getElementById('modal-account-name').value;
    const type = document.getElementById('modal-account-type').value;
    const isCash = type === 'cash';
    const bankName = isCash ? null : document.getElementById('modal-bank-name').value;
    const accountNumber = isCash ? null : document.getElementById('modal-account-number').value;
    const balance = document.getElementById('modal-balance').value;
    const currency = document.getElementById('modal-currency').value;
    const color = document.getElementById('modal-color').value;

    if (!name || name.length < 2) {
      showToast('Account name must be at least 2 characters', 'error');
      return false;
    }

    try {
      FundSourceService.add({ name, type, bankName, accountNumber, balance, currency, color });
      showToast('Account created', 'success');
      renderBanks();
      return true;
    } catch (error) {
      showToast(translateError(error), 'error');
      return false;
    }
  });

  // Reactive field visibility
  const typeSelect = document.getElementById('modal-account-type');
  const bankFields = document.getElementById('bank-specific-fields');
  if (typeSelect && bankFields) {
    const updateVisibility = () => {
      if (typeSelect.value === 'cash') {
        bankFields.classList.add('hidden');
      } else {
        bankFields.classList.remove('hidden');
      }
    };
    typeSelect.addEventListener('change', updateVisibility);
    updateVisibility();
  }
}

function showEditAccountModal(id) {
  const state = getState();
  const fs = state.fundSources.find(f => f.id === id);
  if (!fs) return;

  const colorSwatches = ['#10B981', '#F4B942', '#60A5FA', '#EC4899', '#8B5CF6', '#F59E0B', '#F87171', '#A78BFA'];

  openModal('Edit Account', `
    <div class="form-group">
      <label class="form-label">Account Name *</label>
      <input type="text" class="form-input" id="edit-account-name" value="${fs.name}">
    </div>
    <div class="form-group">
      <label class="form-label">Account Type *</label>
      <select class="form-input form-select" id="edit-account-type">
        ${FUND_SOURCE_TYPES.map(t => `<option value="${t.id}" ${t.id === fs.type ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
      </select>
    </div>
    <div id="edit-bank-specific-fields">
      <div class="form-group">
        <label class="form-label">Bank Name</label>
        <input type="text" class="form-input" id="edit-bank-name" value="${fs.bankName || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Account Number (last 4 digits)</label>
        <input type="text" class="form-input" id="edit-account-number" value="${fs.accountNumber || ''}" maxlength="4">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Current Balance</label>
        <input type="number" class="form-input" id="edit-balance" value="${fs.balance}" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <select class="form-input form-select" id="edit-currency">
          ${CURRENCIES.map(c => `<option value="${c.code}" ${c.code === fs.currency ? 'selected' : ''}>${c.code}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Color</label>
      <div class="color-swatches">
        ${colorSwatches.map(c => `
          <div class="color-swatch ${c === fs.color ? 'selected' : ''}" style="background: ${c}" data-color="${c}" onclick="selectEditColorSwatch(this)"></div>
        `).join('')}
      </div>
      <input type="hidden" id="edit-color" value="${fs.color || colorSwatches[0]}">
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <input type="text" class="form-input" id="edit-notes" value="${fs.notes || ''}">
    </div>
  `, () => {
    if (!canSubmit('edit-account-form')) return false;

    const name = document.getElementById('edit-account-name').value;
    const type = document.getElementById('edit-account-type').value;
    const isCash = type === 'cash';
    const bankName = isCash ? null : document.getElementById('edit-bank-name').value;
    const accountNumber = isCash ? null : document.getElementById('edit-account-number').value;
    const balance = document.getElementById('edit-balance').value;
    const currency = document.getElementById('edit-currency').value;
    const color = document.getElementById('edit-color').value;
    const notes = document.getElementById('edit-notes').value;

    if (!name || name.length < 2) {
      showToast('Account name must be at least 2 characters', 'error');
      return false;
    }

    try {
      FundSourceService.edit(id, { name, type, bankName, accountNumber, balance, currency, color, notes });
      showToast('Account updated', 'success');
      renderBanks();
      return true;
    } catch (error) {
      showToast(translateError(error), 'error');
      return false;
    }
  }, 'Save');

  // Reactive field visibility
  const typeSelect = document.getElementById('edit-account-type');
  const bankFields = document.getElementById('edit-bank-specific-fields');
  if (typeSelect && bankFields) {
    const updateVisibility = () => {
      if (typeSelect.value === 'cash') {
        bankFields.classList.add('hidden');
      } else {
        bankFields.classList.remove('hidden');
      }
    };
    typeSelect.addEventListener('change', updateVisibility);
    updateVisibility();
  }
}

function showDeleteConfirmation(id) {
  const state = getState();
  const fs = state.fundSources.find(f => f.id === id);
  if (!fs) return;

  const hasTransactions = state.transactions.some(tx => tx.fundSourceId === id);
  const message = hasTransactions
    ? `Are you sure you want to archive "${fs.name}"? This account has linked transactions that will be preserved.`
    : `Are you sure you want to delete "${fs.name}"?`;
  const confirmLabel = hasTransactions ? 'Archive' : 'Delete';

  openModal(confirmLabel + ' Account', message, () => {
    FundSourceService.softDelete(id);
    showToast(`${fs.name} archived`, 'info');
    renderBanks();
    return true;
  }, confirmLabel);
}

// Global functions for color selection
window.selectColorSwatch = function (el) {
  document.querySelectorAll('#modal-body .color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('modal-color').value = el.dataset.color;
};

window.selectEditColorSwatch = function (el) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('edit-color').value = el.dataset.color;
};

// Register view for automatic re-rendering
registerViewRenderer('banks', renderBanks);