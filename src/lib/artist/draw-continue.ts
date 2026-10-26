// Artist 그림 이어 그리기 · 안 나온 그림 다시 그리기 판단(2026-10-27 디자이너 QA 1차 #05 #06).
//   서버 초안이 내 그림 한도(6장)에 막혀 건너뛴 그림은 이 프로젝트의 그림이 다 끝나면 이어서 그린다
//   (2026-09-11 오너 (가): 내 한도에 막힌 건 내 것이 끝나면 이어 간다). 이어 그리다 자리가 없다고 거절되면
//   멈추고 단추로 남긴다(자동 재시도 없음). 그리다 실패한 그림은 자동으로 다시 그리지 않는다 — 카드 · 단추로 사람이 고른다.
//   "그리는 중"은 화면이 보낸 것과 서버가 그리는 것(생성 상태 조회의 대기 작업)을 함께 센다.
//   화면(브라우저)과 테스트가 함께 쓴다 — 서버 전용 모듈을 들이지 않는다.
import type { CompletionGaps } from '@/lib/artist/completion-gaps'

/** 한 프로젝트에서 이어 그리기를 몇 번까지 하는지 — 막히면 단추로 남긴다. */
export const DRAW_CONTINUE_MAX_ROUNDS = 3
/** 그림체를 읽는 동안 돌아온 이어 그리기를 다시 볼 때까지 — 읽기가 끝나면 서버가 빈칸을 그린다(2026-10-10 오너). */
export const STYLE_WAIT_RECHECK_MS = 20_000
/** 내 한도(개인 축)에 막혀 거절됐을 때 다시 볼 때까지 — 다른 프로젝트의 내 그림이 끝나기를 기다린다(2026-09-11 오너 (가)). */
export const USER_LIMIT_RECHECK_MS = 60_000
/** 이만큼 실패한 칸은 자동 경로(이어 그리기 · 다시 그리기 단추)가 서버에서 거절된다 — 카드의 다시 만들기로 사람이 고른다.
 *  서버 give-up 게이트(generation-jobs AUTO_GENERATION_GIVE_UP_THRESHOLD)와 같은 값이다. */
export const AUTO_DRAW_GIVE_UP_FAILS = 2

type Failure = { failCount: number }
/** 서버 초안이 자리 때문에 건너뛴 칸의 축 — 'char:<characterId>' · 'world:<locationId>'. */
export type CapacitySkips = Readonly<Record<string, 'user' | 'global'>>

export interface DrawTargetInput {
  characters: ReadonlyArray<{
    characterId: string
    entityType: 'person' | 'object'
    appearances: ReadonlyArray<{ appearanceKey: string; isDefault: boolean; sheetUrl: string | null }>
  }>
  worlds: ReadonlyArray<{ locationId: string; wideShot: string | null }>
  /** 그리는 중인 인물 칸(화면이 보낸 것 + 서버가 그리는 것). */
  drawingViews: ReadonlyArray<{ characterId: string; appearanceKey: string; view: string }>
  /** 그리는 중인 배경 칸(기본 모습은 locationId). */
  drawingLocations: ReadonlyArray<string>
  /** 실패 기록 — 인물: characterId → appearanceKey → view. */
  failedViews?: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, Failure>>>>>>
  /** 실패 기록 — 배경: worldFailureKey(기본 모습은 locationId). */
  failedLocations?: Readonly<Record<string, Failure>>
  /** 서버 초안이 자리 때문에 건너뛴 칸(축) — 모두의 자리(global)에 막힌 칸은 이어 그리지 않는다. */
  capacitySkips?: CapacitySkips
}

export interface DrawTargets {
  characters: Array<{ characterId: string; appearanceKey: string }>
  worlds: string[]
}

/**
 * 대표 그림이 없고 그리는 중도 아닌 인물 · 배경([완료하기]와 같은 기준).
 *   늘 빼는 칸: 그리는 중 · 두 번 실패해 자동 경로가 멈춘 칸(카드의 다시 만들기로 사람이 고른다).
 *   skipFailed(이어 그리기)면 실패 기록이 있는 칸과 모두의 자리에 막혀 건너뛴 칸도 뺀다 — 둘 다 사람이 고른다.
 */
