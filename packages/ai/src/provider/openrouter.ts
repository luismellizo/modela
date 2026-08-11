import {
  type AIProvider,
  type AssistantMessage,
  type ContentPart,
  type GenerateRequest,
  type ImageAnalysisRequest,
  type Message,
  ProviderError,
  type ProviderEvent,
  type ToolCall,
} from './types'

const DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export type OpenRouterConfig = {
  apiKey: string
  model: string
  /** Override for self-hosted gateways that speak the same API. */
  endpoint?: string
  /** Sent as `HTTP-Referer` — OpenRouter uses it for attribution. */
  appUrl?: string
  appName?: string
  supportsVision?: boolean
}

type OpenAiToolCallDelta = {
  index?: number
  id?: string
  function?: { name?: string; arguments?: string }
}

type StreamChoiceDelta = {
  content?: string | null
  tool_calls?: OpenAiToolCallDelta[]
}

/**
 * OpenRouter speaks the OpenAI chat-completions dialect, so this adapter also
 * works against any gateway that does — point `endpoint` at it.
 */
export function createOpenRouterProvider(config: OpenRouterConfig): AIProvider {
  if (!config.apiKey) {
    throw new ProviderError('missing_credentials', 'OpenRouter API key is required')
  }

  const endpoint = config.endpoint ?? DEFAULT_ENDPOINT

  const headers = (): Record<string, string> => {
    const base: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    }
    if (config.appUrl) base['HTTP-Referer'] = config.appUrl
    if (config.appName) base['X-Title'] = config.appName
    return base
  }

  async function post(body: unknown, signal?: AbortSignal): Promise<Response> {
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        signal,
      })
    } catch (error) {
      if (signal?.aborted) throw new ProviderError('cancelled', 'Request cancelled')
      throw new ProviderError('network', `Could not reach OpenRouter: ${describe(error)}`)
    }
    if (!response.ok) {
      throw await toProviderError(response)
    }
    return response
  }

  return {
    id: 'openrouter',
    model: config.model,
    supportsVision: config.supportsVision ?? true,
    supportsTools: true,

    async *generate(request: GenerateRequest): AsyncIterable<ProviderEvent> {
      const response = await post(
        {
          model: request.model ?? config.model,
          messages: request.messages.map(toOpenAiMessage),
          ...(request.tools?.length
            ? {
                tools: request.tools.map((tool) => ({
                  type: 'function',
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                  },
                })),
                tool_choice: 'auto',
              }
            : {}),
          ...(request.responseFormat
            ? {
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: request.responseFormat.name,
                    schema: request.responseFormat.schema,
                    strict: true,
                  },
                },
              }
            : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
          stream: true,
        },
        request.signal,
      )

      if (!response.body) {
        throw new ProviderError('network', 'OpenRouter returned an empty stream')
      }

      const assembler = new ToolCallAssembler()
      let text = ''
      let usage: { inputTokens: number; outputTokens: number } | undefined

      for await (const payload of readSseData(response.body, request.signal)) {
        if (payload === '[DONE]') break

        let chunk: {
          choices?: { delta?: StreamChoiceDelta }[]
          usage?: { prompt_tokens?: number; completion_tokens?: number }
          error?: { message?: string }
        }
        try {
          chunk = JSON.parse(payload)
        } catch {
          // OpenRouter interleaves `: OPENROUTER PROCESSING` keep-alives and the
          // occasional partial frame. Skipping is correct — the stream recovers.
          continue
        }

        if (chunk.error) {
          throw new ProviderError('unknown', chunk.error.message ?? 'OpenRouter stream error')
        }

        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
          }
        }

        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue

        if (delta.content) {
          text += delta.content
          yield { type: 'text-delta', text: delta.content }
        }

        for (const call of delta.tool_calls ?? []) {
          const index = call.index ?? 0
          assembler.push(index, call)
          yield {
            type: 'tool-call-delta',
            index,
            ...(call.id ? { id: call.id } : {}),
            ...(call.function?.name ? { name: call.function.name } : {}),
            ...(call.function?.arguments ? { argumentsDelta: call.function.arguments } : {}),
          }
        }
      }

      const toolCalls = assembler.result()
      const message: AssistantMessage = {
        role: 'assistant',
        content: text,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      }
      yield { type: 'message', message, ...(usage ? { usage } : {}) }
    },

    async analyzeImage(request: ImageAnalysisRequest): Promise<unknown> {
      const response = await post(
        {
          model: request.model ?? config.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: request.instruction },
                { type: 'image_url', image_url: { url: request.image } },
              ],
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: request.schemaName, schema: request.schema, strict: true },
          },
          stream: false,
        },
        request.signal,
      )

      const body = (await response.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const content = body.choices?.[0]?.message?.content
      if (!content) {
        throw new ProviderError('unknown', 'Image analysis returned no content')
      }
      try {
        return JSON.parse(content)
      } catch {
        throw new ProviderError('unknown', 'Image analysis returned malformed JSON')
      }
    },
  }
}

/**
 * Tool call arguments arrive as a stream of string fragments keyed by index.
 * Nothing guarantees the id or name lands in the same frame as the arguments,
 * so each field is filled in as it shows up.
 */
class ToolCallAssembler {
  readonly #calls = new Map<number, { id: string; name: string; args: string }>()

  push(index: number, delta: OpenAiToolCallDelta): void {
    const current = this.#calls.get(index) ?? { id: '', name: '', args: '' }
    if (delta.id) current.id = delta.id
    if (delta.function?.name) current.name = delta.function.name
    if (delta.function?.arguments) current.args += delta.function.arguments
    this.#calls.set(index, current)
  }

  result(): ToolCall[] {
    return [...this.#calls.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, call]) => call.name !== '')
      .map(([index, call]) => ({
        id: call.id || `call_${index}`,
        name: call.name,
        arguments: call.args || '{}',
      }))
  }
}

/** Yields the payload of each `data:` line in an SSE stream. */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) throw new ProviderError('cancelled', 'Request cancelled')
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line.startsWith('data:')) {
          yield line.slice(5).trim()
        }
        newline = buffer.indexOf('\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function toOpenAiMessage(message: Message): Record<string, unknown> {
  switch (message.role) {
    case 'system':
      return { role: 'system', content: message.content }
    case 'user':
      return { role: 'user', content: message.content.map(toOpenAiPart) }
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.arguments },
              })),
            }
          : {}),
      }
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
  }
}

function toOpenAiPart(part: ContentPart): Record<string, unknown> {
  if (part.type === 'text') return { type: 'text', text: part.text }
  return { type: 'image_url', image_url: { url: part.url } }
}

async function toProviderError(response: Response): Promise<ProviderError> {
  const raw = await response.text().catch(() => '')
  let message = raw
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } }
    message = parsed.error?.message ?? raw
  } catch {
    // Non-JSON body — the raw text is the best message available.
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderError('missing_credentials', message || 'Invalid API key', response.status)
  }
  if (response.status === 429) {
    return new ProviderError('rate_limited', message || 'Rate limited', response.status)
  }
  if (response.status === 404) {
    return new ProviderError('model_unavailable', message || 'Model not found', response.status)
  }
  if (response.status === 400) {
    return new ProviderError('invalid_request', message || 'Invalid request', response.status)
  }
  return new ProviderError(
    'unknown',
    message || `Request failed (${response.status})`,
    response.status,
  )
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
