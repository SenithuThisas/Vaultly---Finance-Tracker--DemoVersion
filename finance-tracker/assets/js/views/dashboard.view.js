/**
 * @fileoverview Dashboard view
 */

import { getState, registerViewRenderer } from '../state.js';
import { TransactionService } from '../services/transaction.service.js';
import { FundSourceService } from '../services/fundSource.service.js';
import { BudgetService } from '../services/budget.service.js';
import { AnalyticsService } from '../services/analytics.service.js';
import { CATEGORIES } from '../data/seed.js';
import { sensitiveValueHtml } from '../security/privacy.js';
import { formatCurrency, formatPct } from '../utils/formatters.js';

/**
 * Render dashboard view
 */
export function renderDashboard() {
  const container = document.getElementById('view-dashboard');
  if (!container) return;

  const now = new Date();
  const currentMonth = TransactionService.getByMonth(now.getFullYear(), now.getMonth());
  const lastMonth = TransactionService.getByMonth(
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
    now.getMonth() === 0 ? 11 : now.getMonth() - 1
  );

  const curCr = currentMonth.filter(tx => tx.type === 'CR').reduce((s, tx) => s + tx.amount, 0);
  const curDr = currentMonth.filter(tx => tx.type === 'DR').reduce((s, tx) => s + tx.amount, 0);
  const lastCr = lastMonth.filter(tx => tx.type === 'CR').reduce((s, tx) => s + tx.amount, 0);
  const lastDr = lastMonth.filter(tx => tx.type === 'DR').reduce((s, tx) => s + tx.amount, 0);

  const netWorth = AnalyticsService.getNetWorth();
  const savingsRate = AnalyticsService.getSavingsRate(curCr, curDr);
  const hasAccounts = FundSourceService.getActive().length > 0;
  const isEmptyStats = !hasAccounts && netWorth === 0 && curCr === 0 && curDr === 0;

  // TODO: When migrating to component rendering, memoize stat cards to avoid re-render on unrelated updates.
  const emptyStatHtml = `
    <div class="stat-empty">
      <div>Add an account to get started</div>
      <div class="stat-empty-cta"><span class="cta-arrow">↗</span> Tap + to add</div>
    </div>
  `;

  const html = `
    <div class="view-header">
      <h2 class="view-title">Dashboard</h2>
    </div>

    <div class="stat-grid" style="margin-bottom: 32px;">
      <div class="stat-card">
        <div class="stat-label">Net Worth</div>
        <div class="stat-value" style="color: var(--accent-gold);">${isEmptyStats ? emptyStatHtml : sensitiveValueHtml(formatCurrency(netWorth), { width: '12ch', copyValue: String(netWorth), copyLabel: 'Net worth' })}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Income This Month</div>
        <div class="stat-value" style="color: var(--accent-green);">${isEmptyStats ? emptyStatHtml : sensitiveValueHtml(formatCurrency(curCr), { width: '12ch', copyValue: String(curCr), copyLabel: 'Income' })}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Expenses This Month</div>
        <div class="stat-value" style="color: var(--accent-red);">${isEmptyStats ? emptyStatHtml : sensitiveValueHtml(formatCurrency(curDr), { width: '12ch', copyValue: String(curDr), copyLabel: 'Expense' })}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Savings Rate</div>
        <div class="stat-value" style="color: ${savingsRate >= 20 ? 'var(--accent-green)' : 'var(--accent-gold)'};">${isEmptyStats ? emptyStatHtml : formatPct(savingsRate)}</div>
      </div>
    </div>

    <div class="chart-container grid grid-2" style="margin-bottom: 32px;">
      <div class="chart-card">
        <h3 class="chart-title">Cashflow (6 Months)</h3>
        <div class="cashflow-chart sensitive-visual" id="cashflow-chart"></div>
      </div>
      <div class="chart-card">
        <h3 class="chart-title">Spending by Category</h3>
        <div class="donut-chart">
          <div class="donut-svg sensitive-visual" id="donut-chart"></div>
          <div class="donut-legend sensitive-visual" id="donut-legend"></div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 32px;">
      <h3 class="chart-title">Recent Transactions</h3>
      <div class="tx-list" id="recent-tx-list"></div>
    </div>

    <div class="grid grid-3" id="budget-health"></div>
  `;

  container.innerHTML = html;

  // Draw charts
  setTimeout(async () => {
    const charts = await import('../components/charts.js');
    charts.drawCashflowChart(document.getElementById('cashflow-chart'), TransactionService.getMonthlyTotals(6));
    renderDonut(charts.drawDonutChart);
    renderRecentTransactions();
    renderBudgetHealth();
  }, 50);
}

