import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import type { SceneOperations } from '@pascal-app/mcp/operations'

/**
 * Snapshots, and alternatives built on them.
 *
 * "Give me three layouts" is only useful if asking for them cannot cost you the
 * one you already had. So every branch point is captured first, and restoring
 * captures the current state on the way out — you can always get back to where
 * you were, including back to the alternative you just left.
 *
 * Kept in memory on purpose for this phase: these are working alternatives
 * within a session, not saved projects. Persisting them is fase 4, and it goes
 * through the existing `SceneStore` rather than a second storage system.
 */

export type Snapshot = {
  id: string
  label: string
  graph: SceneGraph
  createdAt: number
  /** How it came about, so the UI can tell a branch from a safety net. */
  origin: 'manual' | 'alternative' | 'auto'
  /** Snapshot this one branched from, when it is an alternative. */
  parentId?: string
  stats: { nodes: number; spaces: number; floorAreaSqM: number }
}

export type SnapshotSummary = Omit<Snapshot, 'graph'>

export type SnapshotStore = {
  capture(options: {
    label: string
    origin?: Snapshot['origin']
    parentId?: string
  }): SnapshotSummary
  restore(id: string): { restored: SnapshotSummary; savedCurrent: SnapshotSummary }
  list(): SnapshotSummary[]
  get(id: string): Snapshot | undefined
  remove(id: string): boolean
  /** The snapshot currently loaded, if the scene came from one. */
  current(): string | null
  clear(): void
}

export type CreateSnapshotStoreOptions = {
  scene: SceneOperations
  /** Oldest snapshots are dropped past this. Graphs are not small. */
  maxSnapshots?: number
}

const DEFAULT_MAX = 12

export function createSnapshotStore(options: CreateSnapshotStoreOptions): SnapshotStore {
  const { scene } = options
  const max = options.maxSnapshots ?? DEFAULT_MAX
  const snapshots = new Map<string, Snapshot>()
  let currentId: string | null = null

  const summarise = (snapshot: Snapshot): SnapshotSummary => {
    const { graph: _graph, ...summary } = snapshot
    return summary
  }

  const evict = () => {
    while (snapshots.size > max) {
      // Oldest first, but never the one the scene is currently sitting on.
      const oldest = [...snapshots.values()]
        .sort((a, b) => a.createdAt - b.createdAt)
        .find((snapshot) => snapshot.id !== currentId)
      if (!oldest) break
      snapshots.delete(oldest.id)
    }
  }

  const capture: SnapshotStore['capture'] = ({ label, origin = 'manual', parentId }) => {
    const graph = scene.exportSceneGraph()
    const snapshot: Snapshot = {
      id: `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      label,
      graph,
      createdAt: Date.now(),
      origin,
      ...(parentId ? { parentId } : {}),
      stats: statsOf(graph),
    }
    snapshots.set(snapshot.id, snapshot)
    evict()
    return summarise(snapshot)
  }

  return {
    capture,

    restore(id) {
      const target = snapshots.get(id)
      if (!target) {
        throw new Error(`No snapshot with id "${id}"`)
      }

      // Capture where we are before leaving it. Without this, switching
      // alternatives quietly destroys whatever was on screen.
      const savedCurrent = capture({
        label: `Before restoring "${target.label}"`,
        origin: 'auto',
      })

      scene.loadJSON(target.graph)
      currentId = target.id

      return { restored: summarise(target), savedCurrent }
    },

    list: () =>
      [...snapshots.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((snapshot) => summarise(snapshot)),

    get: (id) => snapshots.get(id),

    remove(id) {
      if (currentId === id) currentId = null
      return snapshots.delete(id)
    },

    current: () => currentId,

    clear() {
      snapshots.clear()
      currentId = null
    },
  }
}

function statsOf(graph: SceneGraph): Snapshot['stats'] {
  const nodes = Object.values(graph.nodes ?? {})
  const zones = nodes.filter((node) => node.type === 'zone')

  let area = 0
  for (const zone of zones) {
    const polygon = ((zone as { polygon?: [number, number][] }).polygon ?? []) as [number, number][]
    area += shoelace(polygon)
  }

  return {
    nodes: nodes.length,
    spaces: zones.length,
    floorAreaSqM: Math.round(area * 100) / 100,
  }
}

function shoelace(polygon: [number, number][]): number {
  if (polygon.length < 3) return 0
  let total = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    if (!current || !next) continue
    total += current[0] * next[1] - next[0] * current[1]
  }
  return Math.abs(total) / 2
}
