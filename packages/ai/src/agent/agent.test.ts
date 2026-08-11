import { beforeEach, describe, expect, test } from 'bun:test'
import { createConversationMemory } from '../memory/conversation'
import { createMockProvider, type MockTurn } from '../provider/mock'
import { ProviderError } from '../provider/types'
import { createFakeScene, type FakeScene, seedBuilding } from '../testing/fake-scene'
import { createToolRegistry } from '../tools/registry'
import { createSceneTools } from '../tools/scene'
import type { SelectionSnapshot } from '../tools/types'
import { createAgent } from './agent'
import type { AgentEvent } from './events'

const SQUARE = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
]

let scene: FakeScene
let levelId: string
let selection: SelectionSnapshot

function buildAgent(turns: MockTurn[], options: { maxSteps?: number } = {}) {
  const provider = createMockProvider({ turns })
  const events: AgentEvent[] = []
  const agent = createAgent(
    {
      provider,
      tools: createToolRegistry({ tools: createSceneTools() }),
      scene,
      getSelection: () => selection,
      historyStore: scene.temporalStore,
      memory: createConversationMemory(),
    },
    { maxSteps: options.maxSteps ?? 8 },
  )
  return { agent, provider, events, onEvent: (event: AgentEvent) => events.push(event) }
}

beforeEach(() => {
  scene = createFakeScene()
  levelId = seedBuilding(scene).levelId
  selection = { buildingId: null, levelId, zoneId: null, selectedIds: [] }
})

