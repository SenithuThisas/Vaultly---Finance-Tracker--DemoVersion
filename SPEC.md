# Personal Finance Tracker - Specification

## Project Overview
- Single self-contained HTML file
- Vanilla HTML, CSS, JavaScript - zero frameworks/dependencies
- Dark Financial Terminal meets Editorial Luxury aesthetic

## Data Schemas
- Transaction: { id, title, amount, category, type: "income"|"expense", date, note, accountId }
- Budget: { id, category, limit, period: "monthly"|"weekly" }
- Account: { id, name, balance, currency, type: "checking"|"savings"|"credit" }
- AppState: { transactions[], budgets[], accounts[], currentView, filters, settings }

## Visual Design
### Colors
- --bg-base: #0F0F0F
- --bg-card: #1A1A1A
- --bg-hover: #242424
- --accent-gold: #F4B942
- --accent-green: #10B981
- --accent-red: #FF6B6B
- --accent-blue: #60A5FA
- --text-primary: #F0F0F0
- --text-muted: #888888
- --border: #2A2A2A

### Typography
- DM Serif Display: headings, big numbers
- JetBrains Mono: numeric values
- DM Sans: body, labels, nav, buttons

### Effects
- Glassmorphism cards: bg rgba(255,255,255,0.03), border 1px solid rgba(255,255,255,0.08)
- Custom scrollbar: dark with gold thumb
- Grain texture via SVG data-URI
- Box shadows: 0 4px 24px rgba(0,0,0,0.4)
- 0.2s ease transitions

## Layout
- Fixed left sidebar: 240px
- Main content: scrollable, max-width 1200px centered
- Mobile ≤768px: collapsible sidebar with hamburger

## Views
1. Dashboard - stats, charts, recent transactions, budget health
2. Transactions - filterable table with add/delete
3. Budgets - category progress cards
4. Analytics - trends and comparisons
5. Accounts - account cards with net worth

## Services
- TransactionService: add, delete, getByMonth, getCategoryTotals, getMonthlyTotals, getRunningBalance
- BudgetService: getStatus, isOverBudget
- AnalyticsService: getSavingsRate, getNetWorth, getTopCategories, getMoMChange
- StorageService: save, load, clear

## Features
- localStorage persistence
- Form validation
- Toast notifications
- Modal/drawer system
- Keyboard shortcuts (D,T,B,A,C,N,Escape)
- CSV export
- Responsive design
- Animated charts and countups
- Budget over-limit pulsing animation