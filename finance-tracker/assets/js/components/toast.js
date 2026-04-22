/**
 * @fileoverview Toast notification component
 */

/**
 * Show a toast notification
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} [type='info']
 * @param {number} [duration=3000]
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || ''}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Auto remove after duration
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}