describe('agent loop', () => {
  test('answers without tools when none are needed', async () => {
    const { agent, onEvent, events } = buildAgent([{ text: 'Metres, throughout.' }])
    const result = await agent.run({ text: 'What units does this use?', onEvent })

    expect(result.status).toBe('completed')
    expect(result.text).toBe('Metres, throughout.')
    expect(result.toolCalls).toBe(0)
    expect(result.undoSteps).toBe(0)
    expect(events.some((event) => event.type === 'turn-start')).toBe(true)
    expect(events.some((event) => event.type === 'turn-end')).toBe(true)
  })

  test('runs a tool then reports on it', async () => {
    const { agent, onEvent, events } = buildAgent([
      {
        toolCalls: [
          { name: 'create_room', arguments: { name: 'Bedroom', polygon: SQUARE, levelId } },
        ],
      },
      { text: 'Bedroom created, 16 m².' },
    ])

    const result = await agent.run({ text: 'Make a 4x4 bedroom', onEvent })

    expect(result.status).toBe('completed')
    expect(result.steps).toBe(2)
    expect(result.toolCalls).toBe(1)
    expect(result.text).toBe('Bedroom created, 16 m².')

    const zones = Object.values(scene.getNodes()).filter((node) => node.type === 'zone')
    expect(zones).toHaveLength(1)

    const toolEnd = events.find((event) => event.type === 'tool-end')
    expect(toolEnd?.type === 'tool-end' && toolEnd.ok).toBe(true)
    expect(events.some((event) => event.type === 'scene-changed')).toBe(true)
  })

  test('a whole turn collapses into one undo step', async () => {
    const { agent } = buildAgent([
      {
        toolCalls: [
          { name: 'create_room', arguments: { name: 'A', polygon: SQUARE, levelId } },
          { name: 'create_wall', arguments: { start: [0, 0], end: [4, 0], levelId } },
          { name: 'create_wall', arguments: { start: [4, 0], end: [4, 4], levelId } },
        ],
      },
      { text: 'Done.' },
    ])

    const historyBefore = scene.getHistory().pastCount
    const result = await agent.run({ text: 'Build it' })

    expect(result.undoSteps).toBe(3)
    // Three mutations went in, one history entry came out.
    expect(scene.getHistory().pastCount - historyBefore).toBe(1)
  })

  test('a read-only turn never touches the history', async () => {
    const { agent } = buildAgent([
      { toolCalls: [{ name: 'get_scene_overview', arguments: {} }] },
      { text: 'The scene is empty.' },
    ])

    const before = scene.getHistory().pastCount
    const result = await agent.run({ text: 'What is in the scene?' })

    expect(result.undoSteps).toBe(0)
    expect(scene.getHistory().pastCount).toBe(before)
  })

  test('a failing tool goes back to the model, which recovers', async () => {
    const { agent, onEvent, events } = buildAgent([
      { toolCalls: [{ name: 'add_door', arguments: { wallId: 'wall_missing', t: 0.5 } }] },
      {
        toolCalls: [{ name: 'create_room', arguments: { name: 'Hall', polygon: SQUARE, levelId } }],
      },
      { text: 'Recovered and built the hall.' },
    ])

    const result = await agent.run({ text: 'Add a door', onEvent })

    expect(result.status).toBe('completed')
    expect(result.toolCalls).toBe(2)

    const failure = events.find((event) => event.type === 'tool-end' && !event.ok)
    expect(failure?.type === 'tool-end' && failure.ok === false && failure.code).toBe('not_found')
  })

  test('an unknown tool name does not end the turn', async () => {
    const { agent } = buildAgent([
      { toolCalls: [{ name: 'nuke_scene', arguments: {} }] },
      { text: 'That tool does not exist, so I did nothing.' },
    ])

    const result = await agent.run({ text: 'Nuke it' })
    expect(result.status).toBe('completed')
    expect(result.toolCalls).toBe(1)
  })

  test('stops at maxSteps instead of looping forever', async () => {
    const turns: MockTurn[] = Array.from({ length: 10 }, () => ({
      toolCalls: [{ name: 'get_scene_overview', arguments: {} }],
    }))
    const { agent } = buildAgent(turns, { maxSteps: 3 })

    const result = await agent.run({ text: 'Keep looking' })

    expect(result.status).toBe('max-steps')
    expect(result.steps).toBe(3)
    expect(result.text).toContain('stopped after 3 steps')
  })

  test('cancellation stops the turn and still collapses history', async () => {
    const controller = new AbortController()
    const { agent, onEvent, events } = buildAgent([
      {
        toolCalls: [
          { name: 'create_room', arguments: { name: 'A', polygon: SQUARE, levelId } },
          { name: 'create_room', arguments: { name: 'B', polygon: SQUARE, levelId } },
        ],
      },
      { text: 'never reached' },
    ])

    // Abort as soon as the first tool has run.
    const wrapped = (event: AgentEvent) => {
      onEvent(event)
      if (event.type === 'tool-end') controller.abort()
    }

    const result = await agent.run({
      text: 'Build two rooms',
      signal: controller.signal,
      onEvent: wrapped,
    })

    expect(result.status).toBe('cancelled')
    expect(events.some((event) => event.type === 'cancelled')).toBe(true)
    // The first room survives — cancelling stops further work, it does not roll back.
    expect(Object.values(scene.getNodes()).filter((node) => node.type === 'zone')).toHaveLength(1)
  })

  test('provider failures surface as an error result, not a throw', async () => {
    const { agent, onEvent, events } = buildAgent([
      { error: new ProviderError('rate_limited', 'Too many requests') },
    ])

    const result = await agent.run({ text: 'Hello', onEvent })

    expect(result.status).toBe('error')
    expect(result.error?.code).toBe('rate_limited')
    expect(events.some((event) => event.type === 'error')).toBe(true)
  })

  test('the system turn carries the live scene and selection', async () => {
    const wallId = scene.createNode(
      {
        object: 'node',
        id: 'wall_sel',
        type: 'wall',
        parentId: levelId,
        start: [0, 0],
        end: [3, 0],
      } as never,
      levelId as never,
    )
    selection = { buildingId: null, levelId, zoneId: null, selectedIds: [wallId as string] }

    const { agent, provider } = buildAgent([{ text: 'ok' }])
    await agent.run({ text: 'Make this taller' })

    const system = provider.calls[0]?.messages[0]
    expect(system?.role).toBe('system')
    const content = system?.role === 'system' ? system.content : ''
    expect(content).toContain('Currently selected')
    expect(content).toContain('wall_sel')
  })

  test('tool specs are sent to the provider on every call', async () => {
    const { agent, provider } = buildAgent([{ text: 'ok' }])
    await agent.run({ text: 'Hello' })

    const names = provider.calls[0]?.tools?.map((tool) => tool.name) ?? []
    expect(names).toContain('create_room')
    expect(names).toContain('get_scene_overview')
    expect(names).toContain('add_window')
  })
})
