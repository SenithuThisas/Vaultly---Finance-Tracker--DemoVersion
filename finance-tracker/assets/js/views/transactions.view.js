/**
 * @fileoverview Transactions view
 */

import { getState, registerViewRenderer } from '../state.js';
import { TransactionService } from '../services/transaction.service.js';
import { FundSourceService } from '../services/fundSource.service.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { openDrawer, closeDrawer } from '../components/drawer.js';
import { CATEGORIES, CR_CATEGORIES, DR_CATEGORIES, CURRENCIES } from '../data/seed.js';
import { formatCurrency } from '../utils/formatters.js';
import { canSubmit, setButtonLoading, setButtonReady, translateError } from '../security/index.js';
import { sensitiveValueHtml } from '../security/privacy.js';

const TRANSACTIONS_PAGE_SIZE = 50;
let currentPage = 1;

/**
 * Render transactions view
 */
export function renderTransactions() {
  const container = document.getElementById('view-transactions');
  if (!container) return;

  const state = getState();
  const activeFundSources = state.fundSources.filter(fs => fs.isActive !== false);

  if (activeFundSources.length === 0) {
    container.innerHTML = `
      <div class="view-header">
        <h2 class="view-title">Transactions</h2>
      </div>
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <div class="empty-text">Please add a fund source first</div>
      </div>
    `;
    return;
  }

  const html = `
    <div class="view-header">
      <h2 class="view-title">Transactions</h2>
    </div>

    <div class="filter-bar">
      <input type="text" class="filter-input search-input" id="tx-search" placeholder="Search transactions...">
      <select class="filter-input form-select" id="tx-type-filter">
        <option value="">All Types</option>
        <option value="CR">Credit (In)</option>
        <option value="DR">Debit (Out)</option>
      </select>
      <select class="filter-input form-select" id="tx-category-filter">
        <option value="">All Categories</option>
      </select>
      <input type="month" class="filter-input" id="tx-month-filter">
    </div>

    <div class="card">
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th data-sort="date">Date</th>
              <th>Category</th>
              <th data-sort="title">Title</th>
              <th class="col-account">Account</th>
              <th data-sort="amount">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="tx-table-body"></tbody>
        </table>
      </div>
      <div class="empty-state" id="tx-empty" style="display: none;">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">No transactions found</div>
      </div>
      <div id="tx-pagination" style="display:flex;justify-content:flex-end;gap:8px;padding:12px 4px 0;"></div>
    </div>
  `;

  container.innerHTML = html;

  // Populate category filter
  setTimeout(() => {
    populateCategoryFilter();
    setupEventListeners();
    renderTransactionTable();
  }, 50);
}

function populateCategoryFilter() {
  const select = document.getElementById('tx-category-filter');
  if (select) {
    select.innerHTML = '<option value="">All Categories</option>' +
      CATEGORIES.map(c => `<option value="${c.id}">${c.emoji} ${c.label}</option>`).join('');
  }
}

function setupEventListeners() {
  // Search
  const searchInput = document.getElementById('tx-search');
  if (searchInput) {
    let timeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        currentPage = 1;
        renderTransactionTable();
      }, 300);
    });
  }

  // Filters
  ['tx-type-filter', 'tx-category-filter', 'tx-month-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        currentPage = 1;
        renderTransactionTable();
      });
    }
  });
}

