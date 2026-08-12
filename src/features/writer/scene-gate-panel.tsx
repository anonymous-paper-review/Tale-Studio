'use client'

// 씬 게이트 확정 컨트롤(#s3-gate 2026-08-05 → #gate-to-chat 2026-08-11 → #gate-main-input 2026-08-12).
//
// 변천: 생성 화면 하단 바 → 채팅 제안 블록 안의 자체 텍스트박스 → **메인 채팅 입력창**.
//   "채팅 안에 또 채팅창"은 어디에 답해야 하는지 갈랐다(오너 피드백 2026-08-12). 이제 수정
//   피드백은 원래 입력창으로 치고(global-chat 이 confirmScenes 활성 중 가로채 revise 로 라우팅),
//   빈 상태로 Enter = 확정이다. 여기는 확정 버튼 하나만 남는다(마우스 경로).

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/project-store'

/** 씬 게이트 API 호출 — 채팅 입력창 가로채기(global-chat)와 확정 버튼이 공유하는 단일 경로. */
export async function sendSceneGate(
  action: 'confirm' | 'revise',
  feedback?: string,
): Promise<boolean> {
  const projectId = useProjectStore.getState().projectId
  if (!projectId) return false
  try {
    const res = await fetch('/api/writer/scene-gate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, action, feedback: feedback?.trim() || undefined }),
    })
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`)
    if (action === 'revise') toast.success('피드백을 반영해 씬 스토리를 다시 쓰는 중이에요')
    else toast.success('씬 확정 — 인물·비주얼·샷 설계를 시작해요')
    return true
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '요청에 실패했어요')
    return false
  }
}

export function SceneGateControls() {
  const [busy, setBusy] = useState(false)

  return (
    <div className="mt-2 flex flex-col gap-1.5 px-1">
      <Button
        size="sm"
        className="w-full rounded-full"
        disabled={busy}
        onClick={() => {
          if (busy) return
          setBusy(true)
          void sendSceneGate('confirm').finally(() => setBusy(false))
        }}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        이대로 확정
      </Button>
      <p className="text-center text-[10px] text-muted-foreground">
        <kbd className="rounded border border-border bg-muted px-1">Enter</kbd> 확정 · 수정할
        내용은 아래 입력창에
      </p>
    </div>
  )
}
