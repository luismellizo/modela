import { describe, expect, test } from 'bun:test'
import type { Message } from '../provider/types'
import { createConversationMemory, userMessage } from './conversation'

function toolResult(name: string, payload: unknown): Message {
  return {
    role: 'tool',
    toolCallId: `call_${name}`,
    toolName: name,
    content: JSON.stringify(payload),
  }
}

describe('conversation memory', () => {
  test('keeps recent turns verbatim', () => {
    const memory = createConversationMemory()
    memory.append(userMessage('Build a house'))
    memory.append({ role: 'assistant', content: 'Sure.' })

    const messages = memory.toMessages()
    expect(messages).toHaveLength(2)
    expect(memory.turnCount()).toBe(1)
  })

  test('trims to the most recent turns', () => {
    const memory = createConversationMemory({ maxTurns: 2 })
    for (let index = 0; index < 5; index += 1) {
      memory.append(userMessage(`message ${index}`))
      memory.append({ role: 'assistant', content: `reply ${index}` })
    }

    const messages = memory.toMessages()
    expect(messages).toHaveLength(4)
    const first = messages[0]
    expect(first?.role).toBe('user')
    expect(
      first?.role === 'user' && first.content[0]?.type === 'text' && first.content[0].text,
    ).toBe('message 3')
  })

  test('old tool results collapse to a receipt with the ids kept', () => {
    const memory = createConversationMemory({ verboseToolResultTurns: 1 })
    memory.append(userMessage('turn one'))
    memory.append(
      toolResult('create_room', {
        zoneId: 'zone_1',
        wallIds: ['wall_1', 'wall_2'],
        bulky: 'x'.repeat(5000),
      }),
    )
    memory.append(userMessage('turn two'))

    const compacted = memory.toMessages().find((message) => message.role === 'tool')
    expect(compacted?.role).toBe('tool')
    const content = compacted?.role === 'tool' ? compacted.content : ''

    expect(content).not.toContain('xxxxx')
    expect(content).toContain('zone_1')
    expect(content).toContain('"ok":true')
  })

  test('a failed tool result keeps its error in the receipt', () => {
    const memory = createConversationMemory({ verboseToolResultTurns: 1 })
    memory.append(userMessage('turn one'))
    memory.append(toolResult('add_door', { error: 'not_found', message: 'no wall' }))
    memory.append(userMessage('turn two'))

    const compacted = memory.toMessages().find((message) => message.role === 'tool')
    const content = compacted?.role === 'tool' ? compacted.content : ''
    expect(content).toContain('not_found')
    expect(content).toContain('"ok":false')
  })

  test('a huge recent tool result is truncated, not dropped', () => {
    const memory = createConversationMemory({ maxToolResultChars: 100 })
    memory.append(userMessage('turn'))
    memory.append(toolResult('find_nodes', { nodes: 'y'.repeat(5000) }))

    const kept = memory.toMessages().find((message) => message.role === 'tool')
    const content = kept?.role === 'tool' ? kept.content : ''
    expect(content.length).toBeLessThan(400)
    expect(content).toContain('truncated')
  })

  test('history() returns everything untouched for the UI', () => {
    const memory = createConversationMemory({ maxTurns: 1 })
    memory.append(userMessage('one'))
    memory.append(userMessage('two'))
    memory.append(userMessage('three'))

    expect(memory.history()).toHaveLength(3)
    expect(memory.toMessages()).toHaveLength(1)
  })

  test('clear empties it', () => {
    const memory = createConversationMemory()
    memory.append(userMessage('hello'))
    memory.clear()
    expect(memory.history()).toHaveLength(0)
  })

  test('images ride along on the user message', () => {
    const message = userMessage('Recreate this', ['data:image/png;base64,AAA'])
    expect(message.content).toHaveLength(2)
    expect(message.content[1]?.type).toBe('image')
  })
})
