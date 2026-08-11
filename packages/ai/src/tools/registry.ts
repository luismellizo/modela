import type { ToolSpec } from '../provider/types'
import {
  type ToolContext,
  type ToolDefinition,
  ToolError,
  type ToolOutcome,
  toToolSpec,
} from './types'

export type ToolRegistry = {
  /** Specs handed to the model. */
  specs(): ToolSpec[]
  get(name: string): ToolDefinition | undefined
  has(name: string): boolean
  names(): string[]
  /**
   * Validate and run. Never throws for tool-level problems — failures come back
   * as `{ ok: false }` so the agent can show them to the model and let it retry.
   */
  execute(name: string, rawArguments: string, context: ToolContext): Promise<ToolOutcome>
}

export type CreateToolRegistryOptions = {
  tools: ToolDefinition[]
  /**
   * Names the user has approved for this turn. A `destructive` tool not listed
   * here is refused with `needs_confirmation` instead of running.
   */
  confirmed?: ReadonlySet<string>
}

export function createToolRegistry(options: CreateToolRegistryOptions): ToolRegistry {
  const byName = new Map<string, ToolDefinition>()
  for (const tool of options.tools) {
    if (byName.has(tool.name)) {
      throw new Error(`Duplicate tool name: ${tool.name}`)
    }
    byName.set(tool.name, tool)
  }
  const confirmed = options.confirmed ?? new Set<string>()

  return {
    specs: () => [...byName.values()].map(toToolSpec),
    get: (name) => byName.get(name),
    has: (name) => byName.has(name),
    names: () => [...byName.keys()],

    async execute(name, rawArguments, context): Promise<ToolOutcome> {
      const tool = byName.get(name)
      if (!tool) {
        return {
          ok: false,
          code: 'unknown_tool',
          message: `No tool named "${name}"`,
          hint: `Available tools: ${[...byName.keys()].join(', ')}`,
        }
      }

      if (tool.risk === 'destructive' && !confirmed.has(name)) {
        return {
          ok: false,
          code: 'needs_confirmation',
          message: `"${name}" changes or removes existing work and needs the user to confirm`,
          hint: 'Describe what you intend to do and ask the user to approve it first.',
        }
      }

      let parsedJson: unknown
      try {
        parsedJson = rawArguments.trim() === '' ? {} : JSON.parse(rawArguments)
      } catch {
        return {
          ok: false,
          code: 'invalid_arguments',
          message: `Arguments for "${name}" are not valid JSON`,
          hint: 'Emit a single JSON object matching the tool schema.',
        }
      }

      const parsed = tool.input.safeParse(parsedJson)
      if (!parsed.success) {
        return {
          ok: false,
          code: 'invalid_arguments',
          message: `Arguments for "${name}" failed validation`,
          hint: parsed.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('; '),
        }
      }

      if (context.signal?.aborted) {
        return { ok: false, code: 'cancelled', message: 'Cancelled before the tool ran' }
      }

      try {
        const result = await tool.handler(parsed.data, context)
        return { ok: true, result }
      } catch (error) {
        if (error instanceof ToolError) {
          return {
            ok: false,
            code: error.code,
            message: error.message,
            ...(error.hint ? { hint: error.hint } : {}),
          }
        }
        return {
          ok: false,
          code: 'failed',
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}
