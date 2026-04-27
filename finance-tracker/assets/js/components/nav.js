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
  const mobileOverlay = document.getElementById('mobile-overlay');
  const bottomTabBar = document.getElementById('bottom-tab-bar');
  const mobileSearchBtn = document.getElementById('mobile-search-btn');
  const moreDrawer = document.getElementById('mobile-more-drawer');
  const moreOverlay = document.getElementById('mobile-more-overlay');
  const moreClose = document.getElementById('mobile-more-close');
  const sidebar = document.getElementById('sidebar');

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
        const action = tab.dataset.action;
        if (view) {
          navigateTo(view);
          updateBottomTabBar(view);
          return;
        }
        if (action === 'more') {
          openMoreDrawer();
        }
      });
    });
  }

  // Mobile overlay (close sidebar)
  if (mobileOverlay) {
    mobileOverlay.addEventListener('click', closeMobileNav);
  }

  if (moreOverlay) {
    moreOverlay.addEventListener('click', closeMoreDrawer);
  }

  moreClose?.addEventListener('click', closeMoreDrawer);

  if (moreDrawer) {
    moreDrawer.addEventListener('click', event => {
      const action = event.target.closest('[data-more-action]')?.dataset.moreAction;
      if (!action) return;

      if (action === 'settings') {
        document.getElementById('settings-btn')?.click();
      } else if (action === 'transfers') {
        navigateTo('transfers');
      } else if (action === 'analytics') {
        navigateTo('analytics');
      } else if (action === 'signout') {
        document.getElementById('sidebar-signout-btn')?.click();
      }
      closeMoreDrawer();
    });
  }

  // Sidebar expand on tap (tablet)
  sidebar?.addEventListener('click', event => {
    const isToggleArea = event.target.closest('.logo');
    if (!isToggleArea) return;
    sidebar.classList.toggle('expanded');
  });

  registerSidebarSwipe(sidebar);

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

function openMoreDrawer() {
  document.getElementById('mobile-more-drawer')?.classList.add('open');
  document.getElementById('mobile-more-overlay')?.classList.add('open');
}

function closeMoreDrawer() {
  document.getElementById('mobile-more-drawer')?.classList.remove('open');
  document.getElementById('mobile-more-overlay')?.classList.remove('open');
}

function registerSidebarSwipe(sidebar) {
  if (!sidebar) return;
  let startX = 0;
  let startY = 0;
  let isTracking = false;

  document.addEventListener('touchstart', event => {
    const touch = event.touches[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
    isTracking = startX < 24;
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!isTracking) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = Math.abs(touch.clientY - startY);
    if (deltaX > 60 && deltaY < 40 && window.innerWidth >= 768) {
      sidebar.classList.add('expanded');
      isTracking = false;
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    isTracking = false;
  });
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