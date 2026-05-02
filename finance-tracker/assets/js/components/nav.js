/**
 * @fileoverview Navigation component — handles sidebar, bottom tab bar, mobile nav
 */

import { navigateTo } from '../state.js';
import { RecurringService } from '../services/recurring.service.js';
import { BudgetService } from '../services/budget.service.js';
import { db, isConfigured } from '../config/supabase.js';

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
 * Update notification badges on nav items (synchronous — recurring & budgets)
 */
export function updateBadges() {
  // Check recurring due — only show if user hasn't visited Transactions this session
  const txLastVisited = Number(localStorage.getItem('nav_visited_transactions') || 0);
  const sessionStart = Number(sessionStorage.getItem('vaultly.session_start') || 0);
  const txBadgeActive = txLastVisited < sessionStart;

  const dueCount = RecurringService.checkDue();

  // Check over-budget count
  const budgetStatuses = BudgetService.getStatus();
  const budgetLastVisited = Number(localStorage.getItem('nav_visited_budgets') || 0);
  const budgetBadgeActive = budgetLastVisited < sessionStart;
  const overBudgetCount = budgetBadgeActive
    ? budgetStatuses.filter(b => b.utilization > 90).length
    : 0;

  // Remove all existing static badges (pending badge managed separately)
  document.querySelectorAll('.nav-badge:not(.nav-badge-pending)').forEach(badge => badge.remove());

  if (dueCount > 0 && txBadgeActive) {
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

  // Kick off async pending badge update without blocking
  updatePendingBadge();
}

/**
 * Async — queries Supabase for the live pending entry count and renders
 * a single badge on the Pending Entries nav link and mobile tab bar item.
 * Idempotent: safe to call multiple times; always removes stale badges first.
 */
export async function updatePendingBadge() {
  // Always clear all existing pending badges first (sidebar + tab bar)
  document.querySelectorAll('.nav-badge-pending').forEach(b => b.remove());

  if (!isConfigured() || !db) return;

  try {
    const { data: sessionData } = await db.auth.getSession();
    const userId = sessionData?.session?.user?.id || null;
    if (!userId) return;

    // Check "last visited" timestamp — only show badge for entries NEWER than last visit
    const lastVisited = Number(localStorage.getItem('nav_visited_pending') || 0);

    const { count, error } = await db
      .from('pending_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('user_id', userId)
      .gt('created_at', new Date(lastVisited).toISOString());

    if (error || !count) return;

    const label = count > 99 ? '99+' : String(count);

    // Sidebar nav link — one badge only
    const pendingNavLink = document.querySelector('.nav-link[data-view="pending"]');
    if (pendingNavLink) {
      // Guard: remove any stale badge that snuck in (race condition safety)
      pendingNavLink.querySelectorAll('.nav-badge-pending').forEach(b => b.remove());
      const badge = document.createElement('span');
      badge.className = 'nav-badge nav-badge-pending';
      badge.textContent = label;
      pendingNavLink.appendChild(badge);
    }

    // Bottom tab bar — one badge only
    const pendingTab = document.querySelector('.tab-item[data-view="pending"]');
    if (pendingTab) {
      pendingTab.querySelectorAll('.nav-badge-pending').forEach(b => b.remove());
      const tabBadge = document.createElement('span');
      tabBadge.className = 'nav-badge nav-badge-pending';
      tabBadge.textContent = label;
      pendingTab.appendChild(tabBadge);
    }
  } catch {
    // Non-critical — silently ignore badge update failures
  }
}

/**
 * Mark a section as visited. Call this when a view is entered.
 * @param {'pending'|'transactions'|'budgets'} section
 */
export function markNavVisited(section) {
  localStorage.setItem(`nav_visited_${section}`, String(Date.now()));
  // Immediately re-evaluate badges to clear the count
  if (section === 'pending') {
    updatePendingBadge();
  } else {
    updateBadges();
  }
}