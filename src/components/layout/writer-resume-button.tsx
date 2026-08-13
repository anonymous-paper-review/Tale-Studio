'use client'

// #stage-retry '이어서 재시도' (2026-08-13) — failed run 을 실패한 스테이지부터 재개하는 공용 버튼.
//   실패 표면 3곳(writer script/rough 빈 상태, artist 게이트)이 공유한다 — 문구·동작이 갈리면
//   한 곳은 "Producer에서 다시"(전체 재실행)를 안내하는 사고가 재발한다.
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function WriterResumeButton({
  projectId,
  onResumed,
}: {
  projectId: string | null | undefined
  /** resume 성공 시 호출 — useWriterStatus 의 restart 를 넘겨 폴링을 재개한다. */
  onResumed?: () => void
}) {
  const [resuming, setResuming] = useState(false)
  const resume = async () => {
    if (!projectId || resuming) return
    setResuming(true)
    try {
      const res = await fetch('/api/writer/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (res.ok) onResumed?.()
    } finally {
      setResuming(false)
    }
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <Button size="sm" onClick={resume} disabled={resuming}>
        {resuming ? '재개하는 중…' : '이어서 재시도'}
      </Button>
      <p className="text-xs text-muted-foreground">
        중단된 단계부터 다시 시작해요 — 처음부터 다시 만들지 않아요.
      </p>
    </div>
  )
}
