/**
 * The provider boundary.
 *
 * Everything above this line (agent, tools, context) is vendor-agnostic. Adding
 * a model or a vendor means writing one more `AIProvider` — nothing else moves.
 *
 * There are two kinds of implementation and both are first-class:
 *  - real vendors (`openrouter`) — used on the server, hold the API key;
 *  - transports (`http`) — used in the browser, forward to a server route.
 */

/** A chunk of a user or assistant message. */
export type ContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      /** `data:` URL or an absolute https URL. */
      url: string
      /** Optional hint for the model about what it is looking at. */
      caption?: string
    }

export type SystemMessage = { role: 'system'; content: string }
export type UserMessage = { role: 'user'; content: ContentPart[] }
export type AssistantMessage = {
  role: 'assistant'
  content: string
  toolCalls?: ToolCall[]
}
export type ToolResultMessage = {
  role: 'tool'
  toolCallId: string
  toolName: string
  /** JSON-serialisable result, or an error envelope. */
  content: string
}

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage

export type ToolCall = {
  id: string
  name: string
  /** Raw JSON string as emitted by the model. Parsed and validated downstream. */
  arguments: string
}

/** Tool contract as the model sees it — JSON Schema, not Zod. */
export type ToolSpec = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type GenerateRequest = {
  messages: Message[]
  tools?: ToolSpec[]
  /** Override the provider's configured model for this call. */
  model?: string
  temperature?: number
  maxTokens?: number
  /** Ask the model to answer with JSON matching this schema, when supported. */
  responseFormat?: { type: 'json_schema'; name: string; schema: Record<string, unknown> }
  signal?: AbortSignal
}

/**
 * Streamed output. `text-delta` and `tool-call-delta` arrive interleaved; the
 * final `message` carries the assembled assistant turn so consumers never have
 * to reconstruct it from deltas.
 */
export type ProviderEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call-delta'; index: number; id?: string; name?: string; argumentsDelta?: string }
  | { type: 'message'; message: AssistantMessage; usage?: TokenUsage }
  | { type: 'error'; error: ProviderError }

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
}

export type ProviderErrorCode =
  | 'missing_credentials'
  | 'rate_limited'
  | 'context_too_long'
  | 'model_unavailable'
  | 'invalid_request'
  | 'network'
  | 'cancelled'
  | 'unknown'

export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly status?: number

  constructor(code: ProviderErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.status = status
  }
}

export type ImageAnalysisRequest = {
  /** `data:` URL or absolute https URL. */
  image: string
  /** What the caller wants extracted, in natural language. */
  instruction: string
  /** JSON Schema the answer must satisfy. */
  schema: Record<string, unknown>
  schemaName: string
  model?: string
  signal?: AbortSignal
}

export type AIProvider = {
  /** Stable identifier, e.g. `openrouter`. Surfaced in the UI and in errors. */
  readonly id: string
  /** Model this provider will use when a request does not override it. */
  readonly model: string
  /** False for providers that cannot see images — the UI hides attachments. */
  readonly supportsVision: boolean
  /** False for providers without native tool calling — the agent refuses to run. */
  readonly supportsTools: boolean

  /** Streaming generation with optional tool calling. */
  generate(request: GenerateRequest): AsyncIterable<ProviderEvent>

  /** One-shot structured extraction from an image. */
  analyzeImage(request: ImageAnalysisRequest): Promise<unknown>
}
