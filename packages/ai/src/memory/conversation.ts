import type { AssistantMessage, Message, ToolResultMessage, UserMessage } from '../provider/types'

/**
 * Conversation memory.
 *
 * Two rules drive this:
 *
 *  - Cost. Tool results are the bulkiest thing in a transcript and the least
 *    useful once acted on. Old ones are replaced with a one-line receipt.
 *  - Truth. What the chat *said* is weaker evidence than what the scene *is*.
 *    The scene summary is rebuilt from the store on every turn, so nothing here
 *    is allowed to contradict it.
 */

export type ConversationOptions = {
  /** Turns kept verbatim. Older ones are trimmed. */
  maxTurns?: number
  /** Tool results older than this many turns collapse to a receipt. */
  verboseToolResultTurns?: number
  /** Characters above which even a recent tool result is truncated. */
  maxToolResultChars?: number
}

const DEFAULTS = {
  maxTurns: 12,
  verboseToolResultTurns: 2,
  maxToolResultChars: 4000,
} satisfies Required<ConversationOptions>

export type ConversationMemory = {
  append(message: Message): void
  appendAll(messages: Message[]): void
  /** Messages to send, already trimmed and compacted. */
  toMessages(): Message[]
  /** Everything, untouched — for rendering the UI. */
  history(): Message[]
  clear(): void
  /** Number of user turns recorded. */
  turnCount(): number
}

export function createConversationMemory(options: ConversationOptions = {}): ConversationMemory {
  const config = { ...DEFAULTS, ...options }
  const messages: Message[] = []

  const userTurnIndices = (): number[] =>
    messages.reduce<number[]>((acc, message, index) => {
      if (message.role === 'user') acc.push(index)
      return acc
    }, [])

  return {
    append(message) {
      messages.push(message)
    },

    appendAll(next) {
      messages.push(...next)
    },

    history: () => [...messages],
    turnCount: () => userTurnIndices().length,

    clear() {
      messages.length = 0
    },

    toMessages() {
      const turns = userTurnIndices()
      // Keep whole turns: cutting between an assistant tool call and its result
      // leaves the model looking at an unanswered call.
      const startIndex =
        turns.length > config.maxTurns ? (turns[turns.length - config.maxTurns] ?? 0) : 0

      const recentBoundary =
        turns.length > config.verboseToolResultTurns
          ? (turns[turns.length - config.verboseToolResultTurns] ?? 0)
          : 0

      return messages.slice(startIndex).map((message, offset) => {
        const absoluteIndex = startIndex + offset
        if (message.role !== 'tool') return message
        return compactToolResult(
          message,
          absoluteIndex >= recentBoundary,
          config.maxToolResultChars,
        )
      })
    },
  }
}

function compactToolResult(
  message: ToolResultMessage,
  recent: boolean,
  maxChars: number,
): ToolResultMessage {
  if (!recent) {
    return { ...message, content: receipt(message) }
  }
  if (message.content.length <= maxChars) return message
  return {
    ...message,
    content: `${message.content.slice(0, maxChars)}\n…truncated. Call ${message.toolName} again with a narrower filter if you need the rest.`,
  }
}

/**
 * A receipt keeps the fact that the call happened and whether it worked —
 * which is all the model needs from an old turn — without the payload.
 */
function receipt(message: ToolResultMessage): string {
  try {
    const parsed = JSON.parse(message.content) as Record<string, unknown>
    if (parsed.error) {
      return JSON.stringify({ tool: message.toolName, ok: false, error: parsed.error })
    }
    const ids = Object.entries(parsed)
      .filter(([key]) => key.endsWith('Id') || key.endsWith('Ids'))
      .slice(0, 6)
    return JSON.stringify({
      tool: message.toolName,
      ok: true,
      ...Object.fromEntries(ids),
    })
  } catch {
    return JSON.stringify({ tool: message.toolName, ok: true })
  }
}

export function userMessage(text: string, images: string[] = []): UserMessage {
  return {
    role: 'user',
    content: [
      { type: 'text' as const, text },
      ...images.map((url) => ({ type: 'image' as const, url })),
    ],
  }
}

export function assistantMessage(content: string): AssistantMessage {
  return { role: 'assistant', content }
}
