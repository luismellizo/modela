import type { AnyNode, AnyNodeId } from '@pascal-app/core/schema'
import type { SceneOperations } from '@pascal-app/mcp/operations'
import { DEFAULT_RULES } from './rules'
import type { SceneView, ValidationIssue, ValidationReport, ValidationRule } from './types'

/**
 * Runs the rules once over a snapshot.
 *
 * The view is built once and shared: every rule needs "all nodes on this level",
 * and recomputing the parent chain per rule turned out to dominate the cost on
 * a house-sized scene.
 */

export function buildSceneView(scene: SceneOperations): SceneView {
  const nodes = scene.getNodes()
  const byLevel = new Map<string, AnyNode[]>()

  for (const node of Object.values(nodes)) {
    const levelId = scene.resolveLevelId(node.id as AnyNodeId)
    if (!levelId) continue
    const bucket = byLevel.get(levelId)
    if (bucket) bucket.push(node)
    else byLevel.set(levelId, [node])
  }

  return { nodes, byLevel }
}

export function runRules(
  view: SceneView,
  rules: ValidationRule[] = DEFAULT_RULES,
): ValidationReport {
  const issues: ValidationIssue[] = []

  for (const rule of rules) {
    try {
      issues.push(...rule.check(view))
    } catch (error) {
      // A broken rule must not take down the check. Report it as a hint so it
      // is visible without blocking anything.
      issues.push({
        rule: rule.id,
        severity: 'hint',
        message: `Rule "${rule.id}" failed to run: ${error instanceof Error ? error.message : String(error)}`,
        nodeIds: [],
      })
    }
  }

  return {
    issues,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    hints: issues.filter((issue) => issue.severity === 'hint').length,
    rulesRun: rules.map((rule) => rule.id),
  }
}

export function validateDesign(
  scene: SceneOperations,
  rules: ValidationRule[] = DEFAULT_RULES,
): ValidationReport {
  return runRules(buildSceneView(scene), rules)
}

/** Compact rendering for the model. Errors first — those are what it must fix. */
export function renderIssues(report: ValidationReport, limit = 12): string {
  if (report.issues.length === 0) return 'No issues found.'

  const order = { error: 0, warning: 1, hint: 2 } as const
  const sorted = [...report.issues].sort((a, b) => order[a.severity] - order[b.severity])

  const lines = sorted
    .slice(0, limit)
    .map((issue) => `- [${issue.severity}] ${issue.message}${issue.fix ? ` → ${issue.fix}` : ''}`)

  if (sorted.length > limit) {
    lines.push(`- …and ${sorted.length - limit} more.`)
  }

  return lines.join('\n')
}
