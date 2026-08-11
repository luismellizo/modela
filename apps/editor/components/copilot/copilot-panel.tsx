'use client'

import { brand } from '@modela/brand'
import { AlertCircle, Eraser } from 'lucide-react'
import { useCallback } from 'react'
import { Composer } from './composer'
import { MessageList } from './message-list'
import type { Attachment } from './types'
import { useCopilot } from './use-copilot'

/**
 * The copilot, mounted as a first-class sidebar tab through the editor's
 * `sidebarTabs` prop. Nothing in `packages/editor` had to change to make room
 * for it.
 */
export function CopilotPanel() {
  const copilot = useCopilot()
  const disabled = copilot.status.state !== 'ready'

  const send = useCallback(
    (text: string, attachments: Attachment[]) => {
      void copilot.send(text, attachments)
    },
    [copilot],
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-border/60 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-base leading-none">{brand.mark}</span>
          <div className="min-w-0">
            <p className="truncate font-medium text-sm leading-tight">{brand.copilot.title}</p>
            {copilot.status.state === 'ready' && (
              <p className="truncate text-[10px] text-muted-foreground leading-tight">
                {copilot.status.model}
              </p>
            )}
          </div>
        </div>
        {copilot.messages.length > 0 && (
          <button
            aria-label="Clear the conversation"
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            disabled={copilot.running}
            onClick={copilot.clear}
            type="button"
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>
        )}
      </header>

      {copilot.status.state === 'disabled' && (
        <div className="m-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 leading-relaxed dark:text-amber-300">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{copilot.status.reason}</span>
        </div>
      )}

      <MessageList
        canUndo={copilot.canUndo}
        disabled={disabled}
        messages={copilot.messages}
        onApplyPlan={(messageId, proposal) => {
          void copilot.applyPlan(messageId, proposal)
        }}
        onApproveTool={(messageId, callId, tool) => {
          void copilot.approveTool(messageId, callId, tool)
        }}
        onDiscardPlan={copilot.discardPlan}
        onDismissTool={copilot.dismissTool}
        onSuggestion={(text) => send(text, [])}
        onUndo={copilot.undoLastOperation}
        running={copilot.running}
      />

      <Composer
        disabled={disabled}
        onCancel={copilot.cancel}
        onSend={send}
        running={copilot.running}
      />
    </div>
  )
}
