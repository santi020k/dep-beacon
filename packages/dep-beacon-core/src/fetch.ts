import type { FetchLike } from './types.js'

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

interface JsonResponse {
  body: unknown
  ok: boolean
  status: number
}

export const fetchJsonWithTimeout = async (
  fetcher: FetchLike,
  input: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<JsonResponse> => {
  const readResponse = async (signal?: AbortSignal): Promise<JsonResponse> => {
    const response = await fetcher(input, { ...init, signal })

    return {
      body: response.ok ? await response.json() : undefined,
      ok: response.ok,
      status: response.status
    }
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return readResponse(init.signal ?? undefined)

  const controller = new AbortController()

  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    return await readResponse(controller.signal)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Request timed out after ${timeoutMs}ms.`, { cause: error })
    }

    throw error
  } finally {
    clearTimeout(timer)
  }
}
