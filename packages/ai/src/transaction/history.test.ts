import { describe, expect, test } from 'bun:test'
import { beginSceneTransaction, retainedPastStateCount } from './history'

function createStore(initial: unknown[] = []) {
  let pastStates = [...initial]
  return {
    temporal: {
      getState: () => ({ pastStates }),
      setState: (state: { pastStates: unknown[] }) => {
        pastStates = state.pastStates
      },
    },
    push(...entries: unknown[]) {
      pastStates = [...pastStates, ...entries]
    },
    get current() {
      return pastStates
    },
  }
}

describe('retainedPastStateCount', () => {
  test('everything survives when history only grew', () => {
    const before = ['a', 'b']
    expect(retainedPastStateCount(before, [...before, 'c', 'd'])).toBe(2)
  })

  test('detects front truncation when Zundo hits its limit', () => {
    const before = ['a', 'b', 'c']
    // 'a' was dropped off the front, two new states were appended.
    expect(retainedPastStateCount(before, ['b', 'c', 'd', 'e'])).toBe(2)
  })

  test('returns zero when nothing is recognisable', () => {
    expect(retainedPastStateCount(['a', 'b'], ['x', 'y'])).toBe(0)
  })
})

describe('beginSceneTransaction', () => {
  test('collapses many mutations into one undo step', () => {
    const store = createStore(['base'])
    const transaction = beginSceneTransaction(store)

    store.push('s1', 's2', 's3', 's4')
    expect(transaction.pendingSteps()).toBe(4)

    const { collapsedFrom } = transaction.commit()

    expect(collapsedFrom).toBe(4)
    expect(store.current).toEqual(['base', 's1'])
  })

  test('leaves a single mutation alone', () => {
    const store = createStore(['base'])
    const transaction = beginSceneTransaction(store)
    store.push('s1')

    expect(transaction.commit().collapsedFrom).toBe(1)
    expect(store.current).toEqual(['base', 's1'])
  })

  test('a read-only turn changes nothing', () => {
    const store = createStore(['base'])
    const transaction = beginSceneTransaction(store)

    expect(transaction.commit().collapsedFrom).toBe(0)
    expect(store.current).toEqual(['base'])
  })

  test('committing twice is a no-op', () => {
    const store = createStore([])
    const transaction = beginSceneTransaction(store)
    store.push('s1', 's2')

    transaction.commit()
    const second = transaction.commit()

    expect(second.collapsedFrom).toBe(0)
    expect(store.current).toEqual(['s1'])
  })

  test('abandon leaves history untouched', () => {
    const store = createStore(['base'])
    const transaction = beginSceneTransaction(store)
    store.push('s1', 's2', 's3')

    transaction.abandon()
    transaction.commit()

    expect(store.current).toEqual(['base', 's1', 's2', 's3'])
  })

  test('collapses correctly even when history was truncated mid-turn', () => {
    const store = createStore(['a', 'b'])
    const transaction = beginSceneTransaction(store)

    // Zundo dropped 'a' and appended three states.
    store.temporal.setState({ pastStates: ['b', 's1', 's2', 's3'] })
    transaction.commit()

    expect(store.current).toEqual(['b', 's1'])
  })
})
