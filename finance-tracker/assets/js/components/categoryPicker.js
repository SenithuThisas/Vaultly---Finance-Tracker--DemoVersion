/**
 * @fileoverview Shared "Add Category" modal.
 *
 * Call `openAddCategoryModal(type, onCreated)` from any view that has a
 * category <select>. The user fills in a name, optional emoji + colour, and
 * picks CR or DR.  On success, `onCreated(category)` is called so the caller
 * can refresh its own dropdown.
 */

import { CategoryService } from '../services/category.service.js';
import { showToast } from './toast.js';

/**
 * Show the "Add new category" modal.
 *
 * @param {'CR'|'DR'} defaultType - Pre-select the type radio.
 * @param {(category: object) => void} onCreated - Callback with the new category.
 */
export function openAddCategoryModal(defaultType = 'DR', onCreated = () => {}) {
  // Remove any pre-existing modal
  const existing = document.getElementById('add-cat-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'add-cat-modal-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;padding:16px;
  `;

  overlay.innerHTML = `
    <div id="add-cat-modal" style="
      background:var(--bg-card,#1a1a2e);
      border:1px solid var(--border,rgba(255,255,255,0.1));
      border-radius:16px;width:100%;max-width:420px;
      padding:28px;box-shadow:0 24px 64px rgba(0,0,0,0.5);
      animation:slideUp .25s ease;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;font-size:18px;font-weight:700;">✨ New Category</h3>
        <button id="add-cat-close" style="background:none;border:none;cursor:pointer;color:var(--text-muted,#888);font-size:22px;line-height:1;padding:0 4px;">&times;</button>
      </div>

      <div class="form-group" style="margin-bottom:16px;">
        <label class="form-label" style="margin-bottom:6px;display:block;">Type *</label>
        <div style="display:flex;gap:12px;">
          <label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 14px;
            background:var(--bg-hover,rgba(255,255,255,0.05));border-radius:8px;
            border:2px solid ${defaultType === 'DR' ? 'var(--accent-blue,#60A5FA)' : 'var(--border,rgba(255,255,255,0.1))'};
            cursor:pointer;" id="lbl-dr">
            <input type="radio" name="cat-type" value="DR" ${defaultType !== 'CR' ? 'checked' : ''}
              style="accent-color:var(--accent-blue,#60A5FA);">
            <span>💸 Expense</span>
          </label>
          <label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 14px;
            background:var(--bg-hover,rgba(255,255,255,0.05));border-radius:8px;
            border:2px solid ${defaultType === 'CR' ? 'var(--accent-green,#10B981)' : 'var(--border,rgba(255,255,255,0.1))'};
            cursor:pointer;" id="lbl-cr">
            <input type="radio" name="cat-type" value="CR" ${defaultType === 'CR' ? 'checked' : ''}
              style="accent-color:var(--accent-green,#10B981);">
            <span>💰 Income</span>
          </label>
        </div>
      </div>

      <div class="form-group" style="margin-bottom:16px;">
        <label class="form-label" style="margin-bottom:6px;display:block;">Name *</label>
        <input type="text" id="cat-name" class="form-input"
          placeholder="e.g. Gym, Pet Care, Side Hustle…"
          maxlength="32" autocomplete="off"
          style="width:100%;box-sizing:border-box;">
      </div>

      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div class="form-group" style="flex:1;">
          <label class="form-label" style="margin-bottom:6px;display:block;">Emoji</label>
          <input type="text" id="cat-emoji" class="form-input"
            placeholder="📦" maxlength="4" value="📦"
            style="font-size:20px;text-align:center;">
        </div>
        <div class="form-group" style="flex:1;">
          <label class="form-label" style="margin-bottom:6px;display:block;">Colour</label>
          <input type="color" id="cat-color" value="#60A5FA"
            style="width:100%;height:42px;border-radius:8px;
            border:1px solid var(--border,rgba(255,255,255,0.1));
            cursor:pointer;background:none;padding:2px 4px;">
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-top:24px;">
        <button id="add-cat-cancel" class="btn btn-secondary" style="flex:1;">Cancel</button>
        <button id="add-cat-save" class="btn btn-primary" style="flex:1;">Add Category</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const nameEl  = overlay.querySelector('#cat-name');
  const saveBtn = overlay.querySelector('#add-cat-save');
  const lblDr   = overlay.querySelector('#lbl-dr');
  const lblCr   = overlay.querySelector('#lbl-cr');

  // Highlight the active radio label border
  overlay.querySelectorAll('input[name="cat-type"]').forEach(r => {
    r.addEventListener('change', () => {
      lblDr.style.borderColor = r.value === 'DR'
        ? 'var(--accent-blue,#60A5FA)'
        : 'var(--border,rgba(255,255,255,0.1))';
      lblCr.style.borderColor = r.value === 'CR'
        ? 'var(--accent-green,#10B981)'
        : 'var(--border,rgba(255,255,255,0.1))';
    });
  });

  function close() { overlay.remove(); }

  overlay.querySelector('#add-cat-close').addEventListener('click', close);
  overlay.querySelector('#add-cat-cancel').addEventListener('click', close);
  // Click-outside-to-close
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  nameEl.focus();

  saveBtn.addEventListener('click', () => {
    const label = nameEl.value.trim();
    const emoji = overlay.querySelector('#cat-emoji').value.trim() || '📦';
    const color = overlay.querySelector('#cat-color').value;
    const type  = overlay.querySelector('input[name="cat-type"]:checked')?.value || 'DR';

    try {
      const cat = CategoryService.add({ label, emoji, color, type });
      showToast(`Category "${cat.label}" created ✅`, 'success');
      close();
      onCreated(cat);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Allow Enter to submit from the name field
  nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
}
