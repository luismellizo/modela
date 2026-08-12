import type { AnyNode } from '@pascal-app/core/schema'
import { boundaryWalls, isZone } from '../validation/geometry'
import type { SceneView } from '../validation/types'
import type { Facing, ScoredSpace, SpaceKind } from './types'

/**
 * Resolving zones into something scoreable.
 *
 * The kind of a space is inferred from its **name**, because the scene graph has
 * no notion of "bedroom" — a zone is a polygon with a label. That makes this the
 * softest part of the whole scoring layer, so the matching is bilingual and
 * anything unrecognised becomes `other` and is skipped by the objectives that
 * depend on kind, rather than being guessed at.
 */

const KIND_PATTERNS: { kind: SpaceKind; patterns: RegExp }[] = [
  // Combined names first. "Sala-comedor" matches both `living` and `dining`,
  // and whichever pattern happened to be listed first would win by accident.
  // It reads as `living` because the area it should be measured against is the
  // larger one; `adjacency` compensates by accepting a living space as the
  // dining end of the kitchen pair when there is no separate dining room.
  { kind: 'living', patterns: /sala[- ]?comedor|living[- ]?dining|salón[- ]?comedor/i },
  { kind: 'bedroom', patterns: /bed|dormit|habitac|recamar|alcoba|cuarto|suite/i },
  { kind: 'bathroom', patterns: /bath|baño|bano|wc|toilet|aseo|ducha/i },
  { kind: 'kitchen', patterns: /kitchen|cocina|galley/i },
  { kind: 'dining', patterns: /dining|comedor/i },
  { kind: 'living', patterns: /living|sala|lounge|estar|family/i },
  {
    kind: 'circulation',
    patterns:
      /hall|corridor|pasillo|circulac|vestíbul|vestibul|entry|entrada|foyer|stair|escalera/i,
  },
  { kind: 'garage', patterns: /garage|garaje|parking|carport|cochera/i },
  {
    kind: 'service',
    patterns: /laundry|lavander|utility|storage|depósit|deposit|bodega|closet|despensa/i,
  },
  { kind: 'outdoor', patterns: /terrace|terraza|patio|balcon|balcón|deck|jard/i },
]

export function classifySpace(name: string): SpaceKind {
  for (const { kind, patterns } of KIND_PATTERNS) {
    if (patterns.test(name)) return kind
  }
  return 'other'
}

/** Habitable in the sense that matters here: people spend waking hours there. */
export function isHabitable(kind: SpaceKind): boolean {
  return kind === 'bedroom' || kind === 'living' || kind === 'dining' || kind === 'kitchen'
}

export function collectSpaces(view: SceneView, levelId: string): ScoredSpace[] {
  const nodes = view.byLevel.get(levelId) ?? []
  const zones = nodes.filter(isZone)
  const buildingCentre = centreOf(zones)

  return zones.map((zone) => {
    const polygon = ((zone.polygon ?? []) as [number, number][]).map(
      ([x, z]) => [x, z] as [number, number],
    )
    const walls = boundaryWalls(zone, view)

    const openings = walls.flatMap((wall) =>
      Object.values(view.nodes).filter(
        (node) =>
          (node.type === 'door' || node.type === 'window') &&
          (node.wallId ?? node.parentId) === wall.id,
      ),
    )

    const windows = openings.filter((node) => node.type === 'window')
    const doors = openings.filter((node) => node.type === 'door')

    const xs = polygon.map((point) => point[0])
    const zs = polygon.map((point) => point[1])
    const centre: [number, number] = [
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...zs) + Math.max(...zs)) / 2,
    ]

    return {
      id: zone.id,
      name: zone.name ?? 'Untitled',
      kind: classifySpace(zone.name ?? ''),
      areaSqM: round(area(polygon)),
      widthM: round(Math.max(...xs) - Math.min(...xs)),
      depthM: round(Math.max(...zs) - Math.min(...zs)),
      centre,
      polygon,
      windows: windows.length,
      doors: doors.length,
      windowFacings: windows
        .map((window) => facingOf(window, view, buildingCentre))
        .filter((facing): facing is Facing => facing !== null),
    }
  })
}

/**
 * Which way a window faces, approximated from the outward normal of its wall
 * relative to the building centroid.
 *
 * Approximate on purpose: the scene graph has no compass, so "north" here means
 * -Z in plan. The agent is told to confirm the real orientation with the user
 * rather than trust this as surveyed fact.
 */
function facingOf(
  window: AnyNode,
  view: SceneView,
  buildingCentre: [number, number],
): Facing | null {
  const wallId = (window as { wallId?: string }).wallId ?? window.parentId
  if (!wallId) return null
  const wall = view.nodes[wallId as keyof typeof view.nodes]
  if (wall?.type !== 'wall') return null

  const [sx, sz] = wall.start as [number, number]
  const [ex, ez] = wall.end as [number, number]
  const midX = (sx + ex) / 2
  const midZ = (sz + ez) / 2

  // Outward is whichever side of the wall points away from the building.
  const outX = midX - buildingCentre[0]
  const outZ = midZ - buildingCentre[1]

  if (Math.abs(outX) < 1e-6 && Math.abs(outZ) < 1e-6) return null
  if (Math.abs(outX) > Math.abs(outZ)) return outX > 0 ? 'east' : 'west'
  return outZ > 0 ? 'south' : 'north'
}

function centreOf(zones: (AnyNode & { type: 'zone' })[]): [number, number] {
  const points = zones.flatMap((zone) => (zone.polygon ?? []) as [number, number][])
  if (points.length === 0) return [0, 0]
  const xs = points.map((point) => point[0])
  const zs = points.map((point) => point[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]
}

export function area(polygon: [number, number][]): number {
  if (polygon.length < 3) return 0
  let total = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    if (!current || !next) continue
    total += current[0] * next[1] - next[0] * current[1]
  }
  return Math.abs(total) / 2
}

export function distance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function round(value: number): number {
  return Math.round(value * 100) / 100
}
