// Writer 산문 한 화면 규칙(v3 W1, 오너 2026-11-03 결정 7 · 8). 고치기 방식 전환(화면 · 채팅 탭)을 뺐으니
//   세 가지 안은 늘 고르기 창으로 고르고, 기다리는 화면의 큰 Lumi 는 Producer 에서 넘어와 초안을 쓰는 동안에만 나온다.
//   약속: tests/writer/prose-one-screen.test.ts
import type { ProseBusy } from '@/lib/prose/busy'
import type { LumiStagePersona } from '@/lib/lumi'

/** 세 가지 안 고르기 창을 열지 — 세 안이 다 쓰였고 산문이 확정 전일 때. */
export function variantsPickerOpen(input: { proposal: { status: string; variants?: readonly unknown[] } | null | undefined; locked: boolean }): boolean {
  return !!input.proposal?.variants?.length && input.proposal.status !== 'generating' && !input.locked
}

/** 기다리는 화면의 큰 Lumi 옷 — 산문 초안을 쓰는 동안(Producer → Writer)만 Writer. 산문을 고치는 동안은 단계 넘김이 아니라 두지 않는다. */
export function proseWaitingLumi(busy: ProseBusy): LumiStagePersona | null {
  return busy?.kind === 'draft' ? 'writer' : null
}
