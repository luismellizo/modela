import type { AnyNode, AnyNodeId } from '@pascal-app/core/schema'
import type { SceneOperations } from '@pascal-app/mcp/operations'
import { z } from 'zod'
import { ToolError, type ToolLimits } from '../types'

export const NodeId = z.string().min(1).describe('Node id, e.g. "wall_a1b2c3"')

export const Vec2 = z.tuple([z.number(), z.number()]).describe('Plan coordinate [x, z] in metres')

/**
 * Models routinely close the ring by repeating the first point — observed from
 * Gemma and others on the very first real call this project ever made. The
 * duplicate would become a zero-length wall, which the design check then
 * reports as an error the user never caused. Dropping it is kinder than being
 * right about the schema.
 */
export const Polygon = z
  .array(Vec2)
  .min(3)
  .transform((points) => {
    const first = points[0]
    const last = points[points.length - 1]
    if (points.length > 3 && first && last && first[0] === last[0] && first[1] === last[1]) {
      return points.slice(0, -1)
    }
    return points
  })
  .describe(
    'Plan polygon in metres, counter-clockwise. Do not repeat the first point at the end — if you do it is dropped.',
  )

/** Reads a node and fails with a message the model can act on. */
export function requireNode(scene: SceneOperations, id: string, expectedType?: string): AnyNode {
  const node = scene.getNode(id as AnyNodeId)
  if (!node) {
    throw new ToolError(
      'not_found',
      `No node with id "${id}"`,
      'Call find_nodes to list valid ids.',
    )
  }
  if (expectedType && node.type !== expectedType) {
    throw new ToolError(
      'invalid_arguments',
      `Node "${id}" is a ${node.type}, expected ${expectedType}`,
    )
  }
  return node
}

/**
 * Levels tagged `role: 'roof'` are structural supports, not storeys. Building
 * on them produces geometry nobody can walk into, so they are refused here the
 * same way the MCP tools refuse them.
 */
export function requireOccupiedLevel(scene: SceneOperations, levelId: string): AnyNode {
  const level = requireNode(scene, levelId, 'level')
  const metadata = level.metadata
  if (
    typeof metadata === 'object' &&
    metadata !== null &&
    'role' in metadata &&
    (metadata as { role?: unknown }).role === 'roof'
  ) {
    throw new ToolError(
      'invalid_arguments',
      `Level "${levelId}" is roof support, not an occupied storey`,
      'Use get_scene_overview to find an occupied level.',
    )
  }
  return level
}

export function assertWithinBounds(limits: ToolLimits, points: readonly number[]): void {
  for (const value of points) {
    if (!Number.isFinite(value) || Math.abs(value) > limits.maxCoordinate) {
      throw new ToolError(
        'limit_exceeded',
        `Coordinate ${value} is outside the allowed ±${limits.maxCoordinate} m range`,
      )
    }
  }
}

export function assertNodeBudget(limits: ToolLimits, count: number): void {
  if (count > limits.maxNodesPerCall) {
    throw new ToolError(
      'limit_exceeded',
      `This call would create ${count} nodes, over the ${limits.maxNodesPerCall} limit`,
      'Split the work across several calls.',
    )
  }
}

/** Picks a level when the model did not name one: the selected one, else the first. */
export function resolveLevelId(
  scene: SceneOperations,
  explicit: string | undefined,
  selectedLevelId: string | null,
): string {
  if (explicit) return explicit
  if (selectedLevelId) return selectedLevelId
  const levels = Object.values(scene.getNodes()).filter((node) => node.type === 'level')
  const first = levels[0]
  if (!first) {
    throw new ToolError(
      'not_found',
      'The scene has no level to build on',
      'Call create_level first.',
    )
  }
  return first.id
}
