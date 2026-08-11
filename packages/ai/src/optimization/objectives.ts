import { queryKnowledge } from '../knowledge/query'
import type { SpaceType } from '../knowledge/types'
import { distance, isHabitable, round } from './spaces'
import type { Objective, ObjectiveScore, ScoredSpace, ScoringContext, SpaceKind } from './types'

/**
 * The objective functions.
 *
 * Each one returns 0..1 and, more importantly, a sentence saying *why*. A score
 * with no explanation is a number the user has to take on faith, and "your
 * layout scores 0.62" helps nobody.
 *
 * `applicable: false` means the scene has nothing to measure — an empty level
 * should not score zero on daylight, it should be excluded.
 */

const KIND_TO_SPACE_TYPE: Partial<Record<SpaceKind, SpaceType>> = {
  bedroom: 'bedroom',
  bathroom: 'bathroom',
  kitchen: 'kitchen',
  living: 'living',
  dining: 'dining',
  circulation: 'hallway',
  garage: 'garage-double',
}

/** How close each space is to the size its type usually wants. */
export const targetAreas: Objective = {
  id: 'target-areas',
  label: 'Room sizes',
  defaultWeight: 1.2,
  basis: 'Compares each space against conventional comfortable sizes from the knowledge base',
  evaluate({ spaces }) {
    const measurable = spaces.filter((space) => KIND_TO_SPACE_TYPE[space.kind])
    if (measurable.length === 0) {
      return notApplicable('target-areas', 'No spaces with a recognisable type to measure')
    }

    const results = measurable.map((space) => {
      const spaceType = KIND_TO_SPACE_TYPE[space.kind] as SpaceType
      const entry = queryKnowledge({ topic: space.kind, spaceType, limit: 1 })[0]
      const comfortable = entry?.dimensions?.comfortableSqM
      const minimum = entry?.dimensions?.minimumSqM

      if (!comfortable || !minimum) return { space, ratio: 1, verdict: 'unknown' as const }

      if (space.areaSqM < minimum) {
        return { space, ratio: space.areaSqM / minimum, verdict: 'undersized' as const }
      }
      if (space.areaSqM >= comfortable) {
        return { space, ratio: 1, verdict: 'comfortable' as const }
      }
      // Between minimum and comfortable, scaled across that band.
      return {
        space,
        ratio: 0.6 + (0.4 * (space.areaSqM - minimum)) / (comfortable - minimum),
        verdict: 'tight' as const,
      }
    })

    const score = mean(results.map((result) => result.ratio))
    const undersized = results.filter((result) => result.verdict === 'undersized')
    const tight = results.filter((result) => result.verdict === 'tight')

    return {
      id: 'target-areas',
      applicable: true,
      score,
      reason:
        undersized.length > 0
          ? `${undersized.length} of ${results.length} space(s) below conventional minimum: ${undersized
              .map((result) => `${result.space.name} (${result.space.areaSqM} m²)`)
              .join(', ')}`
          : tight.length > 0
            ? `All spaces above minimum; ${tight.length} tighter than comfortable: ${tight
                .map((result) => result.space.name)
                .join(', ')}`
            : `All ${results.length} space(s) at or above conventional comfortable size`,
      ...(undersized.length > 0 || tight.length > 0
        ? {
            improvement: `Enlarge ${[...undersized, ...tight]
              .slice(0, 3)
              .map((result) => result.space.name)
              .join(', ')} with reshape_space.`,
          }
        : {}),
    }
  },
}

