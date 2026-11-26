'use client'

// 콘티의 [씬 · 샷 나누기 시작] — 산문은 확정했는데(저장 단계 conti) 씬 · 샷 나누기가 걸리지 않은 채 남은 콘티를 다시 건다
//   (확정 뒤 나누기를 걸지 못하고 창을 닫았을 때 · O1 오너 2026-11-26). 하는 일은 확정 뒤와 같다(features/prose/confirm-prose-flow).
//   예전 흐름으로 Artist 까지 간 프로젝트(저장 단계 artist)는 지금처럼 Artist [만들기]로 나누므로 보드가 이 단추를 그리지 않는다.
import { useState } from 'react'
import { Loader2, Play } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { continueContiSplit } from '@/features/prose/confirm-prose-flow'
import { useT } from '@/lib/i18n'

export function ContiSplitStart() {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const start = async () => {
    if (busy) return
    setBusy(true)
    try {
      // 이동은 없다 — 이미 콘티 화면이다. 나누기가 걸리면 보드가 잠금 표시("콘티로 넘어가는 중이에요")로 바뀐다.
      await continueContiSplit({ navigate: () => {}, notify: toast, t })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button onClick={() => void start()} disabled={busy} data-testid="conti-split-start">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      {t('Split into scenes and shots')}
    </Button>
  )
}
