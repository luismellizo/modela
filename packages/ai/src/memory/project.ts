/**
 * Project memory: the brief, not the chat.
 *
 * Three sources of truth exist and they do not rank equally:
 *
 *   1. The scene       — what actually exists. Always wins.
 *   2. Project memory  — the brief: budget, style, constraints, decisions.
 *   3. Conversation    — what was said this session. Weakest.
 *
 * The scene is rebuilt into the prompt on every turn, so it cannot go stale.
 * Conversation is trimmed and eventually forgotten. This layer is what survives
 * in between: the things a client told you once that still govern the project
 * three sessions later.
 *
 * It never stores geometry. "Three bedrooms" belongs here only as a *goal*; how
 * many bedrooms exist is a question for the scene, and if the two disagree the
 * scene is right and the agent says so.
 */

export type FactCategory =
  /** What the project is: size, programme, site. */
  | 'brief'
  /** Hard limits: budget, lot dimensions, regulations the user stated. */
  | 'constraint'
  /** Taste: style, materials, priorities. */
  | 'preference'
  /** Something settled during the work, so it is not relitigated. */
  | 'decision'

export type ProjectFact = {
  id: string
  /** Short slug, e.g. `lot-size`. Re-stating a key replaces it. */
  key: string
  value: string
  category: FactCategory
  /** `user` = they said it. `inferred` = the agent concluded it. */
  source: 'user' | 'inferred'
  statedAt: number
}

export type ProjectMemoryStorage = {
  load(): ProjectFact[] | null
  save(facts: ProjectFact[]): void
  clear(): void
}

export type ProjectMemory = {
  remember(input: Omit<ProjectFact, 'id' | 'statedAt'>): ProjectFact
  forget(key: string): boolean
  facts(): ProjectFact[]
  byCategory(category: FactCategory): ProjectFact[]
  /** Prose for the system prompt. Empty string when there is nothing to say. */
  render(): string
  clear(): void
  isEmpty(): boolean
}

export type CreateProjectMemoryOptions = {
  /** Omit for an in-memory-only brief, e.g. in tests. */
  storage?: ProjectMemoryStorage
  /** Facts above this and the oldest inferred ones are dropped. */
  maxFacts?: number
}

const DEFAULT_MAX_FACTS = 40

export function createProjectMemory(options: CreateProjectMemoryOptions = {}): ProjectMemory {
  const max = options.maxFacts ?? DEFAULT_MAX_FACTS
  let facts: ProjectFact[] = options.storage?.load() ?? []

  const persist = () => options.storage?.save(facts)

  const prune = () => {
    if (facts.length <= max) return
    // Drop inferred facts before anything the user actually said.
    const ordered = [...facts].sort((a, b) => {
      if (a.source !== b.source) return a.source === 'inferred' ? -1 : 1
      return a.statedAt - b.statedAt
    })
    const doomed = new Set(ordered.slice(0, facts.length - max).map((fact) => fact.id))
    facts = facts.filter((fact) => !doomed.has(fact.id))
  }

  return {
    remember(input) {
      const fact: ProjectFact = {
        ...input,
        id: `fact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        statedAt: Date.now(),
      }
      // Re-stating a key replaces it: a brief that accumulates contradictions
      // is worse than no brief.
      facts = [...facts.filter((entry) => entry.key !== fact.key), fact]
      prune()
      persist()
      return fact
    },

    forget(key) {
      const before = facts.length
      facts = facts.filter((fact) => fact.key !== key)
      const removed = facts.length < before
      if (removed) persist()
      return removed
    },

    facts: () => [...facts].sort((a, b) => a.statedAt - b.statedAt),
    byCategory: (category) => facts.filter((fact) => fact.category === category),
    isEmpty: () => facts.length === 0,

    clear() {
      facts = []
      options.storage?.clear()
    },

    render() {
      if (facts.length === 0) return ''

      const titles: Record<FactCategory, string> = {
        brief: 'Brief',
        constraint: 'Constraints',
        preference: 'Preferences',
        decision: 'Decisions already made',
      }

      const sections: string[] = []
      for (const category of ['brief', 'constraint', 'preference', 'decision'] as const) {
        const entries = facts.filter((fact) => fact.category === category)
        if (entries.length === 0) continue
        sections.push(
          `${titles[category]}:\n${entries
            .map(
              (fact) =>
                `- ${fact.key}: ${fact.value}${fact.source === 'inferred' ? ' (your assumption, not stated)' : ''}`,
            )
            .join('\n')}`,
        )
      }

      return sections.join('\n\n')
    },
  }
}

/**
 * Browser-backed storage. Lives here rather than in the app because it is
 * pure Web Storage API — no React, no DOM nodes — and keeping it beside the
 * memory keeps the serialisation format in one place.
 */
export function createWebStorage(
  key: string,
  storage: {
    getItem(k: string): string | null
    setItem(k: string, v: string): void
    removeItem(k: string): void
  },
): ProjectMemoryStorage {
  return {
    load() {
      try {
        const raw = storage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as ProjectFact[]) : null
      } catch {
        // Corrupt storage is not worth failing a session over.
        return null
      }
    },
    save(facts) {
      try {
        storage.setItem(key, JSON.stringify(facts))
      } catch {
        // Quota exceeded or private mode. The brief still works in memory.
      }
    },
    clear() {
      try {
        storage.removeItem(key)
      } catch {
        // Nothing useful to do.
      }
    },
  }
}
