import type { AnyNode, AnyNodeId } from '@pascal-app/core/schema'

/**
 * Architectural validation.
 *
 * `validate_scene` in the core checks that every node matches its Zod schema.
 * That catches a malformed node; it says nothing about a door that opens into
 * thin air or a bedroom nobody can reach. This layer covers the second kind.
 *
 * Hard constraint on what belongs here: a rule must be computable from the
 * scene graph. Anything that needs information the editor does not hold — code
 * compliance, structural adequacy, local regulation — is not a rule, it is a
 * guess wearing a rule's clothes, and it does not go in.
 */

export type IssueSeverity =
  /** Broken geometry. The design is wrong, not merely improvable. */
  | 'error'
  /** Very likely a mistake, but legitimate in some designs. */
  | 'warning'
  /** Worth knowing. Never worth blocking on. */
  | 'hint'

export type ValidationIssue = {
  /** Stable rule id, e.g. `door-outside-wall`. */
  rule: string
  severity: IssueSeverity
  message: string
  /** Nodes involved, so the agent can fix them and the UI can highlight them. */
  nodeIds: string[]
  /** What would resolve it. Written for the model, so it must be actionable. */
  fix?: string
}

export type SceneView = {
  nodes: Record<AnyNodeId, AnyNode>
  /** All nodes under a level, resolved through the parent chain. */
  byLevel: Map<string, AnyNode[]>
}

export type ValidationRule = {
  id: string
  severity: IssueSeverity
  /** One line explaining what it checks. Shown in docs and in the UI. */
  description: string
  check(view: SceneView): ValidationIssue[]
}

export type ValidationReport = {
  issues: ValidationIssue[]
  errors: number
  warnings: number
  hints: number
  /** Rules that ran. Useful when a user asks why something was not caught. */
  rulesRun: string[]
}
