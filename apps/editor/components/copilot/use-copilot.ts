'use client'

import {
  type Agent,
  type AgentEvent,
  applyProposal,
  createAgent,
  createConversationMemory,
  createHttpProvider,
  createProposalTool,
  createSceneTools,
  createToolRegistry,
  createVisionTools,
  type Proposal,
  type ToolDefinition,
} from '@modela/ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getHistoryStore, getSceneOperations, readSelection } from './scene-operations'
import type { Attachment, ChatMessage, CopilotStatus, ToolActivity } from './types'
import { captureViewport } from './viewport-capture'

/**
 * The panel's whole state machine.
 *
 * The agent runs here, in the browser, against the live scene. The server is
 * only a credentialed proxy for the model — see `app/api/copilot/route.ts`.
 */

const ENDPOINT = '/api/copilot'

export type UseCopilot = {
  status: CopilotStatus
  messages: ChatMessage[]
  running: boolean
  /** True once the agent has changed the scene at least once this session. */
  canUndo: boolean
  send(text: string, attachments: Attachment[]): Promise<void>
  cancel(): void
  undoLastOperation(): void
  clear(): void
  /** Run an approved plan. No model call — the reviewed steps run as reviewed. */
  applyPlan(messageId: string, proposal: Proposal): Promise<void>
  /** Throw a plan away without touching the scene. */
  discardPlan(messageId: string): void
  /**
   * Approve a destructive tool the agent asked for, and let it try again. The
   * approval lasts one turn.
   */
  approveTool(messageId: string, callId: string, tool: string): Promise<void>
  /** Refuse a destructive tool. The scene is untouched. */
  dismissTool(messageId: string, callId: string): void
}

