/**
 * @fileoverview Storage layer — Supabase only.
 */

import { isConfigured, checkSupabaseHealth } from './config/supabase.js';
import { supabaseAdapter } from './adapters/supabase.adapter.js';
import { withRetry, runOnlineAware, logSecurityEvent } from './security/index.js';

let adapterReady = false;

// ─── Adapter selection ────────────────────────────────────────────────────────

async function ensureAdapter() {
  if (adapterReady) return;

  if (isConfigured() && await checkSupabaseHealth()) {
    adapterReady = true;
    console.log('Using Supabase adapter');
  } else {
    console.warn('Supabase is not available — data will not be persisted.');
  }
}

export function isUsingCloud() {
  return adapterReady;
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function load() {
  await ensureAdapter();

  if (adapterReady) {
    try {
      const data = await supabaseAdapter.load();
      if (data) return data;
    } catch (e) {
      console.error('Supabase load failed:', e);
    }
  }

  return null;
}

// ─── Per-record saves (called by dispatch in state.js) ────────────────────────

/**
 * Save a single record to Supabase.
 * action: the dispatch action string
 * payload: the record or id
 */
export async function saveRecord(action, payload) {
  if (!adapterReady) return;

  const operation = async () => {
    switch (action) {
      case 'ADD_FUND_SOURCE':
        return supabaseAdapter.insertFundSource(payload);
      case 'EDIT_FUND_SOURCE':
        return supabaseAdapter.updateFundSource(payload);
      case 'DELETE_FUND_SOURCE':
        return supabaseAdapter.deleteFundSource(payload);
      case 'ADD_TRANSACTION':
        return supabaseAdapter.insertTransaction(payload);
      case 'EDIT_TRANSACTION':
        return supabaseAdapter.updateTransaction(payload);
      case 'DELETE_TRANSACTION':
        return supabaseAdapter.deleteTransaction(payload);
      case 'ADD_TRANSFER':
        return supabaseAdapter.insertTransfer(payload);
      case 'EDIT_TRANSFER':
        return supabaseAdapter.updateTransfer(payload);
      case 'DELETE_TRANSFER':
        return supabaseAdapter.deleteTransfer(payload);
      case 'ADD_BUDGET':
        return supabaseAdapter.insertBudget(payload);
      case 'EDIT_BUDGET':
        return supabaseAdapter.updateBudget(payload);
      case 'DELETE_BUDGET':
        return supabaseAdapter.deleteBudget(payload);
      case 'ADD_GOAL':
        return supabaseAdapter.insertGoal(payload);
      case 'EDIT_GOAL':
        return supabaseAdapter.updateGoal(payload);
      case 'DELETE_GOAL':
        return supabaseAdapter.deleteGoal(payload);
      case 'ADD_RECURRING_RULE':
        return supabaseAdapter.insertRecurringRule(payload);
      case 'EDIT_RECURRING_RULE':
        return supabaseAdapter.updateRecurringRule(payload);
      case 'UPDATE_SETTINGS':
        return supabaseAdapter.saveSettings(payload);
      default:
        return null;
    }
  };

  try {
    await runOnlineAware(() => withRetry(operation, 3, 1000), { action, payload });
  } catch (err) {
    logSecurityEvent({
      type: 'STORAGE_WRITE_FAILED',
      details: {
        action,
        message: err?.message || String(err)
      }
    });
    console.error(`Supabase write failed for ${action}:`, err);
  }
}

// ─── Misc utils ───────────────────────────────────────────────────────────────

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
  _downloadFile(csv, `vaultly-export-${_dateString()}.csv`, 'text/csv');
  logSecurityEvent({ type: 'DATA_EXPORTED', details: { format: 'csv' } });
}

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
  _downloadFile(csv, `${fundSource.name}-ledger-${_dateString()}.csv`, 'text/csv');
}

export function exportJSON(state) {
  const sanitized = {
    ...state,
    auth: undefined,
    session: undefined,
    token: undefined
  };
  _downloadFile(JSON.stringify(sanitized, null, 2), `vaultly-export-${_dateString()}.json`, 'application/json');
  logSecurityEvent({ type: 'DATA_EXPORTED', details: { format: 'json' } });
}

export function importJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.transactions && !data.fundSources) {
      throw new Error('Invalid data format');
    }
    return data;
  } catch (e) {
    return e;
  }
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function _downloadFile(content, filename, mimeType) {
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

function _dateString() {
  return new Date().toISOString().split('T')[0];
}