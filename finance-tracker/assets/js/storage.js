/**
 * @fileoverview Storage layer — Supabase only.
 */

import { isConfigured } from './config/supabase.js';
import { supabaseAdapter } from './adapters/supabase.adapter.js';

const BOOTSTRAP_CACHE_KEY = 'vaultly.bootstrap.cache.v1';
const CACHED_DATA_TIMEOUT_MS = 20000;
const LIVE_DATA_TIMEOUT_MS = 12000;

export function isUsingCloud() {
  return isConfigured();
}

export function getCachedBootstrap(userId = null) {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const raw = window.localStorage.getItem(BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const payload = parsed?.payload;
    if (!payload) return null;

    if (userId && parsed?.userId && parsed.userId !== userId) {
      return null;
    }

    return {
      ...payload,
      cacheTimestamp: parsed.cachedAt || null,
      fromCache: true
    };
  } catch (error) {
    console.warn('Failed to read bootstrap cache:', error);
    return null;
  }
}

function saveBootstrapCache(userId, payload) {
  if (typeof window === 'undefined' || !window.localStorage || !payload) return;

  try {
    window.localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({
      userId: userId || null,
      cachedAt: Date.now(),
      payload: {
        fundSources: payload.fundSources || [],
        transactions: payload.transactions || [],
        transfers: payload.transfers || [],
        budgets: payload.budgets || [],
        recurringRules: payload.recurringRules || [],
        settings: payload.settings || null,
        loadErrors: payload.loadErrors || []
      }
    }));
  } catch (error) {
    console.warn('Failed to save bootstrap cache:', error);
  }
}

function emitCachedProgress(onProgress, cached) {
  if (!onProgress || !cached) return;

  onProgress({ key: 'fundSources', data: cached.fundSources || [], error: null, source: 'cache' });
  onProgress({ key: 'transactions', data: cached.transactions || [], error: null, source: 'cache' });
  onProgress({ key: 'transfers', data: cached.transfers || [], error: null, source: 'cache' });
  onProgress({ key: 'budgets', data: cached.budgets || [], error: null, source: 'cache' });
  onProgress({ key: 'recurringRules', data: cached.recurringRules || [], error: null, source: 'cache' });
  onProgress({ key: 'settings', data: cached.settings || null, error: null, source: 'cache' });
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function load(user = null, options = {}) {
  const {
    onProgress,
    onBackgroundRefresh,
    backgroundRefresh = true,
    forceRefresh = false,
    healthTimeoutMs = 3000
  } = options;

  const userId = user?.id || null;
  const cached = forceRefresh ? null : getCachedBootstrap(userId);

  if (cached) {
    emitCachedProgress(onProgress, cached);

    if (backgroundRefresh && isConfigured()) {
      supabaseAdapter.load(user, {
        onProgress,
        healthTimeoutMs,
        queryTimeoutMs: LIVE_DATA_TIMEOUT_MS
      }).then((fresh) => {
        if (!fresh) return;
        saveBootstrapCache(userId, fresh);
        onBackgroundRefresh?.(fresh);
      }).catch((error) => {
        console.warn('Background refresh failed:', error);
      });
    }

    return cached;
  }

  if (isConfigured()) {
    try {
      const data = await supabaseAdapter.load(user, {
        onProgress,
        healthTimeoutMs,
        queryTimeoutMs: options.queryTimeoutMs || CACHED_DATA_TIMEOUT_MS
      });
      if (data) {
        saveBootstrapCache(userId, data);
        return data;
      }
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
  if (!isConfigured()) return;

  try {
    switch (action) {
      case 'ADD_FUND_SOURCE':
        await supabaseAdapter.insertFundSource(payload);
        break;
      case 'EDIT_FUND_SOURCE':
        await supabaseAdapter.updateFundSource(payload);
        break;
      case 'DELETE_FUND_SOURCE':
        await supabaseAdapter.deleteFundSource(payload);
        break;
      case 'ADD_TRANSACTION':
        await supabaseAdapter.insertTransaction(payload);
        break;
      case 'EDIT_TRANSACTION':
        await supabaseAdapter.updateTransaction(payload);
        break;
      case 'DELETE_TRANSACTION':
        await supabaseAdapter.deleteTransaction(payload);
        break;
      case 'ADD_TRANSFER':
        await supabaseAdapter.insertTransfer(payload);
        break;
      case 'DELETE_TRANSFER':
        await supabaseAdapter.deleteTransfer(payload);
        break;
      case 'ADD_BUDGET':
        await supabaseAdapter.insertBudget(payload);
        break;
      case 'EDIT_BUDGET':
        await supabaseAdapter.updateBudget(payload);
        break;
      case 'DELETE_BUDGET':
        await supabaseAdapter.deleteBudget(payload);
        break;
      case 'ADD_RECURRING_RULE':
        await supabaseAdapter.insertRecurringRule(payload);
        break;
      case 'EDIT_RECURRING_RULE':
        await supabaseAdapter.updateRecurringRule(payload);
        break;
      case 'UPDATE_SETTINGS':
        await supabaseAdapter.saveSettings(payload);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`Supabase write failed for ${action}:`, err);
    throw err;
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
  _downloadFile(JSON.stringify(state, null, 2), `vaultly-backup-${_dateString()}.json`, 'application/json');
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