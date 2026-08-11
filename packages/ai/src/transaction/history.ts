/**
 * One AI turn, one undo step.
 *
 * `@pascal-app/core` ships `runAsSingleSceneHistoryStep`, but it takes a
 * synchronous callback: it reads the history, runs, and collapses — all in one
 * tick. An agent turn is async by nature (a model call sits between every pair
 * of tool calls), so the same job has to be split into `begin()` now and
 * `commit()` later.
 *
 * The collapse arithmetic is deliberately identical to core's: find how much of
 * the old history survived, then keep only the first state added on top. Undo
 * then walks back to exactly where the turn started.
 */

export type TemporalHistoryStore<TPastState> = {
  temporal: {
    getState(): { pastStates: TPastState[] }
    setState(state: { pastStates: TPastState[] }): void
  }
}

export type SceneTransaction = {
  /** How many history entries the turn has added so far. */
  pendingSteps(): number
  /** Collapse everything added since `begin` into a single undo step. */
  commit(): { collapsedFrom: number }
  /** Give up on collapsing — history keeps whatever the turn produced. */
  abandon(): void
}

/**
 * Zundo's `pastStates` is append-only within a turn, but it can also be
 * truncated from the front once it hits its limit. Comparing by identity finds
 * how many of the original entries are still there, which is the only reliable
 * anchor.
 */
export function retainedPastStateCount<TPastState>(
  before: readonly TPastState[],
  after: readonly TPastState[],
): number {
  for (let start = 0; start < before.length; start += 1) {
    const retained = before.length - start
    if (retained > after.length) continue
    let matches = true
    for (let index = 0; index < retained; index += 1) {
      if (before[start + index] !== after[index]) {
        matches = false
        break
      }
    }
    if (matches) return retained
  }
  return 0
}

export function beginSceneTransaction<TPastState>(
  store: TemporalHistoryStore<TPastState>,
): SceneTransaction {
  const before = [...store.temporal.getState().pastStates]
  let settled = false

  const added = (): { after: TPastState[]; retained: number; count: number } => {
    const after = store.temporal.getState().pastStates
    const retained = retainedPastStateCount(before, after)
    return { after, retained, count: after.length - retained }
  }

  return {
    pendingSteps: () => (settled ? 0 : added().count),

    commit() {
      if (settled) return { collapsedFrom: 0 }
      settled = true
      const { after, retained, count } = added()
      if (count > 1) {
        const firstAdded = after[retained]
        if (firstAdded !== undefined) {
          store.temporal.setState({ pastStates: [...after.slice(0, retained), firstAdded] })
        }
      }
      return { collapsedFrom: count }
    },

    abandon() {
      settled = true
    },
  }
}
