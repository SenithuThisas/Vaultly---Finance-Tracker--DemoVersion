/**
 * @fileoverview Reusable copy button renderer
 */

/**
 * Render a copy button element
 * @param {{value: string, label: string, disabled?: boolean}} options
 * @returns {string}
 */
export function renderCopyButton(options) {
  const value = options?.value || '';
  const label = options?.label || 'Value';
  const disabled = Boolean(options?.disabled);
  const disabledAttr = disabled ? 'disabled' : '';
  const disabledClass = disabled ? 'disabled' : '';
  const disabledData = disabled ? 'true' : 'false';

  return `
    <button class="copy-btn ${disabledClass}" type="button" data-copy-sensitive="true" data-copy-label="${label}" data-copy-value="${value}" data-copy-disabled="${disabledData}" ${disabledAttr} aria-label="Copy ${label}" title="Copy ${label}">
      <span class="copy-icon">⧉</span>
      <span class="copy-tooltip" role="status" aria-live="polite"></span>
    </button>
  `;
}
