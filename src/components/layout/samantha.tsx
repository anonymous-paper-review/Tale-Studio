'use client'

import { useEffect, useState, useRef } from 'react'
import { MessageCircle, Send, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConfigStore } from '@/stores/config-store'

export function Samantha() {
  const feedbackEnabled = useConfigStore((s) => s.feedbackEnabled)
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const nearCorner =
        window.innerWidth - e.clientX < 140 && window.innerHeight - e.clientY < 140
      setVisible(nearCorner)
    }
    window.addEventListener('pointermove', onPointerMove)
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [])

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current)
    }
  }, [])

  if (!feedbackEnabled) return null

  const handleSend = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? '전송 실패')
      }
      setMessage('')
      setSuccess(true)
      successTimer.current = setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '전송 실패')
    } finally {
      setSending(false)
    }
  }

  const showButton = visible || open

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={[
            'fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-300',
            showButton
              ? 'translate-x-0 opacity-100'
              : 'pointer-events-none translate-x-[120%] opacity-0',
          ].join(' ')}
          aria-label="피드백 보내기"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-80">
        <div className="space-y-3">
          <h4 className="font-medium">피드백 보내기</h4>

          <div className="relative">
            {!message && (
              <div
                className="pointer-events-none absolute left-0 top-0 p-3 text-sm text-muted-foreground"
                aria-hidden
              >
                피드백은 항상 열려있습니다. 12시간 내로 답변 없을 시 시간당{' '}
                <strong className="font-bold text-foreground">100 Credit</strong>
                을 제공해드립니다.
              </div>
            )}
            <textarea
              className="w-full resize-none rounded-md border border-input bg-transparent p-3 text-sm placeholder-transparent focus:outline-none focus:ring-1 focus:ring-ring"
              rows={5}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value)
                setError(null)
                setSuccess(false)
              }}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-primary">전송되었습니다</p>}

          <button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            보내기
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
