import type {
  AIProvider,
  AssistantMessage,
  GenerateRequest,
  ImageAnalysisRequest,
  ProviderEvent,
  ToolCall,
} from './types'
import { ProviderError } from './types'

/**
 * A scripted turn. The agent loop consumes one per `generate` call, in order,
 * so a test can express "call this tool, then answer" as data.
 */
export type MockTurn = {
  text?: string
  toolCalls?: { name: string; arguments: unknown; id?: string }[]
  /** Throw instead of answering — for testing provider failure handling. */
  error?: ProviderError
}

export type MockProviderConfig = {
  turns: MockTurn[]
  /** Answer for `analyzeImage`. */
  imageAnalysis?: unknown
  /** Fallback when the script runs out, instead of throwing. */
  fallbackText?: string
  supportsVision?: boolean
  supportsTools?: boolean
}

export type MockProvider = AIProvider & {
  /** Requests seen so far — assert on what the agent actually sent. */
  readonly calls: GenerateRequest[]
  reset(): void
}

/**
 * Deterministic provider for tests and for running the editor without a key.
 * It is named `mock` everywhere it surfaces so nobody mistakes its output for
 * a real model's.
 */
export function createMockProvider(config: MockProviderConfig): MockProvider {
  const calls: GenerateRequest[] = []
  let cursor = 0

  return {
    id: 'mock',
    model: 'mock',
    supportsVision: config.supportsVision ?? true,
    supportsTools: config.supportsTools ?? true,
    calls,

    reset() {
      cursor = 0
      calls.length = 0
    },

    async *generate(request: GenerateRequest): AsyncIterable<ProviderEvent> {
      calls.push(request)
      const turn = config.turns[cursor]
      cursor += 1

      if (!turn) {
        if (config.fallbackText === undefined) {
          throw new ProviderError('invalid_request', `Mock provider ran out of turns at ${cursor}`)
        }
        yield { type: 'text-delta', text: config.fallbackText }
        yield {
          type: 'message',
          message: { role: 'assistant', content: config.fallbackText },
        }
        return
      }

      if (turn.error) throw turn.error
      if (request.signal?.aborted) throw new ProviderError('cancelled', 'Request cancelled')

      const text = turn.text ?? ''
      // Emit in chunks so consumers exercise their streaming path.
      for (const piece of chunk(text, 12)) {
        if (request.signal?.aborted) throw new ProviderError('cancelled', 'Request cancelled')
        yield { type: 'text-delta', text: piece }
      }

      const toolCalls: ToolCall[] = (turn.toolCalls ?? []).map((call, index) => ({
        id: call.id ?? `mock_call_${cursor}_${index}`,
        name: call.name,
        arguments: JSON.stringify(call.arguments),
      }))

      for (const [index, call] of toolCalls.entries()) {
        yield {
          type: 'tool-call-delta',
          index,
          id: call.id,
          name: call.name,
          argumentsDelta: call.arguments,
        }
      }

      const message: AssistantMessage = {
        role: 'assistant',
        content: text,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      }
      yield { type: 'message', message, usage: { inputTokens: 0, outputTokens: 0 } }
    },

    async analyzeImage(_request: ImageAnalysisRequest): Promise<unknown> {
      if (config.imageAnalysis === undefined) {
        throw new ProviderError('invalid_request', 'Mock provider has no scripted image analysis')
      }
      return config.imageAnalysis
    },
  }
}

function chunk(text: string, size: number): string[] {
  if (text === '') return []
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}
