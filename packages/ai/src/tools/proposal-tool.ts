import { z } from 'zod'
import { type Proposal, validateProposal } from '../agent/proposal'
import { defineTool, type ToolDefinition, ToolError } from './types'

/**
 * `propose_plan` is the agent's way of stopping to ask.
 *
 * It does not touch the scene. It validates the planned calls, hands them to
 * the host, and ends the turn — the agent loop treats a successful proposal as
 * a full stop, so the model cannot talk itself into building anyway.
 */
export function createProposalTool(): ToolDefinition {
  return defineTool({
    name: 'propose_plan',
    kind: 'read',
    risk: 'safe',
    description:
      'Show the user a plan and wait for approval instead of building straight away. Use it when the work is large (roughly more than six steps), when it would delete or replace existing work, or when you are generating a whole design over a scene that already has one. Small reversible edits do not need this. The calls you list here are exactly what runs on approval, so make them complete and correct.',
    input: z.object({
      title: z.string().min(3).describe('Short heading, e.g. "180 m² house, 3 bedrooms"'),
      summary: z
        .string()
        .min(10)
        .describe('One or two sentences: what this does and any assumption it rests on'),
      calls: z
        .array(
          z.object({
            tool: z.string().min(1).describe('Name of the tool to run'),
            arguments: z.record(z.string(), z.unknown()).describe('Its arguments'),
            label: z
              .string()
              .min(1)
              .describe('One line for the user, with real numbers — "Kitchen — 3.5 × 4 m (14 m²)"'),
          }),
        )
        .min(1)
        .max(80),
      warnings: z
        .array(z.string())
        .optional()
        .describe('Anything the user should know before approving: estimates, unknowns, deletions'),
    }),
    handler: (args, context) => {
      if (!context.proposals) {
        throw new ToolError(
          'failed',
          'This host cannot show proposals',
          'Carry out the work directly instead, and describe what you did.',
        )
      }

      const validation = validateProposal(args.calls, context.proposals.validate)
      if (!validation.ok) {
        // A plan that cannot run is worse than no plan — the user would approve
        // something that then falls over halfway. Send it back to the model.
        throw new ToolError(
          'invalid_arguments',
          `${validation.failures.length} planned call(s) failed validation`,
          validation.failures
            .map((failure) => `calls[${failure.index}] (${failure.tool}): ${failure.message}`)
            .join('; '),
        )
      }

      const proposal: Proposal = {
        id: `proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        title: args.title,
        summary: args.summary,
        calls: args.calls,
        warnings: args.warnings ?? [],
        createdAt: Date.now(),
      }

      context.proposals.submit(proposal)

      return {
        proposalId: proposal.id,
        status: 'awaiting_approval',
        steps: proposal.calls.length,
        note: 'The plan is now in front of the user. Stop here — say what you are proposing in one or two sentences and wait. Do not build anything.',
      }
    },
  })
}
