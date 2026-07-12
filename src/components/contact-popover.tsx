'use client'

// 랜딩 footer의 Contact (L3). 클릭하면 메신저형 팝업이 떠서 이메일 주소를 보여주고,
// 작성한 메시지를 /api/feedback (kind:'contact') 로 보내 talestudio24@gmail.com 으로 포워딩한다.
import { useState, type ReactNode } from 'react'
import { Loader2, Send } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const CONTACT_EMAIL = 'talestudio24@gmail.com'

export function ContactPopover({
  trigger,
  side = 'top',
  align = 'start',
  note,
}: {
  /** 커스텀 트리거(사이드바 아이콘 등). 없으면 기본 "Contact" 텍스트 버튼. */
  trigger?: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** 팝업 상단 안내 문구(예: 사이드바 Help의 응답/보상 안내). 없으면 미표시. */
  note?: ReactNode
} = {}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, kind: 'contact' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? '전송 실패')
      }
      setMessage('')
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '전송 실패')
    } finally {
      setSending(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button type="button" className="transition-colors hover:text-primary">
            Contact
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-80 text-foreground">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium">Contact</h4>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-0.5 block text-xs text-primary hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
          {note ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
          ) : null}
          <textarea
            className="w-full resize-none rounded-md border border-input bg-transparent p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            rows={4}
            placeholder="메시지를 남겨주세요. 이메일로 전달됩니다."
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
              setError(null)
              setSuccess(false)
            }}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {success ? <p className="text-xs text-primary">전송되었습니다</p> : null}
          <button
            type="button"
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            보내기
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
