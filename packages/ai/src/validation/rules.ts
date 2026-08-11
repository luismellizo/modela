import {
  areaOf,
  boundaryWalls,
  describe,
  isOpening,
  isWall,
  isZone,
  lengthOf,
  polygonsOverlap,
  type Vec2,
} from './geometry'
import type { ValidationIssue, ValidationRule } from './types'

/**
 * The starting rule set.
 *
 * Every one of these is computable from the scene graph and every message tells
 * the agent what to do about it — a rule that only says "this is wrong" makes
 * the model guess at the fix, and it guesses badly.
 */

const MIN_WALL_LENGTH = 0.05
const MIN_ROOM_AREA = 1
const MIN_CORRIDOR_WIDTH = 0.8

/** A door or window whose span falls outside the wall it belongs to. */
export const openingOutsideWall: ValidationRule = {
  id: 'opening-outside-wall',
  severity: 'error',
  description: 'Doors and windows must sit fully within their wall',
  check(view) {
    const issues: ValidationIssue[] = []

    for (const node of Object.values(view.nodes)) {
      if (!isOpening(node)) continue
      const wallId = node.wallId ?? node.parentId
      if (!wallId) {
        issues.push({
          rule: 'opening-outside-wall',
          severity: 'error',
          message: `${describe(node)} is not attached to any wall`,
          nodeIds: [node.id],
          fix: 'Delete it and add it again with add_door or add_window, naming the wall.',
        })
        continue
      }

      const wall = view.nodes[wallId as keyof typeof view.nodes]
      if (!wall || !isWall(wall)) {
        issues.push({
          rule: 'opening-outside-wall',
          severity: 'error',
          message: `${describe(node)} points at ${wallId}, which is not a wall`,
          nodeIds: [node.id],
          fix: 'Re-add the opening against a real wall.',
        })
        continue
      }

      const span = lengthOf({ start: wall.start as Vec2, end: wall.end as Vec2 })
      const half = node.width / 2
      const localX = node.position[0]

      if (node.width > span + 1e-6) {
        issues.push({
          rule: 'opening-outside-wall',
          severity: 'error',
          message: `${describe(node)} is ${node.width.toFixed(2)} m wide but its wall is only ${span.toFixed(2)} m long`,
          nodeIds: [node.id, wall.id],
          fix: `Narrow it below ${span.toFixed(2)} m, or move it to a longer wall.`,
        })
        continue
      }

      if (localX < half - 1e-6 || localX > span - half + 1e-6) {
        issues.push({
          rule: 'opening-outside-wall',
          severity: 'error',
          message: `${describe(node)} overhangs its wall: it sits at ${localX.toFixed(2)} m on a ${span.toFixed(2)} m wall`,
          nodeIds: [node.id, wall.id],
          fix: `Set its position along the wall between ${half.toFixed(2)} and ${(span - half).toFixed(2)} m — update_node with position, or delete it and re-add with a t between 0 and 1.`,
        })
      }
    }

    return issues
  },
}

/** A wall so short it renders as nothing. Usually a mistyped coordinate. */
export const degenerateWall: ValidationRule = {
  id: 'degenerate-wall',
  severity: 'error',
  description: 'Walls must have a usable length',
  check(view) {
    return Object.values(view.nodes)
      .filter(isWall)
      .filter(
        (wall) => lengthOf({ start: wall.start as Vec2, end: wall.end as Vec2 }) < MIN_WALL_LENGTH,
      )
      .map((wall) => ({
        rule: 'degenerate-wall',
        severity: 'error' as const,
        message: `${describe(wall)} is effectively zero length`,
        nodeIds: [wall.id],
        fix: 'Give it real endpoints with update_node, or delete it.',
      }))
  },
}

/** A room with no door in any of its boundary walls cannot be entered. */
export const roomWithoutAccess: ValidationRule = {
  id: 'room-without-access',
  severity: 'warning',
  description: 'Every enclosed room needs a door',
  check(view) {
    const issues: ValidationIssue[] = []

    for (const zone of Object.values(view.nodes).filter(isZone)) {
      const walls = boundaryWalls(zone, view)
      if (walls.length === 0) continue

      const hasDoor = walls.some((wall) =>
        Object.values(view.nodes).some(
          (node) => node.type === 'door' && (node.wallId ?? node.parentId) === wall.id,
        ),
      )

      if (!hasDoor) {
        const wall = walls[0]
        issues.push({
          rule: 'room-without-access',
          severity: 'warning',
          message: `${describe(zone)} has no door — it cannot be entered`,
          nodeIds: [zone.id, ...walls.map((entry) => entry.id)],
          fix: wall
            ? `Add a door with add_door on one of its walls, e.g. ${wall.id} at t 0.5.`
            : 'Add a door on one of its walls.',
        })
      }
    }

    return issues
  },
}

