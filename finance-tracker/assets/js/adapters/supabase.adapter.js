/**
 * @fileoverview Supabase storage adapter using @supabase/supabase-js SDK
 */

import { supabase, getCurrentUser } from '../config/supabase.js';

const QUERY_TIMEOUT_MS = 12000;
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const HEALTH_TIMEOUT_MS = 3000;
const QUERY_CONCURRENCY = 2;

let activeLoad = null;

function emitProgress(listeners, payload) {
  listeners.forEach((listener) => {
    try {
      listener?.(payload);
    } catch (error) {
      console.warn('[Adapter] onProgress listener failed:', error);
    }
  });
}

function withTimeout(promise, label, timeoutMs = QUERY_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(queryFactory, label, retryDelaysMs = RETRY_DELAYS_MS) {
  return withRetryAndTimeout(queryFactory, label, retryDelaysMs, QUERY_TIMEOUT_MS);
}

async function withRetryAndTimeout(queryFactory, label, retryDelaysMs = RETRY_DELAYS_MS, timeoutMs = QUERY_TIMEOUT_MS) {
  let lastError = null;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    try {
      return await withTimeout(queryFactory(), label, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt >= retryDelaysMs.length) break;

      const delayMs = retryDelaysMs[attempt];
      console.warn(`[Adapter] ${label} failed (attempt ${attempt + 1}), retrying in ${delayMs}ms`, error);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function runWithConcurrency(taskFactories, limit = QUERY_CONCURRENCY) {
  const results = new Array(taskFactories.length);
  let cursor = 0;

  async function worker() {
    while (cursor < taskFactories.length) {
      const index = cursor;
      cursor += 1;

      try {
        const value = await taskFactories[index]();
        results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(limit, taskFactories.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export const supabaseAdapter = {
  async load(userParam = null, options = {}) {
    const {
      onProgress,
      queryTimeoutMs = QUERY_TIMEOUT_MS,
      healthTimeoutMs = HEALTH_TIMEOUT_MS
    } = options;

    if (activeLoad) {
      if (onProgress) activeLoad.listeners.add(onProgress);
      console.log('[Adapter] load() deduped - returning in-flight promise');
      return activeLoad.promise;
    }

    const listeners = new Set();
    if (onProgress) listeners.add(onProgress);

    const loadPromise = (async () => {
    console.log('[Adapter] load() triggered');
    try {
      let user = userParam;
      if (!user) {
        console.log('[Adapter] Awaiting getCurrentUser()...');
        user = await getCurrentUser();
      }
      console.log('[Adapter] User fetched:', user?.id);
      if (!user) return null;

      await withTimeout(
        supabase.from('profiles').select('id').eq('id', user.id).limit(1),
        'connection health check',
        healthTimeoutMs
      ).catch((error) => {
        throw new Error(`Connection issue: ${error.message}`);
      });

      const queries = [
        {
          key: 'fundSources',
          label: 'fund_sources query',
          run: () => supabase.from('fund_sources').select('*').order('created_at'),
          normalize: (rows) => (rows || []).map(normalizeFundSource)
        },
        {
          key: 'transactions',
          label: 'transactions query',
          run: () => supabase.from('transactions').select('*').order('date', { ascending: false }),
          normalize: (rows) => (rows || []).map(normalizeTransaction)
        },
        {
          key: 'transfers',
          label: 'transfers query',
          run: () => supabase.from('transfers').select('*').order('date', { ascending: false }),
          normalize: (rows) => (rows || []).map(normalizeTransfer)
        },
        {
          key: 'budgets',
          label: 'budgets query',
          run: () => supabase.from('budgets').select('*').order('created_at'),
          normalize: (rows) => (rows || []).map(normalizeBudget)
        },
        {
          key: 'recurringRules',
          label: 'recurring_rules query',
          run: () => supabase.from('recurring_rules').select('*').order('created_at'),
          normalize: (rows) => (rows || []).map(normalizeRecurringRule)
        },
        {
          key: 'settings',
          label: 'profiles query',
          run: () => supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          normalize: (profile) => profile
            ? {
                currency: profile.currency,
                dateFormat: profile.date_format,
                userName: profile.full_name
              }
            : null
        }
      ];

      const taskFactories = queries.map((q) => async () => {
        const result = await withRetryAndTimeout(q.run, q.label, RETRY_DELAYS_MS, queryTimeoutMs);
        if (result.error) {
          emitProgress(listeners, { key: q.key, error: result.error });
          return result;
        }

        emitProgress(listeners, { key: q.key, data: q.normalize(result.data), error: null });
        return result;
      });

      const settled = await runWithConcurrency(taskFactories, QUERY_CONCURRENCY);
      const loaded = {
        fundSources: [],
        transactions: [],
        transfers: [],
        budgets: [],
        recurringRules: [],
        settings: null
      };
      const errors = [];

      settled.forEach((result, index) => {
        const query = queries[index];

        if (result.status === 'rejected') {
          errors.push({ key: query.key, error: result.reason });
          return;
        }

        const { data, error } = result.value;
        if (error) {
          errors.push({ key: query.key, error });
          return;
        }

        loaded[query.key] = query.normalize(data);
      });

      if (errors.length > 0) {
        console.warn('[Adapter] Bootstrap completed with partial failures:', errors);
      }

      return {
        ...loaded,
        loadErrors: errors
      };
    } catch (error) {
      console.error('Supabase load error:', error);
      throw error;
    }
    })().finally(() => {
      activeLoad = null;
    });

    activeLoad = { promise: loadPromise, listeners };
    return loadPromise;
  },

  // ── Fund Sources ──────────────────────────────────────────────────────────
  async insertFundSource(fundSource) {
    const user = await getCurrentUser();
    const { data, error } = await supabase
      .from('fund_sources')
      .insert({ id: fundSource.id, ...toDbFundSource(fundSource), user_id: user.id })
      .select().single();
    if (error) throw error;
    return data;
  },

  async updateFundSource(fundSource) {
    const { data, error } = await supabase
      .from('fund_sources')
      .update(toDbFundSource(fundSource))
      .eq('id', fundSource.id)
      .select().single();
    if (error) throw error;
    return data;
  },

  async deleteFundSource(id) {
    const { error } = await supabase
      .from('fund_sources')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  },

  // ── Transactions ──────────────────────────────────────────────────────────
  async insertTransaction(transaction) {
    const user = await getCurrentUser();
    const { data, error } = await supabase
      .from('transactions')
      .insert({ id: transaction.id, ...toDbTransaction(transaction), user_id: user.id })
      .select().single();
    if (error) throw error;
    return data;
  },

  async updateTransaction(transaction) {
    const { data, error } = await supabase
      .from('transactions')
      .update(toDbTransaction(transaction))
      .eq('id', transaction.id)
      .select().single();
    if (error) throw error;
    return data;
  },

  async deleteTransaction(id) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ── Transfers ─────────────────────────────────────────────────────────────
  async insertTransfer(transfer) {
    const user = await getCurrentUser();
    const { data, error } = await supabase
      .from('transfers')
      .insert({ id: transfer.id, ...toDbTransfer(transfer), user_id: user.id })
      .select().single();
    if (error) throw error;
    return data;
  },

  async deleteTransfer(id) {
    const { error } = await supabase
      .from('transfers')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ── Budgets ───────────────────────────────────────────────────────────────
  async insertBudget(budget) {
    const user = await getCurrentUser();
    const { data, error } = await supabase
      .from('budgets')
      .insert({ id: budget.id, ...toDbBudget(budget), user_id: user.id })
      .select().single();
    if (error) throw error;
    return data;
  },

  async updateBudget(budget) {
    const { data, error } = await supabase
      .from('budgets')
      .update(toDbBudget(budget))
      .eq('id', budget.id)
      .select().single();
    if (error) throw error;
    return data;
  },

  async deleteBudget(id) {
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ── Recurring Rules ───────────────────────────────────────────────────────
  async insertRecurringRule(rule) {
    const user = await getCurrentUser();
    const { data, error } = await supabase
      .from('recurring_rules')
      .insert({ id: rule.id, ...toDbRecurringRule(rule), user_id: user.id })
      .select().single();
    if (error) throw error;
    return data;
  },

  async updateRecurringRule(rule) {
    const { data, error } = await supabase
      .from('recurring_rules')
      .update(toDbRecurringRule(rule))
      .eq('id', rule.id)
      .select().single();
    if (error) throw error;
    return data;
  },

  async deleteRecurringRule(id) {
    const { error } = await supabase
      .from('recurring_rules')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ── Settings (Profile) ────────────────────────────────────────────────────
  async saveSettings(settings) {
    try {
      const user = await getCurrentUser();
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .update({
          currency: settings.currency,
          date_format: settings.dateFormat,
          full_name: settings.userName
        })
        .eq('id', user.id)
        .select().single();
      
      if (error) throw error;
      return data;
    } catch {
      return null;
    }
  }
};

// ── Helpers ─────────────────────────────────────────────────────────────────

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
  return {
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
    is_active: fs.isActive !== false
  };
}

function toDbTransaction(tx) {
  return {
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
  return {
    from_fund_source_id: t.fromFundSourceId,
    to_fund_source_id: t.toFundSourceId,
    amount: t.amount,
    fee: t.fee || 0,
    date: t.date,
    note: t.note || null
  };
}

function toDbBudget(b) {
  return {
    category: b.category,
    limit_amount: b.limit,
    period: b.period,
    fund_source_id: b.fundSourceId || null,
    color: b.color
  };
}

function toDbRecurringRule(r) {
  return {
    title: r.title,
    amount: r.amount,
    type: r.type,
    category: r.category,
    fund_source_id: r.fundSourceId,
    period: r.period,
    next_due_date: r.nextDueDate,
    is_active: r.isActive !== false
  };
}
