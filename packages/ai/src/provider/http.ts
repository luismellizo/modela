import { readSseData } from './openrouter'
import type { AIProvider, GenerateRequest, ImageAnalysisRequest, ProviderEvent } from './types'
import { ProviderError } from './types'

export type HttpProviderConfig = {
  /** Server route that owns the API key, e.g. `/api/copilot`. */
  endpoint: string
  /** Reported as this provider's id so the UI can show what is really answering. */
  id?: string
  model?: string
  supportsVision?: boolean
  supportsTools?: boolean
  headers?: Record<string, string>
}

/**
 * Browser-side provider. Holds no credentials: it forwards the request to a
 * server route that runs the real provider and streams `ProviderEvent`s back.
 *
 * This is why the agent loop can live in the browser (where the scene is) while
 * the API key never leaves the server.
 */
export function createHttpProvider(config: HttpProviderConfig): AIProvider {
  const post = async (body: unknown, signal?: AbortSignal): Promise<Response> => {
    let response: Response
    try {
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...config.headers },
        body: JSON.stringify(body),
        signal,
      })
    } catch (error) {
      if (signal?.aborted) throw new ProviderError('cancelled', 'Request cancelled')
      throw new ProviderError('network', describe(error))
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        code?: string
        message?: string
      } | null
      throw new ProviderError(
        (payload?.code as ProviderError['code']) ?? 'unknown',
        payload?.message ?? `Copilot request failed (${response.status})`,
        response.status,
      )
    }
    return response
  }

  return {
    id: config.id ?? 'http',
    model: config.model ?? 'server-configured',
    supportsVision: config.supportsVision ?? true,
    supportsTools: config.supportsTools ?? true,

    async *generate(request: GenerateRequest): AsyncIterable<ProviderEvent> {
      const { signal, ...rest } = request
      const response = await post({ action: 'generate', ...rest }, signal)
      if (!response.body) throw new ProviderError('network', 'Copilot returned an empty stream')

      for await (const payload of readSseData(response.body, signal)) {
        if (payload === '[DONE]') return
        let event: ProviderEvent
        try {
          event = JSON.parse(payload) as ProviderEvent
        } catch {
          continue
        }
        if (event.type === 'error') {
          const raw = event.error as unknown as { code?: string; message?: string }
          throw new ProviderError(
            (raw.code as ProviderError['code']) ?? 'unknown',
            raw.message ?? 'Copilot stream error',
          )
        }
        yield event
      }
    },

    async analyzeImage(request: ImageAnalysisRequest): Promise<unknown> {
      const { signal, ...rest } = request
      const response = await post({ action: 'analyze-image', ...rest }, signal)
      const body = (await response.json()) as { result?: unknown }
      return body.result
    },
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
