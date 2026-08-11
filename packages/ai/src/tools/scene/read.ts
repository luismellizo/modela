import type { AnyNode, AnyNodeId, AnyNodeType } from '@pascal-app/core/schema'
import { z } from 'zod'
import { buildSceneSummary } from '../../context/scene-context'
import { defineTool, type ToolDefinition } from '../types'
import { NodeId, requireNode } from './schemas'

/**
 * Read tools are how the agent avoids being fed the whole scene. It asks for
 * the inventory once, then drills into whatever the request is actually about.
 */
export function createReadTools(): ToolDefinition[] {
  return [
    defineTool({
      name: 'get_scene_overview',
      kind: 'read',
      risk: 'safe',
      description:
        'Inventory of the scene: levels, spaces with area and dimensions, element counts, plan bounds and the current selection. Call this before making changes to an existing scene.',
      input: z.object({}),
      handler: (_args, context) => buildSceneSummary(context.scene, context.selection),
    }),

    defineTool({
      name: 'find_nodes',
      kind: 'read',
      risk: 'safe',
      description:
        'List nodes matching a filter. Returns id, type, name and key dimensions — not full geometry. Use it to locate the ids you need.',
      input: z.object({
        type: z
          .string()
          .optional()
          .describe('Node type, e.g. wall, window, door, zone, item, level, stair, roof'),
        levelId: NodeId.optional().describe('Restrict to one level'),
        nameContains: z
          .string()
          .optional()
          .describe('Case-insensitive substring match on the node name'),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: (args, context) => {
        const filter: { type?: AnyNodeType; levelId?: AnyNodeId } = {}
        if (args.type) filter.type = args.type as AnyNodeType
        if (args.levelId) filter.levelId = args.levelId as AnyNodeId

        let found =
          args.type || args.levelId
            ? context.scene.findNodes(filter)
            : Object.values(context.scene.getNodes())

        if (args.nameContains) {
          const needle = args.nameContains.toLowerCase()
          found = found.filter((node) => (node.name ?? '').toLowerCase().includes(needle))
        }

        const limit = Math.min(
          args.limit ?? context.limits.maxNodesPerRead,
          context.limits.maxNodesPerRead,
        )
        return {
          total: found.length,
          truncated: found.length > limit,
          nodes: found.slice(0, limit).map(brief),
        }
      },
    }),

    defineTool({
      name: 'describe_node',
      kind: 'read',
      risk: 'safe',
      description:
        'Full properties of one node plus its ancestry and direct children. Use this before modifying something.',
      input: z.object({ nodeId: NodeId }),
      handler: (args, context) => {
        const node = requireNode(context.scene, args.nodeId)
        return {
          node,
          ancestry: context.scene.getAncestry(node.id as AnyNodeId).map((ancestor) => ({
            id: ancestor.id,
            type: ancestor.type,
            name: ancestor.name ?? null,
          })),
          children: context.scene.getChildren(node.id as AnyNodeId).map(brief),
          levelId: context.scene.resolveLevelId(node.id as AnyNodeId),
        }
      },
    }),

    defineTool({
      name: 'get_selection',
      kind: 'read',
      risk: 'safe',
      description:
        'What the user has selected in the editor right now. Resolve "this", "that" and "the selected one" with it.',
      input: z.object({}),
      handler: (_args, context) => {
        const ids = context.selection.selectedIds
        return {
          levelId: context.selection.levelId,
          zoneId: context.selection.zoneId,
          buildingId: context.selection.buildingId,
          nodes: ids
            .map((id) => context.scene.getNode(id as AnyNodeId))
            .filter((node): node is AnyNode => node !== null)
            .map((node) => ({ ...brief(node), properties: node })),
        }
      },
    }),

    defineTool({
      name: 'validate_scene',
      kind: 'read',
      risk: 'safe',
      description:
        'Schema-validate every node. Run it after a batch of changes and fix what it reports before telling the user you are done.',
      input: z.object({}),
      handler: (_args, context) => {
        const result = context.scene.validateScene()
        return {
          valid: result.valid,
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 50),
        }
      },
    }),
  ]
}

/** Compact node view — enough to identify and size a node, nothing more. */
function brief(node: AnyNode): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: node.id,
    type: node.type,
    name: node.name ?? null,
  }

  switch (node.type) {
    case 'wall':
      base.start = node.start
      base.end = node.end
      base.lengthM = round(Math.hypot(node.end[0] - node.start[0], node.end[1] - node.start[1]))
      if (node.height !== undefined) base.heightM = node.height
      if (node.thickness !== undefined) base.thicknessM = node.thickness
      break
    case 'zone':
      base.polygon = node.polygon
      base.ceilingHeightM = node.ceilingHeight
      break
    case 'door':
    case 'window':
      base.wallId = node.wallId ?? null
      base.widthM = node.width
      base.heightM = node.height
      base.position = node.position
      break
    case 'item':
      base.assetId = node.asset?.id ?? null
      base.position = node.position
      base.rotation = node.rotation
      break
    case 'level':
      base.index = node.level
      break
    default:
      break
  }

  return base
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
