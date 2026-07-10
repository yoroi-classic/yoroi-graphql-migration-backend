// Preserve the previous fetch-timeout call shape without its stale node-fetch@1 peer.
const AbortController = require("abort-controller");
const fetch = require("node-fetch");

module.exports = async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs,
  timeoutMessage = "fetch timeout"
) {
  if (!timeoutMs) {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
