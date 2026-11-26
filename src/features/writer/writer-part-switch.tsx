'use client'

// Writer 위 막대의 [씬 스토리 | 콘티](dev D1 오너 2026-11-22 · O1 오너 2026-11-26, 위 막대 "Writer" 칩 바로 오른쪽 두 칸). 시안 없음.
//   두 칸 다 그 화면으로 가는 길이다(씬 스토리 = /studio/producer, 콘티 = /studio/conti) — 무엇이 꺼지고 어디로 가는지는 lib/writer/parts.
//   생김새는 Producer 시작 화면 위 막대의 고르기와 같은 묶음 탭(Tabs default)이다 — 콘티 안의 [러프 | 대사] 알약 탭과 겹치지 않게.
//   화살표 키로 칸을 옮겨 다닐 때는 옮겨 가지 않는다(manual) — 고른 칸에서 Enter · Space · 누르기로만 옮긴다.
//   이 컴포넌트는 React 상태 훅을 쓰지 않는다(시험이 렌더 없이 onValueChange 를 부른다 — tests/writer/part-switch.test.ts).
import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { STAGE_LABEL } from '@/lib/constants'
import { withDemoShare } from '@/lib/demo/context'
import { useT } from '@/lib/i18n'
import { writerPartItems, writerPartOfStage, writerPartTarget } from '@/lib/writer/parts'
import { aiBusyNow, useAiBusyStore } from '@/stores/ai-busy-store'
import { useProjectStore } from '@/stores/project-store'
import type { StageId } from '@/types'

export function WriterPartSwitch({ stage }: { stage: StageId }) {
  const t = useT()
  const router = useRouter()
  const current = writerPartOfStage(stage)
  const contiOpen = useProjectStore((s) => s.canNavigateTo('conti'))
  const aiBusy = useAiBusyStore((s) => s.tokens.length > 0)
  if (!current) return null
  const items = writerPartItems({ current, contiOpen, aiBusy })
  return (
    <Tabs
      value={current}
      activationMode="manual"
      // 잠금 · AI 일은 지금 값(aiBusyNow)으로 다시 본다 — 레일 이동(goToStage)과 같은 까닭.
      onValueChange={(next) => {
        const to = writerPartTarget(next, { current, contiOpen, aiBusy: aiBusyNow() })
        if (to) router.push(withDemoShare(to))
      }}
      className="shrink-0 gap-0"
    >
      <TabsList aria-label={STAGE_LABEL.producer} className="h-8 group-data-[orientation=horizontal]/tabs:h-8" data-testid="writer-parts">
        {items.map((item) => (
          // 꺼진 단추에는 마우스가 닿지 않는다 — 까닭(title)은 감싼 칸에 둔다.
          <span key={item.part} className="inline-flex h-full" title={item.note ? t(item.note) : undefined}>
            <TabsTrigger value={item.part} disabled={item.disabled} className="px-3" data-testid={`writer-part-${item.part}`}>
              {t(item.label)}
            </TabsTrigger>
          </span>
        ))}
      </TabsList>
    </Tabs>
  )
}
