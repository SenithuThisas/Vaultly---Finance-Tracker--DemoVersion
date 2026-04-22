/**
 * @fileoverview Seed data with categories, currencies, and mock data
 */

/** @type {Array<{id: string, label: string, emoji: string, color: string, type: 'CR'|'DR'}>} */
export const CATEGORIES = [
  { id: 'salary', label: 'Salary', emoji: '💼', color: '#3FB950', type: 'CR' },
  { id: 'freelance', label: 'Freelance', emoji: '💻', color: '#58A6FF', type: 'CR' },
  { id: 'investment_ret', label: 'Investment Return', emoji: '📈', color: '#E6B450', type: 'CR' },
  { id: 'gift_received', label: 'Gift Received', emoji: '🎁', color: '#BC8CFF', type: 'CR' },
  { id: 'refund', label: 'Refund', emoji: '↩️', color: '#79C0FF', type: 'CR' },
  { id: 'other_cr', label: 'Other Income', emoji: '➕', color: '#56D364', type: 'CR' },
  { id: 'housing', label: 'Housing/Rent', emoji: '🏠', color: '#60A5FA', type: 'DR' },
  { id: 'food', label: 'Food & Dining', emoji: '🍔', color: '#F59E0B', type: 'DR' },
  { id: 'transport', label: 'Transport', emoji: '🚗', color: '#8B5CF6', type: 'DR' },
  { id: 'entertainment', label: 'Entertainment', emoji: '🎬', color: '#EC4899', type: 'DR' },
  { id: 'healthcare', label: 'Healthcare', emoji: '🏥', color: '#10B981', type: 'DR' },
  { id: 'utilities', label: 'Utilities', emoji: '⚡', color: '#FCD34D', type: 'DR' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️', color: '#F87171', type: 'DR' },
  { id: 'education', label: 'Education', emoji: '📚', color: '#60A5FA', type: 'DR' },
  { id: 'subscriptions', label: 'Subscriptions', emoji: '🔄', color: '#A78BFA', type: 'DR' },
  { id: 'investment', label: 'Investment', emoji: '💹', color: '#34D399', type: 'DR' },
  { id: 'insurance', label: 'Insurance', emoji: '🛡️', color: '#6EE7B7', type: 'DR' },
  { id: 'other_dr', label: 'Other Expense', emoji: '➖', color: '#FF7B72', type: 'DR' }
];

export const CR_CATEGORIES = CATEGORIES.filter(c => c.type === 'CR');
export const DR_CATEGORIES = CATEGORIES.filter(c => c.type === 'DR');

/** @type {Array<{id: string, label: string, icon: string}>} */
export const FUND_SOURCE_TYPES = [
  { id: 'bank', label: 'Bank Account', icon: '🏦' },
  { id: 'cash', label: 'Cash on Hand', icon: '💵' },
  { id: 'ewallet', label: 'E-Wallet', icon: '📱' },
  { id: 'credit_card', label: 'Credit Card', icon: '💳' },
  { id: 'investment', label: 'Investment', icon: '📈' }
];

/** @type {Array<{code: string, label: string, symbol: string}>} */
export const CURRENCIES = [
  { code: 'LKR', label: 'Sri Lankan Rupee', symbol: '₨' },
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
  { code: 'INR', label: 'Indian Rupee', symbol: '₹' },
  { code: 'SGD', label: 'Singapore Dollar', symbol: 'S$' },
  { code: 'MYR', label: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' }
];

const uuid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

/**
 * Generate seed data for first-time users
 * @returns {{fundSources: Array, transactions: Array, transfers: Array, budgets: Array, recurringRules: Array}}
 */
export function getSeedData() {
  const fundSources = [
    {
      id: 'fs-1',
      name: 'Commercial Bank',
      type: 'bank',
      bankName: 'Commercial Bank Ceylon',
      accountNumber: '1234',
      currency: 'LKR',
      balance: 245000,
      initialBalance: 200000,
      color: '#10B981',
      icon: '🏦',
      notes: 'Primary salary account',
      createdAt: new Date().toISOString(),
      isActive: true
    },
    {
      id: 'fs-2',
      name: 'HNB Savings',
      type: 'bank',
      bankName: 'Hatton National Bank',
      accountNumber: '5678',
      currency: 'LKR',
      balance: 890000,
      initialBalance: 850000,
      color: '#60A5FA',
      icon: '🏦',
      notes: 'Emergency fund savings',
      createdAt: new Date().toISOString(),
      isActive: true
    },
    {
      id: 'fs-3',
      name: 'Cash on Hand',
      type: 'cash',
      bankName: null,
      accountNumber: null,
      currency: 'LKR',
      balance: 15500,
      initialBalance: 10000,
      color: '#F4B942',
      icon: '💵',
      notes: 'Daily cash reserve',
      createdAt: new Date().toISOString(),
      isActive: true
    },
    {
      id: 'fs-4',
      name: 'Credit Card',
      type: 'credit_card',
      bankName: 'HSBC',
      accountNumber: '9012',
      currency: 'LKR',
      balance: -48500,
      initialBalance: 0,
      color: '#F87171',
      icon: '💳',
      notes: 'Credit card debt',
      createdAt: new Date().toISOString(),
      isActive: true
    }
  ];

  const transactions = [];
  const now = new Date();

  const txTemplates = [
    { title: 'Monthly Salary', amount: 425000, category: 'salary', type: 'CR' },
    { title: 'House Rent', amount: 185000, category: 'housing', type: 'DR' },
    { title: 'Grocery Shopping', amount: 28500, category: 'food', type: 'DR' },
    { title: 'Gas & Fuel', amount: 8500, category: 'transport', type: 'DR' },
    { title: 'Netflix Subscription', amount: 2499, category: 'subscriptions', type: 'DR' },
    { title: 'Freelance Project', amount: 120000, category: 'freelance', type: 'CR' },
    { title: 'Electric Bill', amount: 12500, category: 'utilities', type: 'DR' },
    { title: 'Internet Bill', amount: 6500, category: 'utilities', type: 'DR' },
    { title: 'Restaurant Dinner', amount: 8500, category: 'food', type: 'DR' },
    { title: 'Doctor Visit', amount: 5500, category: 'healthcare', type: 'DR' },
    { title: 'Online Shopping', amount: 18500, category: 'shopping', type: 'DR' },
    { title: 'Gym Membership', amount: 5500, category: 'healthcare', type: 'DR' },
    { title: 'Movie Tickets', amount: 3200, category: 'entertainment', type: 'DR' },
    { title: 'Pharmacy', amount: 3500, category: 'healthcare', type: 'DR' },
    { title: 'Coffee Shop', amount: 1200, category: 'food', type: 'DR' },
    { title: 'Spotify', amount: 990, category: 'subscriptions', type: 'DR' },
    { title: 'Car Insurance', amount: 28000, category: 'transport', type: 'DR' },
    { title: 'Water Bill', amount: 2500, category: 'utilities', type: 'DR' },
    { title: 'Takeout', amount: 3500, category: 'food', type: 'DR' },
    { title: 'Tuk Tuk Ride', amount: 500, category: 'transport', type: 'DR' },
    { title: 'Clothing', amount: 15000, category: 'shopping', type: 'DR' },
    { title: 'Performance Bonus', amount: 85000, category: 'salary', type: 'CR' },
    { title: 'Investment Return', amount: 35000, category: 'investment_ret', type: 'CR' },
    { title: 'Concert Tickets', amount: 12000, category: 'entertainment', type: 'DR' },
    { title: 'Groceries', amount: 18500, category: 'food', type: 'DR' },
    { title: 'Dentist', amount: 8500, category: 'healthcare', type: 'DR' },
    { title: 'Electronics', amount: 45000, category: 'shopping', type: 'DR' },
    { title: 'Groceries', amount: 22500, category: 'food', type: 'DR' },
    { title: 'Freelance Project', amount: 95000, category: 'freelance', type: 'CR' },
    { title: 'Restaurant', amount: 9500, category: 'food', type: 'DR' },
    { title: 'Electric Bill', amount: 15500, category: 'utilities', type: 'DR' },
    { title: 'Internet', amount: 6500, category: 'utilities', type: 'DR' },
    { title: 'Car Maintenance', amount: 15000, category: 'transport', type: 'DR' },
    { title: 'Doctor Checkup', amount: 7500, category: 'healthcare', type: 'DR' },
    { title: 'Groceries', amount: 19500, category: 'food', type: 'DR' },
    { title: 'Freelance Design', amount: 65000, category: 'freelance', type: 'CR' },
    { title: 'Shopping', amount: 25000, category: 'shopping', type: 'DR' },
    { title: 'Entertainment', amount: 9500, category: 'entertainment', type: 'DR' },
    { title: 'Utilities', amount: 12500, category: 'utilities', type: 'DR' },
    { title: 'Investment', amount: 50000, category: 'investment', type: 'DR' },
    { title: 'Grocery', amount: 16500, category: 'food', type: 'DR' },
    { title: 'Transport', amount: 5500, category: 'transport', type: 'DR' },
    { title: 'Healthcare', amount: 8500, category: 'healthcare', type: 'DR' },
    { title: 'Dining Out', amount: 12000, category: 'food', type: 'DR' },
    { title: 'Online Course', amount: 25000, category: 'education', type: 'DR' },
    { title: 'Gift Received', amount: 15000, category: 'gift_received', type: 'CR' },
    { title: 'Refund', amount: 3500, category: 'refund', type: 'CR' },
    { title: 'Phone Bill', amount: 2800, category: 'utilities', type: 'DR' },
    { title: 'Mobile Recharge', amount: 1500, category: 'utilities', type: 'DR' },
    { title: 'Vegetable Market', amount: 4200, category: 'food', type: 'DR' },
    { title: 'Books', amount: 8500, category: 'education', type: 'DR' },
    { title: 'Haircut', amount: 2000, category: 'other_dr', type: 'DR' },
    { title: 'Taxi Ride', amount: 1800, category: 'transport', type: 'DR' }
  ];

  // Generate transactions spanning last 3 months
  let txIndex = 0;
  for (let monthOffset = 2; monthOffset >= 0; monthOffset--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();

    for (let day = 1; day <= Math.min(18 + monthOffset * 2, daysInMonth); day++) {
      if (txIndex >= txTemplates.length) break;

      const template = txTemplates[txIndex];
      const txDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);

      let fundSourceId;
      if (template.type === 'CR') {
        fundSourceId = template.category === 'salary' ? 'fs-1' : 'fs-2';
      } else {
        fundSourceId = template.category === 'shopping' ? 'fs-4' : 'fs-1';
      }

      transactions.push({
        id: uuid(),
        title: template.title,
        amount: template.amount,
        type: template.type,
        category: template.category,
        fundSourceId,
        date: txDate.toISOString().split('T')[0],
        reference: '',
        note: '',
        tags: [],
        isRecurring: false,
        recurringPeriod: null,
        createdAt: txDate.toISOString()
      });

      txIndex++;
    }
  }

  const transfers = [
    {
      id: uuid(),
      fromFundSourceId: 'fs-1',
      toFundSourceId: 'fs-2',
      amount: 50000,
      date: new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString().split('T')[0],
      note: 'Monthly savings transfer',
      fee: 0,
      createdAt: new Date().toISOString()
    },
    {
      id: uuid(),
      fromFundSourceId: 'fs-2',
      toFundSourceId: 'fs-3',
      amount: 10000,
      date: new Date(now.getFullYear(), now.getMonth(), 5).toISOString().split('T')[0],
      note: 'Weekly cash allowance',
      fee: 0,
      createdAt: new Date().toISOString()
    },
    {
      id: uuid(),
      fromFundSourceId: 'fs-1',
      toFundSourceId: 'fs-4',
      amount: 25000,
      date: new Date(now.getFullYear(), now.getMonth() - 2, 20).toISOString().split('T')[0],
      note: 'Credit card payment',
      fee: 0,
      createdAt: new Date().toISOString()
    }
  ];

  const budgets = [
    { id: 'bud-1', category: 'food', limit: 100000, period: 'monthly', fundSourceId: null, color: '#F59E0B', createdAt: now.toISOString() },
    { id: 'bud-2', category: 'transport', limit: 50000, period: 'monthly', fundSourceId: null, color: '#8B5CF6', createdAt: now.toISOString() },
    { id: 'bud-3', category: 'entertainment', limit: 25000, period: 'monthly', fundSourceId: null, color: '#EC4899', createdAt: now.toISOString() },
    { id: 'bud-4', category: 'shopping', limit: 75000, period: 'monthly', fundSourceId: null, color: '#F87171', createdAt: now.toISOString() },
    { id: 'bud-5', category: 'utilities', limit: 45000, period: 'monthly', fundSourceId: null, color: '#FCD34D', createdAt: now.toISOString() },
    { id: 'bud-6', category: 'housing', limit: 200000, period: 'monthly', fundSourceId: null, color: '#60A5FA', createdAt: now.toISOString() }
  ];

  const recurringRules = [
    {
      id: 'rec-1',
      title: 'Monthly Rent',
      amount: 185000,
      type: 'DR',
      category: 'housing',
      fundSourceId: 'fs-1',
      period: 'monthly',
      nextDueDate: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0],
      isActive: true
    },
    {
      id: 'rec-2',
      title: 'Monthly Salary',
      amount: 425000,
      type: 'CR',
      category: 'salary',
      fundSourceId: 'fs-1',
      period: 'monthly',
      nextDueDate: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0],
      isActive: true
    },
    {
      id: 'rec-3',
      title: 'Netflix Subscription',
      amount: 2499,
      type: 'DR',
      category: 'subscriptions',
      fundSourceId: 'fs-4',
      period: 'monthly',
      nextDueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5).toISOString().split('T')[0],
      isActive: true
    },
    {
      id: 'rec-4',
      title: 'Gym Membership',
      amount: 5500,
      type: 'DR',
      category: 'healthcare',
      fundSourceId: 'fs-1',
      period: 'monthly',
      nextDueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3).toISOString().split('T')[0],
      isActive: true
    }
  ];

  return { fundSources, transactions, transfers, budgets, recurringRules };
}

/**
 * Get category by id
 * @param {string} id
 * @returns {Object}
 */
export function getCategoryById(id) {
  return CATEGORIES.find(c => c.id === id) || { id, label: id, emoji: '📦', color: '#888', type: 'DR' };
}