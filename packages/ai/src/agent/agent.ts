import type { SceneOperations } from '@pascal-app/mcp/operations'
import { buildSceneSummary, renderSceneSummary } from '../context/scene-context'
import type { ConversationMemory } from '../memory/conversation'
import { userMessage } from '../memory/conversation'
import { buildArchitectPrompt } from '../prompts/architect'
import type { AIProvider, Message, TokenUsage, ToolCall } from '../provider/types'
import { ProviderError } from '../provider/types'
import type { ToolRegistry } from '../tools/registry'
import type { VisionContext } from '../tools/types'
import {
  DEFAULT_TOOL_LIMITS,
  type ProposalContext,
  type SelectionSnapshot,
  type ToolLimits,
} from '../tools/types'
import type { SceneTransaction, TemporalHistoryStore } from '../transaction/history'
import { beginSceneTransaction } from '../transaction/history'
import { renderIssues, validateDesign } from '../validation/engine'
import type { ValidationReport, ValidationRule } from '../validation/types'
import type { AgentEvent, AgentEventHandler } from './events'
import type { Proposal } from './proposal'

export type AgentDependencies = {
  provider: AIProvider
  tools: ToolRegistry
  scene: SceneOperations
  /** Reads the live selection at the moment a tool runs, not at turn start. */
  getSelection: () => SelectionSnapshot
  /**
   * The Zundo store, used to collapse the turn into one undo step. Omit it and
   * the turn still works — each mutation just becomes its own undo entry.
   */
  historyStore?: TemporalHistoryStore<unknown>
  memory: ConversationMemory
  /**
   * Renders the current viewport as a data URL. DOM work, so the host owns it;
   * without it `review_viewport` tells the model to answer from scene data.
   */
  captureViewport?: () => Promise<string | null>
}

export type AgentOptions = {
  /** Hard cap on model calls per turn. Prevents a loop from burning credit. */
  maxSteps?: number
  limits?: ToolLimits
  /** Reply language, e.g. `es`. */
  language?: string
  projectNotes?: string
  temperature?: number
  /**
   * Run the architectural rules when the model thinks it has finished, and hand
   * any errors back so it can fix them. On by default: a model that believes it
   * is done is exactly when a door hanging off a wall goes unnoticed.
   */
  autoCorrect?: boolean
  /** How many times to send errors back before giving up and reporting them. */
  maxCorrectionRounds?: number
  /** Override the rule set. Defaults to `DEFAULT_RULES`. */
  rules?: ValidationRule[]
}

export type RunInput = {
  text: string
  /** `data:` URLs or absolute https URLs. */
  images?: string[]
  signal?: AbortSignal
  onEvent?: AgentEventHandler
}

export type RunResult = {
  turnId: string
  text: string
  steps: number
  toolCalls: number
  undoSteps: number
  usage: TokenUsage
  status: 'completed' | 'cancelled' | 'max-steps' | 'error' | 'awaiting-approval'
  error?: { code: string; message: string }
  /** Set when `status` is `awaiting-approval`. The host applies or discards it. */
  proposal?: Proposal
  /** The last automatic design check, when one ran. */
  validation?: ValidationReport
  /** How many times errors were handed back for correction. */
  correctionRounds?: number
}

export type Agent = {
  run(input: RunInput): Promise<RunResult>
}

const DEFAULT_MAX_STEPS = 24
const DEFAULT_CORRECTION_ROUNDS = 2

