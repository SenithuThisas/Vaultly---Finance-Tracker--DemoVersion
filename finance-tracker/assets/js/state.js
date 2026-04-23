/**
 * @fileoverview Centralized state management with dispatch pattern
 */

import { saveRecord } from './storage.js';
import { showToast } from './components/toast.js';

/** @type {import('./types').AppState} */
let AppState = {
  fundSources: [],
  transactions: [],
  transfers: [],
  budgets: [],
  recurringRules: [],
  currentView: 'dashboard',
  filters: {},
  settings: {
    currency: 'LKR',
    dateFormat: 'DD/MM/YYYY',
    userName: 'User'
  }
};

let viewRenderers = {};

/**
 * Register view renderers for re-rendering after state changes
 * @param {string} viewName
 * @param {Function} renderer
 */
export function registerViewRenderer(viewName, renderer) {
  viewRenderers[viewName] = renderer;
}

/**
 * Get current state snapshot
 * @returns {import('./types').AppState}
 */
export function getState() {
  return AppState;
}

/**
 * Set entire state (used for loading from storage)
 * @param {import('./types').AppState} newState
 */
export function setState(newState) {
  AppState = newState;
}

/**
 * Dispatch action - mutates state, saves to storage, re-renders view
 * @param {string} action - Action type
 * @param {*} payload - Action payload
 */
export function dispatch(action, payload) {
  switch (action) {
    case 'ADD_FUND_SOURCE':
      AppState.fundSources.push(payload);
      break;
    case 'EDIT_FUND_SOURCE':
      const fsIdx = AppState.fundSources.findIndex(f => f.id === payload.id);
      if (fsIdx !== -1) AppState.fundSources[fsIdx] = payload;
      break;
    case 'DELETE_FUND_SOURCE':
      const fs = AppState.fundSources.find(f => f.id === payload);
      if (fs) {
        fs.isActive = false;
      }
      break;
    case 'ADD_TRANSACTION':
      AppState.transactions.unshift(payload);
      break;
    case 'EDIT_TRANSACTION':
      const txIdx = AppState.transactions.findIndex(t => t.id === payload.id);
      if (txIdx !== -1) AppState.transactions[txIdx] = payload;
      break;
    case 'DELETE_TRANSACTION':
      AppState.transactions = AppState.transactions.filter(t => t.id !== payload);
      break;
    case 'ADD_TRANSFER':
      AppState.transfers.unshift(payload);
      break;
    case 'DELETE_TRANSFER':
      AppState.transfers = AppState.transfers.filter(t => t.id !== payload);
      break;
    case 'ADD_BUDGET':
      AppState.budgets.push(payload);
      break;
    case 'EDIT_BUDGET':
      const bIdx = AppState.budgets.findIndex(b => b.id === payload.id);
      if (bIdx !== -1) AppState.budgets[bIdx] = payload;
      break;
    case 'DELETE_BUDGET':
      AppState.budgets = AppState.budgets.filter(b => b.id !== payload);
      break;
    case 'ADD_RECURRING_RULE':
      AppState.recurringRules.push(payload);
      break;
    case 'EDIT_RECURRING_RULE':
      const rIdx = AppState.recurringRules.findIndex(r => r.id === payload.id);
      if (rIdx !== -1) AppState.recurringRules[rIdx] = payload;
      break;
    case 'SET_VIEW':
      AppState.currentView = payload;
      break;
    case 'UPDATE_SETTINGS':
      AppState.settings = { ...AppState.settings, ...payload };
      break;
  }

  // Write the specific record to Supabase immediately
  saveRecord(action, payload).catch(err => {
    console.error('saveRecord error:', err);
    showToast('Failed to save data. Please check your connection.', 'error');
  });

  // Re-render current view
  const currentView = AppState.currentView;
  if (viewRenderers[currentView]) {
    viewRenderers[currentView]();
  }

  return AppState;
}

/**
 * Navigate to a different view
 * @param {string} viewName
 */
export function navigateTo(viewName) {
  dispatch('SET_VIEW', viewName);
  updateActiveView(viewName);
  updateActiveNav(viewName);
  updateBreadcrumb(viewName);
}

function updateActiveView(viewName) {
  document.querySelectorAll('.view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });
}

function updateActiveNav(viewName) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });
  // Sync bottom tab bar
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });
}

function updateBreadcrumb(viewName) {
  const breadcrumb = document.getElementById('breadcrumb');
  if (breadcrumb) {
    const names = {
      dashboard: 'Dashboard',
      banks: 'Bank Accounts',
      transactions: 'Transactions',
      transfers: 'Transfers',
      budgets: 'Budgets',
      analytics: 'Analytics'
    };
    breadcrumb.textContent = names[viewName] || viewName;
  }
}

/**
 * Clear the entire state (used on sign out)
 */
export function clearState() {
  AppState = {
    fundSources: [],
    transactions: [],
    transfers: [],
    budgets: [],
    recurringRules: [],
    currentView: 'dashboard',
    filters: {},
    settings: {
      currency: 'LKR',
      dateFormat: 'DD/MM/YYYY',
      userName: 'User'
    }
  };

  const currentView = AppState.currentView;
  if (viewRenderers[currentView]) {
    viewRenderers[currentView]();
  }
}