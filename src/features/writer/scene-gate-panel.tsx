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
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useT } from '@/lib/i18n'

// 수정 요청·확정 호출은 global-chat-store(reviseSceneGate·confirmSceneGate) 한 곳이 맡는다(2026-10-01).

// label · handoff: 넘기기 전 트리트먼트 초안(2026-10-02 시안 v04)은 확정이 곧 Writer 로 넘기기다 — 버튼은 "Writer로 넘기기"이고 확인 창을 연다.
export function SceneGateControls({ label, handoff = false }: { label?: string; handoff?: boolean } = {}) {
  const [busy, setBusy] = useState(false)
  const t = useT()
  // 캡션 중간에 <kbd> 엘리먼트가 끼어들어야 해서 {kbd} 토큰으로 번역문을 받은 뒤 직접 split
  //   (sidebar.tsx 의 {credit} 스플릿과 동일 패턴).
  const [kbdPre, kbdPost] = (handoff
    ? t('{kbd} to hand over to Writer · edits go in the input box below')
    : t('{kbd} to confirm · edits go in the input box below')
  ).split('{kbd}')

  return (
    <div className="mt-2 flex flex-col gap-1.5 px-1">
      <Button
        size="sm"
        className="w-full rounded-full"
        disabled={busy}
        onClick={() => {
          if (busy) return
          setBusy(true)
          // Producer 메인의 확정과 같은 경로 — 성공하면 Writer 화면으로 간다(2026-10-01).
          void useGlobalChatStore.getState().confirmSceneGate()
            .then((ok) => {
              if (ok === true) toast.success(t('Scenes confirmed. Starting character, visual, and shot design'))
              else if (ok === false) toast.error(t('Could not confirm the scene story. Please try again.'))
            })
            .finally(() => setBusy(false))
        }}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        {label ?? t('Confirm as-is')}
      </Button>
      <p className="text-center text-[10px] text-muted-foreground">
        {kbdPre}
        <kbd className="rounded border border-border bg-muted px-1">Enter</kbd>
        {kbdPost}
      </p>
    </div>
  )
}
