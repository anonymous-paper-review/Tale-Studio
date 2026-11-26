// Writer 의 두 칸 — 씬 스토리 · 콘티(오너 2026-11-26 O1 "콘티를 Artist 앞에", dev fb1120 D1 의 두 칸을 옮겨 씀).
//   주소 · 단계 id: 씬 스토리 = /studio/producer(id producer), 콘티 = /studio/conti(id conti). Storyboard(id writer)는 따로 있는 실사 단계다.
//   레일은 두 칸을 Writer 한 칸으로 보이고, 위 막대의 [씬 스토리 | 콘티](features/writer/writer-part-switch)가 두 칸을 오간다.
//   콘티는 산문 확정으로 열린다(lib/stage-gate) — 열리기 전에는 [콘티]가 꺼져 있다. AI 가 일하는 동안은 레일과 같이 막는다.
//   두 칸 사이를 옮길 때는 단계 사이의 세로 움직임 대신 옆으로 민다(app/studio/template). 약속: tests/writer/part-switch.test.ts
import { STAGES } from '@/lib/constants'
import { railNavBlocked } from '@/stores/ai-busy-store'
import type { StageId } from '@/types'

export type WriterPart = 'scene' | 'conti'

/** 칸 순서 = 화면 왼쪽 → 오른쪽. label 은 영어 원문 = i18n 키(한국어 씬 스토리 · 콘티 — 영어 화면의 콘티는 지금 이름 Rough storyboard). */
export const WRITER_PARTS = [
  { part: 'scene', stage: 'producer', label: 'Scene story' },
  { part: 'conti', stage: 'conti', label: 'Rough storyboard' },
] as const satisfies ReadonlyArray<{ part: WriterPart; stage: StageId; label: string }>

/** 꺼진 [콘티]의 까닭 — 콘티는 산문을 확정하면 열린다(O1). */
export const CONTI_LOCKED_NOTE = 'Opens when you confirm the prose'
/** AI 가 일하는 동안 꺼진 칸의 까닭 — 레일 단계 단추와 같은 말. */
export const PART_BUSY_NOTE = 'AI is working. You can move once it finishes.'

/** 그 단계가 Writer 의 어느 칸인가(Writer 밖이면 null). */
export function writerPartOfStage(stage: string | null | undefined): WriterPart | null {
  return WRITER_PARTS.find((item) => item.stage === stage)?.part ?? null
}

/** 그 칸의 주소 — 단계 표(STAGES)의 주소 그대로. */
export function writerPartPath(part: WriterPart): string {
  const stage = WRITER_PARTS.find((item) => item.part === part)!.stage
  return STAGES.find((s) => s.id === stage)!.path
}

export interface WriterPartFacts {
  /** 지금 보는 칸. */
  current: WriterPart
  /** 콘티가 열렸나(canNavigateTo('conti')). */
  contiOpen: boolean
  /** AI 가 일하는 잠금이 걸려 있나(ai-busy-store). */
  aiBusy: boolean
}

export interface WriterPartItem {
  part: WriterPart
  label: string
  active: boolean
  disabled: boolean
  /** 꺼진 까닭(영어 원문 = i18n 키). */
  note: string | null
}

/** 위 막대 두 칸의 모습. 지금 보는 칸은 늘 켜져 있고(눌러도 그대로), 다른 칸은 아직 안 열렸거나 AI 가 일하면 꺼진다. */
export function writerPartItems(facts: WriterPartFacts): WriterPartItem[] {
  return WRITER_PARTS.map(({ part, label }) => {
    const active = part === facts.current
    const locked = part === 'conti' && !facts.contiOpen
    const disabled = !active && railNavBlocked({ to: 'stage', locked, aiBusy: facts.aiBusy })
    const note = !disabled ? null : facts.aiBusy ? PART_BUSY_NOTE : CONTI_LOCKED_NOTE
    return { part, label, active, disabled, note }
  })
}

/** 칸을 눌렀을 때 갈 주소 — 지금 보는 칸이거나 꺼진 칸이면 null(옮기지 않는다). */
export function writerPartTarget(next: string, facts: WriterPartFacts): string | null {
  const item = writerPartItems(facts).find((candidate) => candidate.part === next)
  if (!item || item.active || item.disabled) return null
  return writerPartPath(item.part)
}

/** 두 칸 사이를 옮길 때 옆으로 미는 방향 — 씬 스토리 → 콘티는 앞(오른쪽에서), 반대는 뒤(왼쪽에서). 두 칸 사이가 아니면 'none'. */
export function writerPartSlide(prev: StageId | null | undefined, next: StageId | null | undefined): 'forward' | 'back' | 'none' {
  const from = writerPartOfStage(prev)
  const to = writerPartOfStage(next)
  if (!from || !to || from === to) return 'none'
  return to === 'conti' ? 'forward' : 'back'
}
