/**
 * @fileoverview Transfer between fund sources service
 */

import { getState, dispatch } from '../state.js';

const uuid = () => crypto.randomUUID();

/** @type {Object} */
export const TransferService = {
  /**
   * Add a new transfer between fund sources
   * @param {Object} data
   * @returns {Object}
   */
  add(data) {
    const newTransfer = {
      id: uuid(),
      fromFundSourceId: data.fromFundSourceId,
      toFundSourceId: data.toFundSourceId,
      amount: parseFloat(data.amount) || 0,
      date: data.date || new Date().toISOString().split('T')[0],
      note: data.note || '',
      fee: parseFloat(data.fee) || 0,
      createdAt: new Date().toISOString()
    };

    dispatch('ADD_TRANSFER', newTransfer);
    return newTransfer;
  },

  /**
   * Delete a transfer
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    dispatch('DELETE_TRANSFER', id);
    return true;
  },

  /**
   * Get transfers for a specific fund source (as source or destination)
   * @param {string} fundSourceId
   * @returns {Array}
   */
  getByFundSource(fundSourceId) {
    const state = getState();
    return state.transfers.filter(t =>
      t.fromFundSourceId === fundSourceId || t.toFundSourceId === fundSourceId
    );
  },

  /**
   * Get recent transfers
   * @param {number} limit
   * @returns {Array}
   */
  getRecent(limit = 10) {
    const state = getState();
    return [...state.transfers]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  },

  /**
   * Get all transfers
   * @returns {Array}
   */
  getAll() {
    const state = getState();
    return [...state.transfers]
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }
};