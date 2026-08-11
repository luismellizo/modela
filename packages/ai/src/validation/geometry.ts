import type { AnyNode } from '@pascal-app/core/schema'
import { polygonBounds, wallLength } from '@pascal-app/mcp/tools/geometry'
import type { SceneView } from './types'

/** Shared helpers for the rules. Kept apart so a rule stays readable. */

export type Vec2 = [number, number]

const TOLERANCE = 0.05

export function isWall(node: AnyNode): node is AnyNode & { type: 'wall' } {
  return node.type === 'wall'
}

export function isZone(node: AnyNode): node is AnyNode & { type: 'zone' } {
  return node.type === 'zone'
}

export function isOpening(node: AnyNode): node is AnyNode & { type: 'door' | 'window' } {
  return node.type === 'door' || node.type === 'window'
}

export function lengthOf(wall: { start: Vec2; end: Vec2 }): number {
  return wallLength(wall)
}

/**
 * Walls that form a zone's boundary.
 *
 * Matched by geometry rather than by the `roomName` metadata `create_room`
 * writes: a wall the user drew by hand, or one nudged after the fact, is still
 * part of the boundary and the rules have to see it.
 */
export function boundaryWalls(
  zone: AnyNode & { type: 'zone' },
  view: SceneView,
): (AnyNode & { type: 'wall' })[] {
  const polygon = (zone.polygon ?? []) as Vec2[]
  if (polygon.length < 3) return []

  const levelId = zone.parentId
  const candidates = (
    levelId ? (view.byLevel.get(levelId) ?? []) : Object.values(view.nodes)
  ).filter(isWall)

  const found: (AnyNode & { type: 'wall' })[] = []

  for (const [index, start] of polygon.entries()) {
    const end = polygon[(index + 1) % polygon.length]
    if (!end) continue
    const wall = candidates.find(
      (candidate) =>
        (near(candidate.start as Vec2, start) && near(candidate.end as Vec2, end)) ||
        (near(candidate.start as Vec2, end) && near(candidate.end as Vec2, start)),
    )
    if (wall && !found.includes(wall)) found.push(wall)
  }

  return found
}

export function near(a: Vec2, b: Vec2, tolerance = TOLERANCE): boolean {
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance
}

export function areaOf(polygon: Vec2[]): number {
  if (polygon.length < 3) return 0
  let area = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    if (!current || !next) continue
    area += current[0] * next[1] - next[0] * current[1]
  }
  return Math.abs(area) / 2
}

/**
 * Approximate overlap test: bounding boxes must intersect, and a vertex of one
 * polygon must sit inside the other.
 *
 * It misses the pathological case of two polygons crossing without any vertex
 * containment. That is fine — this drives a *warning*, and a rule that cries
 * wolf is worse than one that occasionally stays quiet.
 */
export function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  if (a.length < 3 || b.length < 3) return false

  const boundsA = polygonBounds(a)
  const boundsB = polygonBounds(b)
  const separated =
    boundsA.maxX <= boundsB.minX + TOLERANCE ||
    boundsB.maxX <= boundsA.minX + TOLERANCE ||
    boundsA.maxZ <= boundsB.minZ + TOLERANCE ||
    boundsB.maxZ <= boundsA.minZ + TOLERANCE
  if (separated) return false

  return a.some((point) => strictlyInside(point, b)) || b.some((point) => strictlyInside(point, a))
}

/** Point in polygon, boundary excluded — rooms sharing a wall do not overlap. */
export function strictlyInside(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false
  const [x, z] = point

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (!a || !b) continue
    if (onSegment(point, a, b)) return false

    const intersects =
      a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    if (intersects) inside = !inside
  }

  return inside
}

function onSegment(point: Vec2, a: Vec2, b: Vec2): boolean {
  const cross = (point[1] - a[1]) * (b[0] - a[0]) - (point[0] - a[0]) * (b[1] - a[1])
  if (Math.abs(cross) > TOLERANCE) return false
  const dot = (point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])
  if (dot < -TOLERANCE) return false
  const lengthSquared = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2
  return dot <= lengthSquared + TOLERANCE
}

export function describe(node: AnyNode): string {
  return node.name ? `${node.type} "${node.name}" (${node.id})` : `${node.type} ${node.id}`
}
