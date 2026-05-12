// Retry helper for sync operations. Exponential backoff: 1s, 3s, 9s by
// default. Returns the result of `fn` if any attempt succeeds; throws the
// last error otherwise.

export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (i < attempts - 1) {
        const delay = baseDelayMs * Math.pow(3, i)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}
