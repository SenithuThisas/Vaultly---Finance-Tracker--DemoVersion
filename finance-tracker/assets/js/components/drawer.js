/**
 * @fileoverview Drawer slide-in panel component
 */

/**
 * Open a drawer with custom content
 * @param {string} title
 * @param {string} bodyHTML
 * @param {string} [footerHTML='<button class="btn btn-secondary" id="drawer-cancel">Cancel</button><button class="btn btn-primary" id="drawer-save">Save</button>']
 * @returns {{onSave: Function|null, onCancel: Function|null}}
 */
export function openDrawer(title, bodyHTML, footerHTML) {
  const overlay = document.getElementById('drawer-overlay');
  const drawer = document.getElementById('tx-drawer');
  const titleEl = document.getElementById('drawer-title');
  const bodyEl = document.getElementById('drawer-body');
  const footerEl = document.getElementById('drawer-footer');

  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHTML;

  const defaultFooter = `
    <button class="btn btn-secondary" id="drawer-cancel">Cancel</button>
    <button class="btn btn-primary" id="drawer-save">Save</button>
  `;
  footerEl.innerHTML = footerHTML || defaultFooter;

  overlay.classList.add('open');
  drawer.classList.add('open');

  // Setup button handlers
  const cancelBtn = document.getElementById('drawer-cancel');
  const saveBtn = document.getElementById('drawer-save');

  return { cancelBtn, saveBtn };
}

/**
 * Close the drawer
 */
export function closeDrawer() {
  const overlay = document.getElementById('drawer-overlay');
  const drawer = document.getElementById('tx-drawer');

  overlay.classList.remove('open');
  drawer.classList.remove('open');
}

/**
 * Initialize drawer event listeners
 */
export function initDrawer() {
  const overlay = document.getElementById('drawer-overlay');
  const closeBtn = document.getElementById('drawer-close');

  overlay.addEventListener('click', closeDrawer);
  closeBtn.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const drawer = document.getElementById('tx-drawer');
      if (drawer.classList.contains('open')) {
        closeDrawer();
      }
    }
  });
}