import { describe, expect, test } from 'bun:test'
import { type CatalogModel, filterModels } from './catalog'

function model(overrides: Partial<CatalogModel> & { id: string }): CatalogModel {
  return {
    name: overrides.id,
    free: false,
    tools: false,
    vision: false,
    contextLength: 8000,
    ...overrides,
  }
}

describe('filterModels', () => {
  const catalog = [
    model({
      id: 'free-tools-vision',
      free: true,
      tools: true,
      vision: true,
      contextLength: 200_000,
    }),
    model({ id: 'free-tools', free: true, tools: true, contextLength: 1_000_000 }),
    model({ id: 'free-no-tools', free: true, tools: false }),
    model({ id: 'paid-tools-vision', free: false, tools: true, vision: true }),
  ]

  test('tool calling is required by default', () => {
    // A model that cannot call tools gives a copilot that talks and never
    // builds, so it must never reach the picker.
    const ids = filterModels(catalog).map((entry) => entry.id)
    expect(ids).not.toContain('free-no-tools')
  })

  test('free-only excludes paid models', () => {
    const ids = filterModels(catalog, { freeOnly: true }).map((entry) => entry.id)
    expect(ids).toContain('free-tools')
    expect(ids).not.toContain('paid-tools-vision')
  })

  test('vision models come first, then the largest context', () => {
    const ids = filterModels(catalog, { freeOnly: true }).map((entry) => entry.id)
    // Vision wins even though the text-only model has five times the context.
    expect(ids).toEqual(['free-tools-vision', 'free-tools'])
  })

  test('vision can be required outright', () => {
    const ids = filterModels(catalog, { freeOnly: true, requireVision: true }).map(
      (entry) => entry.id,
    )
    expect(ids).toEqual(['free-tools-vision'])
  })

  test('the tools requirement can be lifted deliberately', () => {
    const ids = filterModels(catalog, { freeOnly: true, requireTools: false }).map(
      (entry) => entry.id,
    )
    expect(ids).toContain('free-no-tools')
  })

  test('an empty catalog yields an empty list, not a throw', () => {
    expect(filterModels([], { freeOnly: true })).toEqual([])
  })
})