function renderTransactionTable() {
  const tbody = document.getElementById('tx-table-body');
  const emptyEl = document.getElementById('tx-empty');
  const paginationEl = document.getElementById('tx-pagination');
  if (!tbody || !emptyEl || !paginationEl) return;

  const search = document.getElementById('tx-search')?.value?.toLowerCase() || '';
  const typeFilter = document.getElementById('tx-type-filter')?.value || '';
  const categoryFilter = document.getElementById('tx-category-filter')?.value || '';
  const monthFilter = document.getElementById('tx-month-filter')?.value || '';

  let filtered = [...getState().transactions];

  if (search) {
    filtered = filtered.filter(tx =>
      tx.title.toLowerCase().includes(search) ||
      tx.note?.toLowerCase().includes(search)
    );
  }

  if (typeFilter) {
    filtered = filtered.filter(tx => tx.type === typeFilter);
  }

  if (categoryFilter) {
    filtered = filtered.filter(tx => tx.category === categoryFilter);
  }

  if (monthFilter) {
    const [year, month] = monthFilter.split('-').map(Number);
    filtered = filtered.filter(tx => {
      const d = new Date(tx.date);
      return d.getFullYear() === year && d.getMonth() === month - 1;
    });
  }

  // Sort by date descending
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  const pageCount = Math.max(1, Math.ceil(filtered.length / TRANSACTIONS_PAGE_SIZE));
  currentPage = Math.min(currentPage, pageCount);
  const startIdx = (currentPage - 1) * TRANSACTIONS_PAGE_SIZE;
  const pagedRows = filtered.slice(startIdx, startIdx + TRANSACTIONS_PAGE_SIZE);

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    paginationEl.innerHTML = '';
    return;
  }

  emptyEl.style.display = 'none';

  tbody.innerHTML = pagedRows.map(tx => {
    const cat = CATEGORIES.find(c => c.id === tx.category) || { emoji: '📦', label: tx.category };
    const fs = getState().fundSources.find(f => f.id === tx.fundSourceId);
    const date = new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
    const typeClass = tx.type === 'CR' ? 'cr' : 'dr';

    return `
      <tr>
        <td class="mono">${date}</td>
        <td><span class="badge badge-${typeClass}">${cat.emoji} ${cat.label}</span></td>
        <td>${tx.title}</td>
        <td class="col-account">${fs?.name || '[Deleted]'}</td>
        <td class="mono tx-amount ${typeClass}">${sensitiveValueHtml(`${tx.type === 'CR' ? '+' : '-'}${formatCurrency(tx.amount)}`, { width: '10ch', copyValue: String(tx.amount), copyLabel: 'Transaction amount' })}</td>
        <td><span class="tx-delete" onclick="window.deleteTransaction('${tx.id}')">🗑️</span></td>
      </tr>
    `;
  }).join('');

  const prevDisabled = currentPage === 1 ? 'disabled' : '';
  const nextDisabled = currentPage === pageCount ? 'disabled' : '';
  paginationEl.innerHTML = `
    <button class="btn btn-sm btn-secondary" ${prevDisabled} onclick="window.changeTxPage(${currentPage - 1})">Prev</button>
    <span style="align-self:center;color:var(--text-muted);font-size:12px;">Page ${currentPage} / ${pageCount}</span>
    <button class="btn btn-sm btn-secondary" ${nextDisabled} onclick="window.changeTxPage(${currentPage + 1})">Next</button>
  `;
}

/**
 * Show add transaction form
 */
