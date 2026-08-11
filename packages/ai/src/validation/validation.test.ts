import { beforeEach, describe, expect, test } from 'bun:test'
import type { AnyNode } from '@pascal-app/core/schema'
import { createFakeScene, type FakeScene, seedBuilding } from '../testing/fake-scene'
import { renderIssues, validateDesign } from './engine'
import { DEFAULT_RULES } from './rules'

let scene: FakeScene
let levelId: string

function add(node: Record<string, unknown>): string {
  scene.seed([{ object: 'node', parentId: levelId, ...node } as unknown as AnyNode])
  return node.id as string
}

function wall(id: string, start: [number, number], end: [number, number]) {
  return add({ id, type: 'wall', start, end, height: 2.7, thickness: 0.2, children: [] })
}

function squareRoom(prefix: string, x: number, z: number, size = 4) {
  const polygon: [number, number][] = [
    [x, z],
    [x + size, z],
    [x + size, z + size],
    [x, z + size],
  ]
  add({ id: `zone_${prefix}`, type: 'zone', name: prefix, polygon, ceilingHeight: 2.7 })
  for (const [index, start] of polygon.entries()) {
    const end = polygon[(index + 1) % polygon.length] as [number, number]
    wall(`wall_${prefix}_${index}`, start, end)
  }
  return polygon
}

function issuesFor(rule: string) {
  return validateDesign(scene).issues.filter((issue) => issue.rule === rule)
}

beforeEach(() => {
  scene = createFakeScene()
  levelId = seedBuilding(scene).levelId
})

describe('rule set', () => {
  test('every rule has an id, a severity and a description', () => {
    for (const rule of DEFAULT_RULES) {
      expect(rule.id).toMatch(/^[a-z][a-z-]*$/)
      expect(['error', 'warning', 'hint']).toContain(rule.severity)
      expect(rule.description.length).toBeGreaterThan(10)
    }
  })

  test('a clean room with a door and a window reports nothing above hint', () => {
    squareRoom('living', 0, 0)
    add({
      id: 'door_1',
      type: 'door',
      parentId: 'wall_living_0',
      wallId: 'wall_living_0',
      position: [2, 1.05, 0],
      width: 0.9,
      height: 2.1,
    })
    add({
      id: 'window_1',
      type: 'window',
      parentId: 'wall_living_1',
      wallId: 'wall_living_1',
      position: [2, 1.65, 0],
      width: 1.5,
      height: 1.5,
    })

    const report = validateDesign(scene)
    expect(report.errors).toBe(0)
    expect(report.warnings).toBe(0)
  })
})

describe('opening-outside-wall', () => {
  test('catches a door hanging off the end of its wall', () => {
    wall('wall_1', [0, 0], [3, 0])
    add({
      id: 'door_bad',
      type: 'door',
      parentId: 'wall_1',
      wallId: 'wall_1',
      position: [2.9, 1.05, 0],
      width: 0.9,
      height: 2.1,
    })

    const issues = issuesFor('opening-outside-wall')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe('error')
    expect(issues[0]?.message).toContain('overhangs')
    expect(issues[0]?.fix).toContain('between 0.45 and 2.55 m')
    expect(issues[0]?.nodeIds).toContain('door_bad')
  })

  test('catches an opening wider than its wall', () => {
    wall('wall_short', [0, 0], [1, 0])
    add({
      id: 'window_wide',
      type: 'window',
      parentId: 'wall_short',
      wallId: 'wall_short',
      position: [0.5, 1.5, 0],
      width: 3,
      height: 1.5,
    })

    const issues = issuesFor('opening-outside-wall')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('3.00 m wide')
  })

  test('catches an opening attached to nothing', () => {
    scene.seed([
      {
        object: 'node',
        id: 'door_orphan',
        type: 'door',
        parentId: null,
        position: [0, 1, 0],
        width: 0.9,
        height: 2.1,
      } as unknown as AnyNode,
    ])

    const issues = issuesFor('opening-outside-wall')
    expect(issues[0]?.message).toContain('not attached to any wall')
  })

  test('a centred door is fine', () => {
    wall('wall_ok', [0, 0], [4, 0])
    add({
      id: 'door_ok',
      type: 'door',
      parentId: 'wall_ok',
      wallId: 'wall_ok',
      position: [2, 1.05, 0],
      width: 0.9,
      height: 2.1,
    })

    expect(issuesFor('opening-outside-wall')).toHaveLength(0)
  })
})

