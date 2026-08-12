'use client'

import type { Proposal } from '@modela/ai'
import { brand } from '@modela/brand'
import { AlertCircle, ArrowRight, Ban, Undo2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { DesignCheck } from './design-check'
import { ConfirmToolCard, ProposalCard } from './proposal-card'
import { ToolActivityList } from './tool-activity'
import type { Attachment, ChatMessage } from './types'

export type MessageListProps = {
  messages: ChatMessage[]
  running: boolean
  canUndo: boolean
  onUndo(): void
  onSuggestion(text: string): void
  onApplyPlan(messageId: string, proposal: Proposal): void
  onDiscardPlan(messageId: string): void
  onApproveTool(messageId: string, callId: string, tool: string): void
  onDismissTool(messageId: string, callId: string): void
  disabled: boolean
}

export function MessageList({
  messages,
  running,
  canUndo,
  onUndo,
  onSuggestion,
  onApplyPlan,
  onDiscardPlan,
  onApproveTool,
  onDismissTool,
  disabled,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Deliberately keyed on the whole array, not its length: streaming rewrites
  // the last message in place, and the view should follow the text as it grows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  if (messages.length === 0) {
    return (
      // `min-h-0` is what keeps the composer on screen: without it this column
      // grows to fit its content instead of scrolling, and pushes the input out
      // of the panel entirely.
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-5 overflow-y-auto px-4 py-6">
        <div className="space-y-2 text-center">
          <span className="block text-2xl leading-none opacity-80">{brand.mark}</span>
          <p className="font-medium text-base">{brand.assistant.title}</p>
          <p className="text-pretty text-muted-foreground text-xs leading-relaxed">
            {brand.assistant.subtitle}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="px-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
            Prueba con
          </p>
          {brand.assistant.suggestions.map((suggestion) => (
            <button
              className={cn(
                'group rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 text-left text-xs leading-relaxed transition-colors',
                'hover:border-border hover:bg-accent/60 disabled:opacity-40',
              )}
              disabled={disabled}
              key={suggestion}
              onClick={() => onSuggestion(suggestion)}
              type="button"
            >
              <span className="flex items-start gap-2">
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                <span className="text-pretty text-muted-foreground group-hover:text-foreground">
                  {suggestion}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {messages.map((message) =>
        message.role === 'user' ? (
          <UserBubble key={message.id} message={message} />
        ) : (
          <AssistantBlock
            canUndo={canUndo}
            key={message.id}
            message={message}
            onApplyPlan={onApplyPlan}
            onApproveTool={onApproveTool}
            onDiscardPlan={onDiscardPlan}
            onDismissTool={onDismissTool}
            onUndo={onUndo}
            running={running}
          />
        ),
      )}
      <div ref={bottomRef} />
    </div>
  )
}

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  return (
    <img
      alt={attachment.name}
      className="h-16 w-16 rounded-md border border-border/60 object-cover"
      src={attachment.url}
    />
  )
}

function UserBubble({ message }: { message: ChatMessage & { role: 'user' } }) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1">
          {message.attachments.map((attachment) => (
            <AttachmentThumb attachment={attachment} key={attachment.id} />
          ))}
        </div>
      )}
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-accent px-2.5 py-1.5 text-sm">
        {message.text}
      </div>
    </div>
  )
}

function AssistantBlock({
  message,
  running,
  canUndo,
  onUndo,
  onApplyPlan,
  onDiscardPlan,
  onApproveTool,
  onDismissTool,
}: {
  message: ChatMessage & { role: 'assistant' }
  running: boolean
  canUndo: boolean
  onUndo(): void
  onApplyPlan(messageId: string, proposal: Proposal): void
  onDiscardPlan(messageId: string): void
  onApproveTool(messageId: string, callId: string, tool: string): void
  onDismissTool(messageId: string, callId: string): void
}) {
  const showThinking = message.streaming && message.text === '' && message.activity.length === 0

  return (
    <div className="flex flex-col gap-1">
      {showThinking && (
        <p className="animate-pulse px-1 text-muted-foreground text-xs">
          {brand.assistant.thinking}
        </p>
      )}

      <ToolActivityList activity={message.activity} />

      {message.validation && (
        <DesignCheck correcting={message.correcting ?? false} report={message.validation} />
      )}

      {message.text && (
        <div
          className={cn(
            'whitespace-pre-wrap break-words px-1 text-sm leading-relaxed',
            message.status === 'cancelled' && 'text-muted-foreground',
          )}
        >
          {message.text}
          {message.streaming && <span className="ml-0.5 animate-pulse">▍</span>}
        </div>
      )}

      {message.error && (
        <div className="mx-1 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertCircle className="mt-px h-3 w-3 shrink-0" />
          <span>
            <span className="font-medium">{message.error.code}</span> — {message.error.message}
          </span>
        </div>
      )}

      {message.status === 'max-steps' && (
        <p className="px-1 text-[11px] text-muted-foreground">
          Me detuve en el límite de pasos. Dime si quieres que siga.
        </p>
      )}

      {message.proposal && (
        <ProposalCard
          disabled={running}
          onApply={() => {
            if (message.proposal) onApplyPlan(message.id, message.proposal)
          }}
          onDiscard={() => onDiscardPlan(message.id)}
          proposal={message.proposal}
        />
      )}

      {message.proposalOutcome === 'discarded' && (
        <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
          <Ban className="h-3 w-3" />
          Plan descartado. No se construyó nada.
        </p>
      )}

      {(message.pendingConfirmations ?? []).map((pending) => (
        <ConfirmToolCard
          arguments={pending.arguments}
          disabled={running}
          key={pending.callId}
          onApprove={() => onApproveTool(message.id, pending.callId, pending.tool)}
          onDismiss={() => onDismissTool(message.id, pending.callId)}
          tool={pending.tool}
        />
      ))}

      {!(running || message.streaming) && (message.undoSteps ?? 0) > 0 && canUndo && (
        <button
          className="mx-1 flex w-fit items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          onClick={onUndo}
          type="button"
        >
          <Undo2 className="h-3 w-3" />
          Deshacer estos cambios
        </button>
      )}
    </div>
  )
}
