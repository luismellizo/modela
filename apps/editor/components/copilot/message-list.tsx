'use client'

import type { Proposal } from '@modela/ai'
import { brand } from '@modela/brand'
import { AlertCircle, Ban, Undo2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col justify-end gap-3 overflow-y-auto p-4">
        <div className="space-y-1">
          <p className="font-medium text-sm">{brand.copilot.title}</p>
          <p className="text-muted-foreground text-xs leading-relaxed">{brand.copilot.subtitle}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {brand.copilot.suggestions.map((suggestion) => (
            <button
              className="rounded-md border border-border/60 px-2.5 py-2 text-left text-muted-foreground text-xs transition-colors hover:border-border hover:bg-accent/50 hover:text-foreground disabled:opacity-40"
              disabled={disabled}
              key={suggestion}
              onClick={() => onSuggestion(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
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
        <p className="animate-pulse px-1 text-muted-foreground text-xs">{brand.copilot.thinking}</p>
      )}

      <ToolActivityList activity={message.activity} />

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
          Stopped at the step limit. Ask me to continue if that was too early.
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
          Plan discarded. Nothing was built.
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
          Undo these changes
        </button>
      )}
    </div>
  )
}
