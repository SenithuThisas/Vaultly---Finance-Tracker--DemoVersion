<div align="center">

# 🏦 Vaultly
### *Your Personal Finance Vault — Secure, Smart & Beautiful*

[![Netlify Status](https://api.netlify.com/api/v1/badges/YOUR-BADGE-ID/deploy-status)](https://app.netlify.com/sites/YOUR-SITE/deploys)
![Version](https://img.shields.io/badge/version-1.0.0-F4B942?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-10B981?style=flat-square)
![Built With](https://img.shields.io/badge/built%20with-Vanilla%20JS%20%2B%20Vite-60A5FA?style=flat-square)
![Supabase](https://img.shields.io/badge/backend-Supabase-3ECF8E?style=flat-square&logo=supabase)

A sleek, dark-themed personal finance tracker for managing bank accounts, transactions, transfers, budgets, savings goals, and spending analytics — all in one secure, cloud-synced place.

[**Live Demo →**](https://YOUR-SITE.netlify.app) &nbsp;·&nbsp; [**Report a Bug**](https://github.com/SenithuThisas/Vaultly---Finance-Tracker--DemoVersion/issues) &nbsp;·&nbsp; [**Request a Feature**](https://github.com/SenithuThisas/Vaultly---Finance-Tracker--DemoVersion/issues)

</div>

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🛠️ Tech Stack](#️-tech-stack)
- [🚀 Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Setup](#environment-setup)
  - [Supabase Database Setup](#supabase-database-setup)
- [🗂️ Project Structure](#️-project-structure)
- [⌨️ Keyboard Shortcuts](#️-keyboard-shortcuts)
- [📊 Data Models](#-data-models)
- [🔒 Security](#-security)
- [🚢 Deployment](#-deployment)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## ✨ Features

### 💳 Fund Source Management
- Add and manage multiple accounts — Bank, Cash, E-Wallet, Credit Card, Investment
- Real-time balance tracking with sparkline charts
- Net worth calculation across all accounts
- Soft-delete (archive) with full transaction history preservation

### 💸 Transactions
- Credit (CR) & Debit (DR) entries with 18+ categories
- Full-text search, type/category/month filters
- Paginated table view (50 per page) with sort
- Edit, duplicate, and delete with confirmation
- Recurring transaction support (weekly / monthly / yearly)
- Reference number and notes support

### 🔄 Transfers
- Move funds between accounts with optional fee tracking
- Auto-updates both source and destination balances
- Full edit/delete history

### 📈 Analytics
- Monthly cashflow bar chart (income vs expenses)
- Category spending donut chart
- 6-month trend lines
- Top spending categories breakdown

### 🎯 Goals & Budgets
- Set savings goals with target amounts and dates
- Category-based budgets (weekly/monthly)
- Progress bars with real-time spend tracking
- Visual alerts when approaching or exceeding limits

### 📲 Telegram Bot Integration
- Submit pending expense entries via Telegram
- Approve or reject from the in-app **Pending Entries** inbox
- Auto-maps your Telegram account to your Vaultly profile

### 🔐 Security & Privacy
- Full Supabase Auth (email + password, email confirmation)
- Row-Level Security (RLS) — every user sees only their own data
- Idle session lock with password re-authentication
- Privacy mode — blur all sensitive values with one click
- Per-card reveal toggle for individual accounts
- Auth attempt rate limiting & lockout (5 attempts → 15 min)
- Periodic session validity checks

### 🌐 General
- Fully responsive — desktop, tablet, mobile
- Offline-aware with local pending queue
- Keyboard shortcut navigation
- Global search (Ctrl+K)
- CSV & JSON data export
- Dark mode only (premium fintech aesthetic)

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES Modules) |
| **Build Tool** | [Vite 5](https://vitejs.dev/) |
| **Backend / DB** | [Supabase](https://supabase.com/) (PostgreSQL + Auth + RLS) |
| **Hosting** | [Netlify](https://www.netlify.com/) |
| **Bot** | Telegram Bot API (via Netlify Serverless Functions) |
| **Fonts** | DM Sans, JetBrains Mono (Google Fonts) |

> **No frameworks. No heavy dependencies.** Just well-structured vanilla JS with a clean service/view architecture.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [npm](https://www.npmjs.com/) v9 or higher
- A [Supabase](https://supabase.com/) account (free tier works)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/SenithuThisas/Vaultly---Finance-Tracker--DemoVersion.git
cd Vaultly---Finance-Tracker--DemoVersion/finance-tracker

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Environment Setup

Create a `.env` file in the `finance-tracker/` directory by copying the example:

```bash
cp .env.example .env   # or create it manually
```

Add your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> ⚠️ **Never commit your `.env` file.** It is already in `.gitignore`.

### Supabase Database Setup

Run the SQL migration files in the Supabase **SQL Editor** in this order:

| # | File | Purpose |
|---|------|---------|
| 1 | `supabase_migration.sql` | Initial RLS policies |
| 2 | `supabase_pending_migration.sql` | Pending transactions & Telegram tables |
| 3 | `fix_rls_isolation.sql` | Per-user RLS isolation |
| 4 | `fix_core_issues.sql` | Balance triggers, cascade deletes, indexes |
| 5 | `setup_goals.sql` | Savings goals table |
| 6 | `fix_missing_columns.sql` | Missing columns patch |

> Run each file separately: **Supabase Dashboard → SQL Editor → New Query → Paste → Run**

---

## 🗂️ Project Structure

```
finance-tracker/
├── index.html                       # Main HTML shell (single-page app)
├── .env                             # Environment variables (gitignored)
├── vite.config.js                   # Vite build config
├── netlify.toml                     # Netlify deploy config
│
├── assets/
│   ├── css/
│   │   ├── main.css                 # Design tokens, reset, base styles
│   │   ├── layout.css               # Sidebar, main area, responsive grid
│   │   ├── components.css           # Cards, buttons, forms, modals, toasts
│   │   └── charts.css               # SVG/canvas chart styles
│   │
│   └── js/
│       ├── app.js                   # App entry point, auth & routing bootstrap
│       ├── state.js                 # Centralized state + dispatch pattern
│       ├── storage.js               # Supabase read/write abstraction
│       │
│       ├── adapters/
│       │   └── supabase.adapter.js  # All Supabase REST calls + normalization
│       │
│       ├── config/
│       │   └── supabase.js          # Supabase client + health check
│       │
│       ├── data/
│       │   └── seed.js              # Categories, currencies, fund source types
│       │
│       ├── security/
│       │   ├── index.js             # Validators, sanitizers, error handlers, rate limiting
│       │   ├── session.js           # Auth lifecycle, idle lock, session checks
│       │   ├── guards.js            # Route guards (requireAuth / requireGuest)
│       │   └── privacy.js           # Privacy mode, blur, per-card reveal
│       │
│       ├── services/
│       │   ├── transaction.service.js
│       │   ├── fundSource.service.js
│       │   ├── transfer.service.js
│       │   ├── budget.service.js
│       │   ├── goal.service.js
│       │   ├── analytics.service.js
│       │   └── recurring.service.js
│       │
│       ├── views/
│       │   ├── dashboard.view.js
│       │   ├── banks.view.js
│       │   ├── transactions.view.js
│       │   ├── transfers.view.js
│       │   ├── budgets.view.js
│       │   ├── analytics.view.js
│       │   ├── pendingEntries.view.js
│       │   └── telegramSettings.view.js
│       │
│       ├── components/
│       │   ├── modal.js
│       │   ├── drawer.js
│       │   ├── toast.js
│       │   ├── charts.js
│       │   ├── nav.js
│       │   └── auth-bg.js
│       │
│       └── utils/
│           └── formatters.js        # Currency, date formatters
│
└── netlify/
    └── functions/                   # Serverless functions (Telegram webhook)
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `1` | Go to Dashboard |
| `2` | Go to Bank Accounts |
| `3` | Go to Transactions |
| `4` | Go to Pending Entries |
| `5` | Go to Transfers |
| `6` | Go to Goals & Budgets |
| `7` | Go to Analytics |
| `N` | New Transaction (quick add) |
| `Ctrl` + `K` | Open Global Search |
| `Esc` | Close modal / drawer / search |

---

## 📊 Data Models

<details>
<summary><strong>FundSource</strong></summary>

```javascript
{
  id: string,           // UUID
  name: string,         // e.g. "BOC Savings"
  type: 'bank' | 'cash' | 'ewallet' | 'credit_card' | 'investment',
  bankName: string | null,
  accountNumber: string | null,
  currency: string,     // e.g. "LKR"
  balance: number,      // Current computed balance
  initialBalance: number,
  color: string,        // Hex color for card
  icon: string,
  notes: string,
  isActive: boolean,
  createdAt: string
}
```
</details>

<details>
<summary><strong>Transaction</strong></summary>

```javascript
{
  id: string,
  title: string,
  amount: number,
  type: 'CR' | 'DR',
  category: string,     // e.g. "food", "salary"
  fundSourceId: string,
  date: string,         // ISO date "YYYY-MM-DD"
  reference: string,
  note: string,
  tags: string[],
  isRecurring: boolean,
  recurringPeriod: 'weekly' | 'monthly' | 'yearly' | null,
  createdAt: string
}
```
</details>

<details>
<summary><strong>Transfer</strong></summary>

```javascript
{
  id: string,
  fromFundSourceId: string,
  toFundSourceId: string,
  amount: number,
  fee: number,
  date: string,
  note: string,
  createdAt: string
}
```
</details>

<details>
<summary><strong>Budget</strong></summary>

```javascript
{
  id: string,
  category: string,
  limit: number,
  period: 'weekly' | 'monthly',
  fundSourceId: string | null,
  color: string,
  createdAt: string
}
```
</details>

<details>
<summary><strong>Goal</strong></summary>

```javascript
{
  id: string,
  name: string,
  targetAmount: number,
  savedAmount: number,
  targetDate: string | null,
  color: string,
  icon: string,
  createdAt: string
}
```
</details>

---

## 🔒 Security

Vaultly is built with security as a first-class concern:

- **Authentication** — Supabase Auth with email confirmation required
- **Row-Level Security** — PostgreSQL RLS enforces that users can only access their own rows, even if the anon key is exposed
- **Session Management** — Automatic idle lock after inactivity, with full session expiry detection
- **Rate Limiting** — Auth attempts are limited client-side (5 attempts → 15-minute lockout)
- **Input Sanitization** — All form inputs are sanitized and validated before dispatch
- **Privacy Mode** — All monetary values can be blurred globally or per-card
- **Secure Headers** — HTTPS-only via Netlify with cache control headers

---

## 🚢 Deployment

The app is deployed automatically via **Netlify** on every push to `main`.

**Manual build:**

```bash
cd finance-tracker
npm run build
# Output is in the ./dist directory
```

**Environment variables** must be configured in the Netlify dashboard under **Site Settings → Environment Variables**:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/your-feature-name`
3. **Commit** your changes: `git commit -m 'feat: add some feature'`
4. **Push** to the branch: `git push origin feature/your-feature-name`
5. **Open** a Pull Request

Please follow the existing code style (vanilla JS, ES modules, service/view separation).

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">

Built with ❤️ by [Senithu Thisas](https://github.com/SenithuThisas)

⭐ **Star this repo if you find it useful!** ⭐

</div>
