/**
 * Architectural reference data.
 *
 * What this is: conventional dimensional ranges that a working architect keeps
 * in their head. Useful because a model asked for "a comfortable bedroom" will
 * otherwise pick a number with no reasoning behind it.
 *
 * What this is **not**: code compliance. These are conventions, not regulation.
 * Every entry says where it applies and every answer the agent gives from it
 * must be framed as a convention, never as a legal requirement. Building codes
 * differ by country, city and building type, and pretending otherwise would be
 * the most damaging thing this file could do.
 *
 * Entries carry a `region`. `general` is the widely-portable baseline; regional
 * packs can be added without touching the query layer.
 */

export type KnowledgeRegion = 'general' | 'latam' | 'europe' | 'north-america'

export type SpaceType =
  | 'bedroom'
  | 'bedroom-main'
  | 'bathroom'
  | 'bathroom-small'
  | 'kitchen'
  | 'living'
  | 'dining'
  | 'living-dining'
  | 'hallway'
  | 'entry'
  | 'garage'
  | 'garage-double'
  | 'laundry'
  | 'storage'
  | 'office'
  | 'terrace'

export type DimensionGuide = {
  /** Below this the space stops working. */
  minimumSqM: number
  /** What most people would call comfortable. */
  comfortableSqM: number
  /** Shortest usable side, in metres. */
  minWidthM: number
  /** Typical proportion, width:depth. Guidance, not a rule. */
  typicalRatio?: string
  notes?: string
}

export type KnowledgeEntry = {
  id: string
  /** Free-text terms the query matches against. */
  topics: string[]
  region: KnowledgeRegion
  /** One or two sentences, written to be quoted to a user. */
  guidance: string
  spaceType?: SpaceType
  dimensions?: DimensionGuide
  /** Spaces this one usually sits next to, and why. */
  adjacency?: { with: string; reason: string }[]
  /** Always present so the agent can say where a number came from. */
  basis: string
}

export type KnowledgeQuery = {
  /** Free text: "bedroom size", "corridor width", "kitchen next to". */
  topic: string
  spaceType?: SpaceType
  region?: KnowledgeRegion
  limit?: number
}
