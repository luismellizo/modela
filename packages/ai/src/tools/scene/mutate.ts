import type { AnyNode, AnyNodeId } from '@pascal-app/core/schema'
import { polygonArea } from '@pascal-app/mcp/tools/geometry'
import { z } from 'zod'
import { defineTool, type ToolDefinition, ToolError } from '../types'
import { assertWithinBounds, NodeId, Polygon, requireNode } from './schemas'

/**
 * Modification. `update_node` is deliberately a narrow whitelist rather than an
 * arbitrary patch: letting a model write any field of any node is how you end
 * up with a wall whose `parentId` points at a door.
 */
const EDITABLE_FIELDS = new Set([
  'name',
  'start',
  'end',
  'height',
  'thickness',
  'width',
  'polygon',
  'position',
  'rotation',
  'scale',
  'color',
  'ceilingHeight',
  'visible',
  'materialPreset',
  'floorFinish',
  'wallFinish',
  'ceilingFinish',
  'sillHeight',
  'doorType',
  'windowType',
  'openingKind',
])

export function createMutationTools(): ToolDefinition[] {
  return [
    defineTool({
      name: 'update_node',
      kind: 'write',
      risk: 'safe',
      description:
        'Change properties of an existing node. Only geometry, naming, finish and visibility fields can be set. Call describe_node first to see current values.',
      input: z.object({
        nodeId: NodeId,
        changes: z
          .record(z.string(), z.unknown())
          .describe(
            'Field/value pairs. Lengths in metres. Allowed: name, start, end, height, thickness, width, polygon, position, rotation, scale, color, ceilingHeight, visible, materialPreset, floorFinish, wallFinish, ceilingFinish, doorType, windowType.',
          ),
      }),
      handler: (args, context) => {
        const node = requireNode(context.scene, args.nodeId)
        const rejected = Object.keys(args.changes).filter((key) => !EDITABLE_FIELDS.has(key))
        if (rejected.length > 0) {
          throw new ToolError(
            'invalid_arguments',
            `These fields cannot be set through update_node: ${rejected.join(', ')}`,
            `Editable fields: ${[...EDITABLE_FIELDS].join(', ')}`,
          )
        }
        if (Object.keys(args.changes).length === 0) {
          throw new ToolError('invalid_arguments', 'No changes given')
        }

        assertWithinBounds(context.limits, collectNumbers(args.changes))

        // The store re-parses against the node schema, so a bad value is
        // rejected there too — this is the early, legible failure.
        context.scene.updateNode(node.id as AnyNodeId, args.changes as Partial<AnyNode>)
        const updated = context.scene.getNode(node.id as AnyNodeId)
        return {
          nodeId: node.id,
          type: node.type,
          applied: Object.keys(args.changes),
          node: updated,
        }
      },
    }),

    defineTool({
      name: 'move_node',
      kind: 'write',
      risk: 'safe',
      description:
        'Translate a node in the plan by a delta in metres. Works on walls, zones, items, doors and windows. Use this for "move the kitchen 1.5 m to the right" instead of recomputing coordinates.',
      input: z.object({
        nodeId: NodeId,
        deltaX: z.number().describe('Metres along +X (right in plan view)'),
        deltaZ: z.number().describe('Metres along +Z (down in plan view)'),
      }),
      handler: (args, context) => {
        const node = requireNode(context.scene, args.nodeId)
        assertWithinBounds(context.limits, [args.deltaX, args.deltaZ])
        const patch = translate(node, args.deltaX, args.deltaZ)
        if (!patch) {
          throw new ToolError(
            'invalid_arguments',
            `A ${node.type} node cannot be translated directly`,
            'Move its parent, or update its geometry with update_node.',
          )
        }
        context.scene.updateNode(node.id as AnyNodeId, patch as Partial<AnyNode>)
        return { nodeId: node.id, type: node.type, moved: { x: args.deltaX, z: args.deltaZ } }
      },
    }),

    defineTool({
      name: 'reshape_space',
      kind: 'write',
      risk: 'safe',
      description:
        'Replace a zone polygon and rebuild its boundary walls to match. Use it to resize a room — moving a single wall leaves the space open.',
      input: z.object({
        zoneId: NodeId,
        polygon: Polygon,
      }),
      handler: (args, context) => {
        const zone = requireNode(context.scene, args.zoneId, 'zone')
        assertWithinBounds(context.limits, args.polygon.flat())

        const levelId = context.scene.resolveLevelId(zone.id as AnyNodeId)
        if (!levelId) {
          throw new ToolError('not_found', `Zone ${args.zoneId} has no parent level`)
        }

        // Walls tagged with this room during creation are the ones that form
        // its boundary. Untagged walls are user-drawn and are left alone.
        const roomName = zone.name
        const boundaryWalls = context.scene
          .findNodes({ levelId: levelId as AnyNodeId, type: 'wall' })
          .filter((wall) => {
            const metadata = wall.metadata
            return (
              typeof metadata === 'object' &&
              metadata !== null &&
              (metadata as { roomName?: unknown }).roomName === roomName
            )
          })
          .sort((a, b) => edgeIndex(a) - edgeIndex(b))

        const points = args.polygon as [number, number][]
        const updates = points.map((start, index) => ({
          start,
          end: points[(index + 1) % points.length] as [number, number],
        }))

        context.scene.updateNode(zone.id as AnyNodeId, { polygon: points } as Partial<AnyNode>)

        const reused = Math.min(boundaryWalls.length, updates.length)
        for (let index = 0; index < reused; index += 1) {
          const wall = boundaryWalls[index]
          const update = updates[index]
          if (!wall || !update) continue
          context.scene.updateNode(wall.id as AnyNodeId, update as Partial<AnyNode>)
        }

        return {
          zoneId: zone.id,
          areaSqM: Math.round(polygonArea(points) * 100) / 100,
          wallsUpdated: reused,
          wallsUnmatched: Math.abs(boundaryWalls.length - updates.length),
          note:
            boundaryWalls.length === updates.length
              ? undefined
              : 'The new polygon has a different edge count than the old one — check the walls and add or delete as needed.',
        }
      },
    }),

    defineTool({
      name: 'delete_node',
      kind: 'write',
      risk: 'destructive',
      description:
        'Delete a node and, with cascade, its descendants. Removes existing work — say what will be deleted and get the user to confirm first.',
      input: z.object({
        nodeId: NodeId,
        cascade: z
          .boolean()
          .optional()
          .describe('Delete children too. Required when the node has any.'),
      }),
      handler: (args, context) => {
        const node = requireNode(context.scene, args.nodeId)
        const removed = context.scene.deleteNode(node.id as AnyNodeId, args.cascade ?? false)
        return { deletedIds: removed, count: removed.length }
      },
    }),
  ]
}

function translate(node: AnyNode, dx: number, dz: number): Record<string, unknown> | null {
  switch (node.type) {
    case 'wall':
      return {
        start: [node.start[0] + dx, node.start[1] + dz],
        end: [node.end[0] + dx, node.end[1] + dz],
      }
    case 'zone':
    case 'slab':
    case 'ceiling':
      return {
        polygon: ((node.polygon ?? []) as [number, number][]).map(
          ([x, z]) => [x + dx, z + dz] as [number, number],
        ),
      }
    case 'item':
    case 'stair':
      return {
        position: [node.position[0] + dx, node.position[1], node.position[2] + dz],
      }
    default:
      return null
  }
}

function edgeIndex(node: AnyNode): number {
  const metadata = node.metadata
  if (typeof metadata === 'object' && metadata !== null && 'edgeIndex' in metadata) {
    const value = (metadata as { edgeIndex?: unknown }).edgeIndex
    if (typeof value === 'number') return value
  }
  return Number.MAX_SAFE_INTEGER
}

function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value)
  else if (Array.isArray(value)) for (const entry of value) collectNumbers(entry, out)
  else if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectNumbers(entry, out)
  }
  return out
}
