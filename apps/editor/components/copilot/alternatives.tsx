'use client'

import type { SnapshotSummary } from '@modela/ai'
import { Check, GitBranch, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Saved designs, switchable.
 *
 * Only manual and alternative captures are listed. The automatic ones taken
 * before each restore are a safety net, not options — showing them would bury
 * the three layouts the user actually asked for under six they did not.
 */

export type AlternativesProps = {
  snapshots: SnapshotSummary[]
  currentId: string | null
  disabled: boolean
  onRestore(id: string): void
}

export function Alternatives({ snapshots, currentId, disabled, onRestore }: AlternativesProps) {
  const options = snapshots.filter((snapshot) => snapshot.origin !== 'auto')
  if (options.length === 0) return null

  return (
    <div className="shrink-0 border-border/60 border-t px-2 py-1.5">
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <GitBranch className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
          Diseños guardados
        </span>
      </div>

      <ul className="flex max-h-28 flex-col gap-0.5 overflow-y-auto">
        {options.map((snapshot) => {
          const isCurrent = snapshot.id === currentId
          return (
            <li key={snapshot.id}>
              <button
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors',
                  isCurrent ? 'bg-accent' : 'hover:bg-accent/50',
                  'disabled:opacity-40',
                )}
                disabled={disabled || isCurrent}
                onClick={() => onRestore(snapshot.id)}
                type="button"
              >
                {isCurrent ? (
                  <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                ) : (
                  <RotateCcw className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{snapshot.label}</span>
                <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                  {snapshot.stats.spaces} esp · {snapshot.stats.floorAreaSqM} m²
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
