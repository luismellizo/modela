import { isProviderId, type ProviderConfig, type ProviderId } from './provider/registry'

/**
 * Environment is read in exactly one place. Everything downstream takes a
 * typed config object, which is what makes the agent testable without stubbing
 * `process.env`.
 */

export type ModelaAiConfig = {
  provider: ProviderId
  model: string
  visionModel: string
  apiKey?: string
  endpoint?: string
  maxSteps: number
  /** True when a real model can actually be reached. */
  enabled: boolean
  /** Why it is disabled, for the UI to show. */
  disabledReason?: string
}

/**
 * A vision-capable default with solid tool calling. Override with
 * `MODELA_AI_MODEL` — any OpenRouter slug works.
 */
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5'
const DEFAULT_MAX_STEPS = 24

export type EnvLike = Record<string, string | undefined>

export function readAiConfig(env: EnvLike): ModelaAiConfig {
  const rawProvider = env.MODELA_AI_PROVIDER?.trim() || 'openrouter'
  const provider: ProviderId = isProviderId(rawProvider) ? rawProvider : 'openrouter'
  const model = env.MODELA_AI_MODEL?.trim() || DEFAULT_MODEL
  const visionModel = env.MODELA_AI_VISION_MODEL?.trim() || model
  const apiKey = env.OPENROUTER_API_KEY?.trim()
  const endpoint = env.MODELA_AI_ENDPOINT?.trim()
  const maxSteps = positiveInt(env.MODELA_AI_MAX_STEPS) ?? DEFAULT_MAX_STEPS

  const base = {
    provider,
    model,
    visionModel,
    maxSteps,
    ...(apiKey ? { apiKey } : {}),
    ...(endpoint ? { endpoint } : {}),
  }

  if (provider === 'mock') {
    return { ...base, enabled: true }
  }

  if (!apiKey) {
    return {
      ...base,
      enabled: false,
      disabledReason:
        'OPENROUTER_API_KEY is not set. Add it to .env.local and restart the dev server.',
    }
  }

  if (!isProviderId(rawProvider)) {
    return {
      ...base,
      enabled: false,
      disabledReason: `Unknown MODELA_AI_PROVIDER "${rawProvider}". Use openrouter or mock.`,
    }
  }

  return { ...base, enabled: true }
}

export function toProviderConfig(
  config: ModelaAiConfig,
  extras: { appUrl?: string; appName?: string } = {},
): ProviderConfig {
  return {
    provider: config.provider,
    model: config.model,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(extras.appUrl ? { appUrl: extras.appUrl } : {}),
    ...(extras.appName ? { appName: extras.appName } : {}),
  }
}

function positiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}
