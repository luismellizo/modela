import type { ToolErrorCode } from '@modela/ai'

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
      status?: 'completed' | 'cancelled' | 'max-steps' | 'error'
      error?: { code: string; message: string }
      at: number
    }

export type CopilotStatus =
  | { state: 'checking' }
  | { state: 'ready'; provider: string; model: string }
  | { state: 'disabled'; reason: string }
