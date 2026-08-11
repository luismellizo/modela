import { describe, expect, test } from 'bun:test'
import { readAiConfig, toProviderConfig } from './config'

describe('readAiConfig', () => {
  test('defaults to OpenRouter with a vision-capable model', () => {
    const config = readAiConfig({ OPENROUTER_API_KEY: 'sk-test' })
    expect(config.provider).toBe('openrouter')
    expect(config.enabled).toBe(true)
    expect(config.model.length).toBeGreaterThan(0)
    expect(config.maxSteps).toBe(24)
  })

  test('disables itself with a usable reason when the key is missing', () => {
    const config = readAiConfig({})
    expect(config.enabled).toBe(false)
    expect(config.disabledReason).toContain('OPENROUTER_API_KEY')
  })

  test('the mock provider needs no key', () => {
    const config = readAiConfig({ MODELA_AI_PROVIDER: 'mock' })
    expect(config.provider).toBe('mock')
    expect(config.enabled).toBe(true)
  })

  test('an unknown provider falls back to openrouter and says so', () => {
    const config = readAiConfig({ MODELA_AI_PROVIDER: 'skynet', OPENROUTER_API_KEY: 'sk-test' })
    expect(config.provider).toBe('openrouter')
    expect(config.enabled).toBe(false)
    expect(config.disabledReason).toContain('skynet')
  })

  test('overrides are honoured', () => {
    const config = readAiConfig({
      OPENROUTER_API_KEY: 'sk-test',
      MODELA_AI_MODEL: 'google/gemini-2.5-pro',
      MODELA_AI_MAX_STEPS: '40',
    })
    expect(config.model).toBe('google/gemini-2.5-pro')
    expect(config.maxSteps).toBe(40)
  })

  test('a nonsense step count falls back to the default', () => {
    expect(readAiConfig({ MODELA_AI_MAX_STEPS: 'lots' }).maxSteps).toBe(24)
    expect(readAiConfig({ MODELA_AI_MAX_STEPS: '-3' }).maxSteps).toBe(24)
  })

  test('the vision model defaults to the main model', () => {
    const config = readAiConfig({ OPENROUTER_API_KEY: 'sk', MODELA_AI_MODEL: 'a/b' })
    expect(config.visionModel).toBe('a/b')
  })

  test('toProviderConfig omits absent optional fields', () => {
    const provider = toProviderConfig(readAiConfig({ MODELA_AI_PROVIDER: 'mock' }))
    expect(provider.provider).toBe('mock')
    expect('apiKey' in provider).toBe(false)
  })
})
