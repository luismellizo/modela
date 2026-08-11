import { z } from 'zod'
import { compareLayouts, scoreLayout } from '../optimization/score'
import type { Hemisphere } from '../optimization/types'
import { defineTool, type ToolDefinition, ToolError } from './types'

/**
 * Scoring and comparison.
 *
 * `score_layout` reads the design as built. `compare_layouts` scores saved
 * snapshots against each other — which is how "give me three options and tell me
 * which is best" becomes something better than a coin toss.
 *
 * Comparison deliberately restores each snapshot to measure it and puts the
 * original back afterwards. Scoring a stored graph without loading it would need
 * a second scene implementation, and two implementations of the same thing drift.
 */
export function createOptimizationTools(): ToolDefinition[] {
  return [
    defineTool({
      name: 'score_layout',
      kind: 'read',
      risk: 'safe',
      description:
        'Score the current layout on room sizes, daylight, circulation, compactness, day/night separation and adjacencies. Returns a number per objective with the reasoning behind it. Use it to answer "is this any good?" and to find what to improve. These are heuristics from the plan, not simulations.',
      input: z.object({
        levelId: z.string().optional().describe('Defaults to the first level'),
        hemisphere: z
          .enum(['north', 'south'])
          .optional()
          .describe('Which side the sun comes from. Ask the user if you do not know.'),
      }),
      handler: (args, context) => {
        const score = scoreLayout({
          scene: context.scene,
          ...(args.levelId ? { levelId: args.levelId } : {}),
          ...(args.hemisphere ? { hemisphere: args.hemisphere as Hemisphere } : {}),
        })

        if (score.spacesScored === 0) {
          return {
            total: 0,
            spacesScored: 0,
            note: 'Nothing to score — the level has no spaces yet.',
          }
        }

        return {
          total: score.total,
          spacesScored: score.spacesScored,
          objectives: score.objectives
            .filter((objective) => objective.applicable)
            .map((objective) => ({
              id: objective.id,
              score: objective.score,
              reason: objective.reason,
              improvement: objective.improvement,
            })),
          skipped: score.objectives
            .filter((objective) => !objective.applicable)
            .map((objective) => ({ id: objective.id, why: objective.reason })),
          weakest: score.weakest.map((objective) => objective.id),
          disclaimer: score.disclaimer,
        }
      },
    }),

    defineTool({
      name: 'compare_layouts',
      kind: 'write',
      risk: 'safe',
      description:
        'Score two or more saved designs and rank them, explaining what separates the top two. Save each option with save_snapshot first. The editor is left showing whichever design it was showing before.',
      input: z.object({
        snapshotIds: z
          .array(z.string().min(1))
          .min(2)
          .max(6)
          .describe('Ids from save_snapshot or list_snapshots'),
        hemisphere: z.enum(['north', 'south']).optional(),
      }),
      handler: (args, context) => {
        const store = context.snapshots
        if (!store) {
          throw new ToolError(
            'failed',
            'This host does not keep snapshots, so there is nothing to compare',
            'Score the current layout with score_layout instead.',
          )
        }

        const missing = args.snapshotIds.filter((id) => !store.get(id))
        if (missing.length > 0) {
          throw new ToolError(
            'not_found',
            `Unknown snapshot(s): ${missing.join(', ')}`,
            'Call list_snapshots for the ids that exist.',
          )
        }

        // Put the user back where they were, whatever happens below.
        const restorePoint = store.capture({ label: 'Before comparing layouts', origin: 'auto' })

        try {
          const entries = args.snapshotIds.map((id) => {
            store.restore(id)
            return {
              label: store.get(id)?.label ?? id,
              score: scoreLayout({
                scene: context.scene,
                ...(args.hemisphere ? { hemisphere: args.hemisphere as Hemisphere } : {}),
              }),
            }
          })

          const comparison = compareLayouts(entries)

          return {
            ranked: comparison.ranked.map((entry) => ({
              label: entry.label,
              total: entry.total,
              strongest: entry.score.objectives
                .filter((objective) => objective.applicable && objective.score >= 0.8)
                .map((objective) => objective.id),
              weakest: entry.score.weakest.map((objective) => objective.id),
            })),
            verdict: comparison.verdict,
            disclaimer: entries[0]?.score.disclaimer,
          }
        } finally {
          store.restore(restorePoint.id)
        }
      },
    }),
  ]
}
