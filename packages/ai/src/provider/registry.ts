import { createMockProvider, type MockTurn } from './mock'
import { createOpenRouterProvider } from './openrouter'
import type { AIProvider } from './types'
import { ProviderError } from './types'

export type ProviderId = 'openrouter' | 'mock'

export type ProviderConfig = {
  provider: ProviderId
  model: string
  apiKey?: string
  endpoint?: string
  appUrl?: string
  appName?: string
  /** Script for the mock provider. Ignored by every other provider. */
  mockTurns?: MockTurn[]
  mockImageAnalysis?: unknown
}

type ProviderFactory = (config: ProviderConfig) => AIProvider

/**
 * Adding a vendor is: write the adapter, add one line here. The agent, the
 * tools and the UI stay untouched — that is the whole point of the boundary.
 */
const factories: Record<ProviderId, ProviderFactory> = {
  openrouter: (config) => {
    if (!config.apiKey) {
      throw new ProviderError(
        'missing_credentials',
        'OPENROUTER_API_KEY is not set. Add it to .env.local and restart the dev server.',
      )
    }
    return createOpenRouterProvider({
      apiKey: config.apiKey,
      model: config.model,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.appUrl ? { appUrl: config.appUrl } : {}),
      ...(config.appName ? { appName: config.appName } : {}),
    })
  },
  mock: (config) =>
    createMockProvider({
      turns: config.mockTurns ?? [],
      fallbackText: 'Mock provider — no model is configured.',
      ...(config.mockImageAnalysis !== undefined
        ? { imageAnalysis: config.mockImageAnalysis }
        : {}),
    }),
}

export function createProvider(config: ProviderConfig): AIProvider {
  const factory = factories[config.provider]
  if (!factory) {
    throw new ProviderError('model_unavailable', `Unknown AI provider: ${config.provider}`)
  }
  return factory(config)
}

export function isProviderId(value: string): value is ProviderId {
  return value in factories
}

export function listProviderIds(): ProviderId[] {
  return Object.keys(factories) as ProviderId[]
}
