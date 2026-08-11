import { beforeEach, describe, expect, test } from 'bun:test'
import { createAgent } from '../agent/agent'
import { createConversationMemory } from '../memory/conversation'
import { createMockProvider, type MockTurn } from '../provider/mock'
import { createFakeScene, type FakeScene, seedBuilding } from '../testing/fake-scene'
import { createToolRegistry } from '../tools/registry'
import { createSceneTools } from '../tools/scene'
import { createSnapshotTools } from '../tools/snapshot-tools'
import type { SelectionSnapshot } from '../tools/types'
import { createSnapshotStore, type SnapshotStore } from './snapshots'

const ROOM = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
]

let scene: FakeScene
let levelId: string
let store: SnapshotStore
let selection: SelectionSnapshot

function zoneCount(): number {
  return Object.values(scene.getNodes()).filter((node) => node.type === 'zone').length
}

async function buildRoom(name: string) {
  const registry = createToolRegistry({ tools: createSceneTools() })
  const outcome = await registry.execute(
    'create_room',
    JSON.stringify({ name, polygon: ROOM, levelId }),
    {
      scene,
      selection,
      limits: { maxNodesPerCall: 120, maxCoordinate: 1000, maxNodesPerRead: 200 },
    },
  )
  if (!outcome.ok) throw new Error(outcome.message)
}

beforeEach(() => {
  scene = createFakeScene()
  levelId = seedBuilding(scene).levelId
  selection = { buildingId: null, levelId, zoneId: null, selectedIds: [] }
  store = createSnapshotStore({ scene })
})

describe('snapshot store', () => {
  test('captures and restores a design', async () => {
    await buildRoom('Original')
    const original = store.capture({ label: 'Original layout' })
    expect(original.stats.spaces).toBe(1)

    await buildRoom('Extra')
    expect(zoneCount()).toBe(2)

    store.restore(original.id)
    expect(zoneCount()).toBe(1)
  })

  test('a snapshot does not share structure with the live scene', async () => {
    await buildRoom('Original')
    const snapshot = store.capture({ label: 'Base' })

    await buildRoom('Later')
    // The captured graph must still describe one room, not two.
    expect(store.get(snapshot.id)?.stats.spaces).toBe(1)
  })

  test('restoring saves the current state first, so nothing is lost', async () => {
    await buildRoom('A')
    const base = store.capture({ label: 'Base' })

    await buildRoom('B')
    expect(zoneCount()).toBe(2)

    const { savedCurrent } = store.restore(base.id)
    expect(zoneCount()).toBe(1)

    // The two-room state is still reachable.
    store.restore(savedCurrent.id)
    expect(zoneCount()).toBe(2)
  })

  test('restoring an unknown id throws rather than wiping the scene', async () => {
    await buildRoom('A')
    expect(() => store.restore('snap_nope')).toThrow('No snapshot')
    expect(zoneCount()).toBe(1)
  })

  test('tracks which snapshot the scene is sitting on', async () => {
    await buildRoom('A')
    const first = store.capture({ label: 'First' })
    expect(store.current()).toBeNull()

    store.restore(first.id)
    expect(store.current()).toBe(first.id)
  })

  test('evicts the oldest but never the one in use', async () => {
    const limited = createSnapshotStore({ scene, maxSnapshots: 3 })
    await buildRoom('A')

    const first = limited.capture({ label: 'First' })
    limited.restore(first.id)

    for (let index = 0; index < 5; index += 1) {
      limited.capture({ label: `Filler ${index}` })
    }

    expect(limited.list().length).toBeLessThanOrEqual(3)
    expect(limited.get(first.id)).toBeDefined()
  })

  test('records stats so the UI can compare options', async () => {
    await buildRoom('Living')
    const snapshot = store.capture({ label: 'One room' })

    expect(snapshot.stats.spaces).toBe(1)
    expect(snapshot.stats.floorAreaSqM).toBe(16)
    expect(snapshot.stats.nodes).toBeGreaterThan(3)
  })
})

describe('snapshot tools', () => {
  function agentWith(turns: MockTurn[]) {
    return createAgent(
      {
        provider: createMockProvider({ turns }),
        tools: createToolRegistry({ tools: [...createSceneTools(), ...createSnapshotTools()] }),
        scene,
        getSelection: () => selection,
        historyStore: scene.temporalStore,
        memory: createConversationMemory(),
        snapshots: store,
      },
      { maxSteps: 12, autoCorrect: false },
    )
  }

  test('the agent can branch, build an alternative and come back', async () => {
    await buildRoom('Original')

    const agent = agentWith([
      { toolCalls: [{ name: 'save_snapshot', arguments: { label: 'Original layout' } }] },
      {
        toolCalls: [
          { name: 'create_room', arguments: { name: 'Alternative wing', polygon: ROOM, levelId } },
        ],
      },
      {
        toolCalls: [
          {
            name: 'save_snapshot',
            arguments: { label: 'Two-wing layout', isAlternative: true },
          },
        ],
      },
      { toolCalls: [{ name: 'list_snapshots', arguments: {} }] },
      { text: 'Two options saved.' },
    ])

    const result = await agent.run({ text: 'Give me another option' })

    expect(result.status).toBe('completed')
    const labels = store.list().map((snapshot) => snapshot.label)
    expect(labels).toContain('Original layout')
    expect(labels).toContain('Two-wing layout')
  })

  test('list_snapshots hides the automatic safety-net captures', async () => {
    await buildRoom('A')
    const base = store.capture({ label: 'Base' })
    store.restore(base.id) // creates an 'auto' snapshot

    const registry = createToolRegistry({ tools: createSnapshotTools() })
    const outcome = await registry.execute('list_snapshots', '{}', {
      scene,
      selection,
      limits: { maxNodesPerCall: 120, maxCoordinate: 1000, maxNodesPerRead: 200 },
      snapshots: store,
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const listed = (outcome.result as { snapshots: { label: string }[] }).snapshots
    expect(listed.every((entry) => !entry.label.startsWith('Before restoring'))).toBe(true)
  })

  test('restore_snapshot fails usefully on a bad id', async () => {
    const registry = createToolRegistry({ tools: createSnapshotTools() })
    const outcome = await registry.execute(
      'restore_snapshot',
      JSON.stringify({ snapshotId: 'snap_nope' }),
      {
        scene,
        selection,
        limits: { maxNodesPerCall: 120, maxCoordinate: 1000, maxNodesPerRead: 200 },
        snapshots: store,
      },
    )

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.code).toBe('not_found')
      expect(outcome.hint).toContain('list_snapshots')
    }
  })

  test('degrades cleanly when the host keeps no snapshots', async () => {
    const registry = createToolRegistry({ tools: createSnapshotTools() })
    const outcome = await registry.execute('save_snapshot', JSON.stringify({ label: 'Base' }), {
      scene,
      selection,
      limits: { maxNodesPerCall: 120, maxCoordinate: 1000, maxNodesPerRead: 200 },
    })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.hint).toContain('describe alternatives in words')
  })
})
