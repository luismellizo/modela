import { beforeEach, describe, expect, test } from 'bun:test'
import type { AnyNode } from '@pascal-app/core/schema'
import { createFakeScene, type FakeScene, seedBuilding } from '../testing/fake-scene'
import { DEFAULT_OBJECTIVES } from './objectives'
import { compareLayouts, scoreLayout } from './score'
import { classifySpace } from './spaces'

let scene: FakeScene
let levelId: string

function add(node: Record<string, unknown>): void {
  scene.seed([{ object: 'node', parentId: levelId, ...node } as unknown as AnyNode])
}

/** A room with four walls, optionally with a door and windows on given edges. */
function room(
  name: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  options: { door?: number; windows?: number[] } = {},
) {
  const polygon: [number, number][] = [
    [x, z],
    [x + width, z],
    [x + width, z + depth],
    [x, z + depth],
  ]
  const slug = name.toLowerCase().replace(/\s+/g, '-')
  add({ id: `zone_${slug}`, type: 'zone', name, polygon, ceilingHeight: 2.7 })

  for (const [index, start] of polygon.entries()) {
    const end = polygon[(index + 1) % polygon.length] as [number, number]
    add({
      id: `wall_${slug}_${index}`,
      type: 'wall',
      start,
      end,
      height: 2.7,
      thickness: 0.2,
      children: [],
    })
  }

  if (options.door !== undefined) {
    add({
      id: `door_${slug}`,
      type: 'door',
      parentId: `wall_${slug}_${options.door}`,
      wallId: `wall_${slug}_${options.door}`,
      position: [1, 1.05, 0],
      width: 0.9,
      height: 2.1,
    })
  }

  for (const edge of options.windows ?? []) {
    add({
      id: `window_${slug}_${edge}`,
      type: 'window',
      parentId: `wall_${slug}_${edge}`,
      wallId: `wall_${slug}_${edge}`,
      position: [1, 1.65, 0],
      width: 1.2,
      height: 1.2,
    })
  }
}

function objective(id: string) {
  return scoreLayout({ scene }).objectives.find((entry) => entry.id === id)
}

beforeEach(() => {
  scene = createFakeScene()
  levelId = seedBuilding(scene).levelId
})

describe('space classification', () => {
  test('recognises both languages', () => {
    expect(classifySpace('Main bedroom')).toBe('bedroom')
    expect(classifySpace('Habitación principal')).toBe('bedroom')
    expect(classifySpace('Cocina')).toBe('kitchen')
    expect(classifySpace('Baño 2')).toBe('bathroom')
    // Combined name: reads as living, so it is measured against the larger
    // area target. Adjacency still finds it as the dining end of the pair.
    expect(classifySpace('Sala-comedor')).toBe('living')
    expect(classifySpace('Comedor')).toBe('dining')
    expect(classifySpace('Pasillo')).toBe('circulation')
    expect(classifySpace('Garaje')).toBe('garage')
  })

  test('an unrecognised name becomes other rather than a guess', () => {
    expect(classifySpace('Zone 7')).toBe('other')
    expect(classifySpace('')).toBe('other')
  })
})

describe('objectives', () => {
  test('every objective declares what it does and does not measure', () => {
    for (const entry of DEFAULT_OBJECTIVES) {
      expect(entry.basis.length).toBeGreaterThan(20)
      expect(entry.defaultWeight).toBeGreaterThan(0)
    }
  })

  test('an empty level scores nothing rather than scoring zero', () => {
    const score = scoreLayout({ scene })
    expect(score.spacesScored).toBe(0)
    expect(score.objectives.every((entry) => !entry.applicable)).toBe(true)
  })

  test('target-areas flags an undersized room with its number', () => {
    room('Bedroom', 0, 0, 2, 2)

    const result = objective('target-areas')
    expect(result?.applicable).toBe(true)
    expect(result?.score).toBeLessThan(0.7)
    expect(result?.reason).toContain('below conventional minimum')
    expect(result?.improvement).toContain('reshape_space')
  })

  test('target-areas is satisfied by comfortable rooms', () => {
    room('Bedroom', 0, 0, 4, 4)
    room('Living', 6, 0, 5, 5)

    const result = objective('target-areas')
    expect(result?.score).toBe(1)
    expect(result?.improvement).toBeUndefined()
  })

  test('daylight rewards windows and names the dark rooms', () => {
    room('Bedroom', 0, 0, 4, 4, { windows: [0] })
    room('Living', 6, 0, 5, 5)

    const result = objective('daylight')
    expect(result?.reason).toContain('1 of 2 habitable space(s) have windows')
    expect(result?.improvement).toContain('Living')
  })

  test('daylight is skipped when there is nothing habitable', () => {
    room('Garaje', 0, 0, 6, 6)
    expect(objective('daylight')?.applicable).toBe(false)
  })

  test('circulation penalises a plan that is mostly corridor', () => {
    room('Pasillo', 0, 0, 10, 4)
    room('Bedroom', 12, 0, 3, 3)

    const result = objective('circulation')
    expect(result?.score).toBeLessThan(0.5)
    expect(result?.improvement).toContain('corridors')
  })

  test('circulation is happy with a modest share', () => {
    room('Living', 0, 0, 6, 6)
    room('Pasillo', 7, 0, 3, 1)

    expect(objective('circulation')?.score).toBe(1)
  })

  test('day-night zoning needs both halves to say anything', () => {
    room('Bedroom', 0, 0, 4, 4)
    expect(objective('day-night-zoning')?.applicable).toBe(false)
  })

  test('day-night zoning rewards separation, at equal plan size', () => {
    // The score is scaled by the plan's own span, so both layouts have to span
    // the same distance or the comparison measures the wrong thing.
    room('Living', 0, 0, 5, 5)
    room('Bedroom', 15, 0, 4, 4)
    const separated = objective('day-night-zoning')?.score ?? 0

    scene = createFakeScene()
    levelId = seedBuilding(scene).levelId
    room('Living', 0, 0, 5, 5)
    room('Bedroom', 5, 0, 4, 4)
    room('Garaje', 15, 0, 4, 4)
    const adjacent = objective('day-night-zoning')?.score ?? 0

    expect(separated).toBeGreaterThan(adjacent)
    expect(adjacent).toBeLessThan(1)
  })

  test('adjacency prefers a kitchen near the dining room', () => {
    room('Cocina', 0, 0, 3, 3)
    room('Comedor', 3, 0, 3, 3)
    const near = objective('adjacency')?.score ?? 0

    scene = createFakeScene()
    levelId = seedBuilding(scene).levelId
    room('Cocina', 0, 0, 3, 3)
    room('Comedor', 40, 0, 3, 3)
    const far = objective('adjacency')?.score ?? 0

    expect(near).toBeGreaterThan(far)
  })

  test('adjacency accepts a combined living-dining as the dining end', () => {
    room('Cocina', 0, 0, 3, 3)
    room('Sala-comedor', 3, 0, 6, 5)

    const result = objective('adjacency')
    expect(result?.applicable).toBe(true)
    expect(result?.reason).toContain('kitchen→dining')
  })

  test('compactness penalises a scattered plan', () => {
    room('Living', 0, 0, 4, 4)
    room('Bedroom', 30, 30, 4, 4)

    const result = objective('compactness')
    expect(result?.score).toBeLessThan(0.5)
    expect(result?.improvement).toContain('Pull the spaces together')
  })
})

