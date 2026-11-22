// 영상 만드는 방식마다 어떤 그림을 어떤 순서로 쓰고, 언제 그 방식을 고를 수 없는지 정한다 (오너 2026-11-22 D2~D5)
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIDEO_MODE,
  START_MIDDLE_SOURCE,
  VIDEO_MODES,
  isVideoMode,
  previousShotInScene,
  takeOverrideForRequest,
  videoModeAvailability,
  videoModeForRequest,
  type VideoModeFacts,
} from '@/lib/director/video-modes'
import { resolveModeFrames, roughMiddleFrame } from '@/lib/director/video-mode-frames'
import { END, REAL_DIRECTION, ROUGH, ROUGH_DIRECTION, ROUGH_GENERATED_AT, START, STORYBOARD } from '../fixtures/_video-submit'

const READY: VideoModeFacts = { hasStoryboard: true, firstShotInScene: false, previousVideo: 'ready', hasMiddle: true }
const SHEET = 'https://media.test/mina_sheet.png'
const SHEET_2 = 'https://media.test/joon_sheet.png'
const WORLD = 'https://media.test/harbor_wide.png'
const LANTERN = 'https://media.test/lantern.png'
const references = {
  characters: [{ url: SHEET, label: 'character sheet: Mina' }, { url: SHEET_2, label: 'character sheet: Joon' }],
  world: { url: WORLD, label: 'the location' },
  props: [{ url: LANTERN, label: 'prop: lantern' }],
}

describe('같이 정한 것', () => {
  // 왜: 오너 2026-11-22 "기존에 있던 Start, End 프레임 생성 방식은 일단 폐기" — 남는 방식은 오너 D2~D5 의 넷이다.
  //   기본(아무것도 안 고름)은 시작+프롬프트다(오너 확정 2026-11-22 M1).
  it('영상 만드는 방식은 넷이다 — 이어서 · 레퍼런스 · 시작+미들 · 시작+프롬프트, 시작+끝은 고를 수 없다', () => {
    expect(VIDEO_MODES).toEqual(['continue', 'reference', 'start_middle', 'start_prompt'])
    expect(isVideoMode('start_end')).toBe(false)
    expect(DEFAULT_VIDEO_MODE).toBe('start_prompt')
  })

  // 왜: 오너 V2 "실사 미들로 해줘" — 영상에는 실사 그림만 들어간다(러프 = 목각 인형). 미들은 실사 시트의 가운데 장(시작 그림 + 화살표 · 글자)이다.
  it('시작+미들의 미들은 실사 시트의 가운데 장이다', () => {
    expect(START_MIDDLE_SOURCE).toBe('real')
    expect(resolveModeFrames({ mode: 'start_middle', storyboardImage: STORYBOARD, roughStoryboard: ROUGH }))
      .toMatchObject({ ok: true, urls: [START, REAL_DIRECTION], roles: ['start', 'direction'], middleSource: 'real' })
  })
})

