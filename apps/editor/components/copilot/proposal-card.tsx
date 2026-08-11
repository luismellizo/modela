'use client'

import type { Proposal } from '@modela/ai'
import { AlertTriangle, Check, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * The plan, before anything happens.
 *
 * What is listed here is literally what runs on approval — the same tool calls,
 * already schema-checked. So the card can promise the user that what they read
 * is what they get.
 */

export type ProposalCardProps = {
  proposal: Proposal
  disabled: boolean
  onApply(): void
  onDiscard(): void
}

const PREVIEW_STEPS = 8

export function ProposalCard({ proposal, disabled, onApply, onDiscard }: ProposalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? proposal.calls : proposal.calls.slice(0, PREVIEW_STEPS)
  const hidden = proposal.calls.length - visible.length

  return (
    <div className="mx-1 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-start gap-2 border-border/60 border-b px-3 py-2">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm leading-tight">{proposal.title}</p>
          <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">{proposal.summary}</p>
        </div>
      </div>

      <ul className="max-h-64 overflow-y-auto px-3 py-2">
        {visible.map((call, index) => (
          <li
            className="flex items-start gap-2 py-0.5 text-xs"
            key={`${proposal.id}_${index}_${call.label}`}
          >
            <Check className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 break-words">{call.label}</span>
          </li>
        ))}
        {hidden > 0 && (
          <li>
            <button
              className="mt-1 ml-5 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setExpanded(true)}
              type="button"
            >
              Show {hidden} more step{hidden === 1 ? '' : 's'}
            </button>
          </li>
        )}
      </ul>

      {proposal.warnings.length > 0 && (
        <ul className="border-border/60 border-t bg-amber-500/10 px-3 py-2">
          {proposal.warnings.map((warning) => (
            <li
              className="flex items-start gap-2 py-0.5 text-[11px] text-amber-700 leading-relaxed dark:text-amber-300"
              key={warning}
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 border-border/60 border-t px-3 py-2">
        <button
          className={cn(
            'flex-1 rounded-md bg-foreground px-3 py-1.5 font-medium text-background text-xs transition-opacity',
            'hover:opacity-80 disabled:opacity-40',
          )}
          disabled={disabled}
          onClick={onApply}
          type="button"
        >
          Apply {proposal.calls.length} change{proposal.calls.length === 1 ? '' : 's'}
        </button>
        <button
          className="rounded-md border border-border/60 px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-40"
          disabled={disabled}
          onClick={onDiscard}
          type="button"
        >
          Discard
        </button>
      </div>
    </div>
  )
}

export type ConfirmToolCardProps = {
  tool: string
  arguments: unknown
  disabled: boolean
  onApprove(): void
  onDismiss(): void
}

/** Shown when the agent asks for a destructive tool it is not allowed to run. */
export function ConfirmToolCard({
  tool,
  arguments: args,
  disabled,
  onApprove,
  onDismiss,
}: ConfirmToolCardProps) {
  return (
    <div className="mx-1 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-xs">Approve {tool.replace(/_/g, ' ')}?</p>
          <p className="mt-0.5 break-words font-mono text-[10px] text-muted-foreground">
            {summarise(args)}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          className="rounded-md bg-foreground px-2.5 py-1 font-medium text-[11px] text-background transition-opacity hover:opacity-80 disabled:opacity-40"
          disabled={disabled}
          onClick={onApprove}
          type="button"
        >
          Approve
        </button>
        <button
          className="rounded-md border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-40"
          disabled={disabled}
          onClick={onDismiss}
          type="button"
        >
          <X className="mr-1 inline h-3 w-3" />
          No
        </button>
      </div>
    </div>
  )
}

function summarise(args: unknown): string {
  if (args === null || typeof args !== 'object') return String(args)
  return Object.entries(args as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(', ')
}
