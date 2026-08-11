'use client'

// 씬 게이트 컨트롤(#s3-gate 2026-08-05) — run 이 awaiting_confirmation 일 때의 확정/수정 조작.
//   위 스트림(씬 스토리)을 검토하고 [수정 요청](s3 재실행 → 다시 게이트) 또는 [이대로 확정]
//   (뒷단 v0~ 진행). 성공 시 상태 전환은 useWriterStatus 폴링이 집어가므로 버튼은 잠금 유지
//   (#double-fire — 실패 시에만 원복).
//
// 사는 곳(2026-08-11, #gate-to-chat): 생성 화면 하단 바 → **채팅 제안 블록 안**.
//   결정을 요구하는 자리가 화면 아래와 채팅 두 곳이면 어디에 답해야 하는지 갈린다. 다른 단계의
//   "다음으로 넘어갈까요"가 전부 채팅에 있으므로 여기도 채팅으로 모은다. 하단 바는 진행률 전용.

import { useState } from 'react'
import { Check, Loader2, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useProjectStore } from '@/stores/project-store'

export function SceneGateControls() {
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
    <div className="mt-2 flex flex-col gap-2 px-1">
      <Textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="수정하고 싶은 부분을 적어 주세요 (예: 두 번째 씬을 더 긴장감 있게)"
        className="min-h-14 text-xs"
        disabled={!!busy}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1 rounded-full"
          onClick={() => void send('confirm')}
          disabled={!!busy}
        >
          {busy === 'confirm' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          이대로 확정
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 rounded-full"
          onClick={() => void send('revise')}
          disabled={!!busy || !feedback.trim()}
        >
          {busy === 'revise' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <PenLine className="size-3.5" />
          )}
          수정 요청
        </Button>
      </div>
    </div>
  )
}
