'use client'

import type { CatalogModel } from '@modela/ai'
import { Check, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Model picker.
 *
 * Every model listed can call tools — the server filters for it — because one
 * that cannot would give you a copilot that talks and never builds, and the
 * failure would look like the agent being stupid rather than misconfigured.
 *
 * Vision is flagged rather than required: plenty of good free models cannot read
 * images, and that only costs you attachments.
 */

export type ModelPickerProps = {
  models: CatalogModel[]
  selected: string | null
  freeOnly: boolean
  disabled: boolean
  onSelect(id: string): void
}

export function ModelPicker({ models, selected, freeOnly, disabled, onSelect }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (models.length === 0) return null

  const current = models.find((model) => model.id === selected) ?? models[0]

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="flex max-w-[13rem] items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="truncate">{shortName(current?.name ?? current?.id ?? '')}</span>
        <ChevronDown className="h-2.5 w-2.5 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          <div className="sticky top-0 border-border/60 border-b bg-popover px-2.5 py-1.5">
            <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
              {freeOnly ? 'Free models' : 'Models'} · all can call tools
            </p>
          </div>

          <ul className="p-1">
            {models.map((model) => {
              const isCurrent = model.id === current?.id
              return (
                <li key={model.id}>
                  <button
                    className={cn(
                      'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                      isCurrent ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                    onClick={() => {
                      onSelect(model.id)
                      setOpen(false)
                    }}
                    type="button"
                  >
                    <Check
                      className={cn(
                        'mt-0.5 h-3 w-3 shrink-0 text-emerald-500',
                        isCurrent ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">{shortName(model.name)}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        {model.vision ? (
                          <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                            <Eye className="h-2.5 w-2.5" />
                            images
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5">
                            <EyeOff className="h-2.5 w-2.5" />
                            text only
                          </span>
                        )}
                        {model.contextLength > 0 && (
                          <span>{formatContext(model.contextLength)} ctx</span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** OpenRouter names carry a "(free)" suffix and a vendor prefix. Both are noise here. */
function shortName(name: string): string {
  return name.replace(/\s*\(free\)\s*$/i, '').replace(/^[^:]+:\s*/, '')
}

function formatContext(length: number): string {
  if (length >= 1_000_000) return `${Math.round(length / 1_000_000)}M`
  if (length >= 1000) return `${Math.round(length / 1000)}k`
  return String(length)
}
