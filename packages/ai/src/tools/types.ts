import type { SceneOperations } from '@pascal-app/mcp/operations'
import { z } from 'zod'
import type { Proposal } from '../agent/proposal'
import type { SnapshotStore } from '../alternatives/snapshots'
import type { ProjectMemory } from '../memory/project'
import type { AIProvider, ToolSpec } from '../provider/types'

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
  /** Present only when the host can supply images. Vision tools need it. */
  vision?: VisionContext
  /** Present only when the host can show a plan and collect approval. */
  proposals?: ProposalContext
  /** Present only when the host keeps snapshots. Enables alternatives. */
  snapshots?: SnapshotStore
  /** Present only when the host persists a project brief across sessions. */
  project?: ProjectMemory
}

/**
 * Wired by the agent. `validate` comes from the tool registry, so a proposal is
 * checked against the very schemas that will run it.
 */
export type ProposalContext = {
  validate(name: string, args: unknown): { ok: true } | { ok: false; message: string }
  submit(proposal: Proposal): void
}

/**
 * Images reach the agent two ways: the user attaches them, or the host renders
 * the current viewport. `captureViewport` is injected by the app because
 * grabbing the canvas is DOM work, which this package does not do.
 */
export type VisionContext = {
  provider: AIProvider
  /** Data URLs attached to the current turn, in the order the user added them. */
  attachments: string[]
  captureViewport?: () => Promise<string | null>
  /** Model to use for image calls. Defaults to the provider's own. */
  model?: string
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

/**
 * Lowest-common-denominator JSON Schema for tool declarations.
 *
 * Zod emits correct 2020-12 JSON Schema. Function-calling APIs accept a much
 * smaller dialect, and they refuse the whole tool list rather than ignoring
 * what they do not know. Two real refusals, both found only by running the
 * copilot against a live model:
 *
 *     GenerateContentRequest…properties[start].items: missing field
 *     auto tool schema uses unsupported assertions or reserved metadata
 *
 * The first was `prefixItems` (how Zod encodes a tuple, and every coordinate
 * here is a tuple). The second was `propertyNames`, `pattern`,
 * `exclusiveMinimum` and friends. Either one killed *every* tool call on a
 * Gemini-family model — the copilot could not touch the scene at all.
 *
 * Hence an allowlist rather than a growing list of things to strip: an unknown
 * keyword should be dropped by default, because the cost of guessing wrong is
 * total failure rather than a slightly looser schema.
 *
 * **The advertised schema is a hint; Zod is the gate.** Dropping `minimum` does
 * not let a bad value through — `registry.execute` still parses against the
 * full schema and hands the model a precise error to correct. What is lost is
 * only some up-front guidance, and the `.describe()` text carries most of that.
 */
const ALLOWED_KEYWORDS = new Set([
  'type',
  'description',
  'enum',
  'items',
  'properties',
  'required',
  'minItems',
  'maxItems',
  'nullable',
])

export function normalizeJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeJsonSchema)
  if (node === null || typeof node !== 'object') return node

  const source = node as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(source)) {
    if (!ALLOWED_KEYWORDS.has(key)) continue
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, schema]) => [
          name,
          normalizeJsonSchema(schema),
        ]),
      )
      continue
    }
    out[key] = normalizeJsonSchema(value)
  }

  const prefixItems = source.prefixItems
  if (Array.isArray(prefixItems) && prefixItems.length > 0) {
    // Our tuples are homogeneous ([number, number]), so the first entry
    // describes them all. Length survives as minItems/maxItems.
    out.items = normalizeJsonSchema(prefixItems[0])
    out.minItems = prefixItems.length
    out.maxItems = prefixItems.length
  }

  return out
}

/** Converts a tool definition into the JSON Schema shape a model expects. */
export function toToolSpec(definition: ToolDefinition): ToolSpec {
  return {
    name: definition.name,
    description: definition.description,
    parameters: normalizeJsonSchema(z.toJSONSchema(definition.input, { io: 'input' })) as Record<
      string,
      unknown
    >,
  }
}
