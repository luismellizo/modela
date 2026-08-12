import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Import hygiene, enforced.
 *
 * This exists because of a bug that every other check passed: `build.ts`
 * imported `DEFAULT_LEVEL_HEIGHT` from the `@pascal-app/core` root barrel. The
 * barrel re-exports the whole package — including React Three Fiber systems
 * that call `createContext` at module scope. Typecheck was happy, the tests
 * were happy (Bun has no problem loading it), the production build was happy.
 * It only exploded when Next actually ran the route on the server:
 *
 *     TypeError: react.createContext is not a function
 *       at packages/core/dist/systems/elevator/elevator-runtime-system.js
 *
 * So: subpath imports only. `packages/ai` is meant to be runnable anywhere, and
 * pulling a barrel that reaches into the renderer breaks that quietly.
 */

const SRC = join(import.meta.dir)

const BARREL_IMPORTS = [
  "'@pascal-app/core'",
  '"@pascal-app/core"',
  "'@pascal-app/viewer'",
  "'@pascal-app/editor'",
  "'@pascal-app/nodes'",
]

/** React and the DOM have no business in this package at all. */
const FORBIDDEN = ["'react'", "'react-dom'", "'three'", "'@react-three/fiber'"]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })
}

describe('import hygiene', () => {
  const files = sourceFiles(SRC)

  test('finds the source files it is meant to police', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  test('never imports an upstream barrel', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const barrel of BARREL_IMPORTS) {
        if (source.includes(`from ${barrel}`)) {
          offenders.push(`${file.replace(SRC, '')} → ${barrel}`)
        }
      }
    }

    expect(
      offenders,
      'Use a subpath such as @pascal-app/core/schema. A barrel drags renderer code into the server.',
    ).toEqual([])
  })

  test('never imports React, the DOM or Three.js', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const forbidden of FORBIDDEN) {
        if (source.includes(`from ${forbidden}`)) {
          offenders.push(`${file.replace(SRC, '')} → ${forbidden}`)
        }
      }
    }

    expect(offenders, 'packages/ai must stay runnable without a browser.').toEqual([])
  })
})
