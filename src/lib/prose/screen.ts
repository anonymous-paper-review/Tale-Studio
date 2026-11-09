// Writer 산문 한 화면 규칙(v3 W1, 오너 2026-11-03 결정 7 · 8). 고치기 방식 전환(화면 · 채팅 탭)을 뺐으니
//   세 가지 안은 늘 고르기 창으로 고르고, 기다리는 화면의 큰 Lumi 는 초안을 쓰는 동안과 고치는 동안 모두 나온다(오너 2026-11-09 결정 4).
//   산문을 고치는 동안(수정안 · 세 가지 안)은 화면을 덮지 않는다 — 잠금은 그대로, 산문은 보고 스크롤한다(11/5 시안 WL, 리드 추천안 ㉠).
//   약속: tests/writer/prose-one-screen.test.ts · tests/writer/prose-wait-clear.test.ts
import type { ProseBusy } from '@/lib/prose/busy'
import { objectParticle } from '@/lib/korean-particles'
import type { LumiStagePersona } from '@/lib/lumi'
import { paragraphLabel } from '@/lib/prose/paragraph-pick'

/** 세 가지 안 고르기 창을 열지 — 세 안이 다 쓰였고 산문이 확정 전일 때. */
export function variantsPickerOpen(input: { proposal: { status: string; variants?: readonly unknown[] } | null | undefined; locked: boolean }): boolean {
  return !!input.proposal?.variants?.length && input.proposal.status !== 'generating' && !input.locked
}

/** 기다리는 화면의 큰 Lumi 옷 — 산문 초안을 쓰는 동안(Producer → Writer)도, 고치는 동안(수정안 · 세 가지 안)도 Writer
 *  (11/5 시안 WL, 오너 2026-11-09 결정 4 추천대로). 기다리는 일이 없으면 없다. */
export function proseWaitingLumi(busy: ProseBusy): LumiStagePersona | null {
  return busy ? 'writer' : null
}

/** 기다리는 창 덮개 — 산문 초안을 기다리는 동안은 화면을 덮고, 같은 단계 안에서 고치는 동안(수정안 · 세 가지 안)은
 *  덮지 않는다(투명 덮개 — 고치기 · 채팅 입력 잠금은 그대로). 카드 Lumi 는 proseWaitingLumi. */
export function proseWaitFrame(busy: ProseBusy): { scrim: 'dim' | 'clear' } {
  if (busy?.kind === 'revise' || busy?.kind === 'rewrite') return { scrim: 'clear' }
  return { scrim: 'dim' }
}

/** 고치는 동안 기다리는 창 설명 — 고쳐 달라고 보낸 문단이 있으면 "S2를 고치는 중이에요. 다른 씬은 그대로 볼 수 있어요."(11/5 시안 WL).
 *  문단 없이 고치거나 세 가지 안 · 초안이면 undefined — 기본 잠금 안내 그대로. */
export function proseWaitDescription(
  t: (text: string, params?: Record<string, string | number>) => string,
  input: { busy: ProseBusy; revisingIndex: number | null },
): string | undefined {
  if (input.busy?.kind !== 'revise' || input.revisingIndex === null) return undefined
  const label = paragraphLabel(input.revisingIndex)
  return t('Revising {label}. You can still read the other scenes.', { label, ul: objectParticle(label) })
}
