/**
 * @fileoverview Supabase storage adapter
 */

import { supabase, isConfigured, getSupabaseHeaders } from '../config/supabase.js';

const TABLES = {
  fundSources: 'fund_sources',
  transactions: 'transactions',
  transfers: 'transfers',
  budgets: 'budgets',
  recurringRules: 'recurring_rules',
  settings: 'user_settings'
};

function getHeaders() {
  return getSupabaseHeaders(true);
}

async function request(method, table, body = null, query = '') {
  if (!isConfigured()) {
    throw new Error('Supabase not configured');
  }

  const url = `${supabase.url}/rest/v1/${table}${query}`;
  const headers = getHeaders();

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
    const error = await response.text();
    throw new Error(`Supabase error: ${response.status} - ${error}`);
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

  async saveTransaction(transaction) {
    const dbObj = toDbTransaction(transaction);
    if (transaction.id) {
      return request('PATCH', TABLES.transactions, dbObj, `?id=eq.${transaction.id}`);
    } else {
      return request('POST', TABLES.transactions, dbObj);
    }
  },

  async deleteTransaction(id) {
    return request('DELETE', TABLES.transactions, null, `?id=eq.${id}`);
  },

  async saveTransfer(transfer) {
    const dbObj = toDbTransfer(transfer);
    if (transfer.id) {
      return request('PATCH', TABLES.transfers, dbObj, `?id=eq.${transfer.id}`);
    } else {
      return request('POST', TABLES.transfers, dbObj);
    }
  },

  async deleteTransfer(id) {
    return request('DELETE', TABLES.transfers, null, `?id=eq.${id}`);
  },

  async saveBudget(budget) {
    const dbObj = toDbBudget(budget);
    if (budget.id) {
      return request('PATCH', TABLES.budgets, dbObj, `?id=eq.${budget.id}`);
    } else {
      return request('POST', TABLES.budgets, dbObj);
    }
  },

  async deleteBudget(id) {
    return request('DELETE', TABLES.budgets, null, `?id=eq.${id}`);
  },

  async saveRecurringRule(rule) {
    const dbObj = toDbRecurringRule(rule);
    if (rule.id) {
      return request('PATCH', TABLES.recurringRules, dbObj, `?id=eq.${rule.id}`);
    } else {
      return request('POST', TABLES.recurringRules, dbObj);
    }
  },

  async saveSettings(settings) {
    try {
      const dbObj = toDbSettings(settings);
      return await request('POST', TABLES.settings, dbObj);
    } catch {
      // user_settings table may not exist yet — silently ignore
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
    initialBalance: parseFloat(row.initial_balance),
    currentBalance: parseFloat(row.current_balance),
    currency: row.currency,
    color: row.color,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTransaction(row) {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    category: row.category,
    type: row.type,
    amount: parseFloat(row.amount),
    fundSourceId: row.fund_source_id,
    reference: row.reference,
    note: row.note,
    tags: row.tags || [],
    isReconciled: row.is_reconciled,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTransfer(row) {
  return {
    id: row.id,
    date: row.date,
    fromFundSourceId: row.from_fund_source_id,
    toFundSourceId: row.to_fund_source_id,
    amount: parseFloat(row.amount),
    reference: row.reference,
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
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeRecurringRule(row) {
  return {
    id: row.id,
    fundSourceId: row.fund_source_id,
    category: row.category,
    type: row.type,
    amount: parseFloat(row.amount),
    frequency: row.frequency,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
    reference: row.reference,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toDbFundSource(fs) {
  return {
    name: fs.name,
    type: fs.type,
    initial_balance: fs.initialBalance,
    current_balance: fs.currentBalance,
    currency: fs.currency,
    color: fs.color,
    is_active: fs.isActive
  };
}

function toDbTransaction(tx) {
  return {
    date: tx.date,
    title: tx.title,
    category: tx.category,
    type: tx.type,
    amount: tx.amount,
    fund_source_id: tx.fundSourceId,
    reference: tx.reference,
    note: tx.note,
    tags: tx.tags,
    is_reconciled: tx.isReconciled
  };
}

function toDbTransfer(t) {
  return {
    date: t.date,
    from_fund_source_id: t.fromFundSourceId,
    to_fund_source_id: t.toFundSourceId,
    amount: t.amount,
    reference: t.reference,
    note: t.note
  };
}

function toDbBudget(b) {
  return {
    category: b.category,
    limit_amount: b.limit,
    period: b.period,
    color: b.color
  };
}

function toDbRecurringRule(r) {
  return {
    fund_source_id: r.fundSourceId,
    category: r.category,
    type: r.type,
    amount: r.amount,
    frequency: r.frequency,
    start_date: r.startDate,
    end_date: r.endDate,
    is_active: r.isActive,
    reference: r.reference,
    note: r.note
  };
}

function toDbSettings(s) {
  return {
    currency: s.currency,
    date_format: s.dateFormat,
    user_name: s.userName
  };
}
