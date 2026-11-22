// 영상 Take 목록은 그 영상을 만든 방식과 실제로 쓴 시작 · 끝 · 미들 그림을 알려준다 — Cinema 이력 카드가 방식을 적는다 (오너 2026-11-22 D2~D5)
import { describe, expect, it } from 'vitest'
import { madeFrames, madeVideoMode } from '@/lib/director-video-takes'

const VIDEO = 'https://media.test/ws/p/videos/clip-a/job-a.mp4'
const take = { url: VIDEO, storage_path: 'ws/p/videos/clip-a/job-a.mp4' }
const START = 'https://media.test/start.png'
const MIDDLE = 'https://media.test/direction.png?v=1'
const END = 'https://media.test/end.png'

function job(patch: Record<string, unknown>) {
  return { id: 'job-a', status: 'completed', model: 'bytedance/seedance-2.0/reference-to-video', result_url: VIDEO, resolution: null, ...patch }
}

describe('같이 정한 것', () => {
  // 왜: 정상 경로 고정 — 시작+끝으로 만든 영상은 지금처럼 "시작 v1 + 끝 v1"을 낸다(디자이너 11/13 D7).
  it('시작 · 끝으로 만든 영상은 지금처럼 쓴 시작 · 끝 그림을 알린다', () => {
    expect(madeFrames(take, job({ reference_image_url: START, reference_image_urls: [START, END], reference_image_roles: ['start', 'end'] })))
      .toEqual({ start: START, end: END })
  })
})

describe('혼자 정한 것', () => {
  // 왜: 레퍼런스 영상의 첫 그림은 참고일 뿐 시작 장면이 아니다 — 예전에는 첫 그림을 "시작"으로 읽어 카드에 틀린 시작 그림이 적혔다.
  it('레퍼런스로 만든 영상은 첫 참고 그림을 시작 그림으로 적지 않는다', () => {
    expect(madeFrames(take, job({ reference_image_url: START, reference_image_urls: [START, END], reference_image_roles: ['ref', 'ref'] })))
      .toBeNull()
  })

  // 왜: Camera 이력 카드가 "시작 + 미들"로 만든 판에 어떤 미들(연출 스케치)을 썼는지 보이려면 그 주소가 필요하다.
  it('시작+미들로 만든 영상은 쓴 미들 그림을 함께 알린다', () => {
    expect(madeFrames(take, job({ reference_image_url: START, reference_image_urls: [START, MIDDLE], reference_image_roles: ['start', 'direction'] })))
      .toEqual({ start: START, end: null, middle: MIDDLE })
  })

  // 왜: Take 카드에 방식을 적는 근거는 지금 영상을 낸 작업의 기록이다 — 다시 만드는 중 · 실패한 시도의 방식은 지금 영상의 방식이 아니다.
  //   오너 2026-11-22 시작+끝 폐기 뒤로는 기본 방식도 작업 기록에 적는다 — 방식이 없는 작업은 그 전(기본 = 시작+끝)에 만든 옛 작업이다.
  it('지금 영상을 낸 작업의 방식을 알리고, 방식이 적히지 않은 옛 작업은 시작+끝으로 본다', () => {
    expect(madeVideoMode(take, job({ video_mode: 'continue' }))).toBe('continue')
    expect(madeVideoMode(take, job({ video_mode: 'start_prompt' }))).toBe('start_prompt')
    expect(madeVideoMode(take, job({}))).toBe('start_end')
    expect(madeVideoMode(take, job({ status: 'queued', video_mode: 'continue' }))).toBeNull()
  })

  // 왜: 노드에서 손으로 이은 그림으로 만든 Take 는 방식이 없다(손 배선이 방식을 이긴다) — 폐기 뒤에 만든 손 배선 작업까지 "시작+끝"으로 읽으면
  //   끝 그림을 보낸 적 없는 Take 이력에 없어진 방식이 적힌다. 손 배선 작업은 그 표시를 작업 기록에 남기고, 방식은 모른다(null)로 읽는다.
  it('손으로 이어 만든 새 작업은 이력에서 시작+끝으로 읽지 않는다', () => {
    expect(madeVideoMode(take, job({ frame_source: 'manual' }))).toBeNull()
  })
})
