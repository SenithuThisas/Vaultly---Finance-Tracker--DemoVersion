/**
 * @fileoverview Supabase storage adapter
 */

import { supabase, isConfigured, getSupabaseHeaders } from '../config/supabase.js';
import { getCurrentUser } from '../security/session.js';

const TABLES = {
  fundSources: 'fund_sources',
  transactions: 'transactions',
  transfers: 'transfers',
  budgets: 'budgets',
  recurringRules: 'recurring_rules',
  settings: 'user_settings'
};

async function getHeaders() {
  return getSupabaseHeaders(true);
}

async function request(method, table, body = null, query = '') {
  if (!isConfigured()) {
    throw new Error('Supabase not configured');
  }

  const url = `${supabase.url}/rest/v1/${table}${query}`;
  const headers = await getHeaders();

  // DELETE requests must not include a body or Prefer: return=representation
  if (method === 'DELETE') {
    delete headers['Prefer'];
  }

  const options = { method, headers };

  if (body && method !== 'DELETE') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  // 204 No Content is a valid success (common for DELETE/PATCH)
  if (response.status === 204) return null;

  if (!response.ok) {
    const errorText = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(errorText);
    } catch {
      parsed = null;
    }

    const err = new Error(parsed?.message || `Supabase error: ${response.status}`);
    err.status = response.status;
    err.code = parsed?.code || null;
    err.details = parsed?.details || errorText;
    throw err;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const supabaseAdapter = {
  async load() {
    try {
      const [fundSources, transactions, transfers, budgets, recurringRules] = await Promise.all([
        request('GET', TABLES.fundSources, null, '?select=*&order=created_at'),
        request('GET', TABLES.transactions, null, '?select=*&order=date.desc'),
        request('GET', TABLES.transfers, null, '?select=*&order=date.desc'),
        request('GET', TABLES.budgets, null, '?select=*&order=created_at'),
        request('GET', TABLES.recurringRules, null, '?select=*&order=created_at'),
      ]);

      return {
        fundSources: (fundSources || []).map(normalizeFundSource),
        transactions: (transactions || []).map(normalizeTransaction),
        transfers: (transfers || []).map(normalizeTransfer),
        budgets: (budgets || []).map(normalizeBudget),
        recurringRules: (recurringRules || []).map(normalizeRecurringRule),
        settings: null
      };
    } catch (error) {
      console.error('Supabase load error:', error);
      throw error;
    }
  },

  async saveFundSource(fundSource) {
    const dbObj = toDbFundSource(fundSource);
    if (fundSource.id) {
      return request('PATCH', TABLES.fundSources, dbObj, `?id=eq.${fundSource.id}`);
    } else {
      return request('POST', TABLES.fundSources, dbObj);
    }
  },

  async deleteFundSource(id) {
    return request('DELETE', TABLES.fundSources, null, `?id=eq.${id}`);
  },

  // ── Transactions ──────────────────────────────────────────────────────────
  async insertTransaction(transaction) {
    return request('POST', TABLES.transactions, { id: transaction.id, ...toDbTransaction(transaction) });
  },

  async updateTransaction(transaction) {
    return request('PATCH', TABLES.transactions, toDbTransaction(transaction), `?id=eq.${transaction.id}`);
  },

  async deleteTransaction(id) {
    return request('DELETE', TABLES.transactions, null, `?id=eq.${id}`);
  },

  // ── Fund Sources ──────────────────────────────────────────────────────────
  async insertFundSource(fundSource) {
    return request('POST', TABLES.fundSources, { id: fundSource.id, ...toDbFundSource(fundSource) });
  },

  async updateFundSource(fundSource) {
    return request('PATCH', TABLES.fundSources, toDbFundSource(fundSource), `?id=eq.${fundSource.id}`);
  },

  // ── Transfers ─────────────────────────────────────────────────────────────
  async insertTransfer(transfer) {
    return request('POST', TABLES.transfers, { id: transfer.id, ...toDbTransfer(transfer) });
  },

  async deleteTransfer(id) {
    return request('DELETE', TABLES.transfers, null, `?id=eq.${id}`);
  },

  // ── Budgets ───────────────────────────────────────────────────────────────
  async insertBudget(budget) {
    return request('POST', TABLES.budgets, { id: budget.id, ...toDbBudget(budget) });
  },

  async updateBudget(budget) {
    return request('PATCH', TABLES.budgets, toDbBudget(budget), `?id=eq.${budget.id}`);
  },

  async deleteBudget(id) {
    return request('DELETE', TABLES.budgets, null, `?id=eq.${id}`);
  },

  // ── Recurring Rules ───────────────────────────────────────────────────────
  async insertRecurringRule(rule) {
    return request('POST', TABLES.recurringRules, { id: rule.id, ...toDbRecurringRule(rule) });
  },

  async updateRecurringRule(rule) {
    return request('PATCH', TABLES.recurringRules, toDbRecurringRule(rule), `?id=eq.${rule.id}`);
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  async saveSettings(settings) {
    try {
      const dbObj = toDbSettings(settings);
      return await request('POST', TABLES.settings, dbObj);
    } catch {
      return null;
    }
  },

  async subscribe(channel, callback) {
    return () => {};
  }
};

function normalizeFundSource(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    bankName: row.bank_name,
    accountNumber: row.account_number,
    currency: row.currency,
    balance: parseFloat(row.balance),
    initialBalance: parseFloat(row.initial_balance),
    color: row.color,
    icon: row.icon,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTransaction(row) {
  return {
    id: row.id,
    title: row.title,
    amount: parseFloat(row.amount),
    type: row.type,
    category: row.category,
    fundSourceId: row.fund_source_id,
    date: row.date,
    reference: row.reference,
    note: row.note,
    tags: row.tags || [],
    isRecurring: row.is_recurring,
    recurringPeriod: row.recurring_period,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTransfer(row) {
  return {
    id: row.id,
    fromFundSourceId: row.from_fund_source_id,
    toFundSourceId: row.to_fund_source_id,
    amount: parseFloat(row.amount),
    fee: parseFloat(row.fee || 0),
    date: row.date,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeBudget(row) {
  return {
    id: row.id,
    category: row.category,
    limit: parseFloat(row.limit_amount),
    period: row.period,
    fundSourceId: row.fund_source_id,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeRecurringRule(row) {
  return {
    id: row.id,
    title: row.title,
    amount: parseFloat(row.amount),
    type: row.type,
    category: row.category,
    fundSourceId: row.fund_source_id,
    period: row.period,
    nextDueDate: row.next_due_date,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toDbFundSource(fs) {
  const user = getCurrentUser();
  return {
    user_id: user?.id,
    name: fs.name,
    type: fs.type,
    bank_name: fs.bankName || null,
    account_number: fs.accountNumber || null,
    currency: fs.currency,
    initial_balance: fs.initialBalance,
    balance: fs.balance,
    color: fs.color,
    icon: fs.icon,
    notes: fs.notes || null,
    is_active: fs.isActive
  };
}

function toDbTransaction(tx) {
  const user = getCurrentUser();
  return {
    user_id: user?.id,
    title: tx.title,
    amount: tx.amount,
    type: tx.type,
    category: tx.category,
    fund_source_id: tx.fundSourceId,
    date: tx.date,
    reference: tx.reference || null,
    note: tx.note || null,
    tags: tx.tags || [],
    is_recurring: tx.isRecurring || false,
    recurring_period: tx.recurringPeriod || null
  };
}

function toDbTransfer(t) {
  const user = getCurrentUser();
  return {
    user_id: user?.id,
    from_fund_source_id: t.fromFundSourceId,
    to_fund_source_id: t.toFundSourceId,
    amount: t.amount,
    fee: t.fee || 0,
    date: t.date,
    note: t.note || null
  };
}

function toDbBudget(b) {
  const user = getCurrentUser();
  return {
    user_id: user?.id,
    category: b.category,
    limit_amount: b.limit,
    period: b.period,
    fund_source_id: b.fundSourceId || null,
    color: b.color
  };
}

function toDbRecurringRule(r) {
  const user = getCurrentUser();
  return {
    user_id: user?.id,
    title: r.title,
    amount: r.amount,
    type: r.type,
    category: r.category,
    fund_source_id: r.fundSourceId,
    period: r.period,
    next_due_date: r.nextDueDate,
    is_active: r.isActive
  };
}

function toDbSettings(s) {
  const user = getCurrentUser();
  return {
    user_id: user?.id,
    currency: s.currency,
    date_format: s.dateFormat,
    user_name: s.userName
  };
}