/** A habitable room with no window. Hint, not warning: bathrooms are fine. */
export const roomWithoutDaylight: ValidationRule = {
  id: 'room-without-daylight',
  severity: 'hint',
  description: 'Rooms people spend time in usually want a window',
  check(view) {
    const issues: ValidationIssue[] = []

    for (const zone of Object.values(view.nodes).filter(isZone)) {
      const walls = boundaryWalls(zone, view)
      if (walls.length === 0) continue
      if (areaOf((zone.polygon ?? []) as Vec2[]) < 4) continue

      const hasWindow = walls.some((wall) =>
        Object.values(view.nodes).some(
          (node) => node.type === 'window' && (node.wallId ?? node.parentId) === wall.id,
        ),
      )

      if (!hasWindow) {
        issues.push({
          rule: 'room-without-daylight',
          severity: 'hint',
          message: `${describe(zone)} has no window`,
          nodeIds: [zone.id],
          fix: 'Add one with add_window if this space is meant to be lived in. Ignore for bathrooms, stores and circulation.',
        })
      }
    }

    return issues
  },
}

/** Two rooms occupying the same floor area on the same level. */
export const overlappingSpaces: ValidationRule = {
  id: 'overlapping-spaces',
  severity: 'warning',
  description: 'Two rooms should not sit on top of each other',
  check(view) {
    const issues: ValidationIssue[] = []

    for (const [levelId, nodes] of view.byLevel) {
      const zones = nodes.filter(isZone)
      for (let i = 0; i < zones.length; i += 1) {
        for (let j = i + 1; j < zones.length; j += 1) {
          const a = zones[i]
          const b = zones[j]
          if (!a || !b) continue
          if (!polygonsOverlap((a.polygon ?? []) as Vec2[], (b.polygon ?? []) as Vec2[])) continue

          issues.push({
            rule: 'overlapping-spaces',
            severity: 'warning',
            message: `${describe(a)} and ${describe(b)} overlap on level ${levelId}`,
            nodeIds: [a.id, b.id],
            fix: 'Move one of them with move_node, or resize it with reshape_space so they only share an edge.',
          })
        }
      }
    }

    return issues
  },
}

/** A room too small to be one. Usually a units mistake — cm entered as m. */
export const unusableRoom: ValidationRule = {
  id: 'unusable-room',
  severity: 'warning',
  description: 'Rooms must be large enough to use',
  check(view) {
    return Object.values(view.nodes)
      .filter(isZone)
      .map((zone) => ({ zone, area: areaOf((zone.polygon ?? []) as Vec2[]) }))
      .filter(({ area }) => area > 0 && area < MIN_ROOM_AREA)
      .map(({ zone, area }) => ({
        rule: 'unusable-room',
        severity: 'warning' as const,
        message: `${describe(zone)} is only ${area.toFixed(2)} m²`,
        nodeIds: [zone.id],
        fix: 'Check the units — dimensions are in metres. Resize with reshape_space.',
      }))
  },
}

/** A room whose narrow side cannot be walked through. */
export const impassableSpace: ValidationRule = {
  id: 'impassable-space',
  severity: 'warning',
  description: 'A space must be wide enough to move through',
  check(view) {
    const issues: ValidationIssue[] = []

    for (const zone of Object.values(view.nodes).filter(isZone)) {
      const polygon = (zone.polygon ?? []) as Vec2[]
      if (polygon.length < 3) continue

      const xs = polygon.map((point) => point[0])
      const zs = polygon.map((point) => point[1])
      const width = Math.max(...xs) - Math.min(...xs)
      const depth = Math.max(...zs) - Math.min(...zs)
      const narrow = Math.min(width, depth)

      if (narrow > 0 && narrow < MIN_CORRIDOR_WIDTH) {
        issues.push({
          rule: 'impassable-space',
          severity: 'warning',
          message: `${describe(zone)} is only ${narrow.toFixed(2)} m across at its narrowest`,
          nodeIds: [zone.id],
          fix: `Widen it past ${MIN_CORRIDOR_WIDTH} m with reshape_space, or remove it if it was not meant to be a space.`,
        })
      }
    }

    return issues
  },
}

export const DEFAULT_RULES: ValidationRule[] = [
  openingOutsideWall,
  degenerateWall,
  roomWithoutAccess,
  overlappingSpaces,
  unusableRoom,
  impassableSpace,
  roomWithoutDaylight,
]
