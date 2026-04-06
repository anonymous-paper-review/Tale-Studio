'use client'

import { useRef, useState } from 'react'
import { Loader2, Send, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentFace } from '@/components/agent-face'
import { TypingText } from '@/components/typing-text'
import { useProducerStore } from '@/stores/producer-store'
import { cn } from '@/lib/utils'

export function MeetingChat() {
  const {
    chatMessages,
    chatLoading,
    sendChatMessage,
    uploadFile,
  } = useProducerStore()

  const [input, setInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSend = async () => {
    if (!input.trim() || chatLoading) return
    const msg = input
    setInput('')
    await sendChatMessage(msg)
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadFile(file)
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <AgentFace
          expression={chatLoading ? 'thinking' : chatMessages.length > 0 ? 'talking' : 'idle'}
          color="#8B5CF6"
          size={36}
        />
        <div>
          <h2 className="text-sm font-semibold">The Meeting Room</h2>
          <p className="text-xs text-muted-foreground">
            Chat with your Producer Agent
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-6 py-4">
        <div className="space-y-3">
          {chatMessages.length === 0 && (
            <div className="space-y-3">
              <div className="mr-8 rounded-lg bg-muted px-4 py-3 text-sm">
                Hello! I&apos;m your Producer Agent. Tell me about the story
                you&apos;d like to create, or upload a script file to get
                started.
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  'A lonely astronaut discovers a garden on Mars',
                  'Two rival chefs compete in a midnight cook-off',
                  'A child finds a door to another world in their closet',
                  'A detective solves crimes using dreams',
                ].map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    onClick={() => setInput(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
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
                  'rounded-lg px-4 py-3 text-sm whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'ml-8 bg-primary/10 text-foreground'
                    : 'mr-8 bg-muted text-foreground',
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
            <div className="mr-8 flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Thinking…
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            placeholder="Tell me about your story…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={chatLoading}
            title="Upload script file (.txt)"
          >
            <Upload className="size-4" />
          </Button>
          <Button
            size="icon"
            onClick={handleSend}
            disabled={chatLoading || !input.trim()}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
