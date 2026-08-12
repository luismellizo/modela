import { DEFAULT_LEVEL_HEIGHT } from '@pascal-app/core/level-height'
import type { AnyNodeId } from '@pascal-app/core/schema'
import { CeilingNode, LevelNode, SlabNode, WallNode, ZoneNode } from '@pascal-app/core/schema'
import { polygonArea } from '@pascal-app/mcp/tools/geometry'
import { z } from 'zod'
import { defineTool, type ToolDefinition, ToolError } from '../types'
import {
  assertNodeBudget,
  assertWithinBounds,
  NodeId,
  Polygon,
  requireNode,
  requireOccupiedLevel,
  resolveLevelId,
  Vec2,
} from './schemas'

/**
 * Construction tools. They build the same node shapes the MCP server builds —
 * a room is a zone plus a slab plus a ceiling plus one wall per polygon edge —
 * so a scene produced by the copilot is indistinguishable from one produced by
 * Claude Desktop driving the MCP server.
 */
export function createBuildTools(): ToolDefinition[] {
  return [
    defineTool({
      name: 'create_level',
      kind: 'write',
      risk: 'safe',
      description:
        "Append a storey above the building's current top level. Use it for a second floor or a basement-to-roof stack.",
      input: z.object({
        buildingId: NodeId.optional().describe('Defaults to the only building in the scene'),
        name: z.string().optional().describe('Storey label, e.g. "Ground floor"'),
        heightM: z
          .number()
          .positive()
          .max(20)
          .optional()
          .describe('Floor-to-floor height in metres'),
      }),
      handler: (args, context) => {
        const buildingId = args.buildingId ?? findSoleBuilding(context.scene)
        requireNode(context.scene, buildingId, 'building')

        const ordinals = context.scene
          .getChildren(buildingId as AnyNodeId)
          .filter((node) => node.type === 'level')
          .map((node) => (node as { level: number }).level)
        const nextOrdinal = Math.max(-1, ...ordinals) + 1

        const level = LevelNode.parse({
          level: nextOrdinal,
          height: args.heightM ?? DEFAULT_LEVEL_HEIGHT,
          children: [],
          ...(args.name ? { name: args.name } : {}),
        })
        const id = context.scene.createNode(level, buildingId as AnyNodeId)
        return { levelId: id, index: nextOrdinal }
      },
    }),

    defineTool({
      name: 'create_room',
      kind: 'write',
      risk: 'safe',
      description:
        'Create an enclosed space from a plan polygon: zone, floor slab, ceiling and one wall per edge. This is the main building block — prefer it over placing walls one by one.',
      input: z.object({
        name: z.string().min(1).describe('Room name, e.g. "Main bedroom"'),
        polygon: Polygon,
        levelId: NodeId.optional().describe('Defaults to the selected or first level'),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe('Zone fill colour in the 2D plan'),
        wallHeightM: z.number().positive().max(20).optional(),
        wallThicknessM: z.number().positive().max(2).optional(),
      }),
      handler: (args, context) => {
        const levelId = resolveLevelId(context.scene, args.levelId, context.selection.levelId)
        requireOccupiedLevel(context.scene, levelId)
        assertWithinBounds(context.limits, args.polygon.flat())
        assertNodeBudget(context.limits, args.polygon.length + 3)

        const points = args.polygon as [number, number][]
        const zone = ZoneNode.parse({
          name: args.name,
          polygon: points,
          color: args.color ?? '#60a5fa',
          metadata: { createdBy: 'modela-copilot' },
        })
        const slab = SlabNode.parse({ polygon: points, metadata: { createdBy: 'modela-copilot' } })
        const ceiling = CeilingNode.parse({
          polygon: points,
          metadata: { createdBy: 'modela-copilot' },
        })
        const walls = points.map((start, index) =>
          WallNode.parse({
            name: `${args.name} wall ${index + 1}`,
            start,
            end: points[(index + 1) % points.length],
            ...(args.wallHeightM !== undefined ? { height: args.wallHeightM } : {}),
            ...(args.wallThicknessM !== undefined ? { thickness: args.wallThicknessM } : {}),
            metadata: { createdBy: 'modela-copilot', roomName: args.name, edgeIndex: index },
          }),
        )

        context.scene.applyPatch([
          { op: 'create', node: zone, parentId: levelId as AnyNodeId },
          { op: 'create', node: slab, parentId: levelId as AnyNodeId },
          { op: 'create', node: ceiling, parentId: levelId as AnyNodeId },
          ...walls.map((wall) => ({
            op: 'create' as const,
            node: wall,
            parentId: levelId as AnyNodeId,
          })),
        ])

        return {
          zoneId: zone.id,
          slabId: slab.id,
          ceilingId: ceiling.id,
          // Edge order matches the polygon, so "the north wall" is addressable.
          wallIds: walls.map((wall) => wall.id),
          areaSqM: Math.round(polygonArea(points) * 100) / 100,
        }
      },
    }),

    defineTool({
      name: 'create_wall',
      kind: 'write',
      risk: 'safe',
      description:
        'Create a single wall between two plan points. Use it for partitions and free-standing walls; use create_room for enclosed spaces.',
      input: z.object({
        start: Vec2,
        end: Vec2,
        levelId: NodeId.optional(),
        name: z.string().optional(),
        thicknessM: z.number().positive().max(2).optional(),
        heightM: z.number().positive().max(20).optional(),
      }),
      handler: (args, context) => {
        const levelId = resolveLevelId(context.scene, args.levelId, context.selection.levelId)
        requireOccupiedLevel(context.scene, levelId)
        assertWithinBounds(context.limits, [...args.start, ...args.end])

        const length = Math.hypot(args.end[0] - args.start[0], args.end[1] - args.start[1])
        if (length < 0.01) {
          throw new ToolError('invalid_arguments', 'Wall start and end are the same point')
        }

        const wall = WallNode.parse({
          start: args.start,
          end: args.end,
          ...(args.name ? { name: args.name } : {}),
          ...(args.thicknessM !== undefined ? { thickness: args.thicknessM } : {}),
          ...(args.heightM !== undefined ? { height: args.heightM } : {}),
          metadata: { createdBy: 'modela-copilot' },
        })
        const id = context.scene.createNode(wall, levelId as AnyNodeId)
        return { wallId: id, lengthM: Math.round(length * 100) / 100 }
      },
    }),
  ]
}

function findSoleBuilding(scene: {
  getNodes(): Record<string, { id: string; type: string }>
}): string {
  const buildings = Object.values(scene.getNodes()).filter((node) => node.type === 'building')
  const first = buildings[0]
  if (!first) {
    throw new ToolError('not_found', 'The scene has no building to add a level to')
  }
  if (buildings.length > 1) {
    throw new ToolError(
      'invalid_arguments',
      'The scene has more than one building — pass buildingId explicitly',
      `Buildings: ${buildings.map((building) => building.id).join(', ')}`,
    )
  }
  return first.id
}
