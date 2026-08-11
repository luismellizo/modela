import type { SceneView } from '../validation/types'

/**
 * Layout scoring.
 *
 * This is the step from drawing to designing: not "is this valid?" but "is this
 * good, and better than the other one?".
 *
 * Everything here is a **heuristic computed from the scene graph**. There is no
 * solar simulation, no thermal model, no cost database. A daylight score counts
 * windows and looks at which façade they face; it does not compute illuminance.
 * Every objective says so in its `basis`, and the tool repeats it, because a
 * number that looks precise is exactly the kind of thing people stop
 * questioning.
 */

export type ObjectiveId =
  | 'target-areas'
  | 'daylight'
  | 'circulation'
  | 'compactness'
  | 'day-night-zoning'
  | 'adjacency'

export type ObjectiveScore = {
  id: ObjectiveId
  /** 0..1. Higher is better. */
  score: number
  /** Plain-language reason, with the numbers that produced the score. */
  reason: string
  /** What would raise it. Absent when the objective is already satisfied. */
  improvement?: string
  /** False when the scene has nothing to measure — excluded from the total. */
  applicable: boolean
}

export type Objective = {
  id: ObjectiveId
  label: string
  /** Relative importance in the default weighting. */
  defaultWeight: number
  /** What the number actually measures, and what it does not. */
  basis: string
  evaluate(context: ScoringContext): ObjectiveScore
}

export type Hemisphere = 'north' | 'south'

export type ScoringContext = {
  view: SceneView
  /** Only spaces on this level are scored. */
  levelId: string
  spaces: ScoredSpace[]
  /** Drives which façade counts as the sunny one. */
  hemisphere: Hemisphere
}

/** A zone with everything the objectives need, resolved once. */
export type ScoredSpace = {
  id: string
  name: string
  kind: SpaceKind
  areaSqM: number
  widthM: number
  depthM: number
  centre: [number, number]
  polygon: [number, number][]
  windows: number
  doors: number
  /** Which plan side each window faces, for the daylight heuristic. */
  windowFacings: Facing[]
}

export type Facing = 'north' | 'south' | 'east' | 'west'

export type SpaceKind =
  | 'bedroom'
  | 'bathroom'
  | 'kitchen'
  | 'living'
  | 'dining'
  | 'circulation'
  | 'garage'
  | 'service'
  | 'outdoor'
  | 'other'

export type LayoutScore = {
  /** 0..1 weighted mean of the applicable objectives. */
  total: number
  objectives: ObjectiveScore[]
  /** Ranked worst-first — where the design has most to gain. */
  weakest: ObjectiveScore[]
  spacesScored: number
  disclaimer: string
}

export type ScoringWeights = Partial<Record<ObjectiveId, number>>
