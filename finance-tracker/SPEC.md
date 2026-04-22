# FinFlow - Personal Finance Tracker

## Project Overview

- **Project Name:** FinFlow
- **Type:** Single-page application (SPA)
- **Architecture:** Multi-file ES Modules
- **Technology:** Vanilla HTML, CSS, JavaScript (no frameworks)
- **Storage:** LocalStorage with `finflow_v3` key

## File Structure

```
finance-tracker/
├── index.html                    # Main HTML shell
├── assets/
│   ├── css/
│   │   ├── main.css              # Variables, reset, base styles
│   │   ├── layout.css            # Sidebar, main, responsive
│   │   ├── components.css        # Cards, buttons, forms, modals
│   │   └── charts.css            # SVG chart styles
│   └── js/
│       ├── app.js                # Entry point, initialization
│       ├── state.js              # Central state management
│       ├── storage.js            # LocalStorage persistence
│       ├── data/
│       │   └── seed.js           # Categories, currencies, mock data
│       ├── services/
│       │   ├── fundSource.service.js
│       │   ├── transaction.service.js
│       │   ├── transfer.service.js
│       │   ├── budget.service.js
│       │   ├── analytics.service.js
│       │   └── recurring.service.js
│       ├── views/
│       │   ├── dashboard.view.js
│       │   ├── banks.view.js
│       │   ├── transactions.view.js
│       │   ├── transfers.view.js
│       │   ├── budgets.view.js
│       │   └── analytics.view.js
│       └── components/
│           ├── modal.js
│           ├── drawer.js
│           ├── toast.js
│           ├── charts.js
│           └── nav.js
└── SPEC.md
```

## Data Models

### FundSource
```javascript
{
  id: string,
  name: string,
  type: 'bank' | 'cash' | 'ewallet' | 'credit_card' | 'investment',
  bankName: string | null,
  accountNumber: string | null,
  currency: string,
  balance: number,
  initialBalance: number,
  color: string,
  icon: string,
  notes: string,
  createdAt: string,
  isActive: boolean
}
```

### Transaction
```javascript
{
  id: string,
  title: string,
  amount: number,
  type: 'CR' | 'DR',
  category: string,
  fundSourceId: string,
  date: string,
  reference: string,
  note: string,
  tags: string[],
  isRecurring: boolean,
  recurringPeriod: string | null,
  createdAt: string
}
```

### Transfer
```javascript
{
  id: string,
  fromFundSourceId: string,
  toFundSourceId: string,
  amount: number,
  date: string,
  note: string,
  fee: number,
  createdAt: string
}
```

### Budget
```javascript
{
  id: string,
  category: string,
  limit: number,
  period: 'monthly' | 'weekly',
  fundSourceId: string | null,
  color: string,
  createdAt: string
}
```

## Views

1. **Dashboard** - Overview stats, cashflow chart, spending donut, recent transactions, budget health
2. **Bank Accounts** - Fund source cards with CRUD operations
3. **Transactions** - Filterable table with add/edit/delete
4. **Transfers** - Transfer money between accounts
5. **Budgets** - Category budgets with progress tracking
6. **Analytics** - Charts, trends, insights

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| 1 | Dashboard |
| 2 | Bank Accounts |
| 3 | Transactions |
| 4 | Transfers |
| 5 | Budgets |
| 6 | Analytics |
| N | New Transaction |
| Ctrl+K | Global Search |
| Escape | Close modal/drawer |

## Categories

- **Credit (CR):** Salary, Freelance, Investment Return, Gift Received, Refund, Other Income
- **Debit (DR):** Housing, Food, Transport, Entertainment, Healthcare, Utilities, Shopping, Education, Subscriptions, Investment, Insurance, Other Expense

## Design System

### Colors
- Primary: #F4B942 (Gold)
- Success: #10B981 (Green)
- Danger: #FF6B6B (Red)
- Info: #60A5FA (Blue)
- Background: #0F0F0F
- Card: #1A1A1A
- Text: #F0F0F0 / #888888

### Typography
- Body: DM Sans
- Mono: JetBrains Mono

## Storage

- Key: `finflow_v3`
- Format: JSON
- Auto-save on every state change

## Export/Import

- JSON: Full state backup
- CSV: Transaction list for spreadsheet import