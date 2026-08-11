import type { SceneOperations } from '@pascal-app/mcp/operations'
import { z } from 'zod'
import type { ToolSpec } from '../provider/types'

/** What a tool can reach. Nothing else — no React, no store, no DOM. */
export type ToolContext = {
  /** The domain façade. Shared with the MCP server, so behaviour matches. */
  scene: SceneOperations
  /** What the user has selected right now, if anything. */
  selection: SelectionSnapshot
  /** Aborted when the user cancels the turn. */
  signal?: AbortSignal
  /** Guardrails, so one bad tool call cannot melt the scene. */
  limits: ToolLimits
}

export type SelectionSnapshot = {
  buildingId: string | null
  levelId: string | null
  zoneId: string | null
  selectedIds: string[]
}

export type ToolLimits = {
  /** Refuse to create more than this many nodes in one call. */
  maxNodesPerCall: number
  /** Refuse coordinates or dimensions beyond this, in metres. */
  maxCoordinate: number
  /** Cap on how many nodes a read tool may return. */
  maxNodesPerRead: number
}

export const DEFAULT_TOOL_LIMITS: ToolLimits = {
  maxNodesPerCall: 120,
  maxCoordinate: 1000,
  maxNodesPerRead: 200,
}

/** Marks a tool as needing user confirmation before it runs. */
export type ToolRisk = 'safe' | 'destructive'

export type ToolDefinition<TInput extends z.ZodType = z.ZodType, TOutput = unknown> = {
  name: string
  description: string
  input: TInput
  /** Reads never mutate the scene, so the agent can call them freely. */
  kind: 'read' | 'write'
  risk: ToolRisk
  handler: (args: z.output<TInput>, context: ToolContext) => Promise<TOutput> | TOutput
}

/**
 * `defineTool` exists so the handler's `args` is inferred from the Zod schema.
 * Without it every tool would need its argument type written twice.
 */
export function defineTool<TInput extends z.ZodType, TOutput>(
  definition: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  return definition
}

export type ToolErrorCode =
  | 'unknown_tool'
  | 'invalid_arguments'
  | 'not_found'
  | 'limit_exceeded'
  | 'needs_confirmation'
  | 'cancelled'
  | 'failed'

export class ToolError extends Error {
  readonly code: ToolErrorCode
  /** Guidance handed back to the model so it can fix its own call. */
  readonly hint?: string

  constructor(code: ToolErrorCode, message: string, hint?: string) {
    super(message)
    this.name = 'ToolError'
    this.code = code
    if (hint !== undefined) this.hint = hint
  }
}

export type ToolOutcome =
  | { ok: true; result: unknown }
  | { ok: false; code: ToolErrorCode; message: string; hint?: string }

/** Converts a tool definition into the JSON Schema shape a model expects. */
export function toToolSpec(definition: ToolDefinition): ToolSpec {
  return {
    name: definition.name,
    description: definition.description,
    parameters: z.toJSONSchema(definition.input, { io: 'input' }) as Record<string, unknown>,
  }
}
