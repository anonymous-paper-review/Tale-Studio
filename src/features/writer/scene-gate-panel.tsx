'use client'

// 씬 게이트 패널(#s3-gate 2026-08-05) — run 이 awaiting_confirmation 일 때 하단 진행 바를 대체.
//   위 스트림(씬 스토리)을 검토하고 [수정 요청](s3 재실행 → 다시 게이트) 또는 [이대로 확정]
//   (뒷단 v0~ 진행). 성공 시 상태 전환은 useWriterStatus 폴링이 집어가므로 버튼은 잠금 유지
//   (#double-fire — 실패 시에만 원복).

import { useState } from 'react'
import { Check, Loader2, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useProjectStore } from '@/stores/project-store'

export function SceneGatePanel() {
  const projectId = useProjectStore((s) => s.projectId)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState<null | 'confirm' | 'revise'>(null)

  const send = async (action: 'confirm' | 'revise') => {
    if (!projectId || busy) return
    if (action === 'revise' && !feedback.trim()) {
      toast.info('수정하고 싶은 내용을 적어 주세요')
      return
    }
    setBusy(action)
    try {
      const res = await fetch('/api/writer/scene-gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, action, feedback: feedback.trim() || undefined }),
      })
      const j = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`)
      if (action === 'revise') {
        toast.success('피드백을 반영해 씬 스토리를 다시 쓰는 중이에요')
        setFeedback('')
      } else {
        toast.success('씬 확정 — 인물·비주얼·샷 설계를 시작해요')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '요청에 실패했어요')
      setBusy(null)
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-background/95 px-6 py-4 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <p className="text-sm font-medium">
          씬 스토리 초안이 준비됐어요 — 위 내용을 검토해 주세요. 확정하면 이 스토리로 샷을
          설계해요.
        </p>
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="수정하고 싶은 부분을 적어 주세요 (예: 두 번째 씬을 더 긴장감 있게, 결말에 여운을 남겨줘)"
          className="min-h-16 text-sm"
          disabled={!!busy}
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => void send('revise')} disabled={!!busy}>
            {busy === 'revise' ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <PenLine className="mr-1.5 size-4" />
            )}
            수정 요청
          </Button>
          <Button onClick={() => void send('confirm')} disabled={!!busy}>
            {busy === 'confirm' ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Check className="mr-1.5 size-4" />
            )}
            이대로 확정
          </Button>
        </div>
      </div>
    </div>
  )
}
