/**
 * @fileoverview Analytics view
 */

import { getState, registerViewRenderer } from '../state.js';
import { TransactionService } from '../services/transaction.service.js';
import { FundSourceService } from '../services/fundSource.service.js';
import { AnalyticsService } from '../services/analytics.service.js';
import { RecurringService } from '../services/recurring.service.js';
import { BudgetService } from '../services/budget.service.js';
import { CATEGORIES } from '../data/seed.js';
import { drawLineChart, drawBarChart, drawHeatmap, formatCurrency, formatPct } from '../components/charts.js';

/**
 * Render analytics view
 */
export function renderAnalytics() {
  const container = document.getElementById('view-analytics');
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

  const incomeChange = AnalyticsService.getMoMChange(curCr, lastCr);
  const expenseChange = AnalyticsService.getMoMChange(curDr, lastDr);
  const savingsRate = AnalyticsService.getSavingsRate(curCr, curDr);
  const lastSavingsRate = AnalyticsService.getSavingsRate(lastCr, lastDr);
  const savingsChange = AnalyticsService.getMoMChange(savingsRate, lastSavingsRate);

  const insights = AnalyticsService.getInsights();
  const recurringRules = RecurringService.getActive();
  const upcomingRecurring = RecurringService.getUpcoming(14);
  const dailySpend = AnalyticsService.getDailySpend(35);

  const html = `
    <div class="view-header">
      <h2 class="view-title">Analytics</h2>
    </div>

    <div class="grid grid-3" style="margin-bottom: 32px;">
      <div class="stat-card">
        <div class="stat-label">Avg Daily Spend</div>
        <div class="stat-value" style="font-size: 22px;">${formatCurrency(AnalyticsService.getAvgDailySpend(now.getFullYear(), now.getMonth()))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Highest Single DR</div>
        <div class="stat-value" style="font-size: 22px; color: var(--accent-red);">
          ${Math.max(0, ...currentMonth.filter(tx => tx.type === 'DR').map(tx => tx.amount)).toLocaleString('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 })}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Recurring Total</div>
        <div class="stat-value" style="font-size: 22px; color: var(--accent-blue);">${formatCurrency(AnalyticsService.getRecurringTotal())}</div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom: 32px;">
      <div class="chart-card">
        <h3 class="chart-title">Net Cashflow (6 Months)</h3>
        <div id="net-cashflow-chart" style="height: 200px;"></div>
      </div>
      <div class="chart-card">
        <h3 class="chart-title">Fund Source Allocation</h3>
        <div id="allocation-chart" style="height: 200px;"></div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom: 32px;">
      <div class="chart-card">
        <h3 class="chart-title">Top Spending Categories</h3>
        <div id="top-categories-chart" style="height: 200px;"></div>
      </div>
      <div class="chart-card">
        <h3 class="chart-title">Spending Heatmap (Last 35 Days)</h3>
        <div id="heatmap-chart" style="padding: 16px 0;"></div>
      </div>
    </div>

    <div class="analytics-grid" style="margin-bottom: 32px;">
      <div class="stat-card">
        <div class="mom-card">
          <div class="mom-icon" style="background: rgba(16, 185, 129, 0.2);">💰</div>
          <div class="mom-content">
            <div class="mom-label">Income Change</div>
            <div class="mom-value ${incomeChange.direction === 'up' ? 'trend-up' : incomeChange.direction === 'down' ? 'trend-down' : ''}">
              ${incomeChange.direction === 'up' ? '↑' : incomeChange.direction === 'down' ? '↓' : '—'} ${formatPct(incomeChange.pct)}
            </div>
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="mom-card">
          <div class="mom-icon" style="background: rgba(255, 107, 107, 0.2);">💸</div>
          <div class="mom-content">
            <div class="mom-label">Expense Change</div>
            <div class="mom-value ${expenseChange.direction === 'up' ? 'trend-up' : expenseChange.direction === 'down' ? 'trend-down' : ''}">
              ${expenseChange.direction === 'up' ? '↑' : expenseChange.direction === 'down' ? '↓' : '—'} ${formatPct(expenseChange.pct)}
            </div>
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="mom-card">
          <div class="mom-icon" style="background: rgba(244, 185, 66, 0.2);">📈</div>
          <div class="mom-content">
            <div class="mom-label">Savings Rate Change</div>
            <div class="mom-value ${savingsChange.direction === 'up' ? 'trend-up' : savingsChange.direction === 'down' ? 'trend-down' : ''}">
              ${savingsChange.direction === 'up' ? '↑' : savingsChange.direction === 'down' ? '↓' : '—'} ${formatPct(savingsChange.pct)}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="chart-card">
        <h3 class="chart-title">Recurring Commitments</h3>
        ${recurringRules.length === 0 ? `
          <div class="empty-state"><div class="empty-icon">🔄</div><div class="empty-text">No recurring rules</div></div>
        ` : `
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Amount</th>
                <th>Frequency</th>
                <th>Next Due</th>
              </tr>
            </thead>
            <tbody>
              ${recurringRules.map(r => {
                const daysUntil = RecurringService.getDaysUntil(r.nextDueDate);
                const isDueSoon = daysUntil <= 7 && daysUntil >= 0;
                return `
                  <tr style="${isDueSoon ? 'background: rgba(244, 185, 66, 0.1);' : ''}">
                    <td>${r.title}</td>
                    <td class="mono" style="color: ${r.type === 'CR' ? 'var(--accent-green)' : 'var(--accent-red)'};">${r.type === 'CR' ? '+' : '-'}${formatCurrency(r.amount)}</td>
                    <td>${r.period}</td>
                    <td class="mono" style="color: ${isDueSoon ? 'var(--accent-gold)' : 'var(--text-muted)'};">${new Date(r.nextDueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>

      <div class="chart-card insights-panel">
        <h3 class="chart-title">Insights</h3>
        ${insights.length === 0 ? `
          <div class="empty-state"><div class="empty-icon">💡</div><div class="empty-text">Not enough data for insights</div></div>
        ` : `
          ${insights.map(insight => `
            <div class="insight-item">
              <span class="insight-icon">${insight.icon}</span>
              <span class="insight-text">${insight.text}</span>
            </div>
          `).join('')}
        `}
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Draw charts
  setTimeout(() => {
    drawNetCashflowChart();
    drawAllocationChart();
    drawTopCategoriesChart();
    drawHeatmap(document.getElementById('heatmap-chart'), dailySpend);
  }, 50);
}

function drawNetCashflowChart() {
  const data = TransactionService.getMonthlyTotals(6);
  const values = data.map(d => d.net);
  const labels = data.map(d => d.label);

  drawLineChart(document.getElementById('net-cashflow-chart'), values, labels, '#F4B942');
}

function drawAllocationChart() {
  const state = getState();
  const activeFundSources = state.fundSources.filter(fs => fs.isActive !== false);

  const data = activeFundSources.map(fs => ({
    label: fs.name,
    amount: FundSourceService.getBalance(fs.id),
    color: fs.color || '#10B981',
    emoji: fs.icon || '🏦'
  })).filter(d => d.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);

  const container = document.getElementById('allocation-chart');
  if (container) {
    container.innerHTML = data.map(d => `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <span style="font-size: 20px;">${d.emoji}</span>
        <div style="flex: 1;">
          <div style="font-size: 13px; margin-bottom: 4px;">${d.label}</div>
          <div class="progress-bar">
            <div class="progress-fill green" style="width: 60%; background: ${d.color};"></div>
          </div>
        </div>
        <div style="font-family: var(--font-mono); font-size: 13px;">${formatCurrency(d.amount)}</div>
      </div>
    `).join('') || '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">No data</div></div>';
  }
}

function drawTopCategoriesChart() {
  const now = new Date();
  const txs = TransactionService.getByMonth(now.getFullYear(), now.getMonth());
  const topCats = AnalyticsService.getTopCategories(txs, 5);

  const data = topCats.map(c => ({
    label: c.category.label,
    amount: c.amount,
    color: c.category.color,
    emoji: c.category.emoji
  }));

  drawBarChart(document.getElementById('top-categories-chart'), data);
}

// Register view for automatic re-rendering
registerViewRenderer('analytics', renderAnalytics);