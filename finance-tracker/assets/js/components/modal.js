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

  // Style based on button type
  if (confirmLabel === 'Delete' || confirmLabel === 'Archive') {
    confirmBtn.style.background = '#F85149';
  } else {
    confirmBtn.style.background = '';
  }

  currentConfirmCallback = () => {
    const result = onConfirm();
    if (result !== false) {
      closeModal();
    }
    return result;
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
}