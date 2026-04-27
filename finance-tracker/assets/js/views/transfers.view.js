/**
 * @fileoverview Transfers view
 */

import { getState, registerViewRenderer } from '../state.js';
import { TransferService } from '../services/transfer.service.js';
import { FundSourceService } from '../services/fundSource.service.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { openDrawer, closeDrawer } from '../components/drawer.js';
import { formatCurrency } from '../components/charts.js';
import { canSubmit, setButtonLoading, setButtonReady, translateError } from '../security/index.js';
import { sensitiveValueHtml } from '../security/privacy.js';

/**
 * Render transfers view
 */
export function renderTransfers() {
  const container = document.getElementById('view-transfers');
  if (!container) return;

  const state = getState();
  const activeFundSources = state.fundSources.filter(fs => fs.isActive !== false);

  if (activeFundSources.length < 2) {
    container.innerHTML = `
      <div class="view-header">
        <h2 class="view-title">Transfers</h2>
      </div>
      <div class="empty-state">
        <div class="empty-icon">🔄</div>
        <div class="empty-text">You need at least 2 accounts to make transfers</div>
      </div>
    `;
    return;
  }

  const transfers = TransferService.getAll();

  const html = `
    <div class="view-header">
      <h2 class="view-title">Transfers</h2>
      <button class="btn btn-primary" id="add-transfer-btn">+ New Transfer</button>
    </div>

    <div class="card">
      ${transfers.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">🔄</div>
          <div class="empty-text">No transfers yet</div>
        </div>
      ` : `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>From</th>
                <th></th>
                <th>To</th>
                <th>Amount</th>
                <th>Fee</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${transfers.map(t => {
                const fromFs = state.fundSources.find(f => f.id === t.fromFundSourceId);
                const toFs = state.fundSources.find(f => f.id === t.toFundSourceId);
                const date = new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });

                return `
                  <tr>
                    <td class="mono">${date}</td>
                    <td><span class="badge badge-trf">${fromFs?.name || '[Deleted]'}</span></td>
                    <td>→</td>
                    <td><span class="badge badge-trf">${toFs?.name || '[Deleted]'}</span></td>
                    <td class="mono" style="color: var(--accent-blue);">${sensitiveValueHtml(formatCurrency(t.amount), { width: '10ch', copyValue: String(t.amount), copyLabel: 'Transfer amount' })}</td>
                    <td class="mono">${t.fee > 0 ? sensitiveValueHtml(formatCurrency(t.fee), { width: '8ch', copyValue: String(t.fee), copyLabel: 'Transfer fee' }) : '-'}</td>
                    <td>${t.note || '-'}</td>
                    <td><span class="tx-delete" onclick="window.deleteTransfer('${t.id}')">🗑️</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  container.innerHTML = html;

  // Setup event listeners
  setTimeout(() => {
    const addBtn = document.getElementById('add-transfer-btn');
    if (addBtn) addBtn.addEventListener('click', showAddTransferForm);
  }, 50);
}

/**
 * Show add transfer form
 */
