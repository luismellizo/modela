import { z } from 'zod'

/**
 * The structured reading of an image.
 *
 * The three-bucket split is the whole point. A model asked to extract a floor
 * plan will happily return a 4.2 m bedroom it never measured. Forcing every
 * fact into `observed`, `inferred` or `unknown` makes the guess visible instead
 * of letting it pass as a measurement — and `source` on each entity carries
 * that distinction all the way into the UI.
 */

export const EvidenceSource = z
  .enum(['observed', 'inferred'])
  .describe('observed = read directly from the image. inferred = a reasonable assumption.')

export const ImageKind = z.enum([
  'floor_plan',
  'facade',
  'interior',
  'sketch',
  'site',
  'reference',
  'not_architectural',
])
export type ImageKind = z.infer<typeof ImageKind>

export const ExtractedSpace = z.object({
  name: z.string(),
  type: z.enum([
    'bedroom',
    'bathroom',
    'kitchen',
    'living',
    'dining',
    'hallway',
    'entry',
    'garage',
    'terrace',
    'laundry',
    'storage',
    'office',
    'other',
  ]),
  widthM: z.number().nullable().describe('Null when the image gives no width'),
  depthM: z.number().nullable(),
  /** Plan position of the space centre, if the layout can be read. */
  centre: z.tuple([z.number(), z.number()]).nullable(),
  source: EvidenceSource,
})
export type ExtractedSpace = z.infer<typeof ExtractedSpace>

export const ExtractedWall = z.object({
  start: z.tuple([z.number(), z.number()]),
  end: z.tuple([z.number(), z.number()]),
  thicknessM: z.number().nullable(),
  source: EvidenceSource,
})

export const ExtractedOpening = z.object({
  kind: z.enum(['door', 'window']),
  /** Name of the space it serves — walls are matched by name, not by id. */
  spaceName: z.string(),
  /** 0..1 along the wall, when the plan shows it. */
  t: z.number().nullable(),
  widthM: z.number().nullable(),
  source: EvidenceSource,
})

export const ArchitecturalExtraction = z.object({
  kind: ImageKind,
  confidence: z.enum(['high', 'medium', 'low']),
  project: z.object({
    type: z.enum(['residential', 'commercial', 'mixed', 'unknown']),
    units: z.enum(['metric', 'imperial', 'unknown']),
    storeys: z.number().nullable(),
  }),
  scale: z.object({
    known: z.boolean(),
    /** How the scale was established, e.g. "5.20 m dimension line on the living room". */
    basis: z.string().nullable(),
  }),
  spaces: z.array(ExtractedSpace),
  walls: z.array(ExtractedWall),
  openings: z.array(ExtractedOpening),
  observed: z.array(z.string()).describe('Facts read directly from the image'),
  inferred: z.array(z.string()).describe('Assumptions made, each with its reasoning'),
  unknown: z.array(z.string()).describe('What the image does not say and was not assumed'),
  notes: z.string().describe('One or two sentences for the user'),
})
export type ArchitecturalExtraction = z.infer<typeof ArchitecturalExtraction>

/** JSON Schema handed to the provider for structured output. */
export function architecturalExtractionJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ArchitecturalExtraction, { io: 'output' }) as Record<string, unknown>
}