export function showAddTransactionForm() {
  const state = getState();
  const activeFundSources = state.fundSources.filter(fs => fs.isActive !== false);

  if (activeFundSources.length === 0) {
    showToast('Please add a fund source first', 'error');
    return;
  }

  const footerHTML = `
    <button class="btn btn-secondary" id="drawer-cancel">Cancel</button>
    <button class="btn btn-primary" id="drawer-save">Record Transaction</button>
  `;

  const { cancelBtn, saveBtn } = openDrawer('Add Transaction', `
    <form id="tx-form">
      <div class="form-group">
        <label class="form-label">Transaction Type</label>
        <div class="radio-group" style="display: flex; gap: 16px;">
          <label class="radio-option" style="flex: 1; padding: 12px; background: var(--bg-hover); border-radius: 8px; border: 2px solid var(--border);">
            <input type="radio" name="tx-type" value="DR" checked>
            <span>💸 Debit (Money Out)</span>
          </label>
          <label class="radio-option" style="flex: 1; padding: 12px; background: var(--bg-hover); border-radius: 8px; border: 2px solid var(--border);">
            <input type="radio" name="tx-type" value="CR">
            <span>💰 Credit (Money In)</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Title *</label>
        <input type="text" class="form-input" id="tx-title" required placeholder="e.g. Grocery Shopping">
      </div>

      <div class="form-group">
        <label class="form-label">Amount *</label>
        <input type="number" class="form-input" id="tx-amount" required min="0.01" step="0.01" placeholder="0.00">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Category *</label>
          <select class="form-input form-select" id="tx-category" required></select>
        </div>
        <div class="form-group">
          <label class="form-label">Date *</label>
          <input type="date" class="form-input" id="tx-date" required>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Fund Source *</label>
        <select class="form-input form-select" id="tx-fund-source" required>
          ${activeFundSources.map(fs => `<option value="${fs.id}">${fs.icon || '🏦'} ${fs.name}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Reference (optional)</label>
        <input type="text" class="form-input" id="tx-reference" placeholder="e.g. CHEQUE-1234">
      </div>

      <div class="form-group">
        <label class="form-label">Note (optional)</label>
        <input type="text" class="form-input" id="tx-note" placeholder="Additional details...">
      </div>

      <div class="form-group">
        <label class="form-label" style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="tx-recurring">
          <span>Recurring Transaction</span>
        </label>
      </div>

      <div id="recurring-options" style="display: none;">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Frequency</label>
            <select class="form-input form-select" id="tx-recurring-period">
              <option value="weekly">Weekly</option>
              <option value="monthly" selected>Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Next Due Date</label>
            <input type="date" class="form-input" id="tx-next-due">
          </div>
        </div>
      </div>
    </form>
  `, footerHTML);

  // Set default date
  document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];

  // Update category based on type selection
  const typeRadios = document.querySelectorAll('input[name="tx-type"]');
  typeRadios.forEach(radio => radio.addEventListener('change', updateCategoryOptions));

  updateCategoryOptions();

  // Recurring toggle
  const recurringCheckbox = document.getElementById('tx-recurring');
  const recurringOptions = document.getElementById('recurring-options');
  if (recurringCheckbox) {
    recurringCheckbox.addEventListener('change', () => {
      recurringOptions.style.display = recurringCheckbox.checked ? 'block' : 'none';
    });
  }

  // Button handlers
  if (cancelBtn) cancelBtn.addEventListener('click', closeDrawer);
  if (saveBtn) saveBtn.addEventListener('click', saveTransaction);
}

function updateCategoryOptions() {
  const type = document.querySelector('input[name="tx-type"]:checked')?.value || 'DR';
  const categorySelect = document.getElementById('tx-category');
  const categories = type === 'CR' ? CR_CATEGORIES : DR_CATEGORIES;

  if (categorySelect) {
    categorySelect.innerHTML = categories.map(c =>
      `<option value="${c.id}">${c.emoji} ${c.label}</option>`
    ).join('');
  }
}

function saveTransaction() {
  if (!canSubmit('transaction-form')) return;

  const title = document.getElementById('tx-title')?.value;
  const amount = document.getElementById('tx-amount')?.value;
  const type = document.querySelector('input[name="tx-type"]:checked')?.value;
  const category = document.getElementById('tx-category')?.value;
  const date = document.getElementById('tx-date')?.value;
  const fundSourceId = document.getElementById('tx-fund-source')?.value;
  const reference = document.getElementById('tx-reference')?.value;
  const note = document.getElementById('tx-note')?.value;
  const isRecurring = document.getElementById('tx-recurring')?.checked;
  const recurringPeriod = document.getElementById('tx-recurring-period')?.value;

  // Validation
  if (!title || title.length < 2) {
    showToast('Title must be at least 2 characters', 'error');
    return;
  }
  if (!amount || parseFloat(amount) <= 0) {
    showToast('Amount must be greater than 0', 'error');
    return;
  }
  if (!category) {
    showToast('Please select a category', 'error');
    return;
  }
  if (!date) {
    showToast('Please select a date', 'error');
    return;
  }
  if (!fundSourceId) {
    showToast('Please select a fund source', 'error');
    return;
  }

  const saveBtn = document.getElementById('drawer-save');
  setButtonLoading(saveBtn, 'Saving...');
  try {
    TransactionService.add({
      title, amount, type, category, date, fundSourceId, reference, note, isRecurring, recurringPeriod
    });

    closeDrawer();
    showToast(`Transaction recorded: ${type === 'CR' ? '+' : '-'}${formatCurrency(parseFloat(amount))}`, 'success');
    renderTransactions();
  } catch (error) {
    showToast(translateError(error), 'error');
  } finally {
    setButtonReady(saveBtn);
  }
}

// Global function for deletion
window.deleteTransaction = function(id) {
  openModal('Delete Transaction', 'Are you sure you want to delete this transaction?', () => {
    TransactionService.delete(id);
    showToast('Transaction deleted', 'success');
    renderTransactions();
    return true;
  });
};

window.changeTxPage = function(page) {
  if (page < 1) return;
  currentPage = page;
  renderTransactionTable();
};

// Register view for automatic re-rendering
registerViewRenderer('transactions', renderTransactions);