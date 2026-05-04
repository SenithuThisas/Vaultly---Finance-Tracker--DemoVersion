/**
 * @fileoverview Transfer between fund sources service
 */

import { getState, dispatch } from '../state.js';
import { sanitizeFormData } from '../security/index.js';

const uuid = () => crypto.randomUUID();

/** @type {Object} */
export const TransferService = {
  /**
   * Add a new transfer between fund sources
   * @param {Object} data
   * @returns {Object}
   */
  add(data) {
    const clean = sanitizeFormData({
      ...data,
      amount: parseFloat(data.amount) || 0,
      fee: parseFloat(data.fee) || 0
    });
    if (!clean.fromFundSourceId || !clean.toFundSourceId || clean.fromFundSourceId === clean.toFundSourceId) {
      throw new Error('Invalid transfer accounts');
    }
    if (!Number.isFinite(clean.amount) || clean.amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    const newTransfer = {
      id: uuid(),
      fromFundSourceId: clean.fromFundSourceId,
      toFundSourceId: clean.toFundSourceId,
      amount: clean.amount,
      date: clean.date || new Date().toISOString().split('T')[0],
      note: clean.note || '',
      fee: clean.fee,
      createdAt: new Date().toISOString()
    };

    dispatch('ADD_TRANSFER', newTransfer);
    return newTransfer;
  },

  /**
   * Edit an existing transfer
   * @param {string} id
   * @param {Object} updates
   * @returns {Object|null}
   */
  edit(id, updates) {
    const state = getState();
    const trf = state.transfers.find(t => t.id === id);
    if (!trf) return null;

    const clean = sanitizeFormData({ ...updates });
    if (clean.amount !== undefined) clean.amount = parseFloat(clean.amount) || 0;
    if (clean.fee !== undefined) clean.fee = parseFloat(clean.fee) || 0;

    const updatedTrf = { ...trf, ...clean };
    
    if (!updatedTrf.fromFundSourceId || !updatedTrf.toFundSourceId || updatedTrf.fromFundSourceId === updatedTrf.toFundSourceId) {
      throw new Error('Invalid transfer accounts');
    }
    if (!Number.isFinite(updatedTrf.amount) || updatedTrf.amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    dispatch('EDIT_TRANSFER', updatedTrf);
    return updatedTrf;
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