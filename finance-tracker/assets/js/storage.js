/**
 * @fileoverview Local storage persistence with export/import functionality
 */

import { STORAGE_KEY, getState, setState } from './state.js';

/**
 * Save state to localStorage
 * @param {Object} state
 */
export function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.warn('Storage quota exceeded');
    } else {
      console.error('Storage save error:', e);
    }
  }
}

/**
 * Load state from localStorage
 * @returns {Object|null}
 */
export function load() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Storage load error:', e);
    return null;
  }
}

/**
 * Clear all stored data
 */
export function clear() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Export all transactions as CSV
 * @param {Array} transactions
 * @param {Array} fundSources
 */
export function exportAllCSV(transactions, fundSources) {
  const headers = ['Date', 'Title', 'Category', 'Type', 'Amount', 'Fund Source', 'Reference', 'Note', 'Tags'];
  const rows = transactions.map(tx => {
    const fs = fundSources.find(f => f.id === tx.fundSourceId);
    return [
      tx.date,
      `"${(tx.title || '').replace(/"/g, '""')}"`,
      tx.category,
      tx.type,
      tx.amount.toFixed(2),
      fs?.name || '[Deleted]',
      tx.reference || '',
      `"${(tx.note || '').replace(/"/g, '""')}"`,
      (tx.tags || []).join(';')
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `finflow-export-${getDateString()}.csv`, 'text/csv');
}

/**
 * Export single fund source ledger as CSV
 * @param {Object} fundSource
 * @param {Array} transactions
 */
export function exportAccountCSV(fundSource, transactions) {
  const headers = ['Date', 'Reference', 'Title', 'Category', 'Type', 'Amount', 'Balance', 'Note'];
  let balance = fundSource.initialBalance;
  const rows = transactions
    .filter(tx => tx.fundSourceId === fundSource.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(tx => {
      balance += tx.type === 'CR' ? tx.amount : -tx.amount;
      return [
        tx.date,
        tx.reference || '',
        `"${(tx.title || '').replace(/"/g, '""')}"`,
        tx.category,
        tx.type,
        tx.amount.toFixed(2),
        balance.toFixed(2),
        `"${(tx.note || '').replace(/"/g, '""')}"`
      ].join(',');
    });

  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `${fundSource.name}-ledger-${getDateString()}.csv`, 'text/csv');
}

/**
 * Export entire state as JSON
 * @param {Object} state
 */
export function exportJSON(state) {
  const json = JSON.stringify(state, null, 2);
  downloadFile(json, `finflow-backup-${getDateString()}.json`, 'application/json');
}

/**
 * Import state from JSON string
 * @param {string} jsonString
 * @returns {Object|Error}
 */
export function importJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.transactions || !data.fundSources) {
      throw new Error('Invalid data format');
    }
    setState(data);
    save(data);
    return data;
  } catch (e) {
    return e;
  }
}

/**
 * Download a file
 * @param {string} content
 * @param {string} filename
 * @param {string} mimeType
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Get current date string for filenames
 * @returns {string}
 */
function getDateString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Read file content (for import)
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}