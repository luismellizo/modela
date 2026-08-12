import { beforeEach, describe, expect, test } from 'bun:test'
import type { AnyNodeId } from '@pascal-app/core/schema'
import { createFakeScene, type FakeScene, seedBuilding } from '../../testing/fake-scene'
import { createToolRegistry, type ToolRegistry } from '../registry'
import { DEFAULT_TOOL_LIMITS, type SelectionSnapshot, type ToolContext } from '../types'
import { createSceneTools } from './index'

const EMPTY_SELECTION: SelectionSnapshot = {
  buildingId: null,
  levelId: null,
  zoneId: null,
  selectedIds: [],
}

let scene: FakeScene
let registry: ToolRegistry
let levelId: string

function context(selection: SelectionSnapshot = EMPTY_SELECTION): ToolContext {
  return { scene, selection, limits: DEFAULT_TOOL_LIMITS }
}

async function call(name: string, args: unknown, selection?: SelectionSnapshot) {
  return registry.execute(name, JSON.stringify(args), context(selection))
}

function expectOk(outcome: Awaited<ReturnType<typeof call>>): Record<string, unknown> {
  if (!outcome.ok) throw new Error(`expected success, got ${outcome.code}: ${outcome.message}`)
  return outcome.result as Record<string, unknown>
}

/** Tool results are untyped by design; tests know the ids they get back. */
function nodeId(value: unknown): AnyNodeId {
  return value as AnyNodeId
}

beforeEach(() => {
  scene = createFakeScene()
  levelId = seedBuilding(scene).levelId
  registry = createToolRegistry({ tools: createSceneTools() })
})

describe('tool registry', () => {
  test('exposes JSON Schema specs for every tool', () => {
    const specs = registry.specs()
    expect(specs.length).toBeGreaterThan(10)
    for (const spec of specs) {
      expect(spec.name).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(spec.description.length).toBeGreaterThan(20)
      expect(spec.parameters).toHaveProperty('type', 'object')
    }
  })

  test('unknown tool fails without throwing', async () => {
    const outcome = await call('demolish_everything', {})
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.code).toBe('unknown_tool')
    expect(outcome.hint).toContain('create_room')
  })

  test('malformed JSON arguments are rejected', async () => {
    const outcome = await registry.execute('create_wall', '{not json', context())
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('invalid_arguments')
  })

  test('schema violations come back with a usable hint', async () => {
    const outcome = await call('add_door', { wallId: 'wall_1', t: 4 })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.code).toBe('invalid_arguments')
      expect(outcome.hint).toContain('t')
    }
  })
})

describe('create_room', () => {
  test('builds zone, slab, ceiling and one wall per edge', async () => {
    const result = expectOk(
      await call('create_room', {
        name: 'Main bedroom',
        polygon: [
          [0, 0],
          [4, 0],
          [4, 3.5],
          [0, 3.5],
        ],
        levelId,
      }),
    )

    expect(result.zoneId).toBeString()
    expect(result.slabId).toBeString()
    expect(result.ceilingId).toBeString()
    expect(result.wallIds).toBeArrayOfSize(4)
    expect(result.areaSqM).toBe(14)

    const nodes = Object.values(scene.getNodes())
    expect(nodes.filter((node) => node.type === 'wall')).toHaveLength(4)
    expect(nodes.filter((node) => node.type === 'zone')).toHaveLength(1)
  })

  test('is a single history entry, not one per node', async () => {
    const before = scene.getHistory().pastCount
    await call('create_room', {
      name: 'Kitchen',
      polygon: [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 3],
      ],
      levelId,
    })
    expect(scene.getHistory().pastCount - before).toBe(1)
  })

  test('falls back to the selected level', async () => {
    const result = expectOk(
      await call(
        'create_room',
        {
          name: 'Study',
          polygon: [
            [0, 0],
            [3, 0],
            [3, 3],
            [0, 3],
          ],
        },
        { ...EMPTY_SELECTION, levelId },
      ),
    )
    const resolved: string | null = scene.resolveLevelId(nodeId(result.zoneId))
    expect(resolved).toBe(levelId)
  })

  test('a polygon that repeats its first point does not become a dead wall', async () => {
    // Real behaviour seen from free models: they close the ring. Left alone the
    // duplicate becomes a zero-length wall and the design check blames the user.
    const result = expectOk(
      await call('create_room', {
        name: 'Closed ring',
        polygon: [
          [0, 0],
          [4, 0],
          [4, 5],
          [0, 5],
          [0, 0],
        ],
        levelId,
      }),
    )

    expect(result.wallIds).toBeArrayOfSize(4)
    expect(result.areaSqM).toBe(20)
  })

  test('refuses coordinates outside the allowed range', async () => {
    const outcome = await call('create_room', {
      name: 'Runaway',
      polygon: [
        [0, 0],
        [999_999, 0],
        [999_999, 10],
        [0, 10],
      ],
      levelId,
    })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('limit_exceeded')
  })

  test('a polygon with too many edges is refused', async () => {
    const polygon = Array.from({ length: 200 }, (_, index) => [index * 0.1, 0] as [number, number])
    const outcome = await call('create_room', { name: 'Absurd', polygon, levelId })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('limit_exceeded')
  })
})

