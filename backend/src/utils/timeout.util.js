// src/utils/timeout.util.js

function withTimeout(promise, fallback, timeoutMs = 1500) {
  let timeoutId;

  return Promise.race([
    Promise.resolve(promise)
      .then((value) => ({ state: "fulfilled", value }))
      .catch(() => ({ state: "rejected" })),
    new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve({ state: "timeout" }), timeoutMs);
    }),
  ])
    .then((result) => {
      if (result.state === "fulfilled") {
        return result.value;
      }

      return fallback;
    })
    .finally(() => {
      clearTimeout(timeoutId);
    });
}

module.exports = {
  withTimeout,
};
