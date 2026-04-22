/**
 * @fileoverview Navigation component
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

  // Nav click handlers
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const view = link.dataset.view;
      if (view) {
        navigateTo(view);
        closeMobileNav();
      }
    });
  });

  // Mobile nav
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('open');
      mobileOverlay?.classList.toggle('open');
    });
  }

  if (mobileOverlay) {
    mobileOverlay.addEventListener('click', closeMobileNav);
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
 * Set active view in navigation
 * @param {string} viewName
 */
export function setActiveView(viewName) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });
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