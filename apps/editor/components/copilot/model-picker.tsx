'use client'

import type { CatalogModel } from '@modela/ai'
import { Check, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Model picker.
 *
 * Every model listed can call tools — the server filters for it — because one
 * that cannot would give you an assistant that talks and never builds, and the
 * failure would look like the model being stupid rather than misconfigured.
 * Vision is flagged rather than required: plenty of good free models cannot read
 * images, and that only costs you attachments.
 *
 * The menu is positioned `inset-x-0` against the panel header rather than
 * against the button. Anchored to the button it opened past the sidebar's edge
 * and half of every name was unreadable — a sidebar is narrow and a dropdown
 * cannot assume room to its side.
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
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  if (models.length === 0) return null

  const current = models.find((model) => model.id === selected) ?? models[0]

  return (
    <>
      <button
        className="mt-0.5 flex w-full items-center gap-1 rounded px-0.5 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        ref={buttonRef}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">
          {shortName(current?.name ?? current?.id ?? '')}
        </span>
        {current && !current.vision && (
          <span className="shrink-0 text-[10px] opacity-70">sin imágenes</span>
        )}
        <ChevronDown
          className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          className="absolute inset-x-2 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
          ref={menuRef}
        >
          <p className="border-border/60 border-b px-3 py-2 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
            {freeOnly ? 'Modelos gratis' : 'Modelos'} · todos usan herramientas
          </p>

          <ul className="max-h-[min(60vh,20rem)] overflow-y-auto p-1">
            {models.map((model) => {
              const isCurrent = model.id === current?.id
              return (
                <li key={model.id}>
                  <button
                    className={cn(
                      'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors',
                      isCurrent ? 'bg-accent' : 'hover:bg-accent/60',
                    )}
                    onClick={() => {
                      onSelect(model.id)
                      setOpen(false)
                    }}
                    type="button"
                  >
                    <Check
                      className={cn(
                        'mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500',
                        isCurrent ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-xs">
                        {shortName(model.name)}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-muted-foreground">
                        {model.vision ? (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Eye className="h-2.5 w-2.5" />
                            lee imágenes
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <EyeOff className="h-2.5 w-2.5" />
                            solo texto
                          </span>
                        )}
                        {model.contextLength > 0 && (
                          <span>{formatContext(model.contextLength)} de contexto</span>
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
    </>
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
