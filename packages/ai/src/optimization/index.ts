export {
  adjacency,
  circulation,
  compactness,
  DEFAULT_OBJECTIVES,
  daylight,
  dayNightZoning,
  targetAreas,
} from './objectives'
export {
  compareLayouts,
  type LayoutComparison,
  type ScoreLayoutOptions,
  scoreLayout,
} from './score'
export { classifySpace, collectSpaces, isHabitable } from './spaces'
export type {
  Facing,
  Hemisphere,
  LayoutScore,
  Objective,
  ObjectiveId,
  ObjectiveScore,
  ScoredSpace,
  ScoringContext,
  ScoringWeights,
  SpaceKind,
} from './types'