describe('openings', () => {
  async function roomWithWalls() {
    const room = expectOk(
      await call('create_room', {
        name: 'Living',
        polygon: [
          [0, 0],
          [5, 0],
          [5, 4],
          [0, 4],
        ],
        levelId,
      }),
    )
    return (room.wallIds as string[])[0] as string
  }

  test('places a door at the requested fraction', async () => {
    const wallId = await roomWithWalls()
    const result = expectOk(await call('add_door', { wallId, t: 0.5 }))

    expect(result.doorId).toBeString()
    expect(result.wallLengthM).toBe(5)
    expect(result.localXM).toBe(2.5)
  })

  test('clamps a door that would overhang the wall end', async () => {
    const wallId = await roomWithWalls()
    const result = expectOk(await call('add_door', { wallId, t: 1, widthM: 1 }))

    expect(result.clamped).toBe(true)
    expect(result.localXM).toBe(4.5)
  })

  test('refuses a door wider than its wall', async () => {
    const wallId = await roomWithWalls()
    const outcome = await call('add_door', { wallId, t: 0.5, widthM: 6 })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.code).toBe('invalid_arguments')
      expect(outcome.message).toContain('too short')
    }
  })

  test('refuses a window that would poke through the wall head', async () => {
    const wallId = await roomWithWalls()
    const outcome = await call('add_window', {
      wallId,
      t: 0.5,
      heightM: 2.5,
      sillHeightM: 1.5,
    })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toContain('exceeds')
  })

  test('refuses to hang a door off a zone', async () => {
    const room = expectOk(
      await call('create_room', {
        name: 'Hall',
        polygon: [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
        levelId,
      }),
    )
    const outcome = await call('add_door', { wallId: room.zoneId, t: 0.5 })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toContain('expected wall')
  })
})

describe('mutation', () => {
  test('move_node translates a wall by the delta', async () => {
    const wall = expectOk(await call('create_wall', { start: [0, 0], end: [4, 0], levelId }))
    expectOk(await call('move_node', { nodeId: wall.wallId, deltaX: 1.5, deltaZ: 0 }))

    const moved = scene.getNode(nodeId(wall.wallId)) as unknown as {
      start: [number, number]
      end: [number, number]
    }
    expect(moved.start).toEqual([1.5, 0])
    expect(moved.end).toEqual([5.5, 0])
  })

  test('update_node refuses fields outside the whitelist', async () => {
    const wall = expectOk(await call('create_wall', { start: [0, 0], end: [3, 0], levelId }))
    const outcome = await call('update_node', {
      nodeId: wall.wallId,
      changes: { parentId: 'site_1', type: 'door' },
    })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.code).toBe('invalid_arguments')
      expect(outcome.message).toContain('parentId')
    }
  })

  test('update_node applies a whitelisted change', async () => {
    const wall = expectOk(await call('create_wall', { start: [0, 0], end: [3, 0], levelId }))
    expectOk(await call('update_node', { nodeId: wall.wallId, changes: { height: 3.2 } }))

    const updated = scene.getNode(nodeId(wall.wallId)) as unknown as { height: number }
    expect(updated.height).toBe(3.2)
  })

  test('reshape_space resizes the zone and its walls together', async () => {
    const room = expectOk(
      await call('create_room', {
        name: 'Bedroom',
        polygon: [
          [0, 0],
          [3, 0],
          [3, 3],
          [0, 3],
        ],
        levelId,
      }),
    )

    const result = expectOk(
      await call('reshape_space', {
        zoneId: room.zoneId,
        polygon: [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
        ],
      }),
    )

    expect(result.areaSqM).toBe(16)
    expect(result.wallsUpdated).toBe(4)

    const firstWall = scene.getNode(nodeId((room.wallIds as string[])[0])) as unknown as {
      end: [number, number]
    }
    expect(firstWall.end).toEqual([4, 0])
  })
})

