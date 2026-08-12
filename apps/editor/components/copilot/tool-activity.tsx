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
  get_scene_overview: 'Leyendo la escena',
  find_nodes: 'Buscando elementos',
  describe_node: 'Inspeccionando',
  get_selection: 'Mirando tu selección',
  validate_scene: 'Validando',
  create_level: 'Añadiendo una planta',
  create_room: 'Creando un espacio',
  create_wall: 'Levantando un muro',
  add_door: 'Poniendo una puerta',
  add_window: 'Poniendo una ventana',
  search_items: 'Buscando en el catálogo',
  place_item: 'Colocando mobiliario',
  update_node: 'Ajustando',
  move_node: 'Moviendo',
  reshape_space: 'Redimensionando un espacio',
  delete_node: 'Borrando',
  analyze_image: 'Leyendo la imagen',
  review_viewport: 'Mirando la vista',
  propose_plan: 'Preparando un plan',
  check_design: 'Revisando el diseño',
  save_snapshot: 'Guardando esta versión',
  restore_snapshot: 'Volviendo a una versión guardada',
  list_snapshots: 'Listando versiones guardadas',
  remember_project_fact: 'Anotando eso',
  get_project_brief: 'Recordando el encargo',
  forget_project_fact: 'Olvidando eso',
  query_architecture_knowledge: 'Consultando dimensiones de referencia',
  score_layout: 'Puntuando la distribución',
  compare_layouts: 'Comparando las opciones',
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
          <Detail label="Herramienta" value={entry.tool} />
          <Detail label="Argumentos" value={format(entry.arguments)} mono />
          {entry.error ? (
            <>
              <Detail label="Error" value={`${entry.error.code} — ${entry.error.message}`} />
              {entry.error.hint && <Detail label="Pista" value={entry.error.hint} />}
            </>
          ) : (
            entry.result !== undefined && (
              <Detail label="Resultado" value={format(entry.result)} mono />
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
