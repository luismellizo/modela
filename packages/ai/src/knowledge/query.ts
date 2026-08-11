import { KNOWLEDGE_ENTRIES } from './entries'
import type { KnowledgeEntry, KnowledgeQuery } from './types'

/**
 * Retrieval over the reference set.
 *
 * Plain term scoring rather than embeddings: the corpus is a few dozen curated
 * entries, and a vector index would be more machinery than the whole knowledge
 * base is worth. When it grows past a few hundred, revisit.
 */

export function queryKnowledge(
  query: KnowledgeQuery,
  entries: KnowledgeEntry[] = KNOWLEDGE_ENTRIES,
): KnowledgeEntry[] {
  const phrase = query.topic.toLowerCase().trim()
  const terms = phrase
    .split(/[\s,]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2)

  const region = query.region ?? 'general'

  const scored = entries
    .map((entry) => ({ entry, score: score(entry, phrase, terms, query) }))
    .filter(({ score: value }) => value > 0)
    .sort((a, b) => {
      // A regional entry outranks the general one on an equal match, so a
      // Bogotá question does not get answered with a European default.
      const regionBias = (entry: KnowledgeEntry) => (entry.region === region ? 1 : 0)
      const bias = regionBias(b.entry) - regionBias(a.entry)
      return bias !== 0 ? bias : b.score - a.score
    })

  return scored.slice(0, query.limit ?? 4).map(({ entry }) => entry)
}

function score(
  entry: KnowledgeEntry,
  phrase: string,
  terms: string[],
  query: KnowledgeQuery,
): number {
  let total = 0

  // An explicit space type is a strong signal — the caller already knows what
  // they are asking about.
  if (query.spaceType && entry.spaceType === query.spaceType) total += 10

  // Multi-word topics are the specific ones — "main bedroom" against "bedroom".
  // Scoring word by word would let the general entry beat the specific one,
  // because the general topic matches a whole word while the specific topic
  // only ever matches parts. Match the phrase first.
  // Padded with spaces so the match respects word boundaries: without it
  // "room size" matches inside "bed|room size|" and the general entry beats the
  // specific one again, which is the exact bug this block exists to fix.
  const paddedPhrase = ` ${phrase} `
  for (const topic of entry.topics) {
    const normalised = topic.toLowerCase()
    if (normalised.includes(' ') && paddedPhrase.includes(` ${normalised} `)) total += 8
  }

  const haystack = [...entry.topics, entry.id, entry.guidance].join(' ').toLowerCase()

  for (const term of terms) {
    if (entry.topics.some((topic) => topic.toLowerCase() === term)) total += 5
    else if (entry.topics.some((topic) => topic.toLowerCase().includes(term))) total += 3
    else if (haystack.includes(term)) total += 1
  }

  // Regional entries should not surface for unrelated questions just because
  // they are regional.
  if (entry.region !== 'general' && total < 3) return 0

  return total
}

/** Compact rendering for a tool result. Keeps the basis attached to the numbers. */
export function renderEntry(entry: KnowledgeEntry): Record<string, unknown> {
  return {
    id: entry.id,
    guidance: entry.guidance,
    ...(entry.dimensions
      ? {
          dimensions: {
            minimumSqM: entry.dimensions.minimumSqM || undefined,
            comfortableSqM: entry.dimensions.comfortableSqM || undefined,
            minWidthM: entry.dimensions.minWidthM || undefined,
            typicalRatio: entry.dimensions.typicalRatio,
            notes: entry.dimensions.notes,
          },
        }
      : {}),
    ...(entry.adjacency ? { adjacency: entry.adjacency } : {}),
    region: entry.region,
    basis: entry.basis,
  }
}

export function listKnowledgeTopics(entries: KnowledgeEntry[] = KNOWLEDGE_ENTRIES): string[] {
  return [...new Set(entries.flatMap((entry) => entry.topics))].sort()
}
