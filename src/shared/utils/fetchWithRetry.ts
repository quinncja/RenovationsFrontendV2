interface RetryConfig {
  retries?: number
  baseDelay?: number
  onRetry?: (attempt: number, delay: number, error: Error) => void
}

const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504]

function shouldRetry(error: unknown): boolean {
  if (error instanceof Error) {
    // Network errors
    if (error.name === "TypeError" || error.message.includes("network")) {
      return true
    }
  }

  // Response errors
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status
    if (status === 401) return false
    return RETRYABLE_STATUS_CODES.includes(status)
  }

  return true
}

export default async function fetchWithRetry<T>(
  apiFn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const { retries = 3, baseDelay = 300, onRetry } = config

  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await apiFn()
    } catch (error) {
      lastError = error

      const isAborted =
        error instanceof Error &&
        (error.name === "AbortError" || error.message.includes("aborted"))

      if (isAborted) {
        throw error
      }

      const isLastAttempt = attempt === retries

      if (isLastAttempt || !shouldRetry(error)) {
        throw error
      }

      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100

      onRetry?.(attempt + 1, delay, error as Error)

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
