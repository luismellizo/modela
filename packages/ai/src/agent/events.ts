import type { TokenUsage } from '../provider/types'
import type { ToolErrorCode } from '../tools/types'
import type { ValidationReport } from '../validation/types'
import type { Proposal } from './proposal'

/**
 * What the UI sees. The panel renders from this stream alone — it never reads
 * agent internals — so the copilot UI can be replaced without touching the
 * agent, and the agent can be tested without a DOM.
 */
export type AgentEvent =
  | { type: 'turn-start'; turnId: string }
  /** A model call is in flight. `step` is 1-based. */
  | { type: 'step-start'; step: number }
  | { type: 'text-delta'; text: string }
  | { type: 'tool-start'; callId: string; tool: string; arguments: unknown }
  | {
      type: 'tool-end'
      callId: string
      tool: string
      ok: true
      result: unknown
      durationMs: number
    }
  | {
      type: 'tool-end'
      callId: string
      tool: string
      ok: false
      code: ToolErrorCode
      message: string
      hint?: string
      durationMs: number
    }
  /** Scene changed — the UI can nudge the viewport or flash what moved. */
  | { type: 'scene-changed'; tool: string }
  /** The agent stopped to ask. The UI renders the plan and collects a verdict. */
  | { type: 'proposal'; proposal: Proposal }
  /** An automatic design check ran. `round` is 0 for the first one. */
  | { type: 'validation'; report: ValidationReport; round: number; correcting: boolean }
  /** A tool was refused for want of approval. The UI can offer the button. */
  | { type: 'needs-confirmation'; callId: string; tool: string; arguments: unknown }
  | {
      type: 'turn-end'
      turnId: string
      text: string
      steps: number
      toolCalls: number
      /** History entries collapsed into one undo step. */
      undoSteps: number
      usage?: TokenUsage
      /** Set when the turn ended because the agent is waiting on approval. */
      awaitingProposal?: Proposal
    }
  | { type: 'cancelled'; turnId: string; undoSteps: number }
  | { type: 'error'; turnId: string; code: string; message: string }

export type AgentEventHandler = (event: AgentEvent) => void
