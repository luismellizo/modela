import { beforeEach, describe, expect, test } from 'bun:test'
import { createConversationMemory } from '../memory/conversation'
import { createMockProvider, type MockTurn } from '../provider/mock'
import { createFakeScene, type FakeScene, seedBuilding } from '../testing/fake-scene'
import { createProposalTool } from '../tools/proposal-tool'
import { createToolRegistry } from '../tools/registry'
import { createSceneTools } from '../tools/scene'
import type { SelectionSnapshot } from '../tools/types'
import { createAgent } from './agent'
import { applyProposal } from './apply-proposal'
import type { AgentEvent } from './events'
import type { Proposal } from './proposal'

const SQUARE = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
]

let scene: FakeScene
let levelId: string
let selection: SelectionSnapshot

const allTools = () => [...createSceneTools(), createProposalTool()]

function buildAgent(turns: MockTurn[]) {
  const events: AgentEvent[] = []
  const agent = createAgent(
    {
      provider: createMockProvider({ turns }),
      tools: createToolRegistry({ tools: allTools() }),
      scene,
      getSelection: () => selection,
      historyStore: scene.temporalStore,
      memory: createConversationMemory(),
    },
    { maxSteps: 8 },
  )
  return { agent, events, onEvent: (event: AgentEvent) => events.push(event) }
}

function room(name: string) {
  return {
    tool: 'create_room',
    arguments: { name, polygon: SQUARE, levelId },
    label: `${name} — 4 × 4 m (16 m²)`,
  }
}

beforeEach(() => {
  scene = createFakeScene()
  levelId = seedBuilding(scene).levelId
  selection = { buildingId: null, levelId, zoneId: null, selectedIds: [] }
})

describe('propose_plan', () => {
  test('stops the turn and hands the plan to the host', async () => {
    const { agent, onEvent, events } = buildAgent([
      {
        toolCalls: [
          {
            name: 'propose_plan',
            arguments: {
              title: '180 m² house',
              summary: 'Three bedrooms, two baths, open kitchen.',
              calls: [room('Bedroom'), room('Kitchen')],
              warnings: ['Ceiling height assumed at 2.60 m'],
            },
          },
        ],
      },
      { text: 'never reached' },
    ])

    const result = await agent.run({ text: 'Design a house', onEvent })

    expect(result.status).toBe('awaiting-approval')
    expect(result.proposal?.calls).toHaveLength(2)
    expect(result.steps).toBe(1)

    const event = events.find((entry) => entry.type === 'proposal')
    expect(event?.type === 'proposal' && event.proposal.title).toBe('180 m² house')

    // Nothing was built. That is the whole point.
    expect(Object.values(scene.getNodes()).filter((node) => node.type === 'zone')).toHaveLength(0)
  })

  test('a plan with an invalid call is refused before the user sees it', async () => {
    const { agent, onEvent, events } = buildAgent([
      {
        toolCalls: [
          {
            name: 'propose_plan',
            arguments: {
              title: 'Broken plan',
              summary: 'This one cannot run.',
              calls: [
                { tool: 'create_room', arguments: { name: 'X' }, label: 'X' },
                { tool: 'not_a_tool', arguments: {}, label: 'Y' },
              ],
            },
          },
        ],
      },
      { text: 'Let me fix that.' },
    ])

    const result = await agent.run({ text: 'Design a house', onEvent })

    expect(result.status).toBe('completed')
    const failure = events.find((entry) => entry.type === 'tool-end' && !entry.ok)
    expect(failure?.type === 'tool-end' && failure.ok === false && failure.hint).toContain(
      'calls[1] (not_a_tool)',
    )
  })

  test('the loop stops even if the model tries to keep building', async () => {
    const { agent } = buildAgent([
      {
        toolCalls: [
          {
            name: 'propose_plan',
            arguments: {
              title: 'A plan',
              summary: 'Two rooms to review.',
              calls: [room('A'), room('B')],
            },
          },
        ],
      },
      // A model that ignored the instruction would build here.
      {
        toolCalls: [
          { name: 'create_room', arguments: { name: 'Sneaky', polygon: SQUARE, levelId } },
        ],
      },
    ])

    const result = await agent.run({ text: 'Design a house' })

    expect(result.status).toBe('awaiting-approval')
    expect(Object.values(scene.getNodes()).filter((node) => node.type === 'zone')).toHaveLength(0)
  })
})

describe('applyProposal', () => {
  const proposal = (calls: Proposal['calls']): Proposal => ({
    id: 'proposal_test',
    title: 'Plan',
    summary: 'Summary',
    calls,
    warnings: [],
    createdAt: Date.now(),
  })

  test('runs every step and collapses into one undo', async () => {
    const before = scene.getHistory().pastCount

    const result = await applyProposal({
      proposal: proposal([room('Bedroom'), room('Kitchen'), room('Bath')]),
      tools: allTools(),
      scene,
      getSelection: () => selection,
      historyStore: scene.temporalStore,
    })

    expect(result.status).toBe('completed')
    expect(result.applied).toBe(3)
    expect(result.undoSteps).toBe(3)
    expect(scene.getHistory().pastCount - before).toBe(1)
    expect(Object.values(scene.getNodes()).filter((node) => node.type === 'zone')).toHaveLength(3)
  })

  test('emits the same events a normal turn does', async () => {
    const events: AgentEvent[] = []
    await applyProposal({
      proposal: proposal([room('Bedroom')]),
      tools: allTools(),
      scene,
      getSelection: () => selection,
      onEvent: (event) => events.push(event),
    })

    expect(events.some((event) => event.type === 'tool-start')).toBe(true)
    expect(events.some((event) => event.type === 'tool-end')).toBe(true)
    expect(events.some((event) => event.type === 'scene-changed')).toBe(true)
  })

  test('approving the plan approves its destructive steps', async () => {
    const wall = scene.createNode(
      {
        object: 'node',
        id: 'wall_doomed',
        type: 'wall',
        parentId: levelId,
        start: [0, 0],
        end: [2, 0],
      } as never,
      levelId as never,
    )

    const result = await applyProposal({
      proposal: proposal([
        {
          tool: 'delete_node',
          arguments: { nodeId: wall as string, cascade: true },
          label: 'Remove the old partition',
        },
      ]),
      tools: allTools(),
      scene,
      getSelection: () => selection,
    })

    expect(result.applied).toBe(1)
    expect(scene.getNode(wall)).toBeNull()
  })

  test('one bad step does not throw away the good ones', async () => {
    const result = await applyProposal({
      proposal: proposal([
        room('Good'),
        { tool: 'add_door', arguments: { wallId: 'wall_missing', t: 0.5 }, label: 'Door' },
        room('Also good'),
      ]),
      tools: allTools(),
      scene,
      getSelection: () => selection,
      historyStore: scene.temporalStore,
    })

    expect(result.status).toBe('partial')
    expect(result.applied).toBe(2)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.index).toBe(1)
  })

  test('cancelling stops between steps', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await applyProposal({
      proposal: proposal([room('A'), room('B')]),
      tools: allTools(),
      scene,
      getSelection: () => selection,
      signal: controller.signal,
    })

    expect(result.status).toBe('cancelled')
    expect(result.applied).toBe(0)
  })
})