export function createAgent(deps: AgentDependencies, options: AgentOptions = {}): Agent {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
  const limits = options.limits ?? DEFAULT_TOOL_LIMITS
  const autoCorrect = options.autoCorrect ?? true
  const maxCorrectionRounds = options.maxCorrectionRounds ?? DEFAULT_CORRECTION_ROUNDS

  return {
    async run(input): Promise<RunResult> {
      const turnId = `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const emit = (event: AgentEvent) => input.onEvent?.(event)
      const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }

      let transaction: SceneTransaction | null = null
      let steps = 0
      let toolCalls = 0
      let finalText = ''
      let pendingProposal: Proposal | null = null
      let mutated = false
      let correctionRounds = 0
      let lastValidation: ValidationReport | null = null

      emit({ type: 'turn-start', turnId })

      // The system turn is rebuilt from the live store every run. That is what
      // makes the scene outrank anything said earlier in the conversation.
      const summary = renderSceneSummary(buildSceneSummary(deps.scene, deps.getSelection()))
      const system: Message = {
        role: 'system',
        content: buildArchitectPrompt({
          sceneSummary: summary,
          ...(options.language ? { language: options.language } : {}),
          ...(options.projectNotes ? { projectNotes: options.projectNotes } : {}),
        }),
      }

      const images = input.images ?? []
      deps.memory.append(userMessage(input.text, images))

      // Vision tools reach the provider through the same abstraction the loop
      // uses, so a mock provider makes them testable too.
      const vision: VisionContext = {
        provider: deps.provider,
        attachments: images,
        ...(deps.captureViewport ? { captureViewport: deps.captureViewport } : {}),
      }

      // Proposals validate against the very registry that will run them, so an
      // approved plan cannot fail on a schema the user never saw.
      const proposals: ProposalContext = {
        validate: (name, args) => deps.tools.validate(name, args),
        submit: (proposal) => {
          pendingProposal = proposal
          emit({ type: 'proposal', proposal })
        },
      }

      const finish = (status: RunResult['status'], error?: RunResult['error']): RunResult => {
        const undoSteps = transaction?.commit().collapsedFrom ?? 0
        if (status === 'cancelled') {
          emit({ type: 'cancelled', turnId, undoSteps })
        } else if (status === 'error' && error) {
          emit({ type: 'error', turnId, code: error.code, message: error.message })
        } else {
          emit({
            type: 'turn-end',
            turnId,
            text: finalText,
            steps,
            toolCalls,
            undoSteps,
            usage,
            ...(pendingProposal ? { awaitingProposal: pendingProposal } : {}),
          })
        }
        return {
          turnId,
          text: finalText,
          steps,
          toolCalls,
          undoSteps,
          usage,
          status,
          ...(error ? { error } : {}),
          ...(pendingProposal ? { proposal: pendingProposal } : {}),
          ...(lastValidation ? { validation: lastValidation } : {}),
          ...(correctionRounds > 0 ? { correctionRounds } : {}),
        }
      }

      try {
        while (steps < maxSteps) {
          if (input.signal?.aborted) return finish('cancelled')

          steps += 1
          emit({ type: 'step-start', step: steps })

          const stream = deps.provider.generate({
            messages: [system, ...deps.memory.toMessages()],
            tools: deps.tools.specs(),
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(input.signal ? { signal: input.signal } : {}),
          })

          let assistant: Message | null = null
          let pendingCalls: ToolCall[] = []
          let stepText = ''

          for await (const event of stream) {
            if (event.type === 'text-delta') {
              stepText += event.text
              emit({ type: 'text-delta', text: event.text })
            } else if (event.type === 'message') {
              assistant = event.message
              pendingCalls = event.message.toolCalls ?? []
              if (event.usage) {
                usage.inputTokens += event.usage.inputTokens
                usage.outputTokens += event.usage.outputTokens
              }
            }
          }

          if (!assistant) {
            // A provider that streamed nothing is a provider that failed.
            return finish('error', {
              code: 'empty_response',
              message: 'The model returned no message',
            })
          }

          deps.memory.append(assistant)
          if (stepText) finalText = stepText

          if (pendingCalls.length === 0) {
            // The model thinks it is done. That is precisely the moment a door
            // hanging off a wall goes unnoticed, so check before agreeing.
            if (!(autoCorrect && mutated) || correctionRounds >= maxCorrectionRounds) {
              if (autoCorrect && mutated) {
                lastValidation = validateDesign(deps.scene, options.rules)
                emit({
                  type: 'validation',
                  report: lastValidation,
                  round: correctionRounds,
                  correcting: false,
                })
              }
              return finish('completed')
            }

            const report = validateDesign(deps.scene, options.rules)
            lastValidation = report
            const correcting = report.errors > 0

            emit({ type: 'validation', report, round: correctionRounds, correcting })

            if (!correcting) {
              return finish('completed')
            }

            correctionRounds += 1
            // Handed back as a user turn because that is the only role every
            // provider accepts mid-conversation. The prefix keeps it honest —
            // the model can see this did not come from the person typing.
            deps.memory.append(
              userMessage(
                `[automatic design check] ${report.errors} error(s) found in what you just built:\n${renderIssues(report)}\n\nFix them with the scene tools, then say what you changed. Do not repeat the whole build.`,
              ),
            )
            continue
          }

          for (const call of pendingCalls) {
            if (input.signal?.aborted) return finish('cancelled')

            toolCalls += 1
            const definition = deps.tools.get(call.name)
            const startedAt = Date.now()

            emit({
              type: 'tool-start',
              callId: call.id,
              tool: call.name,
              arguments: safeParse(call.arguments),
            })

            // The transaction opens lazily: a turn that only reads the scene
            // should not touch the undo history at all.
            if (definition?.kind === 'write' && !transaction && deps.historyStore) {
              transaction = beginSceneTransaction(deps.historyStore)
            }

            const outcome = await deps.tools.execute(call.name, call.arguments, {
              scene: deps.scene,
              selection: deps.getSelection(),
              limits,
              vision,
              proposals,
              ...(input.signal ? { signal: input.signal } : {}),
            })

            const durationMs = Date.now() - startedAt

            if (outcome.ok) {
              emit({
                type: 'tool-end',
                callId: call.id,
                tool: call.name,
                ok: true,
                result: outcome.result,
                durationMs,
              })
              if (definition?.kind === 'write') {
                mutated = true
                emit({ type: 'scene-changed', tool: call.name })
              }
              deps.memory.append({
                role: 'tool',
                toolCallId: call.id,
                toolName: call.name,
                content: JSON.stringify(outcome.result ?? {}),
              })
            } else {
              emit({
                type: 'tool-end',
                callId: call.id,
                tool: call.name,
                ok: false,
                code: outcome.code,
                message: outcome.message,
                ...(outcome.hint ? { hint: outcome.hint } : {}),
                durationMs,
              })
              if (outcome.code === 'needs_confirmation') {
                emit({
                  type: 'needs-confirmation',
                  callId: call.id,
                  tool: call.name,
                  arguments: safeParse(call.arguments),
                })
              }
              // Errors go back to the model rather than aborting the turn —
              // recovering from a bad argument is its job, and it is good at it.
              deps.memory.append({
                role: 'tool',
                toolCallId: call.id,
                toolName: call.name,
                content: JSON.stringify({
                  error: outcome.code,
                  message: outcome.message,
                  ...(outcome.hint ? { hint: outcome.hint } : {}),
                }),
              })
            }
          }

          // A submitted proposal is a full stop. The prompt asks the model to
          // wait, but a prompt is not a control — the loop enforces it, so a
          // model that keeps going cannot build what the user has not approved.
          if (pendingProposal) {
            finalText =
              finalText || 'I have put a plan together. Review it and apply it when you are happy.'
            return finish('awaiting-approval')
          }
        }

        finalText =
          finalText ||
          `I stopped after ${maxSteps} steps to avoid running away. Tell me how to continue.`
        return finish('max-steps')
      } catch (error) {
        if (input.signal?.aborted) return finish('cancelled')
        if (error instanceof ProviderError) {
          if (error.code === 'cancelled') return finish('cancelled')
          return finish('error', { code: error.code, message: error.message })
        }
        return finish('error', {
          code: 'unknown',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
