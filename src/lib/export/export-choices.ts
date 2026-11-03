// [내보내기] 체크 창(v3, 오너 2026-11-03 "버튼을 누르면 check 박스가 떠서 어떤 아이템만 내보낼 수 있을지 정해줘").
//   칸은 예전 메뉴 그대로 넷 — 화면 JPEG · 마스터 시트 그림 · 이 단계 ZIP · 전체 프로젝트 ZIP. 고를 수 있는 조건도 예전 메뉴와 같다.
//   고른 것만 창의 순서대로 하나씩 받는다. 화면 JPEG 는 창이 다 닫힌 뒤에 찍고, 한 칸이 실패해도 다음 칸으로 넘어간다.
//   그리기 · 받기는 호출부(components/export-menu.tsx)가 넘긴다 — 이 파일은 고를 수 있는지와 순서만 정한다(DOM 의존 없음).
//   약속: tests/editor/export-dialog.test.ts
import type { PrevizExportAccess } from '@/lib/billing/export-access'
import type { ExportStage } from './types'

/** 창의 칸 순서 = 받는 순서. 화면 JPEG 가 맨 앞이다 — 다른 받기가 화면을 바꾸기 전에 찍는다. */
export const EXPORT_CHOICES = ['screen', 'sheet', 'stage', 'project'] as const
export type ExportChoice = (typeof EXPORT_CHOICES)[number]

export interface ExportChoiceState {
  choice: ExportChoice
  enabled: boolean
  /** 고를 수 없는 까닭 — 프로젝트 없음 · 받는 중 · 요금제 · 이 단계에는 단계 ZIP 이 없음. */
  blockedBy: 'project' | 'busy' | 'plan' | 'stage' | null
}

export function exportChoiceStates(input: {
  hasProject: boolean
  busy: boolean
  access: PrevizExportAccess
  /** 이 단계 ZIP 으로 묶을 단계(resolveExportStage) — Producer 시작 화면 · Editor 는 없다. */
  stage: ExportStage | null
}): ExportChoiceState[] {
  return EXPORT_CHOICES.map((choice) => {
    const blockedBy = !input.hasProject
      ? 'project'
      : input.busy
        ? 'busy'
        : input.access !== 'open'
          ? 'plan'
          : choice === 'stage' && !input.stage
            ? 'stage'
            : null
    return { choice, enabled: blockedBy === null, blockedBy }
  })
}

/** 고른 칸 중 지금 고를 수 있는 것만, 창의 순서대로. */
export function exportRunList(picked: ReadonlySet<ExportChoice>, states: readonly ExportChoiceState[]): ExportChoice[] {
  return states.filter((state) => state.enabled && picked.has(state.choice)).map((state) => state.choice)
}

/** 두 칸 이상이면 파일도 둘 이상 — 브라우저가 여러 파일 다운로드를 허용할지 물을 수 있어 창에 미리 알린다. */
export function warnsMultipleDownloads(list: readonly ExportChoice[]): boolean {
  return list.length >= 2
}

export interface ExportRunDeps {
  closeDialog: () => void
  /** 창이 화면에서 다 사라질 때까지 — 화면 JPEG 에 창이 찍히지 않게. */
  dialogGone: () => Promise<void>
  /** 칸마다 받기. 성공 · 실패 알림은 칸이 스스로 띄운다. */
  run: Record<ExportChoice, () => Promise<void>>
}

/** 창을 닫고 다 사라지면, 고른 칸을 하나씩 받는다. 한 칸이 실패해도 다음 칸으로 넘어간다. */
export async function runExportChoices(list: readonly ExportChoice[], deps: ExportRunDeps): Promise<void> {
  deps.closeDialog()
  await deps.dialogGone()
  for (const choice of list) {
    try {
      await deps.run[choice]()
    } catch (error) {
      console.warn(`[export] ${choice} failed; continuing with the rest:`, error)
    }
  }
}

/** present() 가 거짓이 될 때까지 기다린다 — 끝내 안 사라져도 maxMs 가 지나면 멈춘다(받기가 멈추지 않게). */
export async function waitUntilGone(
  present: () => boolean,
  sleep: (ms: number) => Promise<void>,
  now: () => number = Date.now,
  { stepMs = 25, maxMs = 2000 }: { stepMs?: number; maxMs?: number } = {},
): Promise<void> {
  const started = now()
  while (present() && now() - started < maxMs) await sleep(stepMs)
}
