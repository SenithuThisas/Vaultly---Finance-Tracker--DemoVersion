/**
 * @fileoverview Fund source (account/bank) management service
 */

import { getState, dispatch } from '../state.js';

const uuid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

/** @type {Object} */
export const FundSourceService = {
  /**
   * Add a new fund source
   * @param {Object} data
   * @returns {Object}
   */
  add(data) {
    const newFs = {
      id: uuid(),
      name: data.name,
      type: data.type || 'bank',
      bankName: data.bankName || null,
      accountNumber: data.accountNumber || null,
      currency: data.currency || 'LKR',
      balance: parseFloat(data.balance) || 0,
      initialBalance: parseFloat(data.balance) || 0,
      color: data.color || '#10B981',
      icon: data.icon || '🏦',
      notes: data.notes || '',
      createdAt: new Date().toISOString(),
      isActive: true
    };

    dispatch('ADD_FUND_SOURCE', newFs);
    return newFs;
  },

  /**
   * Edit an existing fund source
   * @param {string} id
   * @param {Object} updates
   * @returns {Object|null}
   */
  edit(id, updates) {
    const state = getState();
    const fs = state.fundSources.find(f => f.id === id);
    if (!fs) return null;

    const updatedFs = { ...fs, ...updates };
    dispatch('EDIT_FUND_SOURCE', updatedFs);
    return updatedFs;
  },

  /**
   * Soft delete a fund source
   * @param {string} id
   * @returns {boolean}
   */
  softDelete(id) {
    dispatch('DELETE_FUND_SOURCE', id);
    return true;
  },

  /**
   * Calculate current balance of a fund source
   * @param {string} id
   * @returns {number}
   */
  getBalance(id) {
    const state = getState();
    const fs = state.fundSources.find(f => f.id === id);
    if (!fs) return 0;

    // Start with initial balance
    let balance = fs.initialBalance;

    // Add CR transactions
    state.transactions
      .filter(tx => tx.fundSourceId === id && tx.type === 'CR')
      .forEach(tx => balance += tx.amount);

    // Subtract DR transactions
    state.transactions
      .filter(tx => tx.fundSourceId === id && tx.type === 'DR')
      .forEach(tx => balance -= tx.amount);

    // Add incoming transfers
    state.transfers
      .filter(t => t.toFundSourceId === id)
      .forEach(t => balance += t.amount);

    // Subtract outgoing transfers
    state.transfers
      .filter(t => t.fromFundSourceId === id)
      .forEach(t => balance -= (t.amount + (t.fee || 0)));

    return balance;
  },

  /**
   * Get monthly CR/DR totals for a fund source
   * @param {string} id
   * @param {number} year
   * @param {number} month
   * @returns {{cr: number, dr: number, net: number}}
   */
  getMonthlyFlow(id, year, month) {
    const state = getState();
    const monthTxs = state.transactions.filter(tx => {
      const d = new Date(tx.date);
      return tx.fundSourceId === id &&
             d.getFullYear() === year &&
             d.getMonth() === month;
    });

    const cr = monthTxs.filter(tx => tx.type === 'CR').reduce((s, tx) => s + tx.amount, 0);
    const dr = monthTxs.filter(tx => tx.type === 'DR').reduce((s, tx) => s + tx.amount, 0);

    return { cr, dr, net: cr - dr };
  },

  /**
   * Get sparkline data for the last N days
   * @param {string} id
   * @param {number} days
   * @returns {Array<{date: string, balance: number}>}
   */
  getSparklineData(id, days = 30) {
    const state = getState();
    const fs = state.fundSources.find(f => f.id === id);
    if (!fs) return [];

    const result = [];
    const now = new Date();
    let runningBalance = fs.initialBalance;

    // Get all transactions for this fund source, sorted by date
    const txList = state.transactions
      .filter(tx => tx.fundSourceId === id)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      // Update running balance with transactions up to this date
      while (txList.length > 0 && txList[0].date <= dateStr) {
        const tx = txList.shift();
        runningBalance += tx.type === 'CR' ? tx.amount : -tx.amount;
      }

      result.push({ date: dateStr, balance: runningBalance });
    }

    return result;
  },

  /**
   * Recompute all fund source balances
   */
  recomputeAll() {
    const state = getState();
    state.fundSources.forEach(fs => {
      fs.balance = this.getBalance(fs.id);
    });
  },

  /**
   * Get active fund sources only
   * @returns {Array}
   */
  getActive() {
    const state = getState();
    return state.fundSources.filter(fs => fs.isActive !== false);
  },

  /**
   * Get fund source by ID
   * @param {string} id
   * @returns {Object|null}
   */
  getById(id) {
    const state = getState();
    return state.fundSources.find(f => f.id === id);
  }
};