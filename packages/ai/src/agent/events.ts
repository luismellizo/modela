import type { TokenUsage } from '../provider/types'
import type { ToolErrorCode } from '../tools/types'

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
  | {
      type: 'turn-end'
      turnId: string
      text: string
      steps: number
      toolCalls: number
      /** History entries collapsed into one undo step. */
      undoSteps: number
      usage?: TokenUsage
    }
  | { type: 'cancelled'; turnId: string; undoSteps: number }
  | { type: 'error'; turnId: string; code: string; message: string }

export type AgentEventHandler = (event: AgentEvent) => void
