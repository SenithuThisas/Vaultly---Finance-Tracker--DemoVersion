/**
 * @fileoverview Budget management service
 */

import { getState, dispatch } from '../state.js';

const uuid = () => crypto.randomUUID();

/** @type {Object} */
export const BudgetService = {
  /**
   * Add a new budget
   * @param {Object} data
   * @returns {Object}
   */
  add(data) {
    const newBudget = {
      id: uuid(),
      category: data.category,
      limit: parseFloat(data.limit) || 0,
      period: data.period || 'monthly',
      fundSourceId: data.fundSourceId || null,
      color: data.color || '#F4B942',
      createdAt: new Date().toISOString()
    };

    dispatch('ADD_BUDGET', newBudget);
    return newBudget;
  },

  /**
   * Edit a budget
   * @param {string} id
   * @param {Object} updates
   * @returns {Object|null}
   */
  edit(id, updates) {
    const state = getState();
    const budget = state.budgets.find(b => b.id === id);
    if (!budget) return null;

    const updatedBudget = { ...budget, ...updates };
    dispatch('EDIT_BUDGET', updatedBudget);
    return updatedBudget;
  },

  /**
   * Delete a budget
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    dispatch('DELETE_BUDGET', id);
    return true;
  },

  /**
   * Get budget status with spending calculations
   * @returns {Array<{id, category, limit, spent, remaining, utilization, daysLeft, isOverBudget}>}
   */
  getStatus() {
    const state = getState();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysInMonth = monthEnd.getDate();
    const daysLeft = daysInMonth - now.getDate();

    return state.budgets.map(budget => {
      const txs = state.transactions.filter(tx =>
        tx.category === budget.category &&
        tx.type === 'DR' &&
        new Date(tx.date) >= monthStart &&
        new Date(tx.date) <= monthEnd &&
        (!budget.fundSourceId || tx.fundSourceId === budget.fundSourceId)
      );

      const spent = txs.reduce((sum, tx) => sum + tx.amount, 0);
      const remaining = budget.limit - spent;
      const utilization = budget.limit > 0 ? (spent / budget.limit) * 100 : 0;

      return {
        ...budget,
        spent,
        remaining,
        utilization,
        daysLeft: Math.max(0, daysLeft),
        isOverBudget: spent > budget.limit
      };
    });
  },

  /**
   * Check if a budget is over limit
   * @param {Object} budget
   * @param {number} spent
   * @returns {boolean}
   */
  isOverBudget(budget, spent) {
    return spent > budget.limit;
  },

  /**
   * Get categories with spending but no budget
   * @returns {Array}
   */
  getUnbudgetedCategories() {
    const state = getState();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const budgetedCategories = new Set(state.budgets.map(b => b.category));

    const spentByCategory = {};
    state.transactions
      .filter(tx => tx.type === 'DR' && new Date(tx.date) >= monthStart)
      .forEach(tx => {
        spentByCategory[tx.category] = (spentByCategory[tx.category] || 0) + tx.amount;
      });

    return Object.entries(spentByCategory)
      .filter(([cat]) => !budgetedCategories.has(cat))
      .map(([category, spent]) => ({ category, spent }));
  },

  /**
   * Get total budget summary
   * @returns {{totalBudgeted: number, totalSpent: number, totalRemaining: number, utilization: number}}
   */
  getSummary() {
    const statuses = this.getStatus();
    const totalBudgeted = statuses.reduce((s, b) => s + b.limit, 0);
    const totalSpent = statuses.reduce((s, b) => s + b.spent, 0);
    const totalRemaining = totalBudgeted - totalSpent;
    const utilization = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

    return { totalBudgeted, totalSpent, totalRemaining, utilization };
  }
};