describe('scoring', () => {
  test('a decent layout scores well and reports what it measured', () => {
    room('Living', 0, 0, 5, 5, { door: 0, windows: [0] })
    room('Cocina', 5, 0, 3, 4, { door: 0, windows: [0] })
    room('Comedor', 8, 0, 3, 4, { door: 0 })
    room('Bedroom', 0, 6, 4, 4, { door: 2, windows: [2] })
    room('Baño', 5, 6, 2, 2, { door: 0 })

    const score = scoreLayout({ scene })
    expect(score.spacesScored).toBe(5)
    expect(score.total).toBeGreaterThan(0.5)
    expect(score.disclaimer).toContain('No daylight, thermal or cost simulation')
  })

  test('weakest is ranked worst-first so the agent knows where to start', () => {
    room('Bedroom', 0, 0, 2, 2)
    room('Living', 20, 20, 3, 3)

    const score = scoreLayout({ scene })
    expect(score.weakest.length).toBeGreaterThan(0)
    for (let index = 1; index < score.weakest.length; index += 1) {
      const previous = score.weakest[index - 1]
      const current = score.weakest[index]
      if (previous && current) expect(previous.score).toBeLessThanOrEqual(current.score)
    }
  })

  test('the hemisphere flips which façade counts as sunny', () => {
    room('Living', 0, 0, 5, 5, { windows: [0] })
    room('Bedroom', 0, 8, 4, 4, { windows: [2] })

    const north = scoreLayout({ scene, hemisphere: 'north' })
    const south = scoreLayout({ scene, hemisphere: 'south' })

    const reason = (score: typeof north) =>
      score.objectives.find((entry) => entry.id === 'daylight')?.reason ?? ''

    expect(reason(north)).toContain('south')
    expect(reason(south)).toContain('north')
  })

  test('custom weights change the total', () => {
    room('Bedroom', 0, 0, 2, 2, { windows: [0] })
    room('Living', 3, 0, 6, 6, { windows: [0] })

    const balanced = scoreLayout({ scene }).total
    const areaHeavy = scoreLayout({ scene, weights: { 'target-areas': 20 } }).total

    expect(areaHeavy).not.toBe(balanced)
  })
})

describe('comparison', () => {
  const layout = (label: string, total: number, objectives: Record<string, number>) => ({
    label,
    score: {
      total,
      objectives: Object.entries(objectives).map(([id, score]) => ({
        id: id as never,
        score,
        reason: `${id} at ${score}`,
        applicable: true,
      })),
      weakest: [],
      spacesScored: 3,
      disclaimer: 'heuristics',
    },
  })

  test('ranks by total and explains what separated the top two', () => {
    const result = compareLayouts([
      layout('B', 0.6, { daylight: 0.5, circulation: 0.8 }),
      layout('A', 0.8, { daylight: 0.9, circulation: 0.8 }),
    ])

    expect(result.ranked[0]?.label).toBe('A')
    expect(result.verdict).toContain('"A" leads on daylight')
  })

  test('mentions where the runner-up is actually better', () => {
    const result = compareLayouts([
      layout('A', 0.75, { daylight: 0.95, circulation: 0.4 }),
      layout('B', 0.7, { daylight: 0.5, circulation: 0.95 }),
    ])

    expect(result.verdict).toContain('circulation')
    expect(result.verdict).toContain('worth weighing')
  })

  test('says so when two options are effectively tied', () => {
    const result = compareLayouts([
      layout('A', 0.8, { daylight: 0.8, circulation: 0.8 }),
      layout('B', 0.8, { daylight: 0.81, circulation: 0.79 }),
    ])

    expect(result.verdict).toContain('almost identically')
    expect(result.verdict).toContain('this cannot measure')
  })

  test('a single option has nothing to beat', () => {
    const result = compareLayouts([layout('A', 0.8, { daylight: 0.8 })])
    expect(result.verdict).toContain('nothing to beat')
  })
})
