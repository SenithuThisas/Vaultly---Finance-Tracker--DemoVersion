/**
 * @fileoverview LocalStorage adapter (offline fallback)
 */

import { STORAGE_KEY } from '../state.js';

export const localStorageAdapter = {
  async load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        return parsed;
      }
      return null;
    } catch (e) {
      console.error('LocalStorage load error:', e);
      return null;
    }
  },

  async saveFundSource(fundSource) {
    return Promise.resolve(fundSource);
  },

  async deleteFundSource(id) {
    return Promise.resolve({ id });
  },

  async saveTransaction(transaction) {
    return Promise.resolve(transaction);
  },

  async deleteTransaction(id) {
    return Promise.resolve({ id });
  },

  async saveTransfer(transfer) {
    return Promise.resolve(transfer);
  },

  async deleteTransfer(id) {
    return Promise.resolve({ id });
  },

  async saveBudget(budget) {
    return Promise.resolve(budget);
  },

  async deleteBudget(id) {
    return Promise.resolve({ id });
  },

  async saveRecurringRule(rule) {
    return Promise.resolve(rule);
  },

  async saveSettings(settings) {
    return Promise.resolve(settings);
  }
};