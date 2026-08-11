import type { AnyNode, AnyNodeId, AnyNodeType } from '@pascal-app/core/schema'
import type { SceneOperations } from '@pascal-app/mcp/operations'

/**
 * A scene good enough to exercise the tools without booting React, Three.js or
 * a browser. It implements the same `SceneOperations` surface the real
 * `SceneBridge` does, over a plain node map plus a fake Zundo history.
 */

export type FakeHistoryState = { pastStates: unknown[] }

export type FakeScene = SceneOperations & {
  /** Fake temporal store, shaped like Zundo's. */
  temporalStore: {
    temporal: {
      getState(): FakeHistoryState
      setState(state: FakeHistoryState): void
    }
  }
  /** Every mutation recorded, for assertions. */
  readonly log: string[]
  seed(nodes: AnyNode[]): void
}

export function createFakeScene(initial: AnyNode[] = []): FakeScene {
  const nodes = new Map<string, AnyNode>()
  const rootIds: string[] = []
  const log: string[] = []
  let pastStates: unknown[] = []

  const snapshot = () => Object.fromEntries(nodes) as Record<AnyNodeId, AnyNode>
  // Every mutation pushes one entry, which is exactly how Zundo behaves and is
  // what the transaction collapse has to cope with.
  const pushHistory = () => {
    pastStates = [...pastStates, snapshot()]
  }

  const insert = (node: AnyNode, parentId?: string) => {
    const stored = { ...node, parentId: parentId ?? null } as AnyNode
    nodes.set(node.id, stored)
    if (parentId) {
      const parent = nodes.get(parentId)
      if (parent) {
        const children = [...((parent as { children?: string[] }).children ?? []), node.id]
        nodes.set(parentId, { ...parent, children } as AnyNode)
      }
    } else {
      rootIds.push(node.id)
    }
  }

  const descendants = (id: string): string[] => {
    const out: string[] = []
    const walk = (current: string) => {
      out.push(current)
      for (const node of nodes.values()) {
        if (node.parentId === current) walk(node.id)
      }
    }
    walk(id)
    return out
  }

  for (const node of initial) insert(node, node.parentId ?? undefined)

  const unsupported = (name: string) => () => {
    throw new Error(`${name} is not implemented in the fake scene`)
  }

  const scene = {
    hasBridge: true,
    hasStore: false,
    hasSceneEvents: false,
    canAppendSceneEvents: false,
    canListSceneEvents: false,
    canCreateProject: false,
    canGetProjectStatus: false,
    storeBackend: null,

    temporalStore: {
      temporal: {
        getState: () => ({ pastStates }),
        setState: (state: FakeHistoryState) => {
          pastStates = state.pastStates
        },
      },
    },
    log,

    seed(next: AnyNode[]) {
      for (const node of next) insert(node, node.parentId ?? undefined)
    },

    getNode: (id: AnyNodeId) => nodes.get(id) ?? null,
    getNodes: () => snapshot(),
    getRootNodeIds: () => rootIds as AnyNodeId[],
    getChildren: (parentId: AnyNodeId) =>
      [...nodes.values()].filter((node) => node.parentId === parentId),

    getAncestry(id: AnyNodeId) {
      const chain: AnyNode[] = []
      let current = nodes.get(id)
      while (current?.parentId) {
        const parent = nodes.get(current.parentId)
        if (!parent) break
        chain.unshift(parent)
        current = parent
      }
      return chain
    },

    findNodes(filter: { type?: AnyNodeType; parentId?: AnyNodeId | null; levelId?: AnyNodeId }) {
      return [...nodes.values()].filter((node) => {
        if (filter.type && node.type !== filter.type) return false
        if (filter.parentId !== undefined && node.parentId !== filter.parentId) return false
        if (filter.levelId && scene.resolveLevelId(node.id as AnyNodeId) !== filter.levelId) {
          return false
        }
        return true
      })
    },

    resolveLevelId(id: AnyNodeId) {
      let current = nodes.get(id)
      while (current) {
        if (current.type === 'level') return current.id as AnyNodeId
        if (!current.parentId) return null
        current = nodes.get(current.parentId)
      }
      return null
    },

    createNode(node: AnyNode, parentId?: AnyNodeId) {
      insert(node, parentId)
      log.push(`create:${node.type}:${node.id}`)
      pushHistory()
      return node.id as AnyNodeId
    },

    updateNode(id: AnyNodeId, data: Partial<AnyNode>) {
      const current = nodes.get(id)
      if (!current) throw new Error(`node not found: ${id}`)
      nodes.set(id, { ...current, ...data } as AnyNode)
      log.push(`update:${current.type}:${id}`)
      pushHistory()
    },

    deleteNode(id: AnyNodeId, cascade = false) {
      const ids = cascade ? descendants(id) : [id]
      if (!cascade && descendants(id).length > 1) {
        throw new Error(`node ${id} has descendants; pass cascade`)
      }
      for (const nodeId of ids) nodes.delete(nodeId)
      log.push(`delete:${id}:${ids.length}`)
      pushHistory()
      return ids
    },

    applyPatch(patches: { op: string; node?: AnyNode; id?: AnyNodeId; parentId?: AnyNodeId }[]) {
      const createdIds: AnyNodeId[] = []
      for (const patch of patches) {
        if (patch.op === 'create' && patch.node) {
          insert(patch.node, patch.parentId)
          createdIds.push(patch.node.id as AnyNodeId)
        }
      }
      log.push(`patch:${patches.length}`)
      // Batched patches are one history entry, matching the real bridge.
      pushHistory()
      return { appliedOps: patches.length, deletedIds: [] as AnyNodeId[], createdIds }
    },

    undo: (steps = 1) => {
      const removed = Math.min(steps, pastStates.length)
      pastStates = pastStates.slice(0, pastStates.length - removed)
      return removed
    },
    redo: () => 0,

    validateScene: () => ({ valid: true, errors: [] }),
    flushDirty: () => [],
    getHistory: () => ({ pastCount: pastStates.length, futureCount: 0 }),
    clearHistory: () => {
      pastStates = []
    },

    setActiveScene: () => undefined,
    getActiveScene: () => null,
    clearActiveScene: () => undefined,
    loadDefault: () => undefined,
    setScene: () => undefined,
    exportJSON: unsupported('exportJSON'),
    exportSceneGraph: unsupported('exportSceneGraph'),
    loadJSON: unsupported('loadJSON'),
    createProject: unsupported('createProject'),
    getProjectStatus: unsupported('getProjectStatus'),
    saveScene: unsupported('saveScene'),
    loadStoredScene: unsupported('loadStoredScene'),
    listScenes: unsupported('listScenes'),
    deleteStoredScene: unsupported('deleteStoredScene'),
    renameStoredScene: unsupported('renameStoredScene'),
    appendSceneEvent: unsupported('appendSceneEvent'),
    listSceneEvents: unsupported('listSceneEvents'),
  } as unknown as FakeScene

  return scene
}

/** Minimal site → building → level stack, the shape the editor boots with. */
export function seedBuilding(scene: FakeScene): {
  siteId: string
  buildingId: string
  levelId: string
} {
  scene.seed([
    { object: 'node', id: 'site_1', type: 'site', parentId: null, children: ['building_1'] },
    {
      object: 'node',
      id: 'building_1',
      type: 'building',
      parentId: 'site_1',
      children: ['level_1'],
    },
    {
      object: 'node',
      id: 'level_1',
      type: 'level',
      name: 'Ground floor',
      parentId: 'building_1',
      level: 0,
      children: [],
    },
  ] as unknown as AnyNode[])
  return { siteId: 'site_1', buildingId: 'building_1', levelId: 'level_1' }
}
