// Preserve the previous fetch-timeout call shape without its stale node-fetch@1 peer.
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
  const callerSignal = options.signal;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener("abort", abortFromCaller, { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError" && timedOut) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (callerSignal) {
      callerSignal.removeEventListener("abort", abortFromCaller);
    }
  }
};
