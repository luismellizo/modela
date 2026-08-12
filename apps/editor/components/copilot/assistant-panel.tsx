'use client'

import { brand } from '@modela/brand'
import { AlertCircle, Eraser } from 'lucide-react'
import { useCallback } from 'react'
import { Alternatives } from './alternatives'
import { Composer } from './composer'
import { MessageList } from './message-list'
import { ModelPicker } from './model-picker'
import type { Attachment } from './types'
import { useCopilot } from './use-copilot'

/**
 * The assistant, mounted as a first-class sidebar tab through the editor's
 * `sidebarTabs` prop. Nothing in `packages/editor` had to change to make room
 * for it.
 *
 * Layout note, learned the hard way: the composer disappeared off the bottom of
 * the panel because a flex child defaults to `min-height: auto`, so the
 * scrolling message list grew to fit its content instead of scrolling. Every
 * column here needs `min-h-0`, and the root needs `overflow-hidden` so nothing
 * can escape the sidebar regardless of how the host sizes it.
 */
export function AssistantPanel() {
  const copilot = useCopilot()
  const disabled = copilot.status.state !== 'ready'

  const send = useCallback(
    (text: string, attachments: Attachment[]) => {
      void copilot.send(text, attachments)
    },
    [copilot],
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* `relative` anchors the model menu to the panel, not to the button —
          anchored to the button it opened past the sidebar edge and clipped. */}
      <header className="relative shrink-0 border-border/60 border-b px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-base leading-none">{brand.mark}</span>
            <p className="truncate font-medium text-sm leading-tight">{brand.assistant.title}</p>
          </div>
          {copilot.messages.length > 0 && (
            <button
              aria-label="Limpiar la conversación"
              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              disabled={copilot.running}
              onClick={copilot.clear}
              type="button"
            >
              <Eraser className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {copilot.status.state === 'ready' &&
          (copilot.models.length > 0 ? (
            <ModelPicker
              disabled={copilot.running}
              freeOnly={copilot.freeOnly}
              models={copilot.models}
              onSelect={copilot.selectModel}
              selected={copilot.selectedModel}
            />
          ) : (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {copilot.status.model}
            </p>
          ))}
      </header>

      {copilot.status.state === 'disabled' && (
        <div className="m-3 flex shrink-0 items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 leading-relaxed dark:text-amber-300">
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

      <Alternatives
        currentId={copilot.currentSnapshotId}
        disabled={copilot.running}
        onRestore={copilot.restoreSnapshot}
        snapshots={copilot.snapshots}
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
