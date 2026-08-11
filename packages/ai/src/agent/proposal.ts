/**
 * Proposals.
 *
 * Small, reversible edits run straight away — asking permission to move a chair
 * is friction, not safety. But "design a house" over a scene that already has
 * one is a different animal: by the time the user sees what happened, the old
 * work is gone.
 *
 * So the agent stops and shows a plan. The plan carries the *actual tool calls*,
 * already schema-checked, so approving it executes exactly what was reviewed —
 * no second model call, no re-planning, no divergence between the plan the user
 * read and the work that runs.
 */

export type ProposedCall = {
  tool: string
  arguments: Record<string, unknown>
  /** One line for the user, e.g. "Main bedroom — 4.2 × 4.3 m (18.2 m²)". */
  label: string
}

export type Proposal = {
  id: string
  title: string
  summary: string
  calls: ProposedCall[]
  warnings: string[]
  createdAt: number
}

export type ProposalValidation =
  | { ok: true }
  | { ok: false; failures: { index: number; tool: string; message: string }[] }

/** Checks every call against its tool's schema before the user ever sees it. */
export function validateProposal(
  calls: ProposedCall[],
  validate: (name: string, args: unknown) => { ok: true } | { ok: false; message: string },
): ProposalValidation {
  const failures: { index: number; tool: string; message: string }[] = []

  for (const [index, call] of calls.entries()) {
    const result = validate(call.tool, call.arguments)
    if (!result.ok) {
      failures.push({ index, tool: call.tool, message: result.message })
    }
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures }
}

export type ProposalThresholds = {
  /** More planned calls than this and the agent should propose, not act. */
  maxDirectCalls: number
}

export const DEFAULT_PROPOSAL_THRESHOLDS: ProposalThresholds = {
  maxDirectCalls: 6,
}
