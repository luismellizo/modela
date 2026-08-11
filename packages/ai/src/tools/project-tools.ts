import { z } from 'zod'
import { queryKnowledge, renderEntry } from '../knowledge/query'
import type { KnowledgeRegion, SpaceType } from '../knowledge/types'
import { defineTool, type ToolContext, type ToolDefinition, ToolError } from './types'

const SPACE_TYPES = [
  'bedroom',
  'bedroom-main',
  'bathroom',
  'bathroom-small',
  'kitchen',
  'living',
  'dining',
  'living-dining',
  'hallway',
  'entry',
  'garage',
  'garage-double',
  'laundry',
  'storage',
  'office',
  'terrace',
] as const

/**
 * The brief and the reference data.
 *
 * These two belong together: one is what *this* project needs, the other is
 * what projects generally need. Between them the agent stops guessing at
 * dimensions and stops forgetting what it was told last week.
 */
export function createProjectTools(): ToolDefinition[] {
  return [
    defineTool({
      name: 'remember_project_fact',
      kind: 'read',
      risk: 'safe',
      description:
        'Store something about this project that should outlive the conversation: budget, lot size, style, a decision that was settled. Use it when the user states a requirement or agrees to something. Do not use it for what exists in the scene — that is what get_scene_overview is for.',
      input: z.object({
        key: z
          .string()
          .min(2)
          .max(48)
          .describe('Short slug, e.g. "lot-size" or "style". Re-using a key replaces it.'),
        value: z.string().min(1).max(400).describe('The fact, in plain language'),
        category: z
          .enum(['brief', 'constraint', 'preference', 'decision'])
          .describe(
            'brief = what it is · constraint = a hard limit · preference = taste · decision = settled',
          ),
        inferred: z
          .boolean()
          .optional()
          .describe('True when you concluded this rather than being told it'),
      }),
      handler: (args, context) => {
        const memory = requireProject(context)
        const fact = memory.remember({
          key: args.key,
          value: args.value,
          category: args.category,
          source: args.inferred ? 'inferred' : 'user',
        })
        return { remembered: fact.key, category: fact.category, totalFacts: memory.facts().length }
      },
    }),

    defineTool({
      name: 'get_project_brief',
      kind: 'read',
      risk: 'safe',
      description:
        'Everything remembered about this project across sessions. The scene always outranks it — if they disagree, the scene is right and you should say so.',
      input: z.object({}),
      handler: (_args, context) => {
        const memory = requireProject(context)
        return {
          empty: memory.isEmpty(),
          facts: memory.facts().map((fact) => ({
            key: fact.key,
            value: fact.value,
            category: fact.category,
            source: fact.source,
          })),
        }
      },
    }),

    defineTool({
      name: 'forget_project_fact',
      kind: 'read',
      risk: 'safe',
      description:
        'Remove a remembered fact, when the user changes their mind or says it is no longer true.',
      input: z.object({ key: z.string().min(1).describe('The key used when it was stored') }),
      handler: (args, context) => {
        const memory = requireProject(context)
        const removed = memory.forget(args.key)
        if (!removed) {
          throw new ToolError(
            'not_found',
            `Nothing is remembered under "${args.key}"`,
            'Call get_project_brief to see the keys that exist.',
          )
        }
        return { forgotten: args.key }
      },
    }),

    defineTool({
      name: 'query_architecture_knowledge',
      kind: 'read',
      risk: 'safe',
      description:
        'Look up conventional dimensions and layout guidance: how big a bedroom should be, how wide a corridor needs to be, what sits next to what. Use it before choosing a dimension yourself, and quote the basis when you tell the user. These are conventions, never code requirements.',
      input: z.object({
        topic: z
          .string()
          .min(2)
          .describe('What you need, e.g. "bedroom size", "corridor width", "kitchen adjacency"'),
        spaceType: z.enum(SPACE_TYPES).optional().describe('Narrows the answer when you know it'),
        region: z
          .enum(['general', 'latam', 'europe', 'north-america'])
          .optional()
          .describe('Regional practice, when it matters'),
      }),
      handler: (args) => {
        const results = queryKnowledge({
          topic: args.topic,
          ...(args.spaceType ? { spaceType: args.spaceType as SpaceType } : {}),
          ...(args.region ? { region: args.region as KnowledgeRegion } : {}),
        })

        if (results.length === 0) {
          return {
            found: 0,
            entries: [],
            note: 'Nothing on that topic. Choose a sensible dimension yourself and tell the user it is your judgement, not a reference figure.',
          }
        }

        return {
          found: results.length,
          entries: results.map(renderEntry),
          disclaimer:
            'These are conventions in common practice, not building code. Present them that way.',
        }
      },
    }),
  ]
}

function requireProject(context: ToolContext) {
  if (!context.project) {
    throw new ToolError(
      'failed',
      'This host does not keep a project brief',
      'Carry the requirement in the conversation instead.',
    )
  }
  return context.project
}
