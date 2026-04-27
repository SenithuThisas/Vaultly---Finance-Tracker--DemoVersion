/**
 * @fileoverview Memoized formatting utilities
 */

const currencyFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const compactFormatter = new Intl.NumberFormat('en-LK', {
  maximumFractionDigits: 1
});

/**
 * Format currency values in a consistent LKR 0.00 style
 * @param {number} value
 * @returns {string}
 */
export function formatCurrency(value) {
  const safe = Number.isFinite(value) ? value : 0;
  return currencyFormatter.format(safe);
}

/**
 * Format percentages with a stable zero output
 * @param {number} value
 * @returns {string}
 */
export function formatPct(value) {
  if (!Number.isFinite(value) || value === 0) {
    return '0%';
  }
  return `${value.toFixed(2)}%`;
}

/**
 * Format compact values for chart axes
 * @param {number} value
 * @returns {string}
 */
export function formatCompact(value) {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) >= 1000000) {
    return `${(safe / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(safe) >= 1000) {
    return `${(safe / 1000).toFixed(1)}K`;
  }
  return compactFormatter.format(safe);
}
