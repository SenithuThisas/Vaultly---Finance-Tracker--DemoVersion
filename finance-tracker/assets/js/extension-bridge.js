/**
 * @fileoverview Extension Bridge utility to handle messaging with the browser extension.
 * Implements a retry/polling mechanism to ensure listeners are ready before sending.
 */

const READY_MSG = 'tabs:outgoing.message.ready';
const TIMEOUT_MS = 3000;
const POLL_INTERVAL = 100;

let isExtensionReady = false;

// Listen for the ready signal from the extension
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === READY_MSG) {
    isExtensionReady = true;
    console.log('[ExtensionBridge] Listener confirmed ready.');
  }
});

/**
 * Sends a message to the extension with a retry mechanism.
 * @param {Object} message - The message payload to send.
 * @returns {Promise<void>}
 */
export async function sendMessageToExtension(message) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const checkReady = () => {
      if (isExtensionReady) {
        window.postMessage({ ...message, source: 'vaultly-app' }, '*');
        resolve();
      } else if (Date.now() - start > TIMEOUT_MS) {
        console.warn(`[ExtensionBridge] Messaging timeout: ${READY_MSG} not received within ${TIMEOUT_MS}ms.`);
        // Fallback or reject as per requirement
        reject(new Error(`No Listener: ${READY_MSG}`));
      } else {
        setTimeout(checkReady, POLL_INTERVAL);
      }
    };

    checkReady();
  });
}
