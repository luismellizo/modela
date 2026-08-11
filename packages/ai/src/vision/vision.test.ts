import { describe, expect, test } from 'bun:test'
import { createMockProvider } from '../provider/mock'
import { analyzeArchitecturalImage } from './analyze'
import { planFromExtraction, planOpenings } from './materialize'
import type { ArchitecturalExtraction } from './schema'
import { validateImageDataUrl } from './validate'

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0]
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46]

function dataUrl(mime: string, bytes: number[], padTo = 0): string {
  const payload = [...bytes, ...new Array(Math.max(0, padTo - bytes.length)).fill(0)]
  const binary = String.fromCharCode(...payload)
  return `data:${mime};base64,${btoa(binary)}`
}

describe('image validation', () => {
  test('accepts a real PNG', () => {
    const result = validateImageDataUrl(dataUrl('image/png', PNG_HEADER, 64))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mimeType).toBe('image/png')
  })

  test('accepts a real JPEG', () => {
    const result = validateImageDataUrl(dataUrl('image/jpeg', JPEG_HEADER, 64))
    expect(result.ok).toBe(true)
  })

  test('rejects a PDF wearing a PNG label', () => {
    const result = validateImageDataUrl(dataUrl('image/png', PDF_HEADER, 64))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('malformed')
  })

  test('rejects a JPEG declared as PNG', () => {
    const result = validateImageDataUrl(dataUrl('image/png', JPEG_HEADER, 64))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('type_mismatch')
  })

  test('rejects a disallowed type', () => {
    const result = validateImageDataUrl(dataUrl('image/svg+xml', PNG_HEADER, 64))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('unsupported_type')
  })

  test('rejects anything that is not a data URL', () => {
    const result = validateImageDataUrl('https://example.com/plan.png')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('not_a_data_url')
  })

  test('enforces the size limit', () => {
    const result = validateImageDataUrl(dataUrl('image/png', PNG_HEADER, 4096), {
      maxBytes: 1024,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('too_large')
  })

  test('rejects an empty payload', () => {
    const result = validateImageDataUrl('data:image/png;base64,')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('malformed')
  })

  test('rejects broken base64', () => {
    const result = validateImageDataUrl('data:image/png;base64,!!!not-base64!!!')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('malformed')
  })
})

const EXTRACTION: ArchitecturalExtraction = {
  kind: 'floor_plan',
  confidence: 'medium',
  project: { type: 'residential', units: 'metric', storeys: 1 },
  scale: { known: true, basis: '5.20 m dimension line on the living room' },
  spaces: [
    {
      name: 'Living',
      type: 'living',
      widthM: 5.2,
      depthM: 4.1,
      centre: [2.6, 2.05],
      source: 'observed',
    },
    {
      name: 'Bedroom',
      type: 'bedroom',
      widthM: null,
      depthM: null,
      centre: null,
      source: 'inferred',
    },
  ],
  walls: [],
  openings: [
    { kind: 'door', spaceName: 'Living', t: 0.5, widthM: 0.9, source: 'observed' },
    { kind: 'window', spaceName: 'Bedroom', t: null, widthM: null, source: 'inferred' },
  ],
  observed: ['5.20 m dimension on the living room'],
  inferred: ['Bedroom sized at the residential default'],
  unknown: ['Wall thickness', 'Orientation'],
  notes: 'Readable plan, partial dimensions.',
}

describe('analysis', () => {
  test('parses a well-formed extraction', async () => {
    const provider = createMockProvider({ turns: [], imageAnalysis: EXTRACTION })
    const result = await analyzeArchitecturalImage({
      provider,
      image: dataUrl('image/png', PNG_HEADER, 64),
      kind: 'floor_plan',
    })

    expect(result.spaces).toHaveLength(2)
    expect(result.unknown).toContain('Wall thickness')
  })

  test('refuses a provider that cannot see', async () => {
    const provider = createMockProvider({
      turns: [],
      imageAnalysis: EXTRACTION,
      supportsVision: false,
    })
    await expect(
      analyzeArchitecturalImage({
        provider,
        image: dataUrl('image/png', PNG_HEADER, 64),
        kind: 'floor_plan',
      }),
    ).rejects.toThrow('cannot read images')
  })

  test('rejects an invalid attachment before calling the model', async () => {
    const provider = createMockProvider({ turns: [], imageAnalysis: EXTRACTION })
    await expect(
      analyzeArchitecturalImage({
        provider,
        image: dataUrl('image/png', PDF_HEADER, 64),
        kind: 'floor_plan',
      }),
    ).rejects.toThrow()
  })

  test('rejects an extraction that does not match the schema', async () => {
    const provider = createMockProvider({
      turns: [],
      imageAnalysis: { kind: 'floor_plan', spaces: 'not an array' },
    })
    await expect(
      analyzeArchitecturalImage({
        provider,
        image: dataUrl('image/png', PNG_HEADER, 64),
        kind: 'floor_plan',
      }),
    ).rejects.toThrow('did not match the expected shape')
  })
})

describe('build plan', () => {
  test('turns spaces into create_room calls', () => {
    const plan = planFromExtraction(EXTRACTION, { levelId: 'level_1' })

    expect(plan.calls).toHaveLength(2)
    expect(plan.calls[0]?.tool).toBe('create_room')
    expect(plan.calls[0]?.assumed).toBe(false)
    expect(plan.calls[1]?.assumed).toBe(true)
    expect(plan.totalAreaSqM).toBeGreaterThan(0)
  })

  test('carries the three evidence buckets through to the plan', () => {
    const plan = planFromExtraction(EXTRACTION)
    expect(plan.observed).toEqual(EXTRACTION.observed)
    expect(plan.inferred).toEqual(EXTRACTION.inferred)
    expect(plan.unknown).toEqual(EXTRACTION.unknown)
  })

  test('warns loudly when the image has no scale', () => {
    const plan = planFromExtraction({
      ...EXTRACTION,
      scale: { known: false, basis: null },
    })
    expect(plan.warnings.join(' ')).toContain('no scale reference')
  })

  test('refuses to build from a non-architectural image', () => {
    const plan = planFromExtraction({ ...EXTRACTION, kind: 'not_architectural' })
    expect(plan.calls).toHaveLength(0)
    expect(plan.warnings[0]).toContain('does not show anything architectural')
  })

  test('lays unpositioned spaces out side by side instead of stacking them', () => {
    const plan = planFromExtraction({
      ...EXTRACTION,
      spaces: [
        { name: 'A', type: 'bedroom', widthM: 3, depthM: 3, centre: null, source: 'observed' },
        { name: 'B', type: 'bedroom', widthM: 3, depthM: 3, centre: null, source: 'observed' },
      ],
    })

    const first = plan.calls[0]?.arguments.polygon as [number, number][]
    const second = plan.calls[1]?.arguments.polygon as [number, number][]
    expect(first[0]?.[0]).toBe(0)
    expect(second[0]?.[0]).toBeGreaterThan(2.9)
  })

  test('openings are planned against real wall ids', () => {
    const calls = planOpenings(EXTRACTION, { Living: ['wall_a', 'wall_b'], Bedroom: ['wall_c'] })

    expect(calls).toHaveLength(2)
    expect(calls[0]?.tool).toBe('add_door')
    expect(calls[0]?.arguments.wallId).toBe('wall_a')
    expect(calls[1]?.tool).toBe('add_window')
    expect(calls[1]?.assumed).toBe(true)
  })

  test('openings for spaces that were not built are dropped', () => {
    expect(planOpenings(EXTRACTION, {})).toHaveLength(0)
  })
})
