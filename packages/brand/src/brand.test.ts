import { describe, expect, test } from 'bun:test'
import { brand, brandMetadata } from './index'

/**
 * Rebranding means editing `index.ts`. These tests are the guard rail for that
 * edit: they fail if someone empties a field the app renders, or drops the
 * upstream attribution the licence requires.
 */

describe('brand', () => {
  test('identity fields are filled in', () => {
    expect(brand.name.length).toBeGreaterThan(0)
    expect(brand.id).toMatch(/^[a-z][a-z0-9-]*$/)
    expect(brand.tagline.length).toBeGreaterThan(0)
    expect(brand.description.length).toBeGreaterThan(20)
    expect(brand.mark.length).toBeGreaterThan(0)
  })

  test('colours are hex', () => {
    for (const [name, value] of Object.entries(brand.colors)) {
      expect(value, `${name} should be a hex colour`).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  test('links are absolute URLs', () => {
    for (const [name, value] of Object.entries(brand.links)) {
      expect(() => new URL(value), `${name} should be a URL`).not.toThrow()
    }
  })

  test('copilot copy has everything the panel renders', () => {
    expect(brand.copilot.title.length).toBeGreaterThan(0)
    expect(brand.copilot.subtitle.length).toBeGreaterThan(0)
    expect(brand.copilot.placeholder.length).toBeGreaterThan(0)
    expect(brand.copilot.thinking.length).toBeGreaterThan(0)
    expect(brand.copilot.suggestions.length).toBeGreaterThan(0)
  })

  test('the missing-key message names the variable to set', () => {
    expect(brand.copilot.missingKey).toContain('OPENROUTER_API_KEY')
  })

  test('upstream attribution survives any rebrand', () => {
    expect(brand.attribution.upstreamName).toBe('Pascal Editor')
    expect(brand.attribution.upstreamUrl).toContain('pascalorg/editor')
    expect(brand.attribution.upstreamCopyright).toContain('Pascal Group Inc.')
    expect(brand.attribution.license).toBe('MIT')
  })

  test('page metadata is derived from the brand', () => {
    expect(brandMetadata.title).toContain(brand.name)
    expect(brandMetadata.applicationName).toBe(brand.name)
    expect(brandMetadata.description).toBe(brand.description)
  })
})
