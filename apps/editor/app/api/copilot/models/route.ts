import { ProviderError, readAiConfig } from '@modela/ai'
import { listAllowedModels } from '@/lib/model-catalog'

/**
 * The model picker's data source.
 *
 * Served from here rather than fetched by the browser for the same reason as
 * everything else in this folder: the catalog request carries the API key.
 */

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const config = readAiConfig(process.env)

  if (config.provider === 'mock') {
    return Response.json({
      models: [
        {
          id: 'mock',
          name: 'Mock provider',
          free: true,
          tools: true,
          vision: true,
          contextLength: 0,
        },
      ],
      freeOnly: config.freeOnly,
      current: config.model,
    })
  }

  if (!config.apiKey) {
    return Response.json({
      models: [],
      freeOnly: config.freeOnly,
      current: config.model,
      message: config.disabledReason,
    })
  }

  try {
    const models = await listAllowedModels(config.apiKey, config.freeOnly)
    return Response.json({ models, freeOnly: config.freeOnly, current: config.model })
  } catch (error) {
    return Response.json({
      models: [],
      freeOnly: config.freeOnly,
      current: config.model,
      code: error instanceof ProviderError ? error.code : 'unknown',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
