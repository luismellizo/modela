import { ProviderError } from './types'

/**
 * The model catalog.
 *
 * OpenRouter publishes every model with its pricing and capabilities, which is
 * the only honest way to build a "free models" picker: hardcoding a list means
 * shipping a list that is wrong within a month.
 *
 * Two capabilities are not optional here. Without `tools` the agent cannot act
 * at all — it becomes the chatbot-beside-an-editor this whole project exists to
 * not be. Without image input, attachments stop working. Both are surfaced per
 * model so the picker can warn rather than silently degrade.
 */

const CATALOG_ENDPOINT = 'https://openrouter.ai/api/v1/models'

export type CatalogModel = {
  id: string
  name: string
  /** True when both prompt and completion cost nothing. */
  free: boolean
  /** Can call tools. The agent refuses to run without it. */
  tools: boolean
  /** Can read images. Attachments are disabled without it. */
  vision: boolean
  contextLength: number
}

export type FetchCatalogOptions = {
  apiKey?: string
  endpoint?: string
  signal?: AbortSignal
}

type RawModel = {
  id?: string
  name?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
  supported_parameters?: string[]
  architecture?: { input_modalities?: string[] }
}

export async function fetchModelCatalog(
  options: FetchCatalogOptions = {},
): Promise<CatalogModel[]> {
  let response: Response
  try {
    response = await fetch(options.endpoint ?? CATALOG_ENDPOINT, {
      headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {},
      ...(options.signal ? { signal: options.signal } : {}),
    })
  } catch (error) {
    throw new ProviderError(
      'network',
      `Could not reach the model catalog: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (!response.ok) {
    throw new ProviderError(
      response.status === 401 ? 'missing_credentials' : 'network',
      `Model catalog request failed (${response.status})`,
      response.status,
    )
  }

  const body = (await response.json()) as { data?: RawModel[] }
  return (body.data ?? []).map(toCatalogModel).filter((model) => model.id !== '')
}

function toCatalogModel(raw: RawModel): CatalogModel {
  // Pricing arrives as decimal strings. Anything that does not parse is treated
  // as paid — guessing "free" wrong costs the user money.
  const price = (value: string | undefined): number => {
    const parsed = Number.parseFloat(value ?? '')
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
  }

  return {
    id: raw.id ?? '',
    name: raw.name ?? raw.id ?? '',
    free: price(raw.pricing?.prompt) === 0 && price(raw.pricing?.completion) === 0,
    tools: (raw.supported_parameters ?? []).includes('tools'),
    vision: (raw.architecture?.input_modalities ?? []).includes('image'),
    contextLength: raw.context_length ?? 0,
  }
}

export type ModelFilter = {
  /** Only models that cost nothing. */
  freeOnly?: boolean
  /** Only models that can drive the agent. Defaults to true. */
  requireTools?: boolean
  requireVision?: boolean
}

export function filterModels(models: CatalogModel[], filter: ModelFilter = {}): CatalogModel[] {
  const requireTools = filter.requireTools ?? true

  return models
    .filter((model) => (filter.freeOnly ? model.free : true))
    .filter((model) => (requireTools ? model.tools : true))
    .filter((model) => (filter.requireVision ? model.vision : true))
    .sort((a, b) => {
      // Vision first — Modela is a visual product and half its features need it.
      if (a.vision !== b.vision) return a.vision ? -1 : 1
      return b.contextLength - a.contextLength
    })
}