function renderDonut(drawDonutChart) {
  if (!drawDonutChart) return;
  const now = new Date();
  const txs = TransactionService.getByMonth(now.getFullYear(), now.getMonth());
  const categoryTotals = TransactionService.getCategoryTotals(txs);

  let categories = Object.entries(categoryTotals)
    .map(([id, amount]) => ({
      category: CATEGORIES.find(c => c.id === id) || { id, label: id, emoji: '📦', color: '#888' },
      amount
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const total = categories.reduce((s, c) => s + c.amount, 0);

  drawDonutChart(
    document.getElementById('donut-chart'),
    document.getElementById('donut-legend'),
    categories,
    total
  );
}

function renderRecentTransactions() {
  const container = document.getElementById('recent-tx-list');
  if (!container) return;

  const recent = TransactionService.getRecent(8);
  const state = getState();

  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div><div class="empty-text">No transactions yet</div></div>';
    return;
  }

  container.innerHTML = recent.map(tx => {
    const cat = CATEGORIES.find(c => c.id === tx.category) || { emoji: '📦', label: tx.category };
    const fs = state.fundSources.find(f => f.id === tx.fundSourceId);
    const date = new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    return `
      <div class="tx-item ${tx.type.toLowerCase()}">
        <div class="tx-date">${date}</div>
        <div class="tx-category">${cat.emoji}</div>
        <div class="tx-title">${tx.title}</div>
        <div class="tx-account">${fs?.name || '[Deleted]'}</div>
        <div class="tx-amount ${tx.type.toLowerCase()}">${sensitiveValueHtml(`${tx.type === 'CR' ? '+' : '-'}${formatCurrency(tx.amount)}`, { width: '10ch', copyValue: String(tx.amount), copyLabel: 'Transaction amount' })}</div>
        <div class="tx-delete" onclick="window.deleteTransaction('${tx.id}')">🗑️</div>
      </div>
    `;
  }).join('');
}

function renderBudgetHealth() {
  const container = document.getElementById('budget-health');
  if (!container) return;

  const statuses = BudgetService.getStatus().slice(0, 6);

  if (statuses.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = statuses.map(b => {
    const cat = CATEGORIES.find(c => c.id === b.category) || { emoji: '📦', label: b.category };
    const color = b.utilization > 90 ? 'var(--accent-red)' : b.utilization > 70 ? 'var(--accent-gold)' : 'var(--accent-green)';
    const fillClass = b.utilization > 90 ? 'red' : b.utilization > 70 ? 'amber' : 'green';

    return `
      <div class="budget-card ${b.isOverBudget ? 'over-budget' : ''}">
        <div class="budget-header">
          <span class="budget-emoji">${cat.emoji}</span>
          <span class="budget-name">${cat.label}</span>
          <span class="budget-amount">${formatPct(b.utilization)}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${fillClass}" style="width: ${Math.min(b.utilization, 100)}%"></div>
        </div>
        <div class="budget-status">
          <span class="budget-spent">${sensitiveValueHtml(formatCurrency(b.spent), { width: '10ch', copyValue: String(b.spent), copyLabel: 'Budget spent' })} spent</span>
          <span>${sensitiveValueHtml(formatCurrency(b.limit), { width: '10ch', copyValue: String(b.limit), copyLabel: 'Budget limit' })} limit</span>
        </div>
      </div>
    `;
  }).join('');
}

// Register view for automatic re-rendering
registerViewRenderer('dashboard', renderDashboard);