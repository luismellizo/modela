import type { Proposal, ToolErrorCode } from '@modela/ai'

/** What the panel renders. Derived entirely from the agent's event stream. */

export type ToolActivity = {
  callId: string
  tool: string
  arguments: unknown
  status: 'running' | 'ok' | 'failed'
  result?: unknown
  error?: { code: ToolErrorCode; message: string; hint?: string }
  durationMs?: number
}

export type Attachment = {
  id: string
  name: string
  /** `data:` URL, ready to send. */
  url: string
  sizeBytes: number
}

export type ChatMessage =
  | {
      id: string
      role: 'user'
      text: string
      attachments: Attachment[]
      at: number
    }
  | {
      id: string
      role: 'assistant'
      text: string
      activity: ToolActivity[]
      /** Set while the turn is still running. */
      streaming: boolean
      /** History entries this turn collapsed into one undo step. */
      undoSteps?: number
      status?: 'completed' | 'cancelled' | 'max-steps' | 'error' | 'awaiting-approval'
      error?: { code: string; message: string }
      /** A plan waiting on the user. Rendered as a card with apply/discard. */
      proposal?: Proposal
      /** Verdict once the user has decided. */
      proposalOutcome?: 'applied' | 'partial' | 'discarded'
      /** Destructive tools the agent asked to run and the user has not approved. */
      pendingConfirmations?: { callId: string; tool: string; arguments: unknown }[]
      at: number
    }

export type CopilotStatus =
  | { state: 'checking' }
  | { state: 'ready'; provider: string; model: string }
  | { state: 'disabled'; reason: string }