/** Windows in the rooms that need them, on the side the sun comes from. */
export const daylight: Objective = {
  id: 'daylight',
  label: 'Natural light',
  defaultWeight: 1.3,
  basis:
    'Counts windows in habitable spaces and which plan side they face. Not a daylight simulation — no illuminance is computed',
  evaluate({ spaces, hemisphere }) {
    const habitable = spaces.filter((space) => isHabitable(space.kind))
    if (habitable.length === 0) {
      return notApplicable('daylight', 'No habitable spaces to light')
    }

    const sunny = hemisphere === 'north' ? 'south' : 'north'
    const withWindows = habitable.filter((space) => space.windows > 0)
    const wellOriented = habitable.filter((space) =>
      space.windowFacings.some((facing) => facing === sunny),
    )

    // Having a window at all is the bigger factor; facing the sun is the bonus.
    const coverage = withWindows.length / habitable.length
    const orientation = wellOriented.length / habitable.length
    const score = coverage * 0.7 + orientation * 0.3

    const dark = habitable.filter((space) => space.windows === 0)

    return {
      id: 'daylight',
      applicable: true,
      score,
      reason: `${withWindows.length} of ${habitable.length} habitable space(s) have windows; ${wellOriented.length} face ${sunny} (the sunny side in the ${hemisphere}ern hemisphere)`,
      ...(dark.length > 0
        ? { improvement: `Add windows to ${dark.map((space) => space.name).join(', ')}.` }
        : orientation < 0.5
          ? { improvement: `Move living spaces and main bedrooms to the ${sunny} side.` }
          : {}),
    }
  },
}

/** Floor area spent on getting from A to B rather than on living. */
export const circulation: Objective = {
  id: 'circulation',
  label: 'Circulation efficiency',
  defaultWeight: 1,
  basis: 'Share of floor area given to halls and corridors. 8–15% is typical in housing',
  evaluate({ spaces }) {
    const total = spaces.reduce((sum, space) => sum + space.areaSqM, 0)
    if (total <= 0) return notApplicable('circulation', 'No floor area to measure')

    const circulationArea = spaces
      .filter((space) => space.kind === 'circulation')
      .reduce((sum, space) => sum + space.areaSqM, 0)
    const share = circulationArea / total

    // A little circulation is necessary; a lot is waste. Zero usually means the
    // rooms open into each other, which is a choice rather than an error.
    const score = share <= 0.15 ? 1 : Math.max(0, 1 - (share - 0.15) / 0.25)

    return {
      id: 'circulation',
      applicable: true,
      score,
      reason: `${round(share * 100)}% of the floor area is circulation (${round(circulationArea)} m² of ${round(total)} m²)`,
      ...(share > 0.15
        ? { improvement: 'Shorten corridors or let rooms open directly into each other.' }
        : {}),
    }
  },
}

/** How much envelope the plan needs for the area it encloses. */
export const compactness: Objective = {
  id: 'compactness',
  label: 'Compactness',
  defaultWeight: 0.8,
  basis:
    'Ratio of the built footprint to the smallest rectangle containing it. A proxy for envelope cost and heat loss, not a thermal calculation',
  evaluate({ spaces }) {
    if (spaces.length === 0) return notApplicable('compactness', 'Nothing built')

    const points = spaces.flatMap((space) => space.polygon)
    if (points.length === 0) return notApplicable('compactness', 'No geometry')

    const xs = points.map((point) => point[0])
    const zs = points.map((point) => point[1])
    const boundingArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs))
    if (boundingArea <= 0) return notApplicable('compactness', 'Degenerate footprint')

    const built = spaces.reduce((sum, space) => sum + space.areaSqM, 0)
    const fill = Math.min(1, built / boundingArea)

    return {
      id: 'compactness',
      applicable: true,
      score: fill,
      reason: `The plan fills ${round(fill * 100)}% of its bounding rectangle (${round(built)} m² built within ${round(boundingArea)} m²)`,
      ...(fill < 0.75
        ? {
            improvement:
              'Pull the spaces together — a scattered plan costs more envelope for the same floor area.',
          }
        : {}),
    }
  },
}

