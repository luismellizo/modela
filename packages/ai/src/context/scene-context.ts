import type { AnyNode, AnyNodeId } from '@pascal-app/core/schema'
import type { SceneOperations } from '@pascal-app/mcp/operations'
import { polygonArea, polygonBounds } from '@pascal-app/mcp/tools/geometry'
import type { SelectionSnapshot } from '../tools/types'

/**
 * The scene never goes to the model whole. A 200-node house serialises to tens
 * of thousands of tokens, most of it geometry the model cannot use. What it
 * needs is an inventory: what exists, how big, where, and what is selected.
 * Detail is pulled on demand with `describe_node`.
 */

export type SpaceSummary = {
  id: string
  name: string
  levelId: string
  areaSqM: number
  widthM: number
  depthM: number
  centre: [number, number]
}

export type LevelSummary = {
  id: string
  name: string
  index: number
  spaces: SpaceSummary[]
  counts: Record<string, number>
}

export type SceneSummary = {
  units: 'metric'
  levels: LevelSummary[]
  totals: {
    nodes: number
    levels: number
    spaces: number
    walls: number
    doors: number
    windows: number
    items: number
    floorAreaSqM: number
  }
  /** Plan bounds of everything built, in metres. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null
  selection: SelectionSummary
  /** Set when the scene is empty — the model should ask or propose, not guess. */
  empty: boolean
}

export type SelectionSummary = {
  levelId: string | null
  levelName: string | null
  nodes: { id: string; type: string; name: string | null }[]
}

const COUNTED_TYPES = ['wall', 'door', 'window', 'item', 'zone', 'slab', 'stair', 'roof'] as const

export function buildSceneSummary(
  scene: SceneOperations,
  selection: SelectionSnapshot,
): SceneSummary {
  const nodes = scene.getNodes()
  const levels = Object.values(nodes).filter((node) => node.type === 'level')

  const levelSummaries: LevelSummary[] = levels
    .map((level, fallbackIndex) => summariseLevel(scene, nodes, level, fallbackIndex))
    .sort((a, b) => a.index - b.index)

  const totals = {
    nodes: Object.keys(nodes).length,
    levels: levelSummaries.length,
    spaces: levelSummaries.reduce((sum, level) => sum + level.spaces.length, 0),
    walls: countType(nodes, 'wall'),
    doors: countType(nodes, 'door'),
    windows: countType(nodes, 'window'),
    items: countType(nodes, 'item'),
    floorAreaSqM: round(
      levelSummaries.reduce(
        (sum, level) => sum + level.spaces.reduce((inner, space) => inner + space.areaSqM, 0),
        0,
      ),
    ),
  }

  return {
    units: 'metric',
    levels: levelSummaries,
    totals,
    bounds: computeBounds(nodes),
    selection: summariseSelection(scene, nodes, selection),
    empty: totals.walls === 0 && totals.spaces === 0 && totals.items === 0,
  }
}

function summariseLevel(
  scene: SceneOperations,
  nodes: Record<AnyNodeId, AnyNode>,
  level: AnyNode,
  fallbackIndex: number,
): LevelSummary {
  const children = scene.findNodes({ levelId: level.id as AnyNodeId })
  const counts: Record<string, number> = {}
  for (const type of COUNTED_TYPES) {
    const count = children.filter((child) => child.type === type).length
    if (count > 0) counts[type] = count
  }

  const spaces = children
    .filter((child): child is AnyNode & { type: 'zone' } => child.type === 'zone')
    .map((zone) => summariseSpace(zone, level.id))

  return {
    id: level.id,
    name: level.name ?? `Level ${fallbackIndex}`,
    index:
      typeof (level as { level?: number }).level === 'number'
        ? (level as { level: number }).level
        : fallbackIndex,
    spaces,
    counts,
  }
}

