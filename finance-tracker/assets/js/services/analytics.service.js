/**
 * @fileoverview Analytics and insights service
 */

import { getState } from '../state.js';
import { TransactionService } from './transaction.service.js';
import { FundSourceService } from './fundSource.service.js';
import { formatCurrency } from '../utils/formatters.js';

/** @type {Object} */
export const AnalyticsService = {
  /**
   * Calculate savings rate
   * @param {number} cr - Total credits
   * @param {number} dr - Total debits
   * @returns {number}
   */
  getSavingsRate(cr, dr) {
    if (cr <= 0) return 0;
    return Math.max(0, ((cr - dr) / cr) * 100);
  },

  /**
   * Get total net worth across all fund sources
   * @returns {number}
   */
  getNetWorth() {
    return FundSourceService.getActive().reduce((sum, fs) => {
      return sum + FundSourceService.getBalance(fs.id);
    }, 0);
  },

  /**
   * Get top spending categories
   * @param {Array} txList
   * @param {number} n
   * @returns {Array<{category: Object, amount: number}>}
   */
  getTopCategories(txList, n = 5) {
    const totals = TransactionService.getCategoryTotals(txList);
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id, amount]) => ({ category: this._getCategory(id), amount }));
  },

  /**
   * Get month-over-month change
   * @param {number} current
   * @param {number} previous
   * @returns {{amount: number, pct: number, direction: string}}
   */
  getMoMChange(current, previous) {
    if (previous === 0) {
      return { amount: current, pct: current > 0 ? 100 : 0, direction: current > 0 ? 'up' : 'flat' };
    }
    const amount = current - previous;
    const pct = (amount / Math.abs(previous)) * 100;
    return {
      amount,
      pct: Math.abs(pct),
      direction: amount > 0 ? 'up' : amount < 0 ? 'down' : 'flat'
    };
  },

  /**
   * Get daily spending for heatmap
   * @param {number} days
   * @returns {Array<{date: string, total: number}>}
   */
  getDailySpend(days = 30) {
    const state = getState();
    const result = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayTotal = state.transactions
        .filter(tx => tx.date === dateStr && tx.type === 'DR')
        .reduce((sum, tx) => sum + tx.amount, 0);

      result.push({ date: dateStr, total: dayTotal });
    }

    return result;
  },

  /**
   * Get average daily spend for a month
   * @param {number} year
   * @param {number} month
   * @returns {number}
   */
  getAvgDailySpend(year, month) {
    const txs = TransactionService.getByMonth(year, month);
    const drTotal = txs.filter(tx => tx.type === 'DR').reduce((s, tx) => s + tx.amount, 0);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return daysInMonth > 0 ? drTotal / daysInMonth : 0;
  },

  /**
   * Get total recurring commitments
   * @returns {number}
   */
  getRecurringTotal() {
    const state = getState();
    return state.recurringRules
      .filter(r => r.isActive)
      .reduce((sum, r) => sum + r.amount, 0);
  },

  /**
   * Auto-generate insights based on data
   * @returns {Array<{icon: string, text: string, type: string}>}
   */
  getInsights() {
    const state = getState();
    const insights = [];
    const now = new Date();
    const currentMonth = TransactionService.getByMonth(now.getFullYear(), now.getMonth());
    const lastMonth = TransactionService.getByMonth(
      now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
      now.getMonth() === 0 ? 11 : now.getMonth() - 1
    );

    const curCr = currentMonth.filter(tx => tx.type === 'CR').reduce((s, tx) => s + tx.amount, 0);
    const curDr = currentMonth.filter(tx => tx.type === 'DR').reduce((s, tx) => s + tx.amount, 0);
    const lastDr = lastMonth.filter(tx => tx.type === 'DR').reduce((s, tx) => s + tx.amount, 0);

    // Savings rate
    const savingsRate = this.getSavingsRate(curCr, curDr);
    if (savingsRate > 20) {
      insights.push({ icon: '✅', text: `Excellent savings rate: <strong>${savingsRate.toFixed(1)}%</strong>`, type: 'success' });
    } else if (savingsRate < 10) {
      insights.push({ icon: '⚠️', text: `Low savings rate: <strong>${savingsRate.toFixed(1)}%</strong> - try to save more`, type: 'warning' });
    }

    // Month over month spending
    const momChange = this.getMoMChange(curDr, lastDr);
    if (momChange.direction === 'up') {
      insights.push({ icon: '📈', text: `Spending is <strong>${momChange.pct.toFixed(0)}%</strong> higher than last month`, type: 'warning' });
    } else if (momChange.direction === 'down') {
      insights.push({ icon: '📉', text: `Spending is <strong>${momChange.pct.toFixed(0)}%</strong> lower than last month`, type: 'success' });
    }

    // Recurring due soon
    const upcoming = state.recurringRules.filter(r => {
      if (!r.isActive) return false;
      const due = new Date(r.nextDueDate);
      const daysUntil = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= 7;
    });
    if (upcoming.length > 0) {
      insights.push({ icon: '📅', text: `<strong>${upcoming.length}</strong> recurring payment(s) due in the next 7 days`, type: 'info' });
    }

    // Over budget categories
    const budgetStatuses = state.budgets.map(b => {
      const txs = currentMonth.filter(tx => tx.category === b.category && tx.type === 'DR');
      const spent = txs.reduce((s, tx) => s + tx.amount, 0);
      return { ...b, spent, utilization: b.limit > 0 ? (spent / b.limit) * 100 : 0 };
    }).filter(b => b.utilization > 90);

    if (budgetStatuses.length > 0) {
      insights.push({ icon: '🚨', text: `<strong>${budgetStatuses.length}</strong> budget(s) are over 90% utilized`, type: 'error' });
    }

    // Top spending category
    const topCats = this.getTopCategories(currentMonth, 1);
    if (topCats.length > 0) {
      insights.push({ icon: '🏆', text: `Top spending: <strong>${topCats[0].category.label}</strong> at ${formatCurrency(topCats[0].amount)}`, type: 'info' });
    }

    return insights;
  },

  /**
   * Helper: get category by id
   * @param {string} id
   * @returns {Object}
   */
  _getCategory(id) {
    const CATEGORIES = [
      { id: 'housing', label: 'Housing/Rent', emoji: '🏠', color: '#60A5FA' },
      { id: 'food', label: 'Food & Dining', emoji: '🍔', color: '#F59E0B' },
      { id: 'transport', label: 'Transport', emoji: '🚗', color: '#8B5CF6' },
      { id: 'entertainment', label: 'Entertainment', emoji: '🎬', color: '#EC4899' },
      { id: 'healthcare', label: 'Healthcare', emoji: '🏥', color: '#10B981' },
      { id: 'utilities', label: 'Utilities', emoji: '⚡', color: '#FCD34D' },
      { id: 'shopping', label: 'Shopping', emoji: '🛍️', color: '#F87171' },
      { id: 'education', label: 'Education', emoji: '📚', color: '#60A5FA' },
      { id: 'subscriptions', label: 'Subscriptions', emoji: '🔄', color: '#A78BFA' },
      { id: 'investment', label: 'Investment', emoji: '💹', color: '#34D399' },
      { id: 'insurance', label: 'Insurance', emoji: '🛡️', color: '#6EE7B7' },
      { id: 'other_dr', label: 'Other Expense', emoji: '➖', color: '#FF7B72' },
      { id: 'salary', label: 'Salary', emoji: '💼', color: '#3FB950' },
      { id: 'freelance', label: 'Freelance', emoji: '💻', color: '#58A6FF' }
    ];
    return CATEGORIES.find(c => c.id === id) || { id, label: id, emoji: '📦', color: '#888' };
  },

  // TODO: Remove once analytics insights migrate to a UI renderer that can format values at display time.
};