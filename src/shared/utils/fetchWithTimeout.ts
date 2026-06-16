/**
 * fetch() with a per-attempt timeout, intended to be wrapped by fetchWithRetry.
 *
 * The Pi backend (reached over the Cloudflare/ngrok tunnel) can hang rather than
 * error. A hung fetch never rejects, so fetchWithRetry never gets a chance to
 * retry. This drives fetch with our own AbortController and converts a timeout
 * into a *retryable* HTTP 408 by default, while still propagating a
 * caller-initiated abort (component unmount / navigation) as a non-retryable
 * AbortError.
 *
 * Set `retryOnTimeout: false` for operations where a timeout-triggered retry is
 * unsafe (e.g. opening a SQL connection) — the timeout then surfaces as an
 * AbortError, which fetchWithRetry treats as terminal.
 */

export const REQUEST_TIMEOUT_MS = 5000

export interface TimeoutOptions {
  timeoutMs?: number
  retryOnTimeout?: boolean
}

export default async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  { timeoutMs = REQUEST_TIMEOUT_MS, retryOnTimeout = true }: TimeoutOptions = {}
): Promise<Response> {
  const callerSignal = init.signal ?? undefined

  // Our own controller drives fetch so we can abort on timeout *or* relay a
  // caller abort. `timedOut` lets the catch block tell the two apart.
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const onCallerAbort = () => controller.abort()
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener("abort", onCallerAbort, { once: true })
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    // Our timeout fired (not a caller-initiated abort).
    if (timedOut && !callerSignal?.aborted) {
      const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`) as Error & {
        status?: number
      }
      if (retryOnTimeout) {
        timeoutError.status = 408 // retryable in fetchWithRetry
      } else {
        timeoutError.name = "AbortError" // terminal in fetchWithRetry
      }
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
    if (callerSignal) callerSignal.removeEventListener("abort", onCallerAbort)
  }
}