function summariseSpace(zone: AnyNode & { type: 'zone' }, levelId: string): SpaceSummary {
  const polygon = (zone.polygon ?? []) as [number, number][]
  const bounds = polygon.length > 0 ? polygonBounds(polygon) : null
  return {
    id: zone.id,
    name: zone.name ?? 'Untitled space',
    levelId,
    areaSqM: round(polygonArea(polygon)),
    widthM: round(bounds?.width ?? 0),
    depthM: round(bounds?.depth ?? 0),
    centre: [round(bounds?.centerX ?? 0), round(bounds?.centerZ ?? 0)],
  }
}

function summariseSelection(
  scene: SceneOperations,
  nodes: Record<AnyNodeId, AnyNode>,
  selection: SelectionSnapshot,
): SelectionSummary {
  const levelNode = selection.levelId ? nodes[selection.levelId as AnyNodeId] : undefined
  const ids =
    selection.selectedIds.length > 0
      ? selection.selectedIds
      : selection.zoneId
        ? [selection.zoneId]
        : []

  return {
    levelId: selection.levelId,
    levelName: levelNode?.name ?? null,
    nodes: ids
      .map((id) => scene.getNode(id as AnyNodeId))
      .filter((node): node is AnyNode => node !== null)
      .map((node) => ({ id: node.id, type: node.type, name: node.name ?? null })),
  }
}

function computeBounds(
  nodes: Record<AnyNodeId, AnyNode>,
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const points: [number, number][] = []
  for (const node of Object.values(nodes)) {
    if (node.type === 'wall') {
      points.push(node.start as [number, number], node.end as [number, number])
    } else if (node.type === 'zone') {
      points.push(...((node.polygon ?? []) as [number, number][]))
    }
  }
  if (points.length === 0) return null
  const bounds = polygonBounds(points)
  return {
    minX: round(bounds.minX),
    maxX: round(bounds.maxX),
    minZ: round(bounds.minZ),
    maxZ: round(bounds.maxZ),
  }
}

function countType(nodes: Record<AnyNodeId, AnyNode>, type: string): number {
  let count = 0
  for (const node of Object.values(nodes)) {
    if (node.type === type) count += 1
  }
  return count
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Renders the summary as terse prose for the system turn. JSON costs roughly
 * 40% more tokens here for no gain — the model reads this fine.
 */
export function renderSceneSummary(summary: SceneSummary): string {
  if (summary.empty) {
    const levels = summary.levels.length
    return levels > 0
      ? `Scene is empty. ${levels} level(s) exist: ${summary.levels
          .map((level) => `${level.name} (${level.id})`)
          .join(', ')}. Units: metres.`
      : 'Scene is completely empty — no levels yet. Units: metres.'
  }

  const lines: string[] = []
  lines.push(
    `Scene: ${summary.totals.spaces} space(s), ${summary.totals.walls} wall(s), ` +
      `${summary.totals.doors} door(s), ${summary.totals.windows} window(s), ` +
      `${summary.totals.items} item(s). Floor area ${summary.totals.floorAreaSqM} m². Units: metres.`,
  )
  if (summary.bounds) {
    lines.push(
      `Plan bounds: x ${summary.bounds.minX}..${summary.bounds.maxX}, ` +
        `z ${summary.bounds.minZ}..${summary.bounds.maxZ}.`,
    )
  }

  for (const level of summary.levels) {
    const counts = Object.entries(level.counts)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ')
    lines.push(`Level "${level.name}" (${level.id})${counts ? ` — ${counts}` : ' — empty'}`)
    for (const space of level.spaces) {
      lines.push(
        `  · ${space.name} (${space.id}) ${space.areaSqM} m², ` +
          `${space.widthM}×${space.depthM} m, centre [${space.centre[0]}, ${space.centre[1]}]`,
      )
    }
  }

  if (summary.selection.nodes.length > 0) {
    const described = summary.selection.nodes
      .map((node) => `${node.type} ${node.id}${node.name ? ` "${node.name}"` : ''}`)
      .join(', ')
    lines.push(`Currently selected: ${described}. "this"/"that" refers to it.`)
  } else if (summary.selection.levelName) {
    lines.push(`Active level: ${summary.selection.levelName} (${summary.selection.levelId}).`)
  }

  return lines.join('\n')
}
