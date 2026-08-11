import {
  createProvider,
  type GenerateRequest,
  type ImageAnalysisRequest,
  ProviderError,
  readAiConfig,
  toProviderConfig,
  validateImageDataUrl,
} from '@modela/ai'
import { brand } from '@modela/brand'
import type { NextRequest } from 'next/server'
import { isModelAllowed } from '@/lib/model-catalog'

/**
 * The copilot's server side.
 *
 * It does exactly two things: hold the API key, and stream the provider's
 * events back to the browser. The agent loop, the tools and the scene all live
 * in the client, because that is where the scene is — see
 * `docs/arquitectura/copiloto.md`.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Attachments are re-validated here even though the composer already checked
// them: anything reaching this route may not have come from our UI.
const MAX_IMAGES_PER_REQUEST = 6

export function GET(): Response {
  const config = readAiConfig(process.env)
  return Response.json({
    enabled: config.enabled,
    provider: config.provider,
    model: config.model,
    maxSteps: config.maxSteps,
    freeOnly: config.freeOnly,
    ...(config.disabledReason ? { reason: config.disabledReason } : {}),
  })
}

export async function POST(request: NextRequest): Promise<Response> {
  const config = readAiConfig(process.env)
  if (!config.enabled) {
    return errorResponse(
      'missing_credentials',
      config.disabledReason ?? 'AI is not configured',
      503,
    )
  }

  let body: { action?: string } & Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return errorResponse('invalid_request', 'Request body is not valid JSON', 400)
  }

  let provider: ReturnType<typeof createProvider>
  try {
    provider = createProvider(
      toProviderConfig(config, {
        appUrl: brand.links.repository,
        appName: brand.name,
      }),
    )
  } catch (error) {
    return fromError(error)
  }

  // The client may name a model. Validate it here — a picker the client can
  // bypass is not a spending limit, and `model` is just a field in a POST body.
  const requestedModel = typeof body.model === 'string' ? body.model : undefined
  if (requestedModel && config.apiKey) {
    const allowed = await isModelAllowed(requestedModel, config.apiKey, config.freeOnly)
    if (!allowed) {
      return errorResponse(
        'invalid_request',
        `Model "${requestedModel}" is not in the allowed list. Free-only mode is ${config.freeOnly ? 'on' : 'off'}.`,
        403,
      )
    }
  }

  if (body.action === 'analyze-image') {
    const payload = body as unknown as ImageAnalysisRequest
    const invalid = rejectBadImages([payload.image])
    if (invalid) return invalid
    try {
      const result = await provider.analyzeImage({
        ...payload,
        model: payload.model ?? config.visionModel,
      })
      return Response.json({ result })
    } catch (error) {
      return fromError(error)
    }
  }

  if (body.action !== 'generate') {
    return errorResponse('invalid_request', `Unknown action "${body.action}"`, 400)
  }

  const generateRequest = body as unknown as GenerateRequest
  if (!Array.isArray(generateRequest.messages) || generateRequest.messages.length === 0) {
    return errorResponse('invalid_request', 'messages is required', 400)
  }

  const images = generateRequest.messages.flatMap((message) =>
    message.role === 'user'
      ? message.content.filter((part) => part.type === 'image').map((part) => part.url)
      : [],
  )
  const invalid = rejectBadImages(images)
  if (invalid) return invalid

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        for await (const event of provider.generate({
          ...generateRequest,
          signal: request.signal,
        })) {
          send(event)
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (error) {
        // The stream has already started, so the status code is spent. The
        // error travels as an event and the client provider rethrows it.
        const { code, message } = describe(error)
        send({ type: 'error', error: { code, message } })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

function rejectBadImages(images: unknown[]): Response | null {
  const urls = images.filter((image): image is string => typeof image === 'string')
  if (urls.length > MAX_IMAGES_PER_REQUEST) {
    return errorResponse(
      'invalid_request',
      `Too many images: ${urls.length}. The limit is ${MAX_IMAGES_PER_REQUEST}.`,
      400,
    )
  }
  for (const url of urls) {
    // Remote URLs are the caller's business; data URLs are ours to police.
    if (!url.startsWith('data:')) continue
    const result = validateImageDataUrl(url)
    if (!result.ok) {
      return errorResponse('invalid_request', result.message, 400)
    }
  }
  return null
}

function describe(error: unknown): { code: string; message: string } {
  if (error instanceof ProviderError) return { code: error.code, message: error.message }
  return {
    code: 'unknown',
    message: error instanceof Error ? error.message : String(error),
  }
}

function fromError(error: unknown): Response {
  const { code, message } = describe(error)
  const status = code === 'missing_credentials' ? 503 : code === 'rate_limited' ? 429 : 500
  return errorResponse(code, message, status)
}

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ code, message }, { status })
}