describe('room-without-access', () => {
  test('flags a sealed room', () => {
    squareRoom('vault', 0, 0)
    const issues = issuesFor('room-without-access')

    expect(issues).toHaveLength(1)
    expect(issues[0]?.fix).toContain('add_door')
    expect(issues[0]?.nodeIds).toContain('zone_vault')
  })

  test('a door on any boundary wall clears it', () => {
    squareRoom('hall', 0, 0)
    add({
      id: 'door_hall',
      type: 'door',
      parentId: 'wall_hall_2',
      wallId: 'wall_hall_2',
      position: [2, 1.05, 0],
      width: 0.9,
      height: 2.1,
    })

    expect(issuesFor('room-without-access')).toHaveLength(0)
  })

  test('boundary walls are matched by geometry, not by metadata', () => {
    // A zone whose walls were drawn by hand, with no roomName tag anywhere.
    add({
      id: 'zone_manual',
      type: 'zone',
      name: 'Manual',
      polygon: [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 3],
      ],
      ceilingHeight: 2.7,
    })
    wall('wall_m0', [0, 0], [3, 0])
    wall('wall_m1', [3, 0], [3, 3])
    wall('wall_m2', [3, 3], [0, 3])
    wall('wall_m3', [0, 3], [0, 0])
    add({
      id: 'door_m',
      type: 'door',
      parentId: 'wall_m0',
      wallId: 'wall_m0',
      position: [1.5, 1.05, 0],
      width: 0.9,
      height: 2.1,
    })

    expect(issuesFor('room-without-access')).toHaveLength(0)
  })
})

describe('overlapping-spaces', () => {
  test('flags two rooms sitting on each other', () => {
    squareRoom('a', 0, 0)
    squareRoom('b', 2, 2)

    const issues = issuesFor('overlapping-spaces')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.nodeIds).toContain('zone_a')
    expect(issues[0]?.nodeIds).toContain('zone_b')
  })

  test('rooms sharing a wall do not count as overlapping', () => {
    squareRoom('a', 0, 0)
    squareRoom('b', 4, 0)

    expect(issuesFor('overlapping-spaces')).toHaveLength(0)
  })
})

describe('dimension rules', () => {
  test('a centimetre-sized room is flagged as a units mistake', () => {
    add({
      id: 'zone_tiny',
      type: 'zone',
      name: 'Tiny',
      polygon: [
        [0, 0],
        [0.4, 0],
        [0.4, 0.4],
        [0, 0.4],
      ],
      ceilingHeight: 2.7,
    })

    const issues = issuesFor('unusable-room')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.fix).toContain('units')
  })

  test('a corridor too narrow to pass is flagged', () => {
    add({
      id: 'zone_slot',
      type: 'zone',
      name: 'Slot',
      polygon: [
        [0, 0],
        [6, 0],
        [6, 0.5],
        [0, 0.5],
      ],
      ceilingHeight: 2.7,
    })

    const issues = issuesFor('impassable-space')
    expect(issues[0]?.message).toContain('0.50 m across')
  })

  test('a zero-length wall is an error', () => {
    wall('wall_dead', [1, 1], [1, 1])
    expect(issuesFor('degenerate-wall')).toHaveLength(1)
  })
})

describe('reporting', () => {
  test('a broken rule is reported, not thrown', () => {
    const report = validateDesign(scene, [
      {
        id: 'exploding-rule',
        severity: 'error',
        description: 'Always throws, to prove the engine holds',
        check() {
          throw new Error('boom')
        },
      },
    ])

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0]?.severity).toBe('hint')
    expect(report.issues[0]?.message).toContain('boom')
  })

  test('renderIssues puts errors first and caps the list', () => {
    squareRoom('a', 0, 0)
    wall('wall_bad', [0, 10], [1, 10])
    add({
      id: 'door_bad',
      type: 'door',
      parentId: 'wall_bad',
      wallId: 'wall_bad',
      position: [0.9, 1.05, 0],
      width: 0.9,
      height: 2.1,
    })

    const rendered = renderIssues(validateDesign(scene))
    expect(rendered.indexOf('[error]')).toBeLessThan(rendered.indexOf('[warning]'))
  })

  test('an empty scene is clean', () => {
    const report = validateDesign(scene)
    expect(report.errors).toBe(0)
    expect(report.warnings).toBe(0)
    expect(renderIssues(report)).toBe('No issues found.')
  })
})
