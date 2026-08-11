'use client'

import { AlertTriangle, Check, ChevronRight, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ToolActivity } from './types'

/**
 * The "what is it doing right now" strip.
 *
 * Tool names are turned into plain verbs because `create_room` is our jargon,
 * not the user's. Arguments and results stay one click away for when something
 * looks wrong.
 */

const VERBS: Record<string, string> = {
  get_scene_overview: 'Reading the scene',
  find_nodes: 'Looking for elements',
  describe_node: 'Inspecting',
  get_selection: 'Checking your selection',
  validate_scene: 'Validating',
  create_level: 'Adding a storey',
  create_room: 'Creating a space',
  create_wall: 'Building a wall',
  add_door: 'Adding a door',
  add_window: 'Adding a window',
  search_items: 'Searching the catalog',
  place_item: 'Placing furniture',
  update_node: 'Adjusting',
  move_node: 'Moving',
  reshape_space: 'Resizing a space',
  delete_node: 'Deleting',
  analyze_image: 'Reading the image',
  review_viewport: 'Looking at the view',
  propose_plan: 'Putting a plan together',
  check_design: 'Checking the design',
  save_snapshot: 'Saving this version',
  restore_snapshot: 'Going back to a saved version',
  list_snapshots: 'Listing saved versions',
  remember_project_fact: 'Noting that down',
  get_project_brief: 'Recalling the brief',
  forget_project_fact: 'Forgetting that',
  query_architecture_knowledge: 'Checking reference dimensions',
  score_layout: 'Rating the layout',
  compare_layouts: 'Comparing the options',
}

export function ToolActivityList({ activity }: { activity: ToolActivity[] }) {
  if (activity.length === 0) return null

  return (
    <ul className="flex flex-col gap-0.5 py-1">
      {activity.map((entry) => (
        <ToolActivityRow entry={entry} key={entry.callId} />
      ))}
    </ul>
  )
}

function ToolActivityRow({ entry }: { entry: ToolActivity }) {
  const [expanded, setExpanded] = useState(false)
  const label = VERBS[entry.tool] ?? entry.tool.replace(/_/g, ' ')

  return (
    <li>
      <button
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors',
          'hover:bg-accent/50',
          entry.status === 'failed' && 'text-amber-600 dark:text-amber-400',
          entry.status === 'ok' && 'text-muted-foreground',
          entry.status === 'running' && 'text-foreground',
        )}
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <StatusIcon status={entry.status} />
        <span className="flex-1 truncate">{label}</span>
        {entry.durationMs !== undefined && entry.durationMs > 400 && (
          <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
            {(entry.durationMs / 1000).toFixed(1)}s
          </span>
        )}
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 transition-transform', expanded && 'rotate-90')}
        />
      </button>

      {expanded && (
        <div className="mt-1 mb-1 ml-6 space-y-1.5 rounded-md border border-border/60 bg-muted/40 p-2">
          <Detail label="Tool" value={entry.tool} />
          <Detail label="Arguments" value={format(entry.arguments)} mono />
          {entry.error ? (
            <>
              <Detail label="Error" value={`${entry.error.code} — ${entry.error.message}`} />
              {entry.error.hint && <Detail label="Hint" value={entry.error.hint} />}
            </>
          ) : (
            entry.result !== undefined && (
              <Detail label="Result" value={format(entry.result)} mono />
            )
          )}
        </div>
      )}
    </li>
  )
}

function StatusIcon({ status }: { status: ToolActivity['status'] }) {
  if (status === 'running') {
    return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-violet-500" />
  }
  if (status === 'failed') {
    return <AlertTriangle className="h-3 w-3 shrink-0" />
  }
  return <Check className="h-3 w-3 shrink-0 text-emerald-500" />
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div
        className={cn(
          'max-h-32 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed',
          mono && 'font-mono',
        )}
      >
        {value}
      </div>
    </div>
  )
}

function format(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
