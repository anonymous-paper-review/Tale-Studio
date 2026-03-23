'use client'

import { useRef, useState } from 'react'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

interface WriterChatProps {
  messages: ChatMessage[]
  loading: boolean
  onSend: (message: string) => void
}

export function WriterChat({ messages, loading, onSend }: WriterChatProps) {
  const [input, setInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  const handleSend = () => {
    if (!input.trim() || loading) return
    const msg = input
    setInput('')
    onSend(msg)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageSquare className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">AI Writer</span>
      </div>

      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                AI Writer can directly edit your scenes and shots.
              </p>
              <div className="space-y-1 text-[11px] text-muted-foreground/70">
                <p>Try:</p>
                <p>&quot;이 샷을 클로즈업으로 바꿔줘&quot;</p>
                <p>&quot;이 씬 분위기를 더 어둡게&quot;</p>
                <p>&quot;주인공 대사 추가해줘&quot;</p>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'rounded-lg px-3 py-2 text-sm',
                msg.role === 'user'
                  ? 'ml-4 bg-primary/10 text-foreground'
                  : 'mr-4 bg-muted text-foreground',
              )}
            >
              {msg.content}
            </div>
          ))}
          {loading && (
            <div className="mr-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Thinking…
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            placeholder="Ask about your scenes & shots…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
