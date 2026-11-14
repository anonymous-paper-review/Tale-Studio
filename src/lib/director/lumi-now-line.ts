// Director 채팅 맨 위 "지금 할 일" 줄(11/13 시안 D5 "지금 할 일 · 이미지 4장 · 약 2분 · Takes 안 써요", 오너 2026-11-14 "추천대로").
//   가리키는 일은 위쪽 가장 밝은 단추와 같은 차례: 이미지 → 영상 → 다음: Editor로, 만드는 중이면 만드는 것과 끝난 수.
//   보드 전체를 센다(상태 고르기 · 고른 샷과 상관없이). 예상 글은 툴바 예상 칸과 같은 함수(toolbar-work.ts workEstimateText).
//   순수 함수만 둔다. 약속: tests/director/lumi-now-line.test.ts
import { imageWorkShotIds, makingLabel, videoWorkShotIds, workEstimateText } from '@/lib/director/toolbar-work'
import type { DirectorShotState } from '@/lib/director/shot-state'
import type { VideoModelKey } from '@/lib/video-models'

type Translate = (text: string, params?: Record<string, string | number>) => string

export interface LumiNowInput {
  /** 샷마다 지금 상태(보드와 같은 판정 — use-shot-states). */
  states: ReadonlyMap<string, DirectorShotState>
  /** 실사 이미지 일괄 · 영상 묶음이 도는 중. */
  imageBusy: boolean
  videoBusy: boolean
  /** 도는 일괄의 끝난 수 / 전체(위쪽 진행과 같은 서버 배치). 모르면 null. */
  progress: { done: number; total: number } | null
  /** 완성 영상이 하나라도 있다 — [다음: Editor로]가 켜지는 조건. */
  canHandOff: boolean
  /** 영상까지 이어서 — 이미지를 만든 샷은 영상도 이어서 만든다. */
  chain: boolean
  modelOf: (shotNodeId: string) => VideoModelKey
  /** 이 샷들 영상에 드는 Take(버튼 확인창 · 채팅과 같은 계산). */
  takesFor: (shotNodeIds: readonly string[]) => number
  /** Take 를 쓰는 계정이다(과금 꺼짐 · 잔액을 못 읽으면 Take 수를 쓰지 않는다). */
  takesShown: boolean
}

/** "지금 할 일 · …" 한 줄. 샷이 없거나 가리킬 일이 없으면 null(줄을 보이지 않는다). */
export function lumiNowLine(input: LumiNowInput, t: Translate): string | null {
  const states = [...input.states.values()]
  if (states.length === 0) return null
  const makingImages = states.filter((state) => state === 'image_generating').length
  const makingVideos = states.filter((state) => state === 'video_generating').length
  // 만드는 동안은 남은 시간을 쓰지 않는다(오너 8/26) — 무엇을 만드는지와 끝난 수만.
  if (makingImages + makingVideos > 0 || input.imageBusy || input.videoBusy) {
    // 영상 묶음이 막 시작해 아직 만드는 샷이 잡히지 않았으면 위쪽 진행 글처럼 수 없이 "영상 만드는 중"(리드 11/14 — "1개"라고 하지 않는다).
    const making = makingImages + makingVideos === 0 && input.videoBusy ? t('Making videos') : makingLabel(makingImages, makingVideos, t)
    const done = input.progress && input.progress.total > 0 ? t('Finished {done} of {total}', input.progress) : null
    return t('Up next · {work}', { work: done ? `${making} · ${done}` : making })
  }
  const images = imageWorkShotIds(input.states, null)
  const videos = videoWorkShotIds(input.states, null)
  let work: string | null = null
  if (images.length > 0) {
    work = workEstimateText({
      images: images.length,
      videoModels: input.chain ? images.map(input.modelOf) : [],
      videoTakes: input.chain ? input.takesFor(images) : 0,
      takesShown: input.takesShown,
      making: false,
      chain: input.chain,
    }, t)
  } else if (videos.length > 0) {
    work = workEstimateText({
      images: 0,
      videoModels: videos.map(input.modelOf),
      videoTakes: input.takesFor(videos),
      takesShown: input.takesShown,
      making: false,
    }, t)
  } else if (input.canHandOff) {
    work = t('Next: Editor')
  }
  return work ? t('Up next · {work}', { work }) : null
}
