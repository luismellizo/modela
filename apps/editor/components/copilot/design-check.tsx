'use client'

import type { ValidationIssue, ValidationReport } from '@modela/ai'
import { AlertTriangle, CircleCheck, Info, Loader2, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * The design check, shown the way a reviewer would report it: the verdict
 * first, the detail on demand.
 *
 * It is deliberately visible even when everything passed. "Checked, nothing
 * wrong" is information; silence is indistinguishable from not having looked.
 */

export type DesignCheckProps = {
  report: ValidationReport
  /** The agent is fixing what the check found. */
  correcting: boolean
}

export function DesignCheck({ report, correcting }: DesignCheckProps) {
  const [expanded, setExpanded] = useState(false)
  const blocking = report.issues.filter((issue) => issue.severity !== 'hint')

  if (correcting) {
    return (
      <p className="flex items-center gap-1.5 px-1 text-[11px] text-violet-600 dark:text-violet-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Found {report.errors} problem{report.errors === 1 ? '' : 's'} — fixing
      </p>
    )
  }

  if (blocking.length === 0) {
    return (
      <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <CircleCheck className="h-3 w-3 text-emerald-500" />
        Design check passed
      </p>
    )
  }

  return (
    <div className="mx-1 overflow-hidden rounded-md border border-border/60">
      <button
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-accent/50"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        {report.errors > 0 ? (
          <ShieldAlert className="h-3 w-3 shrink-0 text-red-500" />
        ) : (
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
        )}
        <span className="flex-1">
          {summarise(report)}
          {report.errors > 0 && ' — unresolved'}
        </span>
        <span className="text-muted-foreground">{expanded ? 'Hide' : 'Show'}</span>
      </button>

      {expanded && (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto border-border/60 border-t px-2 py-1.5">
          {blocking.map((issue) => (
            <IssueRow issue={issue} key={`${issue.rule}_${issue.nodeIds.join('_')}`} />
          ))}
        </ul>
      )}
    </div>
  )
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  return (
    <li className="text-[11px] leading-relaxed">
      <div className="flex items-start gap-1.5">
        <span
          className={cn(
            'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
            issue.severity === 'error' ? 'bg-red-500' : 'bg-amber-500',
          )}
        />
        <div className="min-w-0">
          <p className="break-words">{issue.message}</p>
          {issue.fix && (
            <p className="mt-0.5 flex items-start gap-1 text-muted-foreground">
              <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
              <span className="break-words">{issue.fix}</span>
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

function summarise(report: ValidationReport): string {
  const parts: string[] = []
  if (report.errors > 0) parts.push(`${report.errors} error${report.errors === 1 ? '' : 's'}`)
  if (report.warnings > 0) {
    parts.push(`${report.warnings} warning${report.warnings === 1 ? '' : 's'}`)
  }
  return parts.join(', ')
}
