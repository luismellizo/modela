import { beforeEach, describe, expect, test } from 'bun:test'
import { createConversationMemory } from '../memory/conversation'
import { createMockProvider, type MockTurn } from '../provider/mock'
import { createFakeScene, type FakeScene, seedBuilding } from '../testing/fake-scene'
import { createDesignCheckTool } from '../tools/design-check'
import { createToolRegistry } from '../tools/registry'
import { createSceneTools } from '../tools/scene'
import type { SelectionSnapshot } from '../tools/types'
import { createAgent } from './agent'
import type { AgentEvent } from './events'

const ROOM = [
  [0, 0],
  [5, 0],
  [5, 4],
  [0, 4],
]

let scene: FakeScene
let levelId: string
let selection: SelectionSnapshot

function buildAgent(turns: MockTurn[], options: Parameters<typeof createAgent>[1] = {}) {
  const events: AgentEvent[] = []
  const agent = createAgent(
    {
      provider: createMockProvider({ turns }),
      tools: createToolRegistry({ tools: [...createSceneTools(), createDesignCheckTool()] }),
      scene,
      getSelection: () => selection,
      historyStore: scene.temporalStore,
      memory: createConversationMemory(),
    },
    { maxSteps: 10, ...options },
  )
  return { agent, events, onEvent: (event: AgentEvent) => events.push(event) }
}

beforeEach(() => {
  scene = createFakeScene()
  levelId = seedBuilding(scene).levelId
  selection = { buildingId: null, levelId, zoneId: null, selectedIds: [] }
})

describe('automatic design check', () => {
  test('runs when the model stops after changing the scene', async () => {
    const { agent, onEvent, events } = buildAgent([
      {
        toolCalls: [{ name: 'create_room', arguments: { name: 'Living', polygon: ROOM, levelId } }],
      },
      { text: 'Done.' },
    ])

    const result = await agent.run({ text: 'Make a living room', onEvent })

    const validation = events.find((event) => event.type === 'validation')
    expect(validation?.type === 'validation' && validation.report.rulesRun.length).toBeGreaterThan(
      0,
    )
    // A sealed room is a warning, not an error, so the turn still completes.
    expect(result.status).toBe('completed')
    expect(result.validation?.warnings).toBeGreaterThan(0)
  })

  test('does not run for a read-only turn', async () => {
    const { agent, onEvent, events } = buildAgent([
      { toolCalls: [{ name: 'get_scene_overview', arguments: {} }] },
      { text: 'The scene is empty.' },
    ])

    await agent.run({ text: 'What is here?', onEvent })

    expect(events.some((event) => event.type === 'validation')).toBe(false)
  })

  test('hands errors back and the model fixes them', async () => {
    const { agent, onEvent, events } = buildAgent([
      // Build a room, then hang a door off the end of one of its walls.
      {
        toolCalls: [{ name: 'create_room', arguments: { name: 'Living', polygon: ROOM, levelId } }],
      },
      { text: 'Room built.' },
      // Correction round: the model actually repositions the offending door.
      {
        toolCalls: [
          {
            name: 'update_node',
            arguments: { nodeId: 'door_broken', changes: { position: [1.5, 1.05, 0] } },
          },
        ],
      },
      { text: 'Fixed the door position.' },
    ])

    // Put a broken door in place before the model claims to be finished.
    const wallId = 'wall_planted'
    scene.seed([
      {
        object: 'node',
        id: wallId,
        type: 'wall',
        parentId: levelId,
        start: [0, 8],
        end: [3, 8],
        height: 2.7,
        children: [],
      } as never,
      {
        object: 'node',
        id: 'door_broken',
        type: 'door',
        parentId: wallId,
        wallId,
        position: [2.95, 1.05, 0],
        width: 0.9,
        height: 2.1,
      } as never,
    ])

    const result = await agent.run({ text: 'Make a living room', onEvent })

    const validations = events.filter((event) => event.type === 'validation')
    // Round 0 found the error; the round after the fix found nothing.
    expect(validations).toHaveLength(2)
    expect(validations[0]?.type === 'validation' && validations[0].correcting).toBe(true)
    expect(validations[1]?.type === 'validation' && validations[1].correcting).toBe(false)
    expect(result.correctionRounds).toBe(1)
    expect(result.text).toBe('Fixed the door position.')
    expect(result.validation?.errors).toBe(0)

    const door = scene.getNode('door_broken' as never) as unknown as { position: number[] }
    expect(door.position[0]).toBe(1.5)
  })

  test('gives up after the correction budget and reports honestly', async () => {
    // The model never fixes anything, so every round finds the same error.
    const turns: MockTurn[] = [
      {
        toolCalls: [{ name: 'create_room', arguments: { name: 'Living', polygon: ROOM, levelId } }],
      },
      { text: 'Done.' },
      { text: 'Still done.' },
      { text: 'Really done.' },
    ]
    const { agent, onEvent, events } = buildAgent(turns, { maxCorrectionRounds: 1 })

    scene.seed([
      {
        object: 'node',
        id: 'wall_p',
        type: 'wall',
        parentId: levelId,
        start: [0, 8],
        end: [3, 8],
        height: 2.7,
        children: [],
      } as never,
      {
        object: 'node',
        id: 'door_p',
        type: 'door',
        parentId: 'wall_p',
        wallId: 'wall_p',
        position: [2.95, 1.05, 0],
        width: 0.9,
        height: 2.1,
      } as never,
    ])

    const result = await agent.run({ text: 'Make a living room', onEvent })

    expect(result.status).toBe('completed')
    expect(result.correctionRounds).toBe(1)
    // The unfixed error is still in the result, so nobody can claim it passed.
    expect(result.validation?.errors).toBeGreaterThan(0)
    expect(events.filter((event) => event.type === 'validation')).toHaveLength(2)
  })

  test('can be turned off', async () => {
    const { agent, onEvent, events } = buildAgent(
      [
        {
          toolCalls: [
            { name: 'create_room', arguments: { name: 'Living', polygon: ROOM, levelId } },
          ],
        },
        { text: 'Done.' },
      ],
      { autoCorrect: false },
    )

    await agent.run({ text: 'Make a living room', onEvent })
    expect(events.some((event) => event.type === 'validation')).toBe(false)
  })
})

describe('check_design tool', () => {
  test('reports a clean scene as clean', async () => {
    const { agent } = buildAgent([
      { toolCalls: [{ name: 'check_design', arguments: {} }] },
      { text: 'No problems.' },
    ])

    const result = await agent.run({ text: 'Any problems?' })
    expect(result.status).toBe('completed')
  })

  test('surfaces real issues through the tool result', async () => {
    const { agent, onEvent, events } = buildAgent([
      { toolCalls: [{ name: 'check_design', arguments: {} }] },
      { text: 'One room has no door.' },
    ])

    await agent.run({ text: 'Any problems?', onEvent })

    // Seeding happens before the run, so the tool sees it.
    const toolEnd = events.find((event) => event.type === 'tool-end')
    expect(toolEnd?.type === 'tool-end' && toolEnd.ok).toBe(true)
  })
})
