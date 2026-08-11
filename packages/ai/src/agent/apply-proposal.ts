import type { SceneOperations } from '@pascal-app/mcp/operations'
import { createToolRegistry } from '../tools/registry'
import {
  DEFAULT_TOOL_LIMITS,
  type SelectionSnapshot,
  type ToolDefinition,
  type ToolLimits,
} from '../tools/types'
import type { TemporalHistoryStore } from '../transaction/history'
import { beginSceneTransaction } from '../transaction/history'
import type { AgentEvent, AgentEventHandler } from './events'
import type { Proposal } from './proposal'

/**
 * Runs an approved plan.
 *
 * Deliberately no model call. The user approved a list of steps; those exact
 * steps run. Asking the model to "now do it" would let it plan something
 * slightly different from what was on screen, which is the one thing a review
 * step exists to prevent.
 *
 * It emits the same events as a normal turn, so the panel renders progress with
 * the same components and the whole thing collapses into one undo step.
 */

export type ApplyProposalDependencies = {
  proposal: Proposal
  /**
   * The tool definitions, not a built registry. Applying builds its own with
   * every tool in the plan pre-approved — the user approving the plan *is* the
   * confirmation for the destructive steps they just read. Taking a registry
   * instead would leave a footgun where an approved delete is refused anyway.
   */
  tools: ToolDefinition[]
  scene: SceneOperations
  getSelection: () => SelectionSnapshot
  historyStore?: TemporalHistoryStore<unknown>
  limits?: ToolLimits
  signal?: AbortSignal
  onEvent?: AgentEventHandler
}

export type ApplyProposalResult = {
  proposalId: string
  applied: number
  failed: { index: number; tool: string; message: string }[]
  undoSteps: number
  status: 'completed' | 'partial' | 'cancelled'
}

export async function applyProposal(deps: ApplyProposalDependencies): Promise<ApplyProposalResult> {
  const emit = (event: AgentEvent) => deps.onEvent?.(event)
  const limits = deps.limits ?? DEFAULT_TOOL_LIMITS
  const failed: ApplyProposalResult['failed'] = []

  const registry = createToolRegistry({
    tools: deps.tools,
    confirmed: new Set(deps.proposal.calls.map((call) => call.tool)),
  })

  const transaction = deps.historyStore ? beginSceneTransaction(deps.historyStore) : null
  let applied = 0
  let cancelled = false

  for (const [index, call] of deps.proposal.calls.entries()) {
    if (deps.signal?.aborted) {
      cancelled = true
      break
    }

    const callId = `${deps.proposal.id}_${index}`
    const startedAt = Date.now()

    emit({ type: 'tool-start', callId, tool: call.tool, arguments: call.arguments })

    const outcome = await registry.execute(call.tool, JSON.stringify(call.arguments), {
      scene: deps.scene,
      selection: deps.getSelection(),
      limits,
      ...(deps.signal ? { signal: deps.signal } : {}),
    })

    const durationMs = Date.now() - startedAt

    if (outcome.ok) {
      applied += 1
      emit({
        type: 'tool-end',
        callId,
        tool: call.tool,
        ok: true,
        result: outcome.result,
        durationMs,
      })
      emit({ type: 'scene-changed', tool: call.tool })
    } else {
      failed.push({ index, tool: call.tool, message: outcome.message })
      emit({
        type: 'tool-end',
        callId,
        tool: call.tool,
        ok: false,
        code: outcome.code,
        message: outcome.message,
        ...(outcome.hint ? { hint: outcome.hint } : {}),
        durationMs,
      })
      // Keep going. A plan is a list of independent rooms far more often than a
      // chain, so stopping at the first failure would throw away good work.
    }
  }

  const undoSteps = transaction?.commit().collapsedFrom ?? 0

  return {
    proposalId: deps.proposal.id,
    applied,
    failed,
    undoSteps,
    status: cancelled ? 'cancelled' : failed.length > 0 ? 'partial' : 'completed',
  }
}
