/**
 * @fileoverview Transaction management service
 */

import { getState, dispatch } from '../state.js';
import { sanitizeFormData, VALIDATORS, validate } from '../security/index.js';

const uuid = () => crypto.randomUUID();

/** @type {Object} */
export const TransactionService = {
  /**
   * Add a new transaction
   * @param {Object} data
   * @returns {Object}
   */
  add(data) {
    const clean = sanitizeFormData({
      ...data,
      amount: parseFloat(data.amount) || 0
    });

    const validation = validate(VALIDATORS.transaction, {
      title: clean.title,
      amount: clean.amount,
      type: clean.type,
      category: clean.category,
      fundSourceId: clean.fundSourceId,
      date: clean.date
    });

    if (!validation.isValid) {
      throw new Error(Object.values(validation.errors)[0]);
    }

    const newTx = {
      id: uuid(),
      title: clean.title,
      amount: clean.amount,
      type: clean.type || 'DR',
      category: clean.category,
      fundSourceId: clean.fundSourceId,
      date: clean.date || new Date().toISOString().split('T')[0],
      reference: clean.reference || '',
      note: clean.note || '',
      tags: clean.tags || [],
      isRecurring: clean.isRecurring || false,
      recurringPeriod: clean.recurringPeriod || null,
      createdAt: new Date().toISOString()
    };

    dispatch('ADD_TRANSACTION', newTx);
    return newTx;
  },

  /**
   * Edit an existing transaction
   * @param {string} id
   * @param {Object} updates
   * @returns {Object|null}
   */
  edit(id, updates) {
    const state = getState();
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) return null;

    const updatedTx = { ...tx, ...updates };
    dispatch('EDIT_TRANSACTION', updatedTx);
    return updatedTx;
  },

  /**
   * Delete a transaction
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    dispatch('DELETE_TRANSACTION', id);
    return true;
  },

  /**
   * Duplicate a transaction with new date
   * @param {string} id
   * @returns {Object|null}
   */
  duplicate(id) {
    const state = getState();
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) return null;

    const newTx = {
      ...tx,
      id: uuid(),
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };

    dispatch('ADD_TRANSACTION', newTx);
    return newTx;
  },

  /**
   * Get transactions for a specific fund source
   * @param {string} fundSourceId
   * @returns {Array}
   */
  getByFundSource(fundSourceId) {
    const state = getState();
    return state.transactions.filter(tx => tx.fundSourceId === fundSourceId);
  },

  /**
   * Get transactions for a specific month
   * @param {number} year
   * @param {number} month - 0-indexed
   * @returns {Array}
   */
  getByMonth(year, month) {
    const state = getState();
    return state.transactions.filter(tx => {
      const d = new Date(tx.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  },

  /**
   * Get category totals from a list of transactions
   * @param {Array} txList
   * @returns {Object}
   */
  getCategoryTotals(txList) {
    const totals = {};
    txList.filter(tx => tx.type === 'DR').forEach(tx => {
      totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
    });
    return totals;
  },

  /**
   * Get monthly totals for the last N months
   * @param {number} months
   * @returns {Array<{label: string, cr: number, dr: number, net: number}>}
   */
  getMonthlyTotals(months = 6) {
    const result = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const year = now.getFullYear();
      const month = now.getMonth() - i;
      const adjustedDate = new Date(year, month, 1);
      const y = adjustedDate.getFullYear();
      const m = adjustedDate.getMonth();

      const txs = this.getByMonth(y, m);
      const cr = txs.filter(tx => tx.type === 'CR').reduce((s, tx) => s + tx.amount, 0);
      const dr = txs.filter(tx => tx.type === 'DR').reduce((s, tx) => s + tx.amount, 0);

      result.push({
        label: adjustedDate.toLocaleString('en-US', { month: 'short' }),
        cr,
        dr,
        net: cr - dr
      });
    }

    return result;
  },

  /**
   * Get running balance for each transaction in a list
   * @param {string} fundSourceId
   * @returns {Array}
   */
  getRunningBalance(fundSourceId) {
    const state = getState();
    const fs = state.fundSources.find(f => f.id === fundSourceId);
    const initialBalance = fs?.initialBalance || 0;

    const txs = state.transactions
      .filter(tx => tx.fundSourceId === fundSourceId)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = initialBalance;
    return txs.map(tx => {
      running += tx.type === 'CR' ? tx.amount : -tx.amount;
      return { ...tx, runningBalance: running };
    });
  },

  /**
   * Get recent transactions
   * @param {number} limit
   * @returns {Array}
   */
  getRecent(limit = 10) {
    const state = getState();
    return [...state.transactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  },

  /**
   * Search transactions
   * @param {string} query
   * @returns {Array}
   */
  search(query) {
    const state = getState();
    const q = query.toLowerCase();
    return state.transactions.filter(tx =>
      tx.title.toLowerCase().includes(q) ||
      tx.note.toLowerCase().includes(q) ||
      tx.reference?.toLowerCase().includes(q) ||
      tx.category.toLowerCase().includes(q)
    );
  }
};