'use client'

import { useRef, useState } from 'react'
import { ChevronUp, ChevronDown, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentFace } from '@/components/agent-face'
import { TypingText } from '@/components/typing-text'
import { useDirectorStore } from '@/stores/director-store'
import { cn } from '@/lib/utils'

export function DirectorChat() {
  const { chatMessages, chatLoading, sendChatMessage } = useDirectorStore()
  const [input, setInput] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const handleSend = async () => {
    if (!input.trim() || chatLoading) return
    const msg = input
    setInput('')
    await sendChatMessage(msg)
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div
      className={cn(
        'flex flex-col border-t border-border transition-all',
        collapsed ? 'h-10' : 'h-56',
      )}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex shrink-0 items-center justify-between px-4 py-2 hover:bg-accent/50"
      >
        <div className="flex items-center gap-2">
          <AgentFace
            expression={chatLoading ? 'thinking' : chatMessages.length > 0 ? 'talking' : 'idle'}
            color="#E50914"
            size={28}
          />
          <span className="text-xs font-semibold">Director Kim</span>
          <span className="text-[10px] text-muted-foreground">
            Cinematography Guide
          </span>
        </div>
        {collapsed ? (
          <ChevronUp className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <>
          {/* Messages */}
          <ScrollArea className="flex-1 px-4">
            <div className="space-y-2 py-2">
              {chatMessages.length === 0 && (
                <div className="mr-8 rounded-lg bg-muted px-3 py-2 text-xs">
                  I&apos;m Director Kim. Select a shot and ask me about camera
                  angles, lighting, or cinematography techniques.
                </div>
              )}
              {chatMessages.map((msg, i) => {
                const isLastModel =
                  msg.role === 'model' &&
                  i === chatMessages.length - 1 &&
                  !chatLoading
                return (
                  <div
                    key={i}
                    className={cn(
                      'rounded-lg px-3 py-2 text-xs whitespace-pre-wrap',
                      msg.role === 'user'
                        ? 'ml-8 bg-primary/10'
                        : 'mr-8 bg-muted',
                    )}
                  >
                    {isLastModel ? (
                      <TypingText text={msg.content} speed={8} />
                    ) : (
                      msg.content
                    )}
                  </div>
                )
              })}
              {chatLoading && (
                <div className="mr-8 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Thinking…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t border-border p-2">
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
                placeholder="Ask about cinematography…"
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
                size="icon"
                className="size-7"
                onClick={handleSend}
                disabled={chatLoading || !input.trim()}
              >
                <Send className="size-3" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