describe('혼자 정한 것', () => {
  // 왜: "앞에서 생성된 영상"은 같은 씬의 바로 앞 샷 영상이다 — 화면과 서버가 같은 순서(샷 읽기 순서 sort_order)로 앞 샷을 찾아야 한다.
  it('같은 씬의 바로 앞 샷을 씬 안 순서로 찾고, 씬의 첫 샷이면 앞 샷이 없다고 한다', () => {
    const shots = [
      { shotId: 'b', sceneId: 's1', sortOrder: 2 },
      { shotId: 'a', sceneId: 's1', sortOrder: 1 },
      { shotId: 'c', sceneId: 's2', sortOrder: 3 },
    ]
    expect(previousShotInScene(shots, 'b')).toBe('a')
    expect(previousShotInScene(shots, 'a')).toBeNull()
    expect(previousShotInScene(shots, 'c')).toBeNull()
  })

  // 왜: 씬이 바뀌면 장소 · 시간이 바뀐다 — 앞 씬 마지막 샷에서 잇지 않는다(대신 기본 방식으로 만든다).
  it('씬의 첫 샷에서는 이어서를 고를 수 없다', () => {
    expect(videoModeAvailability('continue', { ...READY, firstShotInScene: true })).toEqual({ enabled: false, reason: 'first_shot_in_scene' })
    expect(videoModeAvailability('start_prompt', { ...READY, firstShotInScene: true }).enabled).toBe(true)
  })

  // 왜: 앞 영상이 끝나길 기다렸다 저절로 만들면 사람이 모르는 사이 Take 가 쓰인다 — 막고 까닭을 다르게 보인다.
  it('앞 샷 영상이 없거나 만드는 중이면 이어서를 고를 수 없고 까닭을 다르게 알린다', () => {
    expect(videoModeAvailability('continue', { ...READY, previousVideo: 'none' })).toEqual({ enabled: false, reason: 'previous_video_missing' })
    expect(videoModeAvailability('continue', { ...READY, previousVideo: 'generating' })).toEqual({ enabled: false, reason: 'previous_video_generating' })
    expect(videoModeAvailability('continue', READY).enabled).toBe(true)
  })

  // 왜: 미들은 실사 시트의 가운데 장이다(V2) — 가운데 장이 없는 옛 실사면 시작+미들은 보낼 그림이 없다.
  it('미들이 없으면 시작+미들을 고를 수 없다', () => {
    expect(videoModeAvailability('start_middle', { ...READY, hasMiddle: false })).toEqual({ enabled: false, reason: 'middle_missing' })
  })

  // 왜: 러프 화살표를 고친 뒤 실사를 다시 그리지 않으면 실사 가운데 장은 고치기 전 움직임이고, 영상 지시의 읽은 줄은 고친 뒤 움직임이다 —
  //   보내는 그림과 글이 다른 움직임을 말하지 않게 그때는 끄고 까닭을 보인다(리드 D1, 2026-11-22). 판정은 "러프 바뀜"(classifyRoughChanged).
  it('시작+미들은 실사 시트에 가운데 장이 있고, 러프를 고친 뒤 다시 그린 실사일 때만 고를 수 있다', () => {
    expect(videoModeAvailability('start_middle', { ...READY, middleOutdated: true })).toEqual({ enabled: false, reason: 'middle_outdated' })
    expect(videoModeAvailability('start_middle', { ...READY, middleOutdated: false })).toEqual({ enabled: true, reason: null })
    expect(videoModeAvailability('start_prompt', { ...READY, middleOutdated: true }).enabled).toBe(true)
  })

  // 왜: 지금 약속(#ref-gate) — 샷의 실사 영상은 실사 시작 그림이 있어야 만든다. 방식이 늘어도 같다.
  it('실사 시작 그림이 없으면 어느 방식도 고를 수 없다', () => {
    for (const mode of VIDEO_MODES) {
      expect(videoModeAvailability(mode, { ...READY, hasStoryboard: false })).toEqual({ enabled: false, reason: 'storyboard_missing' })
    }
  })

  // 왜: Camera 에서 방식을 고른 Take 를 노드에서 손으로 다시 이으면 사람이 마지막에 한 것(손 배선)이 이긴다 —
  //   Take 기록도 실제로 쓴 것과 같아야 Take 카드에 틀린 방식이 적히지 않는다.
  it('노드에서 손으로 그림을 이으면 그 Take 의 방식은 보내지 않고 새 Take 기록에서도 지운다', () => {
    const override = { videoMode: 'reference', resolution: '1080p' } as const
    expect(videoModeForRequest(override, true)).toBeUndefined()
    expect(videoModeForRequest(override, false)).toBe('reference')
    expect(takeOverrideForRequest({ ...override }, undefined)).toEqual({ resolution: '1080p' })
  })

  // 왜: 이어서로 만든 Take 를 다른 방식으로 다시 만들 때 옛 이어서 출처가 기록에 남으면 그 Take 가 이어 만든 것처럼 보인다.
  it('이어서가 아닌 방식으로 바꾸면 이어서 출처를 새 Take 기록에 남기지 않는다', () => {
    const continueFrom = { videoClipId: 'clip-1', generationJobId: 'job-1', frameUrl: 'https://media.test/f.jpg' }
    expect(takeOverrideForRequest({ videoMode: 'start_prompt', continueFrom }, 'start_prompt')).toEqual({ videoMode: 'start_prompt' })
    expect(takeOverrideForRequest({ videoMode: 'continue', continueFrom }, 'continue')).toEqual({ videoMode: 'continue', continueFrom })
  })

  // 왜: 모델이 받는 장 수를 넘으면 뒤에서부터 덜어 낸다 — 소품이 맨 뒤라 먼저, 그다음 배경, 인물 순이고 샷 실사는 마지막까지 남는다.
  //   소품 그림은 fb-artist 의 샷별 소품 함수가 들어오기 전에는 빈 목록이다(자리만 정해 둔다).
  it('레퍼런스에 넣는 그림 순서는 샷 실사 → 인물 시트 → 배경 → 소품이고, 소품이 맨 뒤라 가장 먼저 덜어 낸다', () => {
    const frames = resolveModeFrames({ mode: 'reference', storyboardImage: STORYBOARD, references, includeShotImage: true })

    expect(frames).toMatchObject({ ok: true, urls: [START, SHEET, SHEET_2, WORLD, LANTERN], roles: ['ref', 'ref', 'ref', 'ref', 'ref'] })
    expect(frames.ok && frames.labels?.[4]).toBe('prop: lantern')
  })

  // 왜: 오너 결정 1 의 대안(실사에 남은 러프 느낌을 피하려고 샷 실사를 빼기) — 시험에서 나란히 보이려면 서버 상수 하나로 바꿔 끼운다.
  it('레퍼런스에서 샷 실사를 빼도록 바꾸면 인물 · 배경 · 소품만 보낸다', () => {
    const frames = resolveModeFrames({ mode: 'reference', storyboardImage: STORYBOARD, references, includeShotImage: false })

    expect(frames.ok && frames.urls).toEqual([SHEET, SHEET_2, WORLD, LANTERN])
  })

  // 왜: 오너 결정 2 의 대안(실사 시트의 가운데 장) — 화풍은 맞지만 고친 화살표는 실사를 다시 만들기 전엔 안 들어간다. 상수 하나로 바꿔 끼운다.
  it('시작+미들의 미들 출처를 실사로 바꾸면 실사 시트의 가운데 장을 보낸다', () => {
    const rough = resolveModeFrames({ mode: 'start_middle', storyboardImage: STORYBOARD, roughStoryboard: ROUGH, middleSource: 'rough' })
    const real = resolveModeFrames({ mode: 'start_middle', storyboardImage: STORYBOARD, roughStoryboard: ROUGH, middleSource: 'real' })

    expect(rough.ok && rough.urls[1]).toContain(ROUGH_DIRECTION)
    expect(real).toMatchObject({ ok: true, urls: [START, REAL_DIRECTION], roles: ['start', 'direction'] })
  })

  // 왜: 화살표 편집기는 같은 주소에 덮어 저장한다 — 시각을 붙이지 않으면 생성처가 고치기 전 그림을 받아 갈 수 있다.
  it('러프 미들 주소에는 고친 시각을 붙인다', () => {
    expect(roughMiddleFrame(ROUGH)).toBe(`${ROUGH_DIRECTION}?v=${ROUGH_GENERATED_AT}`)
    expect(roughMiddleFrame({ ...ROUGH, status: 'generating' })).toBeNull()
  })

  // 왜: 오너 2026-11-22 "앞에서 생성된 영상의 마지막 프레임을 참조" · 시작+끝 폐기 — 이번 샷의 실사 끝 그림은 실사 끝이 있어도 보내지 않는다.
  //   이어 붙일 장면이 없으면 만들지 않는다.
  it('이어서는 이어 붙일 장면만 시작으로 쓰고, 이번 샷의 끝 그림은 보내지 않는다', () => {
    const frame = 'https://media.test/chain.jpg'
    expect(resolveModeFrames({ mode: 'continue', storyboardImage: STORYBOARD, continueFrameUrl: frame }))
      .toMatchObject({ ok: true, urls: [frame], roles: ['start'] })
    expect(STORYBOARD.frames.end).toBe(END)
    expect(resolveModeFrames({ mode: 'continue', storyboardImage: STORYBOARD, continueFrameUrl: null }))
      .toEqual({ ok: false, code: 'missing_continue_frame' })
  })
})
