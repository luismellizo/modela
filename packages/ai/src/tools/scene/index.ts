import type { ToolDefinition } from '../types'
import { createBuildTools } from './build'
import { createItemTools } from './items'
import { createMutationTools } from './mutate'
import { createOpeningTools } from './openings'
import { createReadTools } from './read'

/**
 * The copilot's tool set: a curated ~15, not the full ~45 the MCP server
 * exposes. Every schema is re-sent on every model call, so an unfocused tool
 * list is a permanent tax on every message. External MCP hosts still get the
 * complete set — see packages/mcp.
 */
export function createSceneTools(): ToolDefinition[] {
  return [
    ...createReadTools(),
    ...createBuildTools(),
    ...createOpeningTools(),
    ...createItemTools(),
    ...createMutationTools(),
  ]
}

export { createBuildTools } from './build'
export { createItemTools } from './items'
export { createMutationTools } from './mutate'
export { createOpeningTools } from './openings'
export { createReadTools } from './read'
