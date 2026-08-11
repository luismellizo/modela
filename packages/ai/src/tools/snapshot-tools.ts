import { z } from 'zod'
import { defineTool, type ToolContext, type ToolDefinition, ToolError } from './types'

/**
 * Snapshots as tools.
 *
 * These are what make "give me three options" possible without gambling the
 * design that already works. `restore_snapshot` is marked safe rather than
 * destructive precisely because it saves the current state on the way out —
 * there is nothing to lose, so making the user confirm every switch would be
 * friction for no protection.
 */
export function createSnapshotTools(): ToolDefinition[] {
  return [
    defineTool({
      name: 'save_snapshot',
      kind: 'read',
      risk: 'safe',
      description:
        'Save the current design under a label so you can come back to it. Do this before exploring an alternative, and after finishing one worth keeping.',
      input: z.object({
        label: z
          .string()
          .min(2)
          .max(80)
          .describe('What this version is, e.g. "Central circulation" or "Original layout"'),
        isAlternative: z
          .boolean()
          .optional()
          .describe('True when this is one of several options you are generating'),
      }),
      handler: (args, context) => {
        const store = requireSnapshots(context)
        const summary = store.capture({
          label: args.label,
          origin: args.isAlternative ? 'alternative' : 'manual',
          ...(store.current() ? { parentId: store.current() as string } : {}),
        })
        return {
          snapshotId: summary.id,
          label: summary.label,
          stats: summary.stats,
        }
      },
    }),

    defineTool({
      name: 'restore_snapshot',
      kind: 'write',
      risk: 'safe',
      description:
        'Load a saved design back into the editor. The current state is saved automatically first, so nothing is lost. Use it to go back to a previous version, or to reset before building the next alternative.',
      input: z.object({
        snapshotId: z.string().min(1).describe('Id from save_snapshot or list_snapshots'),
      }),
      handler: (args, context) => {
        const store = requireSnapshots(context)
        try {
          const { restored, savedCurrent } = store.restore(args.snapshotId)
          return {
            restored: { id: restored.id, label: restored.label, stats: restored.stats },
            previousStateSavedAs: savedCurrent.id,
          }
        } catch (error) {
          throw new ToolError(
            'not_found',
            error instanceof Error ? error.message : String(error),
            'Call list_snapshots to see which ids exist.',
          )
        }
      },
    }),

    defineTool({
      name: 'list_snapshots',
      kind: 'read',
      risk: 'safe',
      description:
        'List saved designs with their labels and sizes. Use it before restoring, and to tell the user what options exist.',
      input: z.object({}),
      handler: (_args, context) => {
        const store = requireSnapshots(context)
        const current = store.current()
        return {
          current,
          snapshots: store
            .list()
            // Automatic safety-net captures are noise for the model — the user
            // can still reach them through the UI.
            .filter((snapshot) => snapshot.origin !== 'auto')
            .map((snapshot) => ({
              id: snapshot.id,
              label: snapshot.label,
              isAlternative: snapshot.origin === 'alternative',
              isCurrent: snapshot.id === current,
              stats: snapshot.stats,
            })),
        }
      },
    }),
  ]
}

function requireSnapshots(context: ToolContext) {
  if (!context.snapshots) {
    throw new ToolError(
      'failed',
      'This host does not keep snapshots',
      'Work on the current design directly and describe alternatives in words.',
    )
  }
  return context.snapshots
}
