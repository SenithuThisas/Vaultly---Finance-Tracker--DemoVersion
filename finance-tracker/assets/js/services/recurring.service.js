/**
 * @fileoverview Recurring transaction management service
 */

import { getState, dispatch } from '../state.js';

const uuid = () => crypto.randomUUID();

/** @type {Object} */
export const RecurringService = {
  /**
   * Check for due recurring rules and return count
   * @returns {number}
   */
  checkDue() {
    const state = getState();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return state.recurringRules.filter(r => {
      if (!r.isActive) return false;
      const due = new Date(r.nextDueDate);
      return due <= today;
    }).length;
  },

  /**
   * Mark a recurring rule as posted and update next due date
   * @param {string} ruleId
   * @returns {Object|null}
   */
  markPosted(ruleId) {
    const state = getState();
    const rule = state.recurringRules.find(r => r.id === ruleId);
    if (!rule) return null;

    const nextDate = this._calculateNextDate(rule.nextDueDate, rule.period);
    const updatedRule = { ...rule, nextDueDate: nextDate };

    dispatch('EDIT_RECURRING_RULE', updatedRule);
    return updatedRule;
  },

  /**
   * Get upcoming recurring rules within N days
   * @param {number} days
   * @returns {Array}
   */
  getUpcoming(days = 30) {
    const state = getState();
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + days);

    return state.recurringRules
      .filter(r => {
        if (!r.isActive) return false;
        const due = new Date(r.nextDueDate);
        return due <= cutoff;
      })
      .sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate));
  },

  /**
   * Get all active recurring rules
   * @returns {Array}
   */
  getActive() {
    const state = getState();
    return state.recurringRules.filter(r => r.isActive);
  },

  /**
   * Add a new recurring rule
   * @param {Object} data
   * @returns {Object}
   */
  add(data) {
    const newRule = {
      id: uuid(),
      title: data.title,
      amount: parseFloat(data.amount) || 0,
      type: data.type || 'DR',
      category: data.category,
      fundSourceId: data.fundSourceId,
      period: data.period || 'monthly',
      nextDueDate: data.nextDueDate || new Date().toISOString().split('T')[0],
      isActive: true
    };

    dispatch('ADD_RECURRING_RULE', newRule);
    return newRule;
  },

  /**
   * Toggle recurring rule active state
   * @param {string} id
   * @returns {Object|null}
   */
  toggle(id) {
    const state = getState();
    const rule = state.recurringRules.find(r => r.id === id);
    if (!rule) return null;

    const updatedRule = { ...rule, isActive: !rule.isActive };
    dispatch('EDIT_RECURRING_RULE', updatedRule);
    return updatedRule;
  },

  /**
   * Calculate next due date based on period
   * @param {string} currentDate
   * @param {string} period
   * @returns {string}
   */
  _calculateNextDate(currentDate, period) {
    const date = new Date(currentDate);

    switch (period) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
    }

    return date.toISOString().split('T')[0];
  },

  /**
   * Get days until next due
   * @param {string} nextDueDate
   * @returns {number}
   */
  getDaysUntil(nextDueDate) {
    const now = new Date();
    const due = new Date(nextDueDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  }
};