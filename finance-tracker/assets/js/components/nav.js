/**
 * @fileoverview Navigation component — handles sidebar, bottom tab bar, mobile nav
 */

import { navigateTo } from '../state.js';
import { RecurringService } from '../services/recurring.service.js';
import { BudgetService } from '../services/budget.service.js';

/**
 * Initialize navigation event listeners
 */
export function initNav() {
  const navLinks = document.querySelectorAll('.nav-link[data-view]');
  const hamburger = document.getElementById('hamburger');
  const mobileOverlay = document.getElementById('mobile-overlay');
  const bottomTabBar = document.getElementById('bottom-tab-bar');
  const mobileSearchBtn = document.getElementById('mobile-search-btn');

  // Sidebar nav click handlers
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const view = link.dataset.view;
      if (view) {
        navigateTo(view);
        closeMobileNav();
        updateBottomTabBar(view);
      }
    });
  });

  // Bottom tab bar click handlers
  if (bottomTabBar) {
    bottomTabBar.querySelectorAll('.tab-item').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        if (view) {
          navigateTo(view);
          updateBottomTabBar(view);
        }
      });
    });
  }

  // Mobile hamburger
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('open');
      mobileOverlay?.classList.toggle('open');
    });
  }

  // Mobile overlay (close sidebar)
  if (mobileOverlay) {
    mobileOverlay.addEventListener('click', closeMobileNav);
  }

  // Mobile search button — triggers same search as desktop
  if (mobileSearchBtn) {
    mobileSearchBtn.addEventListener('click', () => {
      const searchOverlay = document.getElementById('search-overlay');
      if (searchOverlay) {
        searchOverlay.classList.add('open');
        document.getElementById('search-input')?.focus();
      }
    });
  }

  // Update notification badges
  updateBadges();
}

/**
 * Close mobile navigation
 */
function closeMobileNav() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('mobile-overlay')?.classList.remove('open');
}

/**
 * Update bottom tab bar active state
 * @param {string} viewName
 */
function updateBottomTabBar(viewName) {
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });
}

/**
 * Set active view in navigation (sidebar + bottom tabs)
 * @param {string} viewName
 */
export function setActiveView(viewName) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });
  updateBottomTabBar(viewName);
}

/**
 * Update notification badges on nav items
 */
export function updateBadges() {
  // Check recurring due
  const dueCount = RecurringService.checkDue();

  // Check over-budget count
  const budgetStatuses = BudgetService.getStatus();
  const overBudgetCount = budgetStatuses.filter(b => b.utilization > 90).length;

  // Update badges in nav
  document.querySelectorAll('.nav-badge').forEach(badge => badge.remove());

  if (dueCount > 0) {
    const txNavLink = document.querySelector('.nav-link[data-view="transactions"]');
    if (txNavLink) {
      const badge = document.createElement('span');
      badge.className = 'nav-badge';
      badge.textContent = dueCount;
      txNavLink.appendChild(badge);
    }
  }

  if (overBudgetCount > 0) {
    const budgetNavLink = document.querySelector('.nav-link[data-view="budgets"]');
    if (budgetNavLink) {
      const badge = document.createElement('span');
      badge.className = 'nav-badge';
      badge.textContent = overBudgetCount;
      budgetNavLink.appendChild(badge);
    }
  }
}