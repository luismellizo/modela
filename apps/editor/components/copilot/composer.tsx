'use client'

import { validateImageDataUrl } from '@modela/ai'
import { brand } from '@modela/brand'
import { ArrowUp, ImagePlus, Square, X } from 'lucide-react'
import { type ChangeEvent, type ClipboardEvent, type DragEvent, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Attachment } from './types'

/**
 * The input. Text plus images, because half of architectural intent arrives as
 * a photo of a plan rather than a sentence.
 */

export type ComposerProps = {
  disabled: boolean
  running: boolean
  onSend(text: string, attachments: Attachment[]): void
  onCancel(): void
}

export function Composer({ disabled, running, onSend, onCancel }: ComposerProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const addFiles = async (files: FileList | File[]) => {
    setError(null)
    const accepted: Attachment[] = []

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setError(`${file.name} is not an image`)
        continue
      }
      const url = await readAsDataUrl(file)
      // The server re-checks this; failing here just saves a round trip and
      // gives the user a faster answer.
      const validation = validateImageDataUrl(url)
      if (!validation.ok) {
        setError(`${file.name}: ${validation.message}`)
        continue
      }
      accepted.push({
        id: `${file.name}_${Date.now()}_${accepted.length}`,
        name: file.name,
        url,
        sizeBytes: validation.bytes,
      })
    }

    if (accepted.length > 0) {
      setAttachments((current) => [...current, ...accepted].slice(0, 6))
    }
  }

  const submit = () => {
    if (disabled || running || text.trim() === '') return
    onSend(text.trim(), attachments)
    setText('')
    setAttachments([])
    setError(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) void addFiles(event.target.files)
    event.target.value = ''
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files)
    if (files.length > 0) {
      event.preventDefault()
      void addFiles(files)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files)
  }

  return (
    <div
      className={cn(
        'shrink-0 border-border/60 border-t bg-background/80 p-2 backdrop-blur',
        dragging && 'bg-accent/40',
      )}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((attachment) => (
            <div
              className="group relative h-14 w-14 overflow-hidden rounded-md border border-border/60"
              key={attachment.id}
            >
              <img
                alt={attachment.name}
                className="h-full w-full object-cover"
                src={attachment.url}
              />
              <button
                aria-label={`Remove ${attachment.name}`}
                className="absolute top-0.5 right-0.5 rounded bg-background/90 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() =>
                  setAttachments((current) => current.filter((entry) => entry.id !== attachment.id))
                }
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mb-1.5 px-1 text-[11px] text-amber-600">{error}</p>}

      <div className="flex items-end gap-1.5 rounded-lg border border-border/60 bg-background px-2 py-1.5 focus-within:border-border">
        <button
          aria-label="Attach an image"
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <ImagePlus className="h-4 w-4" />
        </button>
        <input
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          multiple
          onChange={handleFileChange}
          ref={fileInputRef}
          type="file"
        />

        <textarea
          className="max-h-40 min-h-[1.5rem] flex-1 resize-none bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value)
            const element = event.target
            element.style.height = 'auto'
            element.style.height = `${Math.min(element.scrollHeight, 160)}px`
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          onPaste={handlePaste}
          placeholder={brand.copilot.placeholder}
          ref={textareaRef}
          rows={1}
          value={text}
        />

        {running ? (
          <button
            aria-label="Stop"
            className="shrink-0 rounded-md bg-foreground p-1.5 text-background transition-opacity hover:opacity-80"
            onClick={onCancel}
            type="button"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            aria-label="Send"
            className="shrink-0 rounded-md bg-foreground p-1.5 text-background transition-opacity hover:opacity-80 disabled:opacity-30"
            disabled={disabled || text.trim() === ''}
            onClick={submit}
            type="button"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}
