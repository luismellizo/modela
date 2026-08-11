import { z } from 'zod'
import { validateDesign } from '../validation/engine'
import { DEFAULT_RULES } from '../validation/rules'
import { defineTool, type ToolDefinition } from './types'

/**
 * `check_design` is the architectural counterpart to `validate_scene`.
 *
 * `validate_scene` answers "is every node well-formed?". This answers "does the
 * building make sense?" — doors inside their walls, rooms you can get into,
 * spaces that do not sit on top of each other.
 */
export function createDesignCheckTool(): ToolDefinition {
  return defineTool({
    name: 'check_design',
    kind: 'read',
    risk: 'safe',
    description:
      'Check the design for architectural problems: openings that overhang their wall, rooms with no door, overlapping spaces, unusable dimensions. Run it after building and fix any errors before telling the user you are finished. Also answers "what is wrong with this layout?".',
    input: z.object({
      severity: z
        .enum(['error', 'warning', 'hint'])
        .optional()
        .describe('Lowest severity to report. Defaults to warning.'),
    }),
    handler: (args, context) => {
      const report = validateDesign(context.scene)
      const floor = args.severity ?? 'warning'
      const rank = { error: 0, warning: 1, hint: 2 } as const

      const issues = report.issues
        .filter((issue) => rank[issue.severity] <= rank[floor])
        .sort((a, b) => rank[a.severity] - rank[b.severity])

      return {
        clean: report.errors === 0 && report.warnings === 0,
        errors: report.errors,
        warnings: report.warnings,
        hints: report.hints,
        issues: issues.slice(0, 40),
        rulesRun: report.rulesRun,
      }
    },
  })
}

/** Every rule that ships, for docs and for a settings screen later on. */
export function listDesignRules(): { id: string; severity: string; description: string }[] {
  return DEFAULT_RULES.map((rule) => ({
    id: rule.id,
    severity: rule.severity,
    description: rule.description,
  }))
}
