/**
 * @fileoverview Global privacy UI controls and sensitive clipboard handling
 */

import { dispatch, getState, subscribeUiState } from '../state.js';
import { showToast } from '../components/toast.js';

const CLIPBOARD_CLEAR_MS = 30000;
let clipboardClearTimer = null;

function getPrivacyState() {
  const state = getState();
  const ui = state.ui || {};
  const privacyModeEnabled = Boolean(ui.privacyModeEnabled);
  const forcedPrivacyBlur = Boolean(ui.forcedPrivacyBlur);
  return {
    privacyModeEnabled,
    forcedPrivacyBlur,
    isPrivacyBlurActive: privacyModeEnabled || forcedPrivacyBlur
  };
}

function updatePrivacyTogglesUI(isPrivacyEnabled) {
  const toggleButtons = document.querySelectorAll('[data-privacy-toggle-btn]');
  toggleButtons.forEach(button => {
    button.classList.toggle('active', isPrivacyEnabled);
    button.setAttribute('aria-pressed', String(isPrivacyEnabled));
    button.setAttribute('title', isPrivacyEnabled ? 'Show sensitive values' : 'Hide sensitive values');

    const openIcon = button.querySelector('.privacy-eye-open');
    const closedIcon = button.querySelector('.privacy-eye-closed');
    if (openIcon && closedIcon) {
      openIcon.classList.toggle('visible', !isPrivacyEnabled);
      closedIcon.classList.toggle('visible', isPrivacyEnabled);
    }
  });
}

function applyPrivacyStateToDom(uiState) {
  document.body.classList.toggle('privacy-blur', uiState.isPrivacyBlurActive);
  updatePrivacyTogglesUI(uiState.privacyModeEnabled);
  updateCopyButtons(uiState.isPrivacyBlurActive);
}

function updateCopyButtons(isBlurActive) {
  const buttons = document.querySelectorAll('[data-copy-sensitive]');
  buttons.forEach(button => {
    const nextDisabled = Boolean(isBlurActive);
    button.disabled = nextDisabled;
    button.classList.toggle('disabled', nextDisabled);
    if (nextDisabled) {
      button.dataset.copyDisabled = 'true';
    } else {
      button.dataset.copyDisabled = 'false';
    }
  });
}

function showCopyTooltip(button, text) {
  if (!button) return;
  const icon = button.querySelector('.copy-icon');
  if (icon && !icon.dataset.originalIcon) {
    icon.dataset.originalIcon = icon.textContent || '';
  }
  const tooltip = button.querySelector('.copy-tooltip');
  if (!tooltip) return;
  tooltip.textContent = text;
  if (icon && text === 'Copied!') {
    icon.textContent = '✓';
  }
  button.classList.add('show-tooltip');
  setTimeout(() => {
    button.classList.remove('show-tooltip');
    if (icon && icon.dataset.originalIcon) {
      icon.textContent = icon.dataset.originalIcon;
    }
  }, 2000);
}

export function initPrivacyControls() {
  document.addEventListener('click', event => {
    const toggleBtn = event.target.closest('[data-privacy-toggle-btn]');
    if (toggleBtn) {
      const state = getPrivacyState();
      dispatch('SET_PRIVACY_MODE', !state.privacyModeEnabled);
      const nextEnabled = !state.privacyModeEnabled;
      showToast(nextEnabled ? 'Privacy mode enabled' : 'Privacy mode disabled', 'info', 1800);
      return;
    }

    const copyBtn = event.target.closest('[data-copy-sensitive]');
    if (copyBtn) {
      event.preventDefault();
      event.stopPropagation();

      const isDisabled = copyBtn.dataset.copyDisabled === 'true' || copyBtn.disabled;
      if (isDisabled) {
        showCopyTooltip(copyBtn, 'Reveal values to copy');
        return;
      }

      const value = copyBtn.getAttribute('data-copy-value') || '';
      const label = copyBtn.getAttribute('data-copy-label') || 'Value';
      copySensitiveValue(value, label, copyBtn);
    }
  });

  subscribeUiState(uiState => {
    applyPrivacyStateToDom(uiState);
  });

  applyPrivacyStateToDom(getPrivacyState());
  enableMobileScreenshotPrevention();
}

export function setForcedPrivacyBlur(value) {
  dispatch('SET_FORCED_PRIVACY_BLUR', Boolean(value));
}

export function isPrivacyModeEnabled() {
  return getPrivacyState().privacyModeEnabled;
}

export function getPrivacyLabel(accountNumber, revealFull = false) {
  const digits = String(accountNumber || '').replace(/\D/g, '');
  if (!digits) return '-';
  if (revealFull || digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}

export function sensitiveValueHtml(text, options = {}) {
  const {
    width = '10ch',
    extraClass = '',
    copyValue = '',
    copyLabel = 'Value'
  } = options;

  const isBlurActive = getPrivacyState().isPrivacyBlurActive;

  if (copyValue) {
    const disabledAttr = isBlurActive ? 'data-copy-disabled="true"' : 'data-copy-disabled="false"';
    return `
      <span class="sensitive-wrap ${extraClass}" data-copy-sensitive="true" data-copy-value="${copyValue}" data-copy-label="${copyLabel}" ${disabledAttr} style="cursor: pointer; position: relative;" title="Click to copy">
        <span class="sensitive-value" style="--sensitive-min-width:${width};">${text}</span>
        <span class="copy-tooltip"></span>
      </span>
    `.trim();
  }

  return `<span class="sensitive-wrap ${extraClass}"><span class="sensitive-value" style="--sensitive-min-width:${width};">${text}</span></span>`;
}

export async function copySensitiveValue(value, label = 'Value', sourceButton = null) {
  if (!value) return;

  try {
    await navigator.clipboard.writeText(String(value));
    showCopyTooltip(sourceButton, 'Copied!');
    showToast(`${label} copied. Clipboard clears in 30s.`, 'info', 2200);
  } catch {
    showToast('Clipboard unavailable in this browser context', 'warning', 2600);
    return;
  }

  if (clipboardClearTimer) {
    clearTimeout(clipboardClearTimer);
  }

  clipboardClearTimer = setTimeout(async () => {
    try {
      await navigator.clipboard.writeText('');
    } catch {
      // Ignore clipboard permission issues during best-effort cleanup.
    }
  }, CLIPBOARD_CLEAR_MS);
}

function enableMobileScreenshotPrevention() {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  if (!isMobile) return;

  try {
    if (window.Android?.setSecureFlag) {
      window.Android.setSecureFlag(true);
      return;
    }

    if (window.Capacitor?.Plugins?.PrivacyScreen?.enable) {
      window.Capacitor.Plugins.PrivacyScreen.enable();
      return;
    }

    if (window.cordova?.plugins?.privacyScreen?.enable) {
      window.cordova.plugins.privacyScreen.enable();
    }
  } catch {
    // Platform bridge may exist but fail; keep app functional.
  }
}
