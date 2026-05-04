/**
 * @fileoverview Modal dialog component
 */

/** @type {Function|null} */
let currentConfirmCallback = null;

/**
 * Open a modal with custom content
 * @param {string} title
 * @param {string} bodyHTML
 * @param {Function} onConfirm
 * @param {string} [confirmLabel='Confirm']
 */
export function openModal(title, bodyHTML, onConfirm, confirmLabel = 'Confirm') {
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const confirmBtn = document.getElementById('modal-confirm');

  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHTML;
  confirmBtn.textContent = confirmLabel;
  confirmBtn.disabled = false;

  // Style confirm button based on action type
  const isDanger = ['Delete', 'Archive', 'Delete All', 'Clear All'].includes(confirmLabel);
  confirmBtn.style.background = isDanger ? '#F85149' : '';

  currentConfirmCallback = async () => {
    const originalLabel = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Working…';

    try {
      const result = await Promise.resolve(onConfirm());
      if (result !== false) {
        closeModal();
      }
      return result;
    } finally {
      // Re-enable in case modal wasn't closed (e.g. validation error returned false)
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalLabel;
    }
  };

  overlay.classList.add('open');
}

/**
 * Close the modal
 */
export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('open');
  currentConfirmCallback = null;
}

/**
 * Initialize modal event listeners
 */
export function initModal() {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.querySelector('.modal');
  const closeBtn = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('modal-cancel');
  const confirmBtn = document.getElementById('modal-confirm');

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  confirmBtn.addEventListener('click', () => {
    if (currentConfirmCallback) {
      currentConfirmCallback();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeModal();
    }
  });

  if (modal) {
    let startY = 0;
    let tracking = false;

    modal.addEventListener('touchstart', event => {
      const touch = event.touches[0];
      if (!touch) return;
      startY = touch.clientY;
      tracking = true;
    }, { passive: true });

    modal.addEventListener('touchmove', event => {
      if (!tracking) return;
      const touch = event.touches[0];
      if (!touch) return;
      const deltaY = touch.clientY - startY;
      if (deltaY > 90) {
        closeModal();
        tracking = false;
      }
    }, { passive: true });

    modal.addEventListener('touchend', () => {
      tracking = false;
    });
  }
}