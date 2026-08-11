import { describe, expect, test } from 'bun:test'
import { KNOWLEDGE_ENTRIES } from './entries'
import { listKnowledgeTopics, queryKnowledge, renderEntry } from './query'

describe('knowledge entries', () => {
  test('every entry states where its numbers come from', () => {
    for (const entry of KNOWLEDGE_ENTRIES) {
      expect(entry.basis.length).toBeGreaterThan(10)
      expect(entry.guidance.length).toBeGreaterThan(30)
      expect(entry.topics.length).toBeGreaterThan(0)
    }
  })

  test('entries that touch regulated matters say so', () => {
    // Ceilings, stairs and glazing are regulated nearly everywhere. Presenting
    // those as plain convention would be the most harmful mistake here.
    for (const id of ['ceiling-height', 'stair-dimensions', 'window-sizes']) {
      const entry = KNOWLEDGE_ENTRIES.find((candidate) => candidate.id === id)
      expect(entry?.basis.toLowerCase()).toContain('regulated')
    }
  })

  test('ids are unique', () => {
    const ids = KNOWLEDGE_ENTRIES.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('dimension guides are internally consistent', () => {
    for (const entry of KNOWLEDGE_ENTRIES) {
      if (!entry.dimensions) continue
      const { minimumSqM, comfortableSqM } = entry.dimensions
      if (minimumSqM > 0 && comfortableSqM > 0) {
        expect(comfortableSqM).toBeGreaterThanOrEqual(minimumSqM)
      }
    }
  })
})

describe('query', () => {
  test('finds the bedroom entry by plain words', () => {
    const results = queryKnowledge({ topic: 'how big should a bedroom be' })
    expect(results[0]?.id).toBe('bedroom-size')
  })

  test('an explicit space type outranks fuzzy text', () => {
    const results = queryKnowledge({ topic: 'size', spaceType: 'kitchen' })
    expect(results[0]?.id).toBe('kitchen-size')
  })

  test('distinguishes the main bedroom from a secondary one', () => {
    const results = queryKnowledge({ topic: 'main bedroom size' })
    expect(results[0]?.id).toBe('main-bedroom-size')
  })

  test('finds corridor guidance from several wordings', () => {
    for (const topic of ['corridor width', 'pasillo', 'circulation space']) {
      const results = queryKnowledge({ topic })
      expect(results.map((entry) => entry.id)).toContain('circulation-width')
    }
  })

  test('a regional entry wins on an equal match', () => {
    const results = queryKnowledge({ topic: 'colombia tropical ventilation', region: 'latam' })
    expect(results[0]?.region).toBe('latam')
  })

  test('regional entries do not leak into unrelated questions', () => {
    const results = queryKnowledge({ topic: 'door width' })
    expect(results.every((entry) => entry.region === 'general')).toBe(true)
  })

  test('an unknown topic returns nothing rather than a bad guess', () => {
    expect(queryKnowledge({ topic: 'quantum plumbing telemetry' })).toHaveLength(0)
  })

  test('respects the limit', () => {
    expect(queryKnowledge({ topic: 'size room space', limit: 2 })).toHaveLength(2)
  })

  test('renderEntry keeps the basis attached to the numbers', () => {
    const entry = KNOWLEDGE_ENTRIES.find((candidate) => candidate.id === 'bedroom-size')
    const rendered = renderEntry(entry as never) as Record<string, unknown>

    expect(rendered.basis).toBeString()
    expect((rendered.dimensions as { minimumSqM: number }).minimumSqM).toBeGreaterThan(0)
  })

  test('renderEntry drops zeroed dimensions instead of claiming 0 m²', () => {
    const entry = KNOWLEDGE_ENTRIES.find((candidate) => candidate.id === 'circulation-width')
    const rendered = renderEntry(entry as never) as {
      dimensions: { minimumSqM?: number; minWidthM?: number }
    }

    expect(rendered.dimensions.minimumSqM).toBeUndefined()
    expect(rendered.dimensions.minWidthM).toBe(0.9)
  })

  test('topics are listable for docs and tooling', () => {
    const topics = listKnowledgeTopics()
    expect(topics).toContain('bedroom')
    expect(topics).toContain('corridor')
  })
})
