/**
 * @fileoverview Budgets view
 */

import { getState, registerViewRenderer } from '../state.js';
import { BudgetService } from '../services/budget.service.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { CATEGORIES, DR_CATEGORIES } from '../data/seed.js';
import { formatCurrency, formatPct } from '../components/charts.js';

/**
 * Render budgets view
 */
export function renderBudgets() {
  const container = document.getElementById('view-budgets');
  if (!container) return;

  const summary = BudgetService.getSummary();
  const statuses = BudgetService.getStatus();
  const unbudgeted = BudgetService.getUnbudgetedCategories();

  const html = `
    <div class="view-header">
      <h2 class="view-title">Budgets</h2>
      <button class="btn btn-primary" id="add-budget-btn">+ Add Budget</button>
    </div>

    <div class="grid grid-4" style="margin-bottom: 32px;">
      <div class="stat-card">
        <div class="stat-label">Total Budgeted</div>
        <div class="stat-value">${formatCurrency(summary.totalBudgeted)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Spent</div>
        <div class="stat-value" style="color: var(--accent-red);">${formatCurrency(summary.totalSpent)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Remaining</div>
        <div class="stat-value" style="color: ${summary.totalRemaining >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">${formatCurrency(summary.totalRemaining)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Utilization</div>
        <div class="stat-value" style="color: ${summary.utilization > 90 ? 'var(--accent-red)' : summary.utilization > 70 ? 'var(--accent-gold)' : 'var(--accent-green)'};">${formatPct(summary.utilization)}</div>
      </div>
    </div>

    <div class="grid grid-3" id="budgets-grid">
      ${statuses.length === 0 ? `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">📊</div>
          <div class="empty-text">No budgets created yet</div>
        </div>
      ` : ''}
    </div>

    ${unbudgeted.length > 0 ? `
      <div class="card" style="margin-top: 32px;">
        <h3 class="chart-title">Unbudgeted Categories</h3>
        <p style="color: var(--text-muted); margin-bottom: 16px; font-size: 14px;">These categories have spending but no budget set.</p>
        <div class="grid grid-4">
          ${unbudgeted.map(ub => {
            const cat = CATEGORIES.find(c => c.id === ub.category) || { emoji: '📦', label: ub.category };
            return `
              <div class="card" style="padding: 16px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                  <span>${cat.emoji}</span>
                  <span>${cat.label}</span>
                </div>
                <div style="font-family: var(--font-mono); color: var(--accent-red);">${formatCurrency(ub.spent)}</div>
                <button class="btn btn-sm btn-secondary" style="margin-top: 8px; width: 100%;" onclick="window.quickAddBudget('${ub.category}')">+ Add Budget</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}
  `;

  container.innerHTML = html;

  // Render budget cards
  setTimeout(() => {
    renderBudgetCards(statuses);
    setupEventListeners();
  }, 50);
}

function renderBudgetCards(statuses) {
  const grid = document.getElementById('budgets-grid');
  if (!grid || statuses.length === 0) return;

  grid.innerHTML = statuses.map(b => {
    const cat = CATEGORIES.find(c => c.id === b.category) || { emoji: '📦', label: b.category };
    const color = b.utilization > 90 ? 'var(--accent-red)' : b.utilization > 70 ? 'var(--accent-gold)' : 'var(--accent-green)';
    const fillClass = b.utilization > 90 ? 'red' : b.utilization > 70 ? 'amber' : 'green';

    return `
      <div class="budget-card ${b.isOverBudget ? 'over-budget' : ''}" data-id="${b.id}">
        <div class="budget-header">
          <span class="budget-emoji">${cat.emoji}</span>
          <span class="budget-name">${cat.label}</span>
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${b.id}" style="margin-left: auto; padding: 4px 8px;">✏️</button>
          <button class="btn btn-sm btn-ghost" data-action="delete" data-id="${b.id}" style="padding: 4px 8px;">🗑️</button>
        </div>
        <div class="budget-amount" style="font-family: var(--font-mono); font-size: 18px; margin-bottom: 12px;">
          ${formatCurrency(b.spent)} <span style="color: var(--text-muted); font-size: 14px;">/ ${formatCurrency(b.limit)}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${fillClass}" style="width: ${Math.min(b.utilization, 100)}%"></div>
        </div>
        <div class="budget-status">
          <span class="budget-spent">${b.utilization.toFixed(1)}% used</span>
          <span class="budget-remaining" style="color: ${b.remaining >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
            ${b.remaining >= 0 ? formatCurrency(b.remaining) + ' left' : formatCurrency(Math.abs(b.remaining)) + ' over'}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

function setupEventListeners() {
  const addBtn = document.getElementById('add-budget-btn');
  if (addBtn) {
    addBtn.addEventListener('click', showAddBudgetModal);
  }

  // Event delegation for edit/delete
  const grid = document.getElementById('budgets-grid');
  if (grid) {
    grid.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      const id = e.target.dataset.id;

      if (action === 'edit' && id) {
        showEditBudgetModal(id);
      } else if (action === 'delete' && id) {
        showDeleteBudgetConfirmation(id);
      }
    });
  }
}

function showAddBudgetModal(category = '') {
  openModal('Add Budget', `
    <div class="form-group">
      <label class="form-label">Category *</label>
      <select class="form-input form-select" id="budget-category">
        ${DR_CATEGORIES.map(c => `<option value="${c.id}" ${c.id === category ? 'selected' : ''}>${c.emoji} ${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Monthly Limit *</label>
      <input type="number" class="form-input" id="budget-limit" min="1" step="1000" placeholder="50000">
    </div>
  `, () => {
    const category = document.getElementById('budget-category').value;
    const limit = document.getElementById('budget-limit').value;

    if (!category) {
      showToast('Please select a category', 'error');
      return false;
    }
    if (!limit || parseFloat(limit) <= 0) {
      showToast('Please enter a valid limit', 'error');
      return false;
    }

    BudgetService.add({ category, limit });
    showToast('Budget created', 'success');
    renderBudgets();
    return true;
  });
}

function showEditBudgetModal(id) {
  const state = getState();
  const budget = state.budgets.find(b => b.id === id);
  if (!budget) return;

  openModal('Edit Budget', `
    <div class="form-group">
      <label class="form-label">Category</label>
      <select class="form-input form-select" id="edit-budget-category" disabled>
        ${DR_CATEGORIES.map(c => `<option value="${c.id}" ${c.id === budget.category ? 'selected' : ''}>${c.emoji} ${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Monthly Limit *</label>
      <input type="number" class="form-input" id="edit-budget-limit" min="1" step="1000" value="${budget.limit}">
    </div>
  `, () => {
    const limit = document.getElementById('edit-budget-limit').value;

    if (!limit || parseFloat(limit) <= 0) {
      showToast('Please enter a valid limit', 'error');
      return false;
    }

    BudgetService.edit(id, { limit: parseFloat(limit) });
    showToast('Budget updated', 'success');
    renderBudgets();
    return true;
  }, 'Save');
}

function showDeleteBudgetConfirmation(id) {
  openModal('Delete Budget', 'Are you sure you want to delete this budget?', () => {
    BudgetService.delete(id);
    showToast('Budget deleted', 'success');
    renderBudgets();
    return true;
  }, 'Delete');
}

// Global function for quick add budget
window.quickAddBudget = function(category) {
  showAddBudgetModal(category);
};

// Register view for automatic re-rendering
registerViewRenderer('budgets', renderBudgets);