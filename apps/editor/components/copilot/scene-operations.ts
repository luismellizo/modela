'use client'

import type { SelectionSnapshot, TemporalHistoryStore } from '@modela/ai'
import useScene from '@pascal-app/core/store'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneOperations, type SceneOperations } from '@pascal-app/mcp/operations'
import { useViewer } from '@pascal-app/viewer'

/**
 * Wires the agent to the editor the user is actually looking at.
 *
 * `SceneBridge` mutates the live `useScene` store, which is what makes changes
 * appear in the viewport as they happen and keeps Zundo's undo stack honest.
 * The same façade backs the MCP server, so both paths behave identically.
 */

let operations: SceneOperations | null = null

export function getSceneOperations(): SceneOperations {
  if (!operations) {
    operations = createSceneOperations({ bridge: new SceneBridge() })
  }
  return operations
}

/** The Zundo store, in the shape the transaction helper expects. */
export function getHistoryStore(): TemporalHistoryStore<unknown> {
  return useScene as unknown as TemporalHistoryStore<unknown>
}

/**
 * Read at the moment a tool runs, not when the turn starts — the user may
 * click something else mid-turn and mean it.
 */
export function readSelection(): SelectionSnapshot {
  const selection = useViewer.getState().selection
  return {
    buildingId: selection.buildingId ?? null,
    levelId: selection.levelId ?? null,
    zoneId: selection.zoneId ?? null,
    selectedIds: [...selection.selectedIds],
  }
}
