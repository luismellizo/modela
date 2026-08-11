import { describe, expect, test } from 'bun:test'
import { createProjectMemory, createWebStorage, type ProjectFact } from './project'

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
  }
}

describe('project memory', () => {
  test('remembers a fact and renders it for the prompt', () => {
    const memory = createProjectMemory()
    memory.remember({ key: 'lot-size', value: '10 × 25 m', category: 'constraint', source: 'user' })

    expect(memory.isEmpty()).toBe(false)
    const rendered = memory.render()
    expect(rendered).toContain('Constraints')
    expect(rendered).toContain('lot-size: 10 × 25 m')
  })

  test('an empty brief renders as nothing, not as an empty heading', () => {
    expect(createProjectMemory().render()).toBe('')
  })

  test('re-stating a key replaces it rather than contradicting itself', () => {
    const memory = createProjectMemory()
    memory.remember({ key: 'budget', value: 'low', category: 'constraint', source: 'user' })
    memory.remember({ key: 'budget', value: 'medium', category: 'constraint', source: 'user' })

    const facts = memory.facts().filter((fact) => fact.key === 'budget')
    expect(facts).toHaveLength(1)
    expect(facts[0]?.value).toBe('medium')
  })

  test('inferred facts are marked so in the prompt', () => {
    const memory = createProjectMemory()
    memory.remember({
      key: 'ceiling',
      value: '2.60 m',
      category: 'decision',
      source: 'inferred',
    })

    expect(memory.render()).toContain('your assumption, not stated')
  })

  test('forget removes it and reports whether it existed', () => {
    const memory = createProjectMemory()
    memory.remember({ key: 'style', value: 'minimal', category: 'preference', source: 'user' })

    expect(memory.forget('style')).toBe(true)
    expect(memory.forget('style')).toBe(false)
    expect(memory.isEmpty()).toBe(true)
  })

  test('groups by category in a stable order', () => {
    const memory = createProjectMemory()
    memory.remember({ key: 'style', value: 'modern', category: 'preference', source: 'user' })
    memory.remember({ key: 'area', value: '180 m²', category: 'brief', source: 'user' })
    memory.remember({ key: 'budget', value: 'medium', category: 'constraint', source: 'user' })

    const rendered = memory.render()
    expect(rendered.indexOf('Brief')).toBeLessThan(rendered.indexOf('Constraints'))
    expect(rendered.indexOf('Constraints')).toBeLessThan(rendered.indexOf('Preferences'))
  })

  test('drops inferred facts before anything the user said', () => {
    const memory = createProjectMemory({ maxFacts: 3 })
    memory.remember({ key: 'guess-1', value: 'a', category: 'decision', source: 'inferred' })
    memory.remember({ key: 'guess-2', value: 'b', category: 'decision', source: 'inferred' })
    memory.remember({ key: 'said-1', value: 'c', category: 'brief', source: 'user' })
    memory.remember({ key: 'said-2', value: 'd', category: 'brief', source: 'user' })
    memory.remember({ key: 'said-3', value: 'e', category: 'brief', source: 'user' })

    const keys = memory.facts().map((fact) => fact.key)
    expect(keys).toHaveLength(3)
    expect(keys).toContain('said-3')
    expect(keys).not.toContain('guess-1')
  })
})

describe('persistence', () => {
  test('survives a reload', () => {
    const backing = fakeStorage()
    const first = createProjectMemory({ storage: createWebStorage('modela.brief', backing) })
    first.remember({ key: 'area', value: '180 m²', category: 'brief', source: 'user' })

    const second = createProjectMemory({ storage: createWebStorage('modela.brief', backing) })
    expect(second.facts()).toHaveLength(1)
    expect(second.facts()[0]?.value).toBe('180 m²')
  })

  test('clear wipes both memory and storage', () => {
    const backing = fakeStorage()
    const memory = createProjectMemory({ storage: createWebStorage('modela.brief', backing) })
    memory.remember({ key: 'area', value: '180 m²', category: 'brief', source: 'user' })

    memory.clear()
    expect(memory.isEmpty()).toBe(true)
    expect(backing.map.size).toBe(0)
  })

  test('corrupt storage degrades to an empty brief instead of throwing', () => {
    const backing = fakeStorage()
    backing.setItem('modela.brief', '{not json')

    const memory = createProjectMemory({ storage: createWebStorage('modela.brief', backing) })
    expect(memory.isEmpty()).toBe(true)
  })

  test('storage that refuses to write does not break the session', () => {
    const memory = createProjectMemory({
      storage: {
        load: () => null,
        save: () => {
          throw new Error('QuotaExceededError')
        },
        clear: () => undefined,
      },
    })

    expect(() =>
      memory.remember({ key: 'area', value: '180 m²', category: 'brief', source: 'user' }),
    ).toThrow()
  })

  test('the web storage wrapper swallows a quota error', () => {
    const storage = createWebStorage('k', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => undefined,
    })

    expect(() => storage.save([] as ProjectFact[])).not.toThrow()
  })
})