export function useCopilot(): UseCopilot {
  const [status, setStatus] = useState<CopilotStatus>({ state: 'checking' })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [running, setRunning] = useState(false)
  const [canUndo, setCanUndo] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const confirmedRef = useRef<Set<string>>(new Set())
  // Memory lives across turns; the transcript above is only for rendering.
  const memory = useMemo(() => createConversationMemory(), [])

  useEffect(() => {
    let cancelled = false
    fetch(ENDPOINT)
      .then((response) => response.json())
      .then((payload: { enabled: boolean; provider: string; model: string; reason?: string }) => {
        if (cancelled) return
        setStatus(
          payload.enabled
            ? { state: 'ready', provider: payload.provider, model: payload.model }
            : { state: 'disabled', reason: payload.reason ?? 'AI is not configured' },
        )
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ state: 'disabled', reason: 'Could not reach the copilot service' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // One list, used by the agent and by plan application, so an approved plan
  // runs against exactly the tools that validated it.
  const toolDefinitions = useMemo<ToolDefinition[]>(
    () => [...createSceneTools(), ...createVisionTools(), createProposalTool()],
    [],
  )

  const buildAgent = useCallback((): Agent => {
    return createAgent(
      {
        provider: createHttpProvider({ endpoint: ENDPOINT, id: 'modela' }),
        tools: createToolRegistry({
          tools: toolDefinitions,
          confirmed: new Set(confirmedRef.current),
        }),
        scene: getSceneOperations(),
        getSelection: readSelection,
        historyStore: getHistoryStore(),
        memory,
        captureViewport,
      },
      { language: typeof navigator === 'undefined' ? 'en' : navigator.language.slice(0, 2) },
    )
  }, [memory, toolDefinitions])

  const patchMessage = useCallback(
    (id: string, update: (message: ChatMessage & { role: 'assistant' }) => void) => {
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== id || message.role !== 'assistant') return message
          const next = { ...message, activity: [...message.activity] }
          update(next)
          return next
        }),
      )
    },
    [],
  )

  const send = useCallback(
    async (text: string, attachments: Attachment[]) => {
      if (running || text.trim() === '') return

      const controller = new AbortController()
      abortRef.current = controller
      setRunning(true)

      const userId = `user_${Date.now()}`
      const assistantId = `assistant_${Date.now()}`

      setMessages((current) => [
        ...current,
        { id: userId, role: 'user', text, attachments, at: Date.now() },
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          activity: [],
          streaming: true,
          at: Date.now(),
        },
      ])

      const patch = (update: (message: ChatMessage & { role: 'assistant' }) => void) =>
        patchMessage(assistantId, update)

      const onEvent = (event: AgentEvent) => {
        switch (event.type) {
          case 'text-delta':
            patch((message) => {
              message.text += event.text
            })
            break
          case 'tool-start':
            patch((message) => {
              message.activity.push({
                callId: event.callId,
                tool: event.tool,
                arguments: event.arguments,
                status: 'running',
              })
            })
            break
          case 'tool-end':
            patch((message) => {
              const activity = message.activity.find(
                (entry): entry is ToolActivity => entry.callId === event.callId,
              )
              if (!activity) return
              activity.durationMs = event.durationMs
              if (event.ok) {
                activity.status = 'ok'
                activity.result = event.result
              } else {
                activity.status = 'failed'
                activity.error = {
                  code: event.code,
                  message: event.message,
                  ...(event.hint ? { hint: event.hint } : {}),
                }
              }
            })
            break
          case 'needs-confirmation':
            patch((message) => {
              message.pendingConfirmations = [
                ...(message.pendingConfirmations ?? []),
                { callId: event.callId, tool: event.tool, arguments: event.arguments },
              ]
            })
            break
          case 'proposal':
            patch((message) => {
              message.proposal = event.proposal
            })
            break
          case 'turn-end':
            patch((message) => {
              message.streaming = false
              message.text = event.text || message.text
              message.undoSteps = event.undoSteps
              message.status = event.awaitingProposal ? 'awaiting-approval' : 'completed'
            })
            if (event.undoSteps > 0) setCanUndo(true)
            break
          case 'cancelled':
            patch((message) => {
              message.streaming = false
              message.status = 'cancelled'
              message.text = message.text || 'Cancelled.'
            })
            if (event.undoSteps > 0) setCanUndo(true)
            break
          case 'error':
            patch((message) => {
              message.streaming = false
              message.status = 'error'
              message.error = { code: event.code, message: event.message }
            })
            break
          default:
            break
        }
      }

      try {
        const result = await buildAgent().run({
          text,
          images: attachments.map((attachment) => attachment.url),
          signal: controller.signal,
          onEvent,
        })
        if (result.status === 'max-steps') {
          patch((message) => {
            message.status = 'max-steps'
            message.streaming = false
          })
        }
      } finally {
        // Approvals are per-turn: confirming a delete once must not silently
        // authorise every delete for the rest of the session.
        confirmedRef.current = new Set()
        abortRef.current = null
        setRunning(false)
      }
    },
    [buildAgent, patchMessage, running],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const undoLastOperation = useCallback(() => {
    // One turn is one history entry, so a single undo reverts the whole thing.
    getSceneOperations().undo(1)
    setCanUndo(false)
  }, [])

  const clear = useCallback(() => {
    memory.clear()
    setMessages([])
    setCanUndo(false)
  }, [memory])

  const applyPlan = useCallback(
    async (messageId: string, proposal: Proposal) => {
      if (running) return

      const controller = new AbortController()
      abortRef.current = controller
      setRunning(true)

      // The card is replaced by live activity, so the user watches the same
      // steps they just read actually run.
      patchMessage(messageId, (message) => {
        message.proposal = undefined
        message.proposalOutcome = 'applied'
        message.status = 'completed'
      })

      try {
        const result = await applyProposal({
          proposal,
          tools: toolDefinitions,
          scene: getSceneOperations(),
          getSelection: readSelection,
          historyStore: getHistoryStore(),
          signal: controller.signal,
          onEvent: (event) => {
            patchMessage(messageId, (message) => {
              if (event.type === 'tool-start') {
                message.activity.push({
                  callId: event.callId,
                  tool: event.tool,
                  arguments: event.arguments,
                  status: 'running',
                })
              } else if (event.type === 'tool-end') {
                const activity = message.activity.find(
                  (entry): entry is ToolActivity => entry.callId === event.callId,
                )
                if (!activity) return
                activity.durationMs = event.durationMs
                if (event.ok) {
                  activity.status = 'ok'
                  activity.result = event.result
                } else {
                  activity.status = 'failed'
                  activity.error = { code: event.code, message: event.message }
                }
              }
            })
          },
        })

        patchMessage(messageId, (message) => {
          message.undoSteps = result.undoSteps
          message.proposalOutcome = result.failed.length > 0 ? 'partial' : 'applied'
          if (result.failed.length > 0) {
            message.text = `${message.text}\n\nApplied ${result.applied} of ${proposal.calls.length} steps. ${result.failed.length} failed — see the activity above.`
          }
        })

        // The model has to know what actually happened, or its next answer will
        // describe a scene that does not exist.
        memory.append({
          role: 'assistant',
          content: `The user approved the plan "${proposal.title}". Applied ${result.applied} of ${proposal.calls.length} steps${
            result.failed.length > 0
              ? `; these failed: ${result.failed
                  .map((failure) => `${failure.tool} (${failure.message})`)
                  .join(', ')}`
              : ''
          }.`,
        })

        if (result.undoSteps > 0) setCanUndo(true)
      } finally {
        abortRef.current = null
        setRunning(false)
      }
    },
    [memory, patchMessage, running, toolDefinitions],
  )

  const discardPlan = useCallback(
    (messageId: string) => {
      patchMessage(messageId, (message) => {
        message.proposal = undefined
        message.proposalOutcome = 'discarded'
        message.status = 'completed'
      })
      memory.append({
        role: 'assistant',
        content: 'The user discarded the plan. Nothing was built. Ask what to change.',
      })
    },
    [memory, patchMessage],
  )

  const approveTool = useCallback(
    async (messageId: string, callId: string, tool: string) => {
      // Lasts one turn only — approving one delete must not authorise every
      // delete for the rest of the session.
      confirmedRef.current.add(tool)
      patchMessage(messageId, (message) => {
        message.pendingConfirmations = (message.pendingConfirmations ?? []).filter(
          (entry) => entry.callId !== callId,
        )
      })
      await send(`Approved: go ahead with ${tool}.`, [])
    },
    [patchMessage, send],
  )

  const dismissTool = useCallback(
    (messageId: string, callId: string) => {
      patchMessage(messageId, (message) => {
        message.pendingConfirmations = (message.pendingConfirmations ?? []).filter(
          (entry) => entry.callId !== callId,
        )
      })
      memory.append({
        role: 'assistant',
        content: 'The user refused that operation. Do not retry it; propose something else.',
      })
    },
    [memory, patchMessage],
  )

  return {
    status,
    messages,
    running,
    canUndo,
    send,
    cancel,
    undoLastOperation,
    clear,
    applyPlan,
    discardPlan,
    approveTool,
    dismissTool,
  }
}
