import type { SceneOperations } from '@pascal-app/mcp/operations'
import { buildSceneView } from '../validation/engine'
import { DEFAULT_OBJECTIVES } from './objectives'
import { collectSpaces, round } from './spaces'
import type { Hemisphere, LayoutScore, Objective, ObjectiveScore, ScoringWeights } from './types'

const DISCLAIMER =
  'These are heuristics computed from the plan — window counts, distances, areas. No daylight, thermal or cost simulation is performed. Use them to compare options, not as absolute quality.'

export type ScoreLayoutOptions = {
  scene: SceneOperations
  /** Defaults to the first level found. */
  levelId?: string
  /** Which way the sun comes from. Defaults to north — ask the user. */
  hemisphere?: Hemisphere
  objectives?: Objective[]
  weights?: ScoringWeights
}

export function scoreLayout(options: ScoreLayoutOptions): LayoutScore {
  const view = buildSceneView(options.scene)
  const levelId = options.levelId ?? firstLevelId(view.byLevel)

  if (!levelId) {
    return {
      total: 0,
      objectives: [],
      weakest: [],
      spacesScored: 0,
      disclaimer: DISCLAIMER,
    }
  }

  const spaces = collectSpaces(view, levelId)
  const objectives = options.objectives ?? DEFAULT_OBJECTIVES
  const context = {
    view,
    levelId,
    spaces,
    hemisphere: options.hemisphere ?? ('north' as Hemisphere),
  }

  const scores = objectives.map((objective) => objective.evaluate(context))
  const applicable = scores.filter((score) => score.applicable)

  const total = weightedMean(applicable, objectives, options.weights)

  return {
    total: round(total),
    objectives: scores.map((score) => ({ ...score, score: round(score.score) })),
    weakest: [...applicable]
      .filter((score) => score.score < 0.8)
      .sort((a, b) => a.score - b.score)
      .map((score) => ({ ...score, score: round(score.score) })),
    spacesScored: spaces.length,
    disclaimer: DISCLAIMER,
  }
}

export type LayoutComparison = {
  ranked: { label: string; total: number; score: LayoutScore }[]
  /** Why the winner won, per objective, against the runner-up. */
  verdict: string
}

/**
 * Comparing options is the point of scoring at all. Ranking alone would leave
 * the user with a leaderboard and no reason, so the verdict names the
 * objectives that actually separated the top two.
 */
export function compareLayouts(entries: { label: string; score: LayoutScore }[]): LayoutComparison {
  const ranked = entries
    .map((entry) => ({ label: entry.label, total: entry.score.total, score: entry.score }))
    .sort((a, b) => b.total - a.total)

  const winner = ranked[0]
  const runnerUp = ranked[1]

  if (!winner) return { ranked, verdict: 'Nothing to compare.' }
  if (!runnerUp) {
    return { ranked, verdict: `Only "${winner.label}" was scored, so there is nothing to beat.` }
  }

  const differences = winner.score.objectives
    .map((objective) => {
      const other = runnerUp.score.objectives.find((entry) => entry.id === objective.id)
      if (!other || !objective.applicable || !other.applicable) return null
      return { id: objective.id, delta: objective.score - other.score, reason: objective.reason }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter((entry) => Math.abs(entry.delta) >= 0.05)
    .sort((a, b) => b.delta - a.delta)

  const better = differences.filter((entry) => entry.delta > 0).slice(0, 2)
  const worse = differences.filter((entry) => entry.delta < 0).slice(0, 1)

  if (better.length === 0 && worse.length === 0) {
    return {
      ranked,
      verdict: `"${winner.label}" and "${runnerUp.label}" score almost identically. Choose on grounds this cannot measure — how they feel, how they build.`,
    }
  }

  const parts = [
    `"${winner.label}" leads on ${better.map((entry) => `${entry.id} (${entry.reason})`).join(' and ')}`,
  ]
  if (worse.length > 0 && worse[0]) {
    parts.push(
      `but "${runnerUp.label}" is better on ${worse[0].id} — worth weighing if that matters more here`,
    )
  }

  return { ranked, verdict: `${parts.join(', ')}.` }
}

function weightedMean(
  scores: ObjectiveScore[],
  objectives: Objective[],
  weights?: ScoringWeights,
): number {
  let weightedTotal = 0
  let weightSum = 0

  for (const score of scores) {
    const objective = objectives.find((entry) => entry.id === score.id)
    const weight = weights?.[score.id] ?? objective?.defaultWeight ?? 1
    weightedTotal += score.score * weight
    weightSum += weight
  }

  return weightSum === 0 ? 0 : weightedTotal / weightSum
}

function firstLevelId(byLevel: Map<string, unknown>): string | undefined {
  for (const key of byLevel.keys()) return key
  return undefined
}
