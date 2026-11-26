// 단계 화면을 여는 동안 기다리는 카드(오너 2026-11-26 m1126 G1 "탭 전환 시 로딩되기 전에 Editor의 탭처럼 로딩창 띄우기") — 언제 보이고 무엇이라 쓰는지.
//   레일로 단계를 옮기거나 프로젝트를 여는 동안, 단계 화면은 자기 자료를 다 읽기 전에 "아직 산문이 없어요" · "아직 생성된 씬·샷이 없어요" ·
//   "AI 자동 생성 진행 중 0%" · "Writer에서 씬을 먼저 만들면…" 같은 틀린 안내를 먼저 보였다(2026-11-26 실측). 그동안은 Editor 의 "클립 준비 중…"과
//   같은 카드(components/feedback/stage-wait)를 보인다 — 잠금이 아니라 레일 · 채팅은 그대로 쓴다. 화면마다 무엇을 "다 읽었다"고 볼지는 아래 함수들,
//   그 사실을 모으는 훅은 hooks/use-stage-wait. 약속: tests/project/stage-wait.test.ts (+ 단계별 open-wait 시험)
import type { StageId } from '@/types'

/** 기다리는 카드 제목(사전 키 = 영어 원문) — 무엇을 읽는지 동사로(design §16.2). Editor 는 오너가 본보기로 든 예전 글 그대로. */
export const STAGE_WAIT_TITLE: Record<StageId, string> = {
  entry: 'Loading the start screen…',
  producer: 'Loading the prose…',
  artist: 'Loading characters and backgrounds…',
  writer: 'Loading the storyboard…',
  director: 'Loading shots…',
  editor: 'Preparing clips…',
}

/** Director 기다리는 카드의 상한 — 동기화가 끝내 샷 카드를 못 놓아도 이만큼 뒤에는 캔버스를 그대로 보인다. */
export const DIRECTOR_WAIT_MAX_MS = 10_000

/** 단계 화면이 내용 대신 기다리는 카드를 보일지 — 프로젝트를 여는 중(바꾸는 동안 포함)이거나, 그 화면이 지금 프로젝트를 아직 다 읽지 못했으면. */
export function stageWaiting(input: { projectId: string | null; initLoading: boolean; read: boolean }): boolean {
  if (!input.projectId || input.initLoading) return true
  return !input.read
}

/** Artist 를 다 읽었나 — 인물 · 배경(받아 둔 것이 있거나 처음 읽기가 끝남)과 진행 상태(산문 목록 · 만드는 중 · 카드를 고르는 근거) 둘 다. */
export function artistRead(input: { hasAssets: boolean; firstRead: boolean; statusRead: boolean }): boolean {
  return (input.hasAssets || input.firstRead) && input.statusRead
}

/** Storyboard 를 다 읽었나 — 받아 둔 샷이 있으면 바로, 없으면 처음 읽기와 진행 상태(빈 보드 안내 · 나누는 중 · 다시 시도를 고르는 근거) 둘 다. */
export function storyboardRead(input: { hasShots: boolean; firstRead: boolean; statusRead: boolean }): boolean {
  return input.hasShots || (input.firstRead && input.statusRead)
}

/** Director 를 다 읽었나 — 씬 · 샷을 읽었고, 샷이 있으면 그 카드가 캔버스에 하나라도 놓였을 때. 상한(timedOut)이 지나면 그대로 보인다. */
export function directorRead(input: { writerRead: boolean; writerShots: number; canvasShots: number; timedOut: boolean }): boolean {
  if (input.timedOut) return true
  return input.writerRead && (input.writerShots === 0 || input.canvasShots > 0)
}

/** 처음 읽기 — 끝나면(실패해도) 풀린다. 절대 거절하지 않는다: 읽기가 실패해도 기다림이 끝나야 화면이 빈 상태 안내 · 다시 시도를 보인다. */
export function settleRead(load: () => Promise<unknown>): Promise<void> {
  return Promise.resolve()
    .then(load)
    .then(
      () => undefined,
      () => undefined,
    )
}