export function missingDrawTargets(input: DrawTargetInput, opts: { skipFailed?: boolean } = {}): DrawTargets {
  const gaveUp = (failure: Failure | undefined) => (failure?.failCount ?? 0) >= AUTO_DRAW_GIVE_UP_FAILS
  const characters: DrawTargets['characters'] = []
  for (const character of input.characters) {
    if (character.entityType === 'object') continue
    if (character.appearances.some((appearance) => appearance.isDefault && appearance.sheetUrl)) continue
    const appearanceKey = character.appearances.find((appearance) => appearance.isDefault)?.appearanceKey
    // 대표 모습 정보가 깨진 인물은 여기서 고를 수 없다 — 나머지는 그대로 고른다.
    if (!appearanceKey) continue
    const drawing = input.drawingViews.some((slot) => slot.characterId === character.characterId && slot.appearanceKey === appearanceKey && slot.view === 'main')
    if (drawing) continue
    const failure = input.failedViews?.[character.characterId]?.[appearanceKey]?.main
    if (gaveUp(failure)) continue
    if (opts.skipFailed && (failure || input.capacitySkips?.[`char:${character.characterId}`] === 'global')) continue
    characters.push({ characterId: character.characterId, appearanceKey })
  }
  const worlds = input.worlds
    .filter((world) => world.wideShot == null)
    .filter((world) => !input.drawingLocations.includes(world.locationId))
    .filter((world) => !gaveUp(input.failedLocations?.[world.locationId]))
    .filter((world) => !(opts.skipFailed && (input.failedLocations?.[world.locationId] || input.capacitySkips?.[`world:${world.locationId}`] === 'global')))
    .map((world) => world.locationId)
  return { characters, worlds }
}

export function drawTargetCount(targets: DrawTargets): number {
  return targets.characters.length + targets.worlds.length
}

/**
 * 그림 그리는 단계에서 지금 할 일.
 *   continue — 앞의 그림이 다 끝났고 한도에 막혀 못 그린 그림이 남았다: 이어서 그린다.
 *   wait — 그리는 중인 그림이 있거나, 그리기 시작한 뒤로 그림 상태를 아직 못 읽었다: 기다린다(단추도 숨긴다).
 *   stop — 자리가 없다고 거절됐거나 남은 그림이 실패한 것뿐이다: 멈추고 다시 그리기 단추를 보인다.
 *   idle — 아직 디자인 중이거나 다 그렸다.
 */
export function drawContinueDecision(input: {
  step: 0 | 1 | 2
  done: boolean
  /** 그리는 중인 그림 수(화면 + 서버). */
  drawing: number
  /** 그리기 단계가 시작된 뒤 그림 상태(서버 대기 작업)를 한 번이라도 읽었다. */
  checkedSinceDrawingBegan: boolean
  /** 실패 기록 없이 안 나온 그림 수. */
  autoTargets: number
  /** 이어 그리기가 멈췄다(거절 · 보낸 것 없음 · 횟수 다 씀). */
  stopped: boolean
  /** 이어 그리기 · 다시 그리기 한 바퀴가 도는 중 — 끝나면 판단이 바뀌어 남은 빈칸을 다시 본다. */
  running?: boolean
  /** 잠시 쉬는 중(그림체를 읽는 중 · 내 한도에 막힘) — 시간이 지나면 다시 본다. */
  paused?: boolean
}): 'continue' | 'wait' | 'stop' | 'idle' {
  if (input.step !== 2 || input.done) return 'idle'
  if (input.drawing > 0 || !input.checkedSinceDrawingBegan || input.running || input.paused) return 'wait'
  if (input.stopped || input.autoTargets === 0) return 'stop'
  return 'continue'
}

/** [완료하기]가 꺼진 까닭 — 그리는 중이면 기다리라고, 아니면 그림이 없는 이름을 보인다. */
export function completeBlockedNote(input: { gaps: CompletionGaps; drawing: number }): { kind: 'drawing' } | { kind: 'missing'; names: string[] } | null {
  const names = [...input.gaps.characters, ...input.gaps.locations]
  if (names.length === 0) return null
  if (input.drawing > 0) return { kind: 'drawing' }
  return { kind: 'missing', names }
}

/**
 * 그림 만드는 중 창의 글 — 멈췄는데(판단 'stop') 빈칸이 남았으면 멈춤 제목 · 안내(검증 지적 3).
 *   다시 그릴 장수가 있으면 단추로, 없으면(두 번 실패한 칸뿐) 카드의 다시 만들기로 안내한다. 멈춘 동안은 도는 원 · 레일 잠금이 없다.
 */
export function makingOverlayCopy(input: { decision: 'continue' | 'wait' | 'stop' | 'idle'; gapCount: number; missingCount: number }): { stopped: boolean; title: string | null; description: string | null } {
  if (input.decision !== 'stop' || input.gapCount === 0) return { stopped: false, title: null, description: null }
  return {
    stopped: true,
    title: 'Some images were not drawn',
    description: input.missingCount > 0
      ? 'Draw the missing ones again, or close this and check the cards.'
      : 'Remake the images that failed from each card.',
  }
}
