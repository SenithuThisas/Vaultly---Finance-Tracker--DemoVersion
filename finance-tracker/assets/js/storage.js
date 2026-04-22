/**
 * @fileoverview Storage layer with Supabase + localStorage fallback
 */

import { STORAGE_KEY, getState, setState } from './state.js';
import { isConfigured, checkSupabaseHealth } from './config/supabase.js';
import { supabaseAdapter } from './adapters/supabase.adapter.js';
import { localStorageAdapter } from './adapters/localStorage.adapter.js';

let adapter = null;
let pendingQueue = [];
let isOnline = navigator.onLine;
let isSyncing = false;

async function selectAdapter() {
  if (isConfigured() && await checkSupabaseHealth()) {
    adapter = supabaseAdapter;
    console.log('Using Supabase adapter');
  } else {
    adapter = localStorageAdapter;
    console.log('Using localStorage adapter (Supabase unavailable)');
  }
  return adapter;
}

function getAdapter() {
  return adapter || supabaseAdapter;
}

window.addEventListener('online', async () => {
  isOnline = true;
  await flushPendingQueue();
});

window.addEventListener('offline', () => {
  isOnline = false;
  adapter = localStorageAdapter;
});

export function save(state) {
  // Always persist to localStorage as a backup cache
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.warn('Storage quota exceeded');
    }
  }

  if (!isOnline) {
    pendingQueue.push({ type: 'full_save', data: state, timestamp: Date.now() });
    return;
  }

  if (adapter === localStorageAdapter) {
    return;
  }

  syncToCloud(state).catch(err => console.error('Sync error:', err));
}

async function syncToCloud(state) {
  if (!state) return;

  const promises = [];

  for (const fs of (state.fundSources || [])) {
    if (fs._dirty || fs._new) {
      promises.push(supabaseAdapter.saveFundSource(fs).then(() => { fs._dirty = false; fs._new = false; }));
    }
  }

  for (const tx of (state.transactions || [])) {
    if (tx._dirty || tx._new) {
      promises.push(supabaseAdapter.saveTransaction(tx).then(() => { tx._dirty = false; tx._new = false; }));
    }
  }

  for (const t of (state.transfers || [])) {
    if (t._dirty || t._new) {
      promises.push(supabaseAdapter.saveTransfer(t).then(() => { t._dirty = false; t._new = false; }));
    }
  }

  for (const b of (state.budgets || [])) {
    if (b._dirty || b._new) {
      promises.push(supabaseAdapter.saveBudget(b).then(() => { b._dirty = false; b._new = false; }));
    }
  }

  await Promise.allSettled(promises);
}

async function load() {
  await selectAdapter();

  try {
    const data = await getAdapter().load();
    if (data) {
      return data;
    }
  } catch (e) {
    console.error('Load error, falling back to localStorage:', e);
  }

  const localData = localStorage.getItem(STORAGE_KEY);
  return localData ? JSON.parse(localData) : null;
}

export { load };

export function clear() {
  localStorage.removeItem(STORAGE_KEY);
  pendingQueue = [];
}

async function flushPendingQueue() {
  if (isSyncing || pendingQueue.length === 0) return;
  isSyncing = true;

  while (pendingQueue.length > 0) {
    const item = pendingQueue.shift();
    try {
      if (item.type === 'full_save') {
        await syncToCloud(item.data);
      }
    } catch (e) {
      console.error('Queue flush error:', e);
      pendingQueue.unshift(item);
      break;
    }
  }

  isSyncing = false;
}

export function queueFundSource(fundSource) {
  pendingQueue.push({ type: 'fund_source', data: fundSource });
  if (isOnline) flushPendingQueue();
}

export function queueTransaction(transaction) {
  pendingQueue.push({ type: 'transaction', data: transaction });
  if (isOnline) flushPendingQueue();
}

export function queueTransfer(transfer) {
  pendingQueue.push({ type: 'transfer', data: transfer });
  if (isOnline) flushPendingQueue();
}

export function queueBudget(budget) {
  pendingQueue.push({ type: 'budget', data: budget });
  if (isOnline) flushPendingQueue();
}

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
  downloadFile(csv, `vaultly-export-${getDateString()}.csv`, 'text/csv');
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
  downloadFile(csv, `${fundSource.name}-ledger-${getDateString()}.csv`, 'text/csv');
}

export function exportJSON(state) {
  const json = JSON.stringify(state, null, 2);
  downloadFile(json, `vaultly-backup-${getDateString()}.json`, 'application/json');
}

export function importJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.transactions && !data.fundSources) {
      throw new Error('Invalid data format');
    }
    setState(data);
    save(data);
    return data;
  } catch (e) {
    return e;
  }
}

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

function getDateString() {
  return new Date().toISOString().split('T')[0];
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function isUsingCloud() {
  return adapter === supabaseAdapter;
}

export function isUsingOffline() {
  return adapter === localStorageAdapter;
}