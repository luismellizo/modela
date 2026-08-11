import type { AnyNodeId, WallNode as WallNodeType } from '@pascal-app/core/schema'
import { DoorNode, WindowNode } from '@pascal-app/core/schema'
import { wallLength, wallLocalXFromT } from '@pascal-app/mcp/tools/geometry'
import { z } from 'zod'
import { defineTool, type ToolDefinition, ToolError } from '../types'
import { NodeId, requireNode } from './schemas'

/**
 * Doors and windows are children of their wall, positioned in wall-local
 * metres. `t` is the fraction along the wall — the model reasons about
 * "centre of the north wall" far more reliably than about world coordinates.
 */
export function createOpeningTools(): ToolDefinition[] {
  return [
    defineTool({
      name: 'add_door',
      kind: 'write',
      risk: 'safe',
      description:
        'Add a door to an existing wall. t is 0..1 along the wall: 0 = start, 0.5 = centre, 1 = end. The position is clamped so the door stays inside the wall.',
      input: z.object({
        wallId: NodeId,
        t: z.number().min(0).max(1).describe('Fraction along the wall'),
        widthM: z.number().positive().max(6).optional().describe('Default 0.9'),
        heightM: z.number().positive().max(4).optional().describe('Default 2.1'),
        doorType: z
          .enum(['hinged', 'sliding', 'pocket', 'bifold', 'garage'])
          .optional()
          .describe('Default hinged'),
        hingesSide: z.enum(['left', 'right']).optional(),
      }),
      handler: (args, context) => {
        const wall = requireNode(context.scene, args.wallId, 'wall') as WallNodeType
        const width = args.widthM ?? 0.9
        const height = args.heightM ?? 2.1
        const length = wallLength(wall)

        if (length < width) {
          throw new ToolError(
            'invalid_arguments',
            `Wall ${args.wallId} is ${length.toFixed(2)} m long, too short for a ${width.toFixed(2)} m door`,
            'Pick a longer wall or a narrower door.',
          )
        }

        const localX = wallLocalXFromT(wall, args.t, width)
        const door = DoorNode.parse({
          wallId: args.wallId,
          parentId: args.wallId,
          position: [localX, height / 2, 0],
          width,
          height,
          ...(args.doorType ? { doorType: args.doorType } : {}),
          ...(args.hingesSide ? { hingesSide: args.hingesSide } : {}),
          metadata: { createdBy: 'modela-copilot' },
        })
        const id = context.scene.createNode(door, args.wallId as AnyNodeId)

        return {
          doorId: id,
          wallLengthM: Math.round(length * 100) / 100,
          localXM: Math.round(localX * 100) / 100,
          clamped: Math.abs(localX - args.t * length) > 1e-9,
        }
      },
    }),

    defineTool({
      name: 'add_window',
      kind: 'write',
      risk: 'safe',
      description:
        'Add a window to an existing wall. t is 0..1 along the wall; sillHeightM is floor to window bottom.',
      input: z.object({
        wallId: NodeId,
        t: z.number().min(0).max(1).describe('Fraction along the wall'),
        widthM: z.number().positive().max(12).optional().describe('Default 1.5'),
        heightM: z.number().positive().max(4).optional().describe('Default 1.5'),
        sillHeightM: z.number().min(0).max(3).optional().describe('Default 0.9'),
        windowType: z
          .enum(['fixed', 'casement', 'sliding', 'awning', 'hopper', 'double-hung'])
          .optional(),
      }),
      handler: (args, context) => {
        const wall = requireNode(context.scene, args.wallId, 'wall') as WallNodeType
        const width = args.widthM ?? 1.5
        const height = args.heightM ?? 1.5
        const sill = args.sillHeightM ?? 0.9
        const length = wallLength(wall)

        if (length < width) {
          throw new ToolError(
            'invalid_arguments',
            `Wall ${args.wallId} is ${length.toFixed(2)} m long, too short for a ${width.toFixed(2)} m window`,
          )
        }

        const wallHeight = wall.height ?? 2.7
        if (sill + height > wallHeight) {
          throw new ToolError(
            'invalid_arguments',
            `Sill ${sill} m plus height ${height} m exceeds the ${wallHeight} m wall`,
            'Lower the sill or shorten the window.',
          )
        }

        const localX = wallLocalXFromT(wall, args.t, width)
        const windowNode = WindowNode.parse({
          wallId: args.wallId,
          parentId: args.wallId,
          position: [localX, sill + height / 2, 0],
          width,
          height,
          ...(args.windowType ? { windowType: args.windowType } : {}),
          metadata: { createdBy: 'modela-copilot' },
        })
        const id = context.scene.createNode(windowNode, args.wallId as AnyNodeId)

        return {
          windowId: id,
          wallLengthM: Math.round(length * 100) / 100,
          localXM: Math.round(localX * 100) / 100,
          sillHeightM: sill,
        }
      },
    }),
  ]
}
