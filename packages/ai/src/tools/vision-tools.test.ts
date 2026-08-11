import { beforeEach, describe, expect, test } from 'bun:test'
import { createMockProvider } from '../provider/mock'
import { createFakeScene, type FakeScene, seedBuilding } from '../testing/fake-scene'
import type { ArchitecturalExtraction } from '../vision/schema'
import { createToolRegistry, type ToolRegistry } from './registry'
import { DEFAULT_TOOL_LIMITS, type ToolContext, type VisionContext } from './types'
import { createVisionTools } from './vision-tools'

const PNG = `data:image/png;base64,${btoa(
  String.fromCharCode(
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(56).fill(0)],
  ),
)}`

const EXTRACTION: ArchitecturalExtraction = {
  kind: 'floor_plan',
  confidence: 'high',
  project: { type: 'residential', units: 'metric', storeys: 1 },
  scale: { known: true, basis: 'printed 5.20 m dimension' },
  spaces: [
    {
      name: 'Living',
      type: 'living',
      widthM: 5.2,
      depthM: 4,
      centre: [2.6, 2],
      source: 'observed',
    },
  ],
  walls: [],
  openings: [{ kind: 'door', spaceName: 'Living', t: 0.5, widthM: 0.9, source: 'observed' }],
  observed: ['5.20 m dimension line'],
  inferred: ['2.60 m ceiling'],
  unknown: ['Orientation'],
  notes: 'Clear plan.',
}

let scene: FakeScene
let registry: ToolRegistry
let levelId: string

function context(vision?: Partial<VisionContext>): ToolContext {
  const provider = createMockProvider({ turns: [], imageAnalysis: EXTRACTION })
  return {
    scene,
    selection: { buildingId: null, levelId, zoneId: null, selectedIds: [] },
    limits: DEFAULT_TOOL_LIMITS,
    ...(vision === undefined
      ? {}
      : { vision: { provider, attachments: [], ...vision } as VisionContext }),
  }
}

async function call(name: string, args: unknown, ctx: ToolContext) {
  return registry.execute(name, JSON.stringify(args), ctx)
}

beforeEach(() => {
  scene = createFakeScene()
  levelId = seedBuilding(scene).levelId
  registry = createToolRegistry({ tools: createVisionTools() })
})

describe('analyze_image', () => {
  test('turns an attachment into an extraction and a build plan', async () => {
    const outcome = await call('analyze_image', { imageIndex: 0 }, context({ attachments: [PNG] }))

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const result = outcome.result as {
      observed: string[]
      inferred: string[]
      unknown: string[]
      plan: { calls: { tool: string }[]; totalAreaSqM: number }
    }

    expect(result.observed).toContain('5.20 m dimension line')
    expect(result.unknown).toContain('Orientation')
    expect(result.plan.calls[0]?.tool).toBe('create_room')
    expect(result.plan.totalAreaSqM).toBe(20.8)
  })

  test('fails clearly when the index points at nothing', async () => {
    const outcome = await call('analyze_image', { imageIndex: 3 }, context({ attachments: [PNG] }))

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.code).toBe('not_found')
      expect(outcome.hint).toContain('0..0')
    }
  })

  test('says so when the user attached nothing', async () => {
    const outcome = await call('analyze_image', {}, context({ attachments: [] }))

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.hint).toContain('has not attached any image')
  })

  test('degrades gracefully when the host has no vision at all', async () => {
    const outcome = await call('analyze_image', {}, context())

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.hint).toContain('scene data')
  })
})

describe('review_viewport', () => {
  test('captures the view and returns grounded observations', async () => {
    const provider = createMockProvider({
      turns: [],
      imageAnalysis: {
        observations: ['The corridor is 2.4 m wide'],
        suggestions: ['Move the bathroom door to shorten the route'],
        cannotTell: ['Ceiling height from this angle'],
      },
    })

    const outcome = await call(
      'review_viewport',
      { question: 'What would you improve?' },
      {
        ...context({ attachments: [] }),
        vision: { provider, attachments: [], captureViewport: async () => PNG },
      },
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const result = outcome.result as { suggestions: string[]; cannotTell: string[] }
    expect(result.suggestions).toHaveLength(1)
    expect(result.cannotTell).toHaveLength(1)
  })

  test('falls back to scene data when the capture returns nothing', async () => {
    const provider = createMockProvider({ turns: [], imageAnalysis: {} })
    const outcome = await call(
      'review_viewport',
      { question: 'How does it look?' },
      {
        ...context({ attachments: [] }),
        vision: { provider, attachments: [], captureViewport: async () => null },
      },
    )

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.hint).toContain('scene data')
  })

  test('falls back when the host cannot capture at all', async () => {
    const outcome = await call(
      'review_viewport',
      { question: 'How does it look?' },
      context({ attachments: [] }),
    )

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toContain('cannot capture the viewport')
  })

  test('rejects a question too vague to answer', async () => {
    const outcome = await call('review_viewport', { question: 'hm' }, context({ attachments: [] }))

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('invalid_arguments')
  })
})
