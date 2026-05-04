/**
 * @fileoverview Budgets view
 */

import { getState, registerViewRenderer } from '../state.js';
import { BudgetService } from '../services/budget.service.js';
import { GoalService } from '../services/goal.service.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { CATEGORIES, DR_CATEGORIES } from '../data/seed.js';
import { formatCurrency, formatPct } from '../utils/formatters.js';
import { canSubmit, translateError } from '../security/index.js';
import { sensitiveValueHtml } from '../security/privacy.js';

/**
 * Render budgets view
 */
export function renderBudgets() {
  const container = document.getElementById('view-budgets');
  if (!container) return;

  const summary = BudgetService.getSummary();
  const statuses = BudgetService.getStatus();
  const unbudgeted = BudgetService.getUnbudgetedCategories();
  const goals = GoalService.getAll();

  const html = `
    <div class="view-header" style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
      <h2 class="view-title">Goals & Budgets</h2>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-secondary" id="add-goal-btn">+ Add Goal</button>
        <button class="btn btn-primary" id="add-budget-btn">+ Add Budget</button>
      </div>
    </div>

    <h3 class="chart-title">Saving Goals</h3>
    <div class="grid grid-3" id="goals-grid" style="margin-bottom: 32px;">
      ${goals.length === 0 ? `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 24px;">
          <div class="empty-icon">🎯</div>
          <div class="empty-text">No saving goals created yet</div>
        </div>
      ` : ''}
    </div>

    <h3 class="chart-title">Expense Budgets</h3>

    <div class="grid grid-4" style="margin-bottom: 32px;">
      <div class="stat-card">
        <div class="stat-label">Total Budgeted</div>
        <div class="stat-value">${sensitiveValueHtml(formatCurrency(summary.totalBudgeted), { width: '11ch', copyValue: String(summary.totalBudgeted), copyLabel: 'Total budgeted' })}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Spent</div>
        <div class="stat-value" style="color: var(--accent-red);">${sensitiveValueHtml(formatCurrency(summary.totalSpent), { width: '11ch', copyValue: String(summary.totalSpent), copyLabel: 'Total spent' })}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Remaining</div>
        <div class="stat-value" style="color: ${summary.totalRemaining >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">${sensitiveValueHtml(formatCurrency(summary.totalRemaining), { width: '11ch', copyValue: String(summary.totalRemaining), copyLabel: 'Remaining budget' })}</div>
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
                <div style="font-family: var(--font-mono); color: var(--accent-red);">${sensitiveValueHtml(formatCurrency(ub.spent), { width: '10ch', copyValue: String(ub.spent), copyLabel: 'Unbudgeted spend' })}</div>
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
    renderGoalCards(goals);
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
          ${sensitiveValueHtml(formatCurrency(b.spent), { width: '10ch', copyValue: String(b.spent), copyLabel: 'Budget spent' })} <span style="color: var(--text-muted); font-size: 14px;">/ ${sensitiveValueHtml(formatCurrency(b.limit), { width: '10ch', copyValue: String(b.limit), copyLabel: 'Budget limit' })}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${fillClass}" style="width: ${Math.min(b.utilization, 100)}%"></div>
        </div>
        <div class="budget-status">
          <span class="budget-spent">${b.utilization.toFixed(1)}% used</span>
          <span class="budget-remaining" style="color: ${b.remaining >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
            ${b.remaining >= 0 ? `${sensitiveValueHtml(formatCurrency(b.remaining), { width: '10ch', copyValue: String(b.remaining), copyLabel: 'Budget remaining' })} left` : `${sensitiveValueHtml(formatCurrency(Math.abs(b.remaining)), { width: '10ch', copyValue: String(Math.abs(b.remaining)), copyLabel: 'Budget overage' })} over`}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

function renderGoalCards(goals) {
  const grid = document.getElementById('goals-grid');
  if (!grid || goals.length === 0) return;

  grid.innerHTML = goals.map(g => {
    const progress = GoalService.getProgress(g);
    const fillClass = progress.isCompleted ? 'green' : 'blue';

    return `
      <div class="budget-card" data-id="${g.id}">
        <div class="budget-header">
          <span class="budget-emoji">${g.icon}</span>
          <span class="budget-name">${g.name}</span>
          <button class="btn btn-sm btn-ghost" data-action="edit-goal" data-id="${g.id}" style="margin-left: auto; padding: 4px 8px;">✏️</button>
          <button class="btn btn-sm btn-ghost" data-action="delete-goal" data-id="${g.id}" style="padding: 4px 8px;">🗑️</button>
        </div>
        <div class="budget-amount" style="font-family: var(--font-mono); font-size: 18px; margin-bottom: 12px; color: var(--accent-blue);">
          ${sensitiveValueHtml(formatCurrency(g.savedAmount), { width: '10ch', copyValue: String(g.savedAmount), copyLabel: 'Saved amount' })} <span style="color: var(--text-muted); font-size: 14px;">/ ${sensitiveValueHtml(formatCurrency(g.targetAmount), { width: '10ch', copyValue: String(g.targetAmount), copyLabel: 'Target amount' })}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${fillClass}" style="width: ${progress.utilization}%"></div>
        </div>
        <div class="budget-status">
          <span class="budget-spent">${progress.utilization.toFixed(1)}% reached</span>
          <span class="budget-remaining" style="color: ${progress.isCompleted ? 'var(--accent-green)' : 'var(--text-muted)'};">
            ${progress.isCompleted ? 'Goal Completed! 🎉' : `${sensitiveValueHtml(formatCurrency(progress.remaining), { width: '10ch', copyValue: String(progress.remaining), copyLabel: 'Remaining to goal' })} to go`}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

function setupEventListeners() {
  const addBudgetBtn = document.getElementById('add-budget-btn');
  if (addBudgetBtn) addBudgetBtn.addEventListener('click', () => showAddBudgetModal());

  const addGoalBtn = document.getElementById('add-goal-btn');
  if (addGoalBtn) addGoalBtn.addEventListener('click', () => showAddGoalModal());

  // Event delegation for edit/delete budgets
  const budgetGrid = document.getElementById('budgets-grid');
  if (budgetGrid) {
    budgetGrid.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      const id = e.target.dataset.id;
      if (action === 'edit' && id) showEditBudgetModal(id);
      else if (action === 'delete' && id) showDeleteBudgetConfirmation(id);
    });
  }

  // Event delegation for edit/delete goals
  const goalsGrid = document.getElementById('goals-grid');
  if (goalsGrid) {
    goalsGrid.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      const id = e.target.dataset.id;
      if (action === 'edit-goal' && id) showEditGoalModal(id);
      else if (action === 'delete-goal' && id) showDeleteGoalConfirmation(id);
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
    if (!canSubmit('add-budget-form')) return false;

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

    try {
      BudgetService.add({ category, limit });
      showToast('Budget created', 'success');
      renderBudgets();
      return true;
    } catch (error) {
      showToast(translateError(error), 'error');
      return false;
    }
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
    if (!canSubmit('edit-budget-form')) return false;

    const limit = document.getElementById('edit-budget-limit').value;

    if (!limit || parseFloat(limit) <= 0) {
      showToast('Please enter a valid limit', 'error');
      return false;
    }

    try {
      BudgetService.edit(id, { limit: parseFloat(limit) });
      showToast('Budget updated', 'success');
      renderBudgets();
      return true;
    } catch (error) {
      showToast(translateError(error), 'error');
      return false;
    }
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

// ── Goals Modals ────────────────────────────────────────────────────────────

function showAddGoalModal() {
  openModal('Add Saving Goal', `
    <div class="form-group">
      <label class="form-label">Goal Name *</label>
      <input type="text" class="form-input" id="goal-name" placeholder="e.g. New Car, Emergency Fund">
    </div>
    <div class="form-group">
      <label class="form-label">Target Amount *</label>
      <input type="number" class="form-input" id="goal-target" min="1" step="1000" placeholder="100000">
    </div>
    <div class="form-group">
      <label class="form-label">Already Saved (Optional)</label>
      <input type="number" class="form-input" id="goal-saved" min="0" step="1000" placeholder="0">
    </div>
    <div class="form-group">
      <label class="form-label">Target Date (Optional)</label>
      <input type="date" class="form-input" id="goal-date">
    </div>
  `, () => {
    if (!canSubmit('add-goal-form')) return false;

    const name = document.getElementById('goal-name').value;
    const targetAmount = document.getElementById('goal-target').value;
    const savedAmount = document.getElementById('goal-saved').value || 0;
    const targetDate = document.getElementById('goal-date').value;

    try {
      GoalService.add({ name, targetAmount, savedAmount, targetDate });
      showToast('Goal created', 'success');
      renderBudgets();
      return true;
    } catch (error) {
      showToast(translateError(error), 'error');
      return false;
    }
  });
}

function showEditGoalModal(id) {
  const goal = GoalService.getAll().find(g => g.id === id);
  if (!goal) return;

  openModal('Edit Saving Goal', `
    <div class="form-group">
      <label class="form-label">Goal Name *</label>
      <input type="text" class="form-input" id="edit-goal-name" value="${goal.name}">
    </div>
    <div class="form-group">
      <label class="form-label">Target Amount *</label>
      <input type="number" class="form-input" id="edit-goal-target" min="1" step="1000" value="${goal.targetAmount}">
    </div>
    <div class="form-group">
      <label class="form-label">Currently Saved</label>
      <input type="number" class="form-input" id="edit-goal-saved" min="0" step="1000" value="${goal.savedAmount}">
    </div>
    <div class="form-group">
      <label class="form-label">Target Date</label>
      <input type="date" class="form-input" id="edit-goal-date" value="${goal.targetDate || ''}">
    </div>
  `, () => {
    if (!canSubmit('edit-goal-form')) return false;

    const name = document.getElementById('edit-goal-name').value;
    const targetAmount = document.getElementById('edit-goal-target').value;
    const savedAmount = document.getElementById('edit-goal-saved').value;
    const targetDate = document.getElementById('edit-goal-date').value;

    try {
      GoalService.edit(id, { name, targetAmount, savedAmount, targetDate });
      showToast('Goal updated', 'success');
      renderBudgets();
      return true;
    } catch (error) {
      showToast(translateError(error), 'error');
      return false;
    }
  }, 'Save');
}

function showDeleteGoalConfirmation(id) {
  openModal('Delete Goal', 'Are you sure you want to delete this saving goal? This will not delete your actual funds.', () => {
    GoalService.delete(id);
    showToast('Goal deleted', 'success');
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