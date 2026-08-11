import type { ArchitecturalExtraction, ExtractedSpace } from './schema'

/**
 * Extraction → a build plan.
 *
 * This deliberately produces *tool calls the agent then executes*, not scene
 * mutations. Two reasons: the plan can be shown to the user before anything
 * changes, and building goes through the same validated tools as everything
 * else instead of a second, unchecked write path.
 */

export type PlannedCall = {
  tool: string
  arguments: Record<string, unknown>
  /** One line for the proposal UI. */
  label: string
  /** True when this step rests on an assumption rather than a measurement. */
  assumed: boolean
}

export type BuildPlan = {
  calls: PlannedCall[]
  /** Total floor area the plan would create. */
  totalAreaSqM: number
  warnings: string[]
  /** Repeated verbatim from the extraction so the UI can show it beside the plan. */
  observed: string[]
  inferred: string[]
  unknown: string[]
}

export type MaterializeOptions = {
  /** Level to build on. Omit to let the agent resolve it. */
  levelId?: string
  /** Fallback dimensions for spaces the image did not size, in metres. */
  defaultSpaceSize?: { widthM: number; depthM: number }
  wallHeightM?: number
  wallThicknessM?: number
  /** Gap between auto-placed spaces when the plan has no coordinates. */
  gapM?: number
}

const DEFAULTS = {
  defaultSpaceSize: { widthM: 3.5, depthM: 3.5 },
  gapM: 0.2,
}

export function planFromExtraction(
  extraction: ArchitecturalExtraction,
  options: MaterializeOptions = {},
): BuildPlan {
  const config = { ...DEFAULTS, ...options }
  const warnings: string[] = []

  if (extraction.kind === 'not_architectural') {
    return {
      calls: [],
      totalAreaSqM: 0,
      warnings: ['This image does not show anything architectural.'],
      observed: extraction.observed,
      inferred: extraction.inferred,
      unknown: extraction.unknown,
    }
  }

  if (extraction.spaces.length === 0) {
    warnings.push('No spaces could be read from the image, so there is nothing to build yet.')
  }

  if (!extraction.scale.known) {
    warnings.push(
      'The image has no scale reference. Dimensions below are proportional estimates — check them before building.',
    )
  }

  if (extraction.confidence === 'low') {
    warnings.push('Low confidence reading. Treat this plan as a starting point, not a survey.')
  }

  const calls: PlannedCall[] = []
  let totalArea = 0
  // Spaces without coordinates get laid out in a row rather than stacked on
  // top of each other at the origin.
  let cursorX = 0

  for (const space of extraction.spaces) {
    const width = space.widthM ?? config.defaultSpaceSize.widthM
    const depth = space.depthM ?? config.defaultSpaceSize.depthM
    const assumed = space.source === 'inferred' || space.widthM === null || space.depthM === null

    const origin: [number, number] = space.centre
      ? [space.centre[0] - width / 2, space.centre[1] - depth / 2]
      : [cursorX, 0]

    if (!space.centre) cursorX += width + config.gapM

    const polygon: [number, number][] = [
      [round(origin[0]), round(origin[1])],
      [round(origin[0] + width), round(origin[1])],
      [round(origin[0] + width), round(origin[1] + depth)],
      [round(origin[0]), round(origin[1] + depth)],
    ]

    totalArea += width * depth

    calls.push({
      tool: 'create_room',
      arguments: {
        name: space.name,
        polygon,
        ...(options.levelId ? { levelId: options.levelId } : {}),
        ...(options.wallHeightM !== undefined ? { wallHeightM: options.wallHeightM } : {}),
        ...(options.wallThicknessM !== undefined ? { wallThicknessM: options.wallThicknessM } : {}),
        color: colorForType(space.type),
      },
      label: `${space.name} — ${round(width)} × ${round(depth)} m (${round(width * depth)} m²)${
        assumed ? ', estimated' : ''
      }`,
      assumed,
    })
  }

  if (extraction.openings.length > 0) {
    warnings.push(
      `${extraction.openings.length} opening(s) were read from the image. They are added after the rooms exist, because they attach to specific walls.`,
    )
  }

  return {
    calls,
    totalAreaSqM: round(totalArea),
    warnings,
    observed: extraction.observed,
    inferred: extraction.inferred,
    unknown: extraction.unknown,
  }
}

/**
 * Openings need wall ids, which only exist once the rooms are built. The agent
 * calls this after executing the room plan, passing the wallIds each
 * `create_room` returned.
 */
export function planOpenings(
  extraction: ArchitecturalExtraction,
  wallIdsBySpace: Record<string, string[]>,
): PlannedCall[] {
  const calls: PlannedCall[] = []

  for (const opening of extraction.openings) {
    const wallIds = wallIdsBySpace[opening.spaceName]
    if (!wallIds || wallIds.length === 0) continue

    // Without a position from the plan, the first edge at mid-span is the least
    // wrong choice — and it is reported as assumed.
    const wallId = wallIds[0]
    if (!wallId) continue

    const assumed = opening.source === 'inferred' || opening.t === null
    const t = opening.t ?? 0.5

    calls.push({
      tool: opening.kind === 'door' ? 'add_door' : 'add_window',
      arguments: {
        wallId,
        t,
        ...(opening.widthM !== null ? { widthM: opening.widthM } : {}),
      },
      label: `${opening.kind === 'door' ? 'Door' : 'Window'} in ${opening.spaceName}${
        assumed ? ', position estimated' : ''
      }`,
      assumed,
    })
  }

  return calls
}

function colorForType(type: ExtractedSpace['type']): string {
  const palette: Record<string, string> = {
    bedroom: '#a78bfa',
    bathroom: '#38bdf8',
    kitchen: '#fbbf24',
    living: '#60a5fa',
    dining: '#34d399',
    garage: '#94a3b8',
    terrace: '#4ade80',
    hallway: '#cbd5e1',
    entry: '#cbd5e1',
    laundry: '#f472b6',
    storage: '#a8a29e',
    office: '#818cf8',
    other: '#60a5fa',
  }
  return palette[type] ?? '#60a5fa'
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
