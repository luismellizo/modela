import type { AnyNodeId } from '@pascal-app/core/schema'
import { ItemNode } from '@pascal-app/core/schema'
import { findCatalogItem, searchCatalogItems } from '@pascal-app/mcp/tools/asset-catalog'
import { z } from 'zod'
import { defineTool, type ToolDefinition, ToolError } from '../types'
import { assertWithinBounds, NodeId, requireOccupiedLevel, resolveLevelId } from './schemas'

/**
 * Furnishing. The catalog is the same one the MCP server exposes, so asset ids
 * the model learned from one path work on the other.
 */
export function createItemTools(): ToolDefinition[] {
  return [
    defineTool({
      name: 'search_items',
      kind: 'read',
      risk: 'safe',
      description:
        'Search the furniture and fixtures catalog. Always search before placing — asset ids are not guessable.',
      input: z.object({
        query: z.string().min(1).describe('e.g. "bed", "dining table", "toilet"'),
        category: z.string().optional().describe('e.g. furniture, appliance, fixture'),
        limit: z.number().int().min(1).max(30).optional(),
      }),
      handler: (args) => {
        const results = searchCatalogItems({
          query: args.query,
          ...(args.category ? { category: args.category } : {}),
        })
        return {
          total: results.length,
          items: results.slice(0, args.limit ?? 12).map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            dimensionsM: item.dimensions ?? [1, 1, 1],
            tags: item.tags ?? [],
            attachTo: item.attachTo ?? null,
          })),
        }
      },
    }),

    defineTool({
      name: 'place_item',
      kind: 'write',
      risk: 'safe',
      description:
        'Place a catalog item on a level at a plan position. rotationDeg turns it around the vertical axis; 0 faces +Z.',
      input: z.object({
        assetId: z.string().min(1).describe('Id from search_items'),
        position: z.tuple([z.number(), z.number()]).describe('Plan position [x, z] in metres'),
        levelId: NodeId.optional(),
        rotationDeg: z.number().optional().describe('Rotation around the vertical axis'),
        name: z.string().optional(),
        elevationM: z
          .number()
          .optional()
          .describe('Height above the floor. Leave unset for floor-standing items.'),
      }),
      handler: (args, context) => {
        const asset = findCatalogItem(args.assetId)
        if (!asset) {
          throw new ToolError(
            'not_found',
            `No catalog item with id "${args.assetId}"`,
            'Call search_items and use an id from the results.',
          )
        }

        const levelId = resolveLevelId(context.scene, args.levelId, context.selection.levelId)
        requireOccupiedLevel(context.scene, levelId)
        assertWithinBounds(context.limits, args.position)

        const item = ItemNode.parse({
          ...(args.name ? { name: args.name } : { name: asset.name }),
          position: [args.position[0], args.elevationM ?? 0, args.position[1]],
          rotation: [0, ((args.rotationDeg ?? 0) * Math.PI) / 180, 0],
          asset: {
            id: asset.id,
            name: asset.name,
            category: asset.category,
            thumbnail: asset.thumbnail ?? '',
            src: asset.src,
            dimensions: asset.dimensions ?? [1, 1, 1],
            offset: asset.offset ?? [0, 0, 0],
            rotation: asset.rotation ?? [0, 0, 0],
            scale: asset.scale ?? [1, 1, 1],
            ...(asset.attachTo ? { attachTo: asset.attachTo } : {}),
            ...(asset.tags ? { tags: asset.tags } : {}),
            ...(asset.surface ? { surface: asset.surface } : {}),
          },
          metadata: { createdBy: 'modela-copilot' },
        })

        const id = context.scene.createNode(item, levelId as AnyNodeId)
        return { itemId: id, assetId: asset.id, dimensionsM: asset.dimensions ?? [1, 1, 1] }
      },
    }),
  ]
}