/** Bedrooms grouped away from the noisy, public half of the house. */
export const dayNightZoning: Objective = {
  id: 'day-night-zoning',
  label: 'Day/night separation',
  defaultWeight: 1,
  basis: 'Distance between the centroid of the sleeping spaces and that of the living spaces',
  evaluate({ spaces }) {
    const night = spaces.filter((space) => space.kind === 'bedroom')
    const day = spaces.filter((space) => space.kind === 'living' || space.kind === 'dining')

    if (night.length === 0 || day.length === 0) {
      return notApplicable('day-night-zoning', 'Needs both bedrooms and living spaces to compare')
    }

    const nightCentre = centroid(night)
    const dayCentre = centroid(day)
    const separation = distance(nightCentre, dayCentre)

    // Scaled against the plan's own size, so a small flat is not penalised for
    // being small.
    const points = spaces.flatMap((space) => space.polygon)
    const span = Math.max(
      Math.max(...points.map((point) => point[0])) - Math.min(...points.map((point) => point[0])),
      Math.max(...points.map((point) => point[1])) - Math.min(...points.map((point) => point[1])),
      1,
    )
    const score = Math.min(1, separation / (span * 0.35))

    return {
      id: 'day-night-zoning',
      applicable: true,
      score,
      reason: `Sleeping and living zones are ${round(separation)} m apart across a ${round(span)} m plan`,
      ...(score < 0.7
        ? {
            improvement:
              'Group the bedrooms further from the living and dining area so reaching one does not cross it.',
          }
        : {}),
    }
  },
}

/** The pairs that should be near each other, actually near each other. */
export const adjacency: Objective = {
  id: 'adjacency',
  label: 'Adjacencies',
  defaultWeight: 1,
  basis: 'Distance between space pairs that conventionally sit together',
  evaluate({ spaces }) {
    const pairs: { from: SpaceKind; to: SpaceKind; why: string }[] = [
      { from: 'kitchen', to: 'dining', why: 'carrying food is the most repeated trip in a home' },
      { from: 'bedroom', to: 'bathroom', why: 'night-time route should be short' },
    ]

    const results = pairs
      .map((pair) => {
        const from = spaces.filter((space) => space.kind === pair.from)
        // A combined living-dining is classified as `living`, so without this
        // fallback a very common layout would silently skip the kitchen pair.
        const fallback: SpaceKind | null = pair.to === 'dining' ? 'living' : null
        const exact = spaces.filter((space) => space.kind === pair.to)
        const to =
          exact.length > 0
            ? exact
            : fallback
              ? spaces.filter((space) => space.kind === fallback)
              : []
        if (from.length === 0 || to.length === 0) return null

        // Closest pairing: one nearby bathroom satisfies a bedroom.
        const closest = Math.min(
          ...from.flatMap((a) => to.map((b) => distance(a.centre, b.centre))),
        )
        const typicalRoom = Math.sqrt(mean(spaces.map((space) => space.areaSqM)) || 1)
        // Within about two room-widths reads as adjacent.
        const score = Math.min(1, (typicalRoom * 2) / Math.max(closest, 0.01))
        return { pair, closest, score }
      })
      .filter((result): result is NonNullable<typeof result> => result !== null)

    if (results.length === 0) {
      return notApplicable('adjacency', 'No conventional pairs present to check')
    }

    const score = mean(results.map((result) => result.score))
    const worst = [...results].sort((a, b) => a.score - b.score)[0]

    return {
      id: 'adjacency',
      applicable: true,
      score,
      reason: results
        .map((result) => `${result.pair.from}→${result.pair.to} ${round(result.closest)} m apart`)
        .join('; '),
      ...(worst && worst.score < 0.8
        ? {
            improvement: `Move the ${worst.pair.from} closer to the ${worst.pair.to} — ${worst.pair.why}.`,
          }
        : {}),
    }
  },
}

export const DEFAULT_OBJECTIVES: Objective[] = [
  targetAreas,
  daylight,
  circulation,
  compactness,
  dayNightZoning,
  adjacency,
]

function notApplicable(id: ObjectiveScore['id'], reason: string): ObjectiveScore {
  return { id, score: 0, reason, applicable: false }
}

function centroid(spaces: ScoredSpace[]): [number, number] {
  const total = spaces.reduce((sum, space) => sum + space.areaSqM, 0) || 1
  return [
    spaces.reduce((sum, space) => sum + space.centre[0] * space.areaSqM, 0) / total,
    spaces.reduce((sum, space) => sum + space.centre[1] * space.areaSqM, 0) / total,
  ]
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export type { ScoringContext }