describe('destructive tools', () => {
  test('delete_node is refused until the user confirms it', async () => {
    const wall = expectOk(await call('create_wall', { start: [0, 0], end: [3, 0], levelId }))
    const outcome = await call('delete_node', { nodeId: wall.wallId })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('needs_confirmation')
    expect(scene.getNode(nodeId(wall.wallId))).not.toBeNull()
  })

  test('delete_node runs once confirmed', async () => {
    const confirmed = createToolRegistry({
      tools: createSceneTools(),
      confirmed: new Set(['delete_node']),
    })
    const wall = expectOk(await call('create_wall', { start: [0, 0], end: [3, 0], levelId }))

    const outcome = await confirmed.execute(
      'delete_node',
      JSON.stringify({ nodeId: wall.wallId }),
      context(),
    )

    expect(outcome.ok).toBe(true)
    expect(scene.getNode(nodeId(wall.wallId))).toBeNull()
  })
})

describe('read tools', () => {
  test('get_scene_overview reports areas and counts', async () => {
    await call('create_room', {
      name: 'Living',
      polygon: [
        [0, 0],
        [5, 0],
        [5, 4],
        [0, 4],
      ],
      levelId,
    })

    const overview = expectOk(await call('get_scene_overview', {})) as unknown as {
      totals: { spaces: number; walls: number; floorAreaSqM: number }
      empty: boolean
    }

    expect(overview.empty).toBe(false)
    expect(overview.totals.spaces).toBe(1)
    expect(overview.totals.walls).toBe(4)
    expect(overview.totals.floorAreaSqM).toBe(20)
  })

  test('get_selection resolves what the user picked', async () => {
    const wall = expectOk(await call('create_wall', { start: [0, 0], end: [3, 0], levelId }))
    const result = expectOk(
      await call(
        'get_selection',
        {},
        {
          ...EMPTY_SELECTION,
          levelId,
          selectedIds: [wall.wallId as string],
        },
      ),
    ) as unknown as { nodes: { id: string; type: string }[] }

    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]?.type).toBe('wall')
  })

  test('find_nodes filters by type and caps the result', async () => {
    for (let index = 0; index < 5; index += 1) {
      await call('create_wall', { start: [0, index], end: [3, index], levelId })
    }
    const result = expectOk(await call('find_nodes', { type: 'wall', limit: 2 })) as unknown as {
      total: number
      truncated: boolean
      nodes: unknown[]
    }

    expect(result.total).toBe(5)
    expect(result.truncated).toBe(true)
    expect(result.nodes).toHaveLength(2)
  })

  test('describe_node reports ancestry', async () => {
    const wall = expectOk(await call('create_wall', { start: [0, 0], end: [3, 0], levelId }))
    const result = expectOk(await call('describe_node', { nodeId: wall.wallId })) as unknown as {
      ancestry: { type: string }[]
      levelId: string
    }

    expect(result.levelId).toBe(levelId)
    expect(result.ancestry.map((node) => node.type)).toEqual(['site', 'building', 'level'])
  })

  test('describe_node on a missing id fails cleanly', async () => {
    const outcome = await call('describe_node', { nodeId: 'wall_nope' })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('not_found')
  })
})

describe('catalog', () => {
  test('search_items finds a bed', async () => {
    const result = expectOk(await call('search_items', { query: 'bed' })) as unknown as {
      items: { id: string }[]
    }
    expect(result.items.length).toBeGreaterThan(0)
  })

  test('place_item rejects an unknown asset id', async () => {
    const outcome = await call('place_item', {
      assetId: 'flying-carpet',
      position: [1, 1],
      levelId,
    })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.code).toBe('not_found')
      expect(outcome.hint).toContain('search_items')
    }
  })

  test('place_item places a real catalog asset', async () => {
    const search = expectOk(await call('search_items', { query: 'bed' })) as unknown as {
      items: { id: string }[]
    }
    const assetId = search.items[0]?.id as string

    const result = expectOk(
      await call('place_item', { assetId, position: [2, 2], levelId, rotationDeg: 90 }),
    )
    expect(result.itemId).toBeString()

    const item = scene.getNode(nodeId(result.itemId)) as unknown as {
      position: [number, number, number]
      rotation: [number, number, number]
    }
    expect(item.position).toEqual([2, 0, 2])
    expect(item.rotation[1]).toBeCloseTo(Math.PI / 2, 6)
  })
})
