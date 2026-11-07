export function withFetch(response, fn) {
  const original = global.fetch;
  global.fetch = async () => ({
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    text: async () => response.body
  });
  return fn().finally(() => {
    global.fetch = original;
  });
}
