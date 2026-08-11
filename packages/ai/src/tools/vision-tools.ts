import { z } from 'zod'
import { LAYOUT_REVIEW_PROMPT } from '../prompts/architect'
import { analyzeArchitecturalImage } from '../vision/analyze'
import { planFromExtraction } from '../vision/materialize'
import { ImageKind } from '../vision/schema'
import {
  defineTool,
  type ToolContext,
  type ToolDefinition,
  ToolError,
  type VisionContext,
} from './types'

/**
 * Vision as tools, not as a side channel.
 *
 * The model already *sees* attachments — they ride along in the user message.
 * What it cannot do on its own is a disciplined extraction that separates what
 * it observed from what it assumed. `analyze_image` forces that split and
 * hands back a build plan; the model then executes the plan with the ordinary
 * scene tools, so nothing bypasses validation.
 */
export function createVisionTools(): ToolDefinition[] {
  return [
    defineTool({
      name: 'analyze_image',
      kind: 'read',
      risk: 'safe',
      description:
        'Read an attached image as structured architecture: spaces with dimensions, walls, openings, plus an explicit split of what was observed, what was inferred and what is unknown. Returns a build plan you can then execute with create_room and friends. Use it before recreating a floor plan.',
      input: z.object({
        imageIndex: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe('Which attachment to read, 0 = the first one'),
        kind: ImageKind.optional().describe('Skip classification if you already know the type'),
        userContext: z
          .string()
          .optional()
          .describe('Anything the user told you about the image, e.g. "the lot is 10 by 25 m"'),
        levelId: z.string().optional().describe('Level the plan should be built on'),
      }),
      handler: async (args, context) => {
        const vision = requireVision(context)
        const image = vision.attachments[args.imageIndex]
        if (!image) {
          throw new ToolError(
            'not_found',
            `There is no attachment at index ${args.imageIndex}`,
            vision.attachments.length === 0
              ? 'The user has not attached any image to this message.'
              : `Attachments available: 0..${vision.attachments.length - 1}`,
          )
        }

        const extraction = await analyzeArchitecturalImage({
          provider: vision.provider,
          image,
          ...(args.kind ? { kind: args.kind } : {}),
          ...(args.userContext ? { userContext: args.userContext } : {}),
          ...(vision.model ? { model: vision.model } : {}),
          ...(context.signal ? { signal: context.signal } : {}),
        })

        const plan = planFromExtraction(extraction, {
          ...(args.levelId ? { levelId: args.levelId } : {}),
        })

        return {
          kind: extraction.kind,
          confidence: extraction.confidence,
          project: extraction.project,
          scale: extraction.scale,
          observed: extraction.observed,
          inferred: extraction.inferred,
          unknown: extraction.unknown,
          notes: extraction.notes,
          plan: {
            totalAreaSqM: plan.totalAreaSqM,
            warnings: plan.warnings,
            calls: plan.calls,
          },
          openings: extraction.openings,
          nextStep:
            plan.calls.length > 0
              ? 'Run plan.calls in order with the matching tools. Then add the openings with add_door/add_window, using the wallIds each create_room returned. Tell the user which dimensions were inferred rather than measured.'
              : 'There is nothing to build from this image. Tell the user what you could and could not read.',
        }
      },
    }),

    defineTool({
      name: 'review_viewport',
      kind: 'read',
      risk: 'safe',
      description:
        'Render what the user is currently looking at and study it. Use it for judgement calls — "what would you improve about this layout?", "does this facade read as modern?" — that the scene graph alone cannot answer.',
      input: z.object({
        question: z
          .string()
          .min(3)
          .describe('What to look for. Be specific; a vague question gets a vague answer.'),
      }),
      handler: async (args, context) => {
        const vision = requireVision(context)
        if (!vision.captureViewport) {
          throw new ToolError(
            'failed',
            'This host cannot capture the viewport',
            'Answer from the scene data instead, using get_scene_overview.',
          )
        }

        const image = await vision.captureViewport()
        if (!image) {
          throw new ToolError(
            'failed',
            'The viewport could not be captured',
            'Answer from the scene data instead.',
          )
        }

        const observations = await vision.provider.analyzeImage({
          image,
          instruction: `${LAYOUT_REVIEW_PROMPT}\n\nThe user asks: ${args.question}`,
          schema: {
            type: 'object',
            properties: {
              observations: { type: 'array', items: { type: 'string' } },
              suggestions: { type: 'array', items: { type: 'string' } },
              cannotTell: { type: 'array', items: { type: 'string' } },
            },
            required: ['observations', 'suggestions', 'cannotTell'],
            additionalProperties: false,
          },
          schemaName: 'viewport_review',
          ...(vision.model ? { model: vision.model } : {}),
          ...(context.signal ? { signal: context.signal } : {}),
        })

        return observations
      },
    }),
  ]
}

function requireVision(context: ToolContext): VisionContext {
  if (!context.vision) {
    throw new ToolError(
      'failed',
      'Image handling is not available in this session',
      'Work from the scene data instead.',
    )
  }
  return context.vision
}