export function showAddTransferForm() {
  const state = getState();
  const activeFundSources = state.fundSources.filter(fs => fs.isActive !== false);

  const footerHTML = `
    <button class="btn btn-secondary" id="drawer-cancel">Cancel</button>
    <button class="btn btn-primary" id="drawer-save">Transfer</button>
  `;

  const { cancelBtn, saveBtn } = openDrawer('New Transfer', `
    <form id="transfer-form">
      <div class="form-group">
        <label class="form-label">From Account *</label>
        <select class="form-input form-select" id="transfer-from" required>
          <option value="">Select source account</option>
          ${activeFundSources.map(fs => {
            const balance = FundSourceService.getBalance(fs.id);
            return `<option value="${fs.id}">${fs.icon || '🏦'} ${fs.name} (${formatCurrency(balance)})</option>`;
          }).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">To Account *</label>
        <select class="form-input form-select" id="transfer-to" required>
          <option value="">Select destination account</option>
          ${activeFundSources.map(fs => {
            const balance = FundSourceService.getBalance(fs.id);
            return `<option value="${fs.id}">${fs.icon || '🏦'} ${fs.name} (${formatCurrency(balance)})</option>`;
          }).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Amount *</label>
        <input type="number" class="form-input" id="transfer-amount" required min="0.01" step="0.01" placeholder="0.00">
      </div>

      <div class="form-group">
        <label class="form-label">Transfer Fee</label>
        <input type="number" class="form-input" id="transfer-fee" min="0" step="0.01" value="0" placeholder="0.00">
      </div>

      <div class="form-group">
        <label class="form-label">Date *</label>
        <input type="date" class="form-input" id="transfer-date" required>
      </div>

      <div class="form-group">
        <label class="form-label">Note (optional)</label>
        <input type="text" class="form-input" id="transfer-note" placeholder="e.g. Monthly savings transfer">
      </div>

      <div id="transfer-preview" class="card" style="background: var(--bg-hover); margin-top: 16px;">
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">Preview</div>
        <div id="preview-balance" style="font-family: var(--font-mono);"></div>
      </div>
    </form>
  `, footerHTML);

  // Set default date
  document.getElementById('transfer-date').value = new Date().toISOString().split('T')[0];

  // Balance preview on change
  const amountInput = document.getElementById('transfer-amount');
  const feeInput = document.getElementById('transfer-fee');
  const fromSelect = document.getElementById('transfer-from');
  const toSelect = document.getElementById('transfer-to');

  const updatePreview = () => {
    const fromId = fromSelect?.value;
    const toId = toSelect?.value;
    const amount = parseFloat(amountInput?.value) || 0;
    const fee = parseFloat(feeInput?.value) || 0;

    if (fromId) {
      const fromBalance = FundSourceService.getBalance(fromId);
      const remaining = fromBalance - amount - fee;
      const preview = document.getElementById('preview-balance');
      if (preview) {
        preview.innerHTML = `
          <div style="margin-bottom: 4px;">After transfer:</div>
          <div style="color: ${remaining >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
            ${sensitiveValueHtml(formatCurrency(remaining), { width: '10ch', copyValue: String(remaining), copyLabel: 'Remaining balance' })}
          </div>
        `;
      }
    }
  };

  [amountInput, feeInput, fromSelect, toSelect].forEach(el => {
    if (el) el.addEventListener('input', updatePreview);
    if (el) el.addEventListener('change', updatePreview);
  });

  // Validate: from !== to
  if (fromSelect && toSelect) {
    toSelect.addEventListener('change', () => {
      if (fromSelect.value === toSelect.value && fromSelect.value) {
        showToast('Cannot transfer to the same account', 'warning');
        toSelect.value = '';
      }
    });
  }

  // Button handlers
  if (cancelBtn) cancelBtn.addEventListener('click', closeDrawer);
  if (saveBtn) saveBtn.addEventListener('click', saveTransfer);
}

function saveTransfer() {
  if (!canSubmit('transfer-form')) return;

  const fromFundSourceId = document.getElementById('transfer-from')?.value;
  const toFundSourceId = document.getElementById('transfer-to')?.value;
  const amount = document.getElementById('transfer-amount')?.value;
  const fee = document.getElementById('transfer-fee')?.value;
  const date = document.getElementById('transfer-date')?.value;
  const note = document.getElementById('transfer-note')?.value;

  // Validation
  if (!fromFundSourceId) {
    showToast('Please select source account', 'error');
    return;
  }
  if (!toFundSourceId) {
    showToast('Please select destination account', 'error');
    return;
  }
  if (fromFundSourceId === toFundSourceId) {
    showToast('Cannot transfer to the same account', 'error');
    return;
  }
  if (!amount || parseFloat(amount) <= 0) {
    showToast('Amount must be greater than 0', 'error');
    return;
  }
  if (!date) {
    showToast('Please select a date', 'error');
    return;
  }

  const saveBtn = document.getElementById('drawer-save');
  setButtonLoading(saveBtn, 'Transferring...');
  try {
    TransferService.add({
      fromFundSourceId,
      toFundSourceId,
      amount,
      fee: fee || 0,
      date,
      note
    });

    closeDrawer();
    showToast(`Transfer of ${formatCurrency(parseFloat(amount))} completed`, 'success');
    renderTransfers();
  } catch (error) {
    showToast(translateError(error), 'error');
  } finally {
    setButtonReady(saveBtn);
  }
}

// Global function for deletion
window.deleteTransfer = function(id) {
  openModal('Delete Transfer', 'Are you sure you want to delete this transfer?', () => {
    TransferService.delete(id);
    showToast('Transfer deleted', 'success');
    renderTransfers();
    return true;
  });
};

// Register view for automatic re-rendering
registerViewRenderer('transfers', renderTransfers);