// Preserve the previous fetch-timeout call shape without its stale node-fetch@1 peer.
const fetch = require('node-fetch');

module.exports = async function fetchWithTimeout(url, options = {}, timeoutMs, timeoutMessage = 'fetch timeout') {
  if (!timeoutMs) {
    return fetch(url, options);
  }

  let timeout;
  const request = fetch(url, options).finally(() => {
    clearTimeout(timeout);
  });

  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([request, timer]);
};
