import type { FetchLike } from './types.js'

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

export const fetchWithTimeout = async (
  fetcher: FetchLike,
  input: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<Response> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fetcher(input, init)

  const controller = new AbortController()

  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    return await fetcher(input, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Request timed out after ${timeoutMs}ms.`, { cause: error })
    }

    throw error
  } finally {
    clearTimeout(timer)
  }
}
