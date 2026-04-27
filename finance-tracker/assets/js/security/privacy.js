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
      const value = copyBtn.getAttribute('data-copy-value') || '';
      const label = copyBtn.getAttribute('data-copy-label') || 'Value';
      copySensitiveValue(value, label);
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

  const copyButton = copyValue
    ? `<button class="sensitive-copy-btn" type="button" data-copy-sensitive="true" data-copy-label="${copyLabel}" data-copy-value="${copyValue}" aria-label="Copy ${copyLabel}" title="Copy ${copyLabel}">⧉</button>`
    : '';

  return `<span class="sensitive-wrap ${extraClass}"><span class="sensitive-value" style="--sensitive-min-width:${width};">${text}</span>${copyButton}</span>`;
}

export async function copySensitiveValue(value, label = 'Value') {
  if (!value) return;

  try {
    await navigator.clipboard.writeText(String(value));
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
