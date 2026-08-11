import type { AIProvider } from '../provider/types'
import { ProviderError } from '../provider/types'
import {
  ArchitecturalExtraction,
  architecturalExtractionJsonSchema,
  type ImageKind,
} from './schema'
import { validateImageDataUrl } from './validate'

/**
 * Image → structured architecture.
 *
 * Per-kind instructions matter more than they look: a floor plan and a facade
 * photo carry completely different evidence, and one generic prompt makes the
 * model hallucinate the missing half of both.
 */

const SHARED_RULES = `
Split everything you report into three buckets and never blur them:
- observed: read directly off the image — a printed dimension, a room label, a countable window.
- inferred: an assumption you are making, each with the reason ("2.60 m ceiling, typical residential").
- unknown: what the image simply does not say and you did not assume.

Never place a measurement in observed unless you can point at where you read it. If there is no scale reference, say so in unknown and set scale.known to false — approximate proportions are still useful, invented dimensions are not.

Set kind to not_architectural if this is not a building, a plan or a space, and leave the arrays empty.`

const KIND_INSTRUCTIONS: Record<ImageKind, string> = {
  floor_plan: `Read this architectural floor plan. Identify spaces with their labels, wall runs, doors and windows, circulation and stairs. Use printed dimension lines and scale bars where present. Give plan coordinates in metres with the origin at the plan's bottom-left, x to the right and z downward.`,
  facade: `Read this building facade. Identify storeys, window and door openings and their rough proportions, roof form and materials. A facade gives no plan dimensions — do not invent any. Estimate heights only relative to a storey.`,
  interior: `Read this interior photograph. Identify the kind of space, its approximate proportions, openings, furniture and finishes. A single photo rarely gives real dimensions — put them in unknown unless something in the frame gives you scale.`,
  sketch: `Read this hand-drawn sketch. Recover the intended layout and adjacencies. Sketches are rarely to scale: trust the topology, treat every dimension as inferred unless it is written down.`,
  site: `Read this site or lot image. Identify boundaries, approximate dimensions, orientation, access and existing structures.`,
  reference: `Read this reference image as design intent. Identify style, materials, massing, proportions and character. Do not attempt a layout — this is inspiration, not a plan.`,
  not_architectural: `Determine whether this image shows anything architectural at all.`,
}

const CLASSIFY_INSTRUCTION = `Classify this image into exactly one of: floor_plan, facade, interior, sketch, site, reference, not_architectural. Answer with JSON only.`

export type AnalyzeImageOptions = {
  provider: AIProvider
  image: string
  /** Skip classification when the caller already knows. */
  kind?: ImageKind
  /** Extra context from the user, e.g. "the lot is 10 by 25 metres". */
  userContext?: string
  model?: string
  signal?: AbortSignal
}

export async function analyzeArchitecturalImage(
  options: AnalyzeImageOptions,
): Promise<ArchitecturalExtraction> {
  if (!options.provider.supportsVision) {
    throw new ProviderError(
      'model_unavailable',
      `${options.provider.id} cannot read images. Configure a vision-capable model.`,
    )
  }

  const validation = validateImageDataUrl(options.image)
  if (!validation.ok && options.image.startsWith('data:')) {
    throw new ProviderError('invalid_request', validation.message)
  }

  const kind = options.kind ?? (await classifyImage(options))
  const instruction = [
    KIND_INSTRUCTIONS[kind],
    SHARED_RULES,
    options.userContext?.trim()
      ? `\nThe user says: ${options.userContext.trim()}\nTreat what they tell you as observed, not inferred.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  const raw = await options.provider.analyzeImage({
    image: options.image,
    instruction,
    schema: architecturalExtractionJsonSchema(),
    schemaName: 'architectural_extraction',
    ...(options.model ? { model: options.model } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  })

  const parsed = ArchitecturalExtraction.safeParse(raw)
  if (!parsed.success) {
    throw new ProviderError(
      'unknown',
      `The model's image analysis did not match the expected shape: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    )
  }

  return parsed.data
}

export async function classifyImage(options: AnalyzeImageOptions): Promise<ImageKind> {
  const raw = await options.provider.analyzeImage({
    image: options.image,
    instruction: CLASSIFY_INSTRUCTION,
    schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: [
            'floor_plan',
            'facade',
            'interior',
            'sketch',
            'site',
            'reference',
            'not_architectural',
          ],
        },
      },
      required: ['kind'],
      additionalProperties: false,
    },
    schemaName: 'image_kind',
    ...(options.model ? { model: options.model } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  })

  const kind = (raw as { kind?: string } | null)?.kind
  return isImageKind(kind) ? kind : 'reference'
}

function isImageKind(value: unknown): value is ImageKind {
  return (
    typeof value === 'string' &&
    [
      'floor_plan',
      'facade',
      'interior',
      'sketch',
      'site',
      'reference',
      'not_architectural',
    ].includes(value)
  )
}
