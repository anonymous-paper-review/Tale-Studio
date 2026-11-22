// Cinema [영상 만들기]의 방식 넷 — 고를 수 없는 방식은 까닭과 함께 꺼지고, 이어서는 앞 샷의 Editor 로 가는 영상 끝 장면으로, 새 Take 마다 사람 말 · 만든 길을 새로 적는지 검사한다 (오너 2026-11-22 D2~D5 · fb-video 계약 fd0e8e56 · 리드 11/22 ⑤)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CAMERA_VIDEO_MODES,
  VIDEO_MODE_BLOCK_TEXT,
  VIDEO_MODE_LABEL,
  cameraModeFacts,
  defaultVideoMode,
  freshTakeFields,
} from '@/features/camera/video-mode'
import { newTakeRequest } from '@/lib/director/shot-detail'
import { shotHistory } from '@/features/camera/shot-history'
import { videoModeAvailability } from '@/lib/director/video-modes'
import { translate } from '@/lib/i18n/translate'
import type { ShotDetailTake } from '@/lib/director/shot-detail'
import type { DirectorNode, VideoNodeData } from '@/types/director'

const image = (url: string) => ({ url, status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: url, direction: `${url}-dir`, end: `${url}-end` } })
const shot = (id: string, writerShotId: string | null, withImage = true) =>
  ({ id, data: { kind: 'shot', label: id, writerShotId, parentSceneNodeId: 'sc', provider: 'seedance', durationSeconds: 4, storyboardImage: withImage ? image(`https://x/${id}.png`) : null } }) as unknown as DirectorNode
const take = (id: string, parent: string, n: number, extra: Partial<VideoNodeData> = {}) =>
  ({
    id,
    data: {
      kind: 'video', label: `take_v${n}`, takeNumber: n, parentShotNodeId: parent, videoClipId: `clip-${id}`, generationJobId: `job-${id}`,
      status: 'completed', lastAttemptStatus: 'completed', videoUrl: `https://x/${id}.mp4`, thumbnailUrl: null, final: false,
      createdAt: `2026-11-22T10:0${n}:00Z`, lastAttemptAt: `2026-11-22T10:0${n}:00Z`, override: {}, cancelledAt: null, ...extra,
    },
  }) as unknown as DirectorNode
const rough = { status: 'completed', generatedAt: 5, frames: { start: 'r-s', direction: 'r-d', end: 'r-e' } }
const writerShots = [
  { shotId: 'w1', sceneId: 'sc_a', sortOrder: 1, roughStoryboard: rough },
  { shotId: 'w2', sceneId: 'sc_a', sortOrder: 2, roughStoryboard: rough },
  { shotId: 'w3', sceneId: 'sc_a', sortOrder: 3, roughStoryboard: null },
  { shotId: 'w9', sceneId: 'sc_b', sortOrder: 1, roughStoryboard: rough },
] as unknown as Parameters<typeof cameraModeFacts>[0]['writerShots']
const panel = () => readFileSync('src/features/camera/fix-panel.tsx', 'utf8')

describe('방식 넷', () => {
  it('[영상 만들기] 칸에는 방식 넷(이어서 · 레퍼런스 · 시작+미들 · 시작+프롬프트)이 있고, 처음 고른 방식은 가장 새 Take 의 방식, 처음 영상이면 기본(시작+프롬프트)이다', () => {
    // 왜: 오너 D2~D5 의 넷 — 시작+끝은 오너 2026-11-22 폐기, 기본은 시작+프롬프트(리드 제안 · 오너 확인 중). 방식은 [다시 만들기]처럼 앞 Take 를 이어받는다(fb-video 혼자 정한 것 3).
    expect(CAMERA_VIDEO_MODES).toEqual(['continue', 'reference', 'start_middle', 'start_prompt'])
    expect(CAMERA_VIDEO_MODES.map((mode) => translate('ko', VIDEO_MODE_LABEL[mode]))).toEqual(['이어서', '레퍼런스', '시작+미들', '시작+프롬프트'])
    expect(defaultVideoMode(null)).toBe('start_prompt')
    expect(defaultVideoMode({ override: {} })).toBe('start_prompt')
    expect(defaultVideoMode({ override: { videoMode: 'reference' } })).toBe('reference')
    expect(defaultVideoMode({ override: { videoMode: 'nope' } as never })).toBe('start_prompt')
  })

  it('씬의 첫 샷 · 앞 샷 영상이 없거나 만드는 중 · 실사 시트에 가운데 장이 없으면 그 방식은 꺼지고 까닭이 보인다', () => {
    // 왜: 서버가 막을 요청(409)을 보내기 전에 화면이 막고, 왜 못 고르는지 한 줄로 알린다(Take 를 쓰지 않는다).
    const first = cameraModeFacts({ shotNodeId: 'n1', nodes: [shot('n1', 'w1')], writerShots })
    expect(videoModeAvailability('continue', first.facts)).toEqual({ enabled: false, reason: 'first_shot_in_scene' })
    const noPrevVideo = cameraModeFacts({ shotNodeId: 'n2', nodes: [shot('n1', 'w1'), shot('n2', 'w2')], writerShots })
    expect(videoModeAvailability('continue', noPrevVideo.facts)).toEqual({ enabled: false, reason: 'previous_video_missing' })
    const making = cameraModeFacts({ shotNodeId: 'n2', nodes: [shot('n1', 'w1'), shot('n2', 'w2'), take('t1', 'n1', 1, { status: 'generating', lastAttemptStatus: 'generating', videoUrl: null })], writerShots })
    expect(videoModeAvailability('continue', making.facts)).toEqual({ enabled: false, reason: 'previous_video_generating' })
    // 미들은 실사 시트의 가운데 장이다(오너 V2) — 가운데 장이 없는 실사.
    const noDirection = shot('n3', 'w3') as unknown as { id: string; data: Record<string, unknown> }
    noDirection.data = { ...noDirection.data, storyboardImage: { url: 'https://x/n3.png', status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: 'https://x/n3.png', end: 'https://x/n3.png-end' } } }
    const noMiddle = cameraModeFacts({ shotNodeId: 'n3', nodes: [noDirection as unknown as DirectorNode], writerShots })
    expect(videoModeAvailability('start_middle', noMiddle.facts)).toEqual({ enabled: false, reason: 'middle_missing' })
    const noImage = cameraModeFacts({ shotNodeId: 'n1', nodes: [shot('n1', 'w1', false)], writerShots })
    expect(videoModeAvailability('reference', noImage.facts)).toEqual({ enabled: false, reason: 'storyboard_missing' })
    for (const text of Object.values(VIDEO_MODE_BLOCK_TEXT)) expect(translate('ko', text), text).not.toBe(text)
    expect(panel()).toMatch(/videoModeAvailability\(option, facts\)/)
  })

  it('이어서는 같은 씬 바로 앞 샷의 Editor 로 가는 Take(★, 없으면 가장 새 완성)에서 잇고, 눌렀을 때 그 영상의 마지막 장면을 잡아 그 장면으로 새 Take 를 만든다', () => {
    // 왜: fb-video 혼자 정한 것 5 — 완성본의 이음매. 장면은 누를 때 잡는다(앞 샷을 다시 만들었으면 새 영상에서).
    const nodes = [shot('n1', 'w1'), shot('n2', 'w2'), take('t1', 'n1', 1), take('t2', 'n1', 2), take('t3', 'n1', 3, { final: true })]
    const facts = cameraModeFacts({ shotNodeId: 'n2', nodes: [...nodes.slice(0, 4)], writerShots })
    expect(facts.facts.previousVideo).toBe('ready')
    expect(facts.previous).toEqual({ takeNodeId: 't2', videoClipId: 'clip-t2', generationJobId: 'job-t2', videoUrl: 'https://x/t2.mp4', plannedSec: 4 })
    expect(cameraModeFacts({ shotNodeId: 'n2', nodes, writerShots }).previous?.takeNodeId).toBe('t3')
    expect(panel()).toMatch(/prepareContinueFrom\(\{ projectId, source: \{ videoClipId: previous\.videoClipId, generationJobId: previous\.generationJobId, videoUrl: previous\.videoUrl \}, plannedSec: previous\.plannedSec \}\)/)
  })

  it('앞 영상의 마지막 장면을 잡지 못하면(검은 화면 · 잡기 · 올리기 실패) 새 Take 를 만들지 않고 까닭을 보인다', () => {
    // 왜: Take 를 쓰기 전에 막는다 — 검은 화면에서 이으면 Take 만 쓰고 이음매가 깨진다(fb-video 혼자 정한 것 9).
    const source = panel()
    expect(source).toContain("'The previous video ends on a black screen, so there is no scene to continue from.'")
    expect(source).toContain("'Unable to capture the source video last frame.'")
    expect(source).toContain("'Unable to upload the source video last frame.'")
  })
})

describe('새 Take 의 기록', () => {
  const base: ShotDetailTake = { id: 'old', data: { override: { changeNote: '더 느리게', note: '옛 말', via: 'chat', videoMode: 'continue', continueFrom: { videoClipId: 'c', generationJobId: 'j', frameUrl: 'f' } } } as unknown as VideoNodeData }

  it('새 Take 를 만들 때마다 그 Take 의 사람 말(바꿀 점)과 만든 길(단추)을 새로 적어, 앞 Take 의 말이 새 Take 요약에 붙지 않는다', () => {
    // 왜: 리드 11/22 ⑤ 주의 — [다시 만들기] 상속이 note · via 도 넘긴다. Take 마다 새로 넣어야 옛 판의 요약이 새 판에 붙지 않는다.
    const made = (change: string, mode: Parameters<typeof freshTakeFields>[0]['mode'], take: ShotDetailTake | null) =>
      newTakeRequest({ takeId: take?.id ?? null, take: take?.data ?? null, shotPrompt: 'P', change, fresh: freshTakeFields({ mode, change }) })
    expect(made('', 'reference', base)).toEqual({
      inheritFromVideoNodeId: 'old',
      videoOverride: { changeNote: '', videoMode: 'reference', note: '', via: 'button' },
    })
    expect(made('', 'start_prompt', null)).toEqual({ videoOverride: { videoMode: 'start_prompt', note: '', via: 'button' } })
    expect(panel()).toMatch(/fresh: freshTakeFields\(\{ mode, change, continueFrom \}\)/)
    expect(panel()).toMatch(/const change = base \? note : ''/)
  })

  it('이어서로 만들면 방금 잡은 장면을 그 Take 의 이어서 출처로 적고, 다른 방식이면 출처를 싣지 않는다', () => {
    // 왜: 서버가 그 장면이 앞 샷의 지금 영상에서 잡은 것인지 확인한다(continue_source_changed). [다시 만들기]도 같은 장면에서 잇는다.
    const continueFrom = { videoClipId: 'clip-t2', generationJobId: 'job-t2', frameUrl: 'https://x/frame.jpg' }
    expect(freshTakeFields({ mode: 'continue', change: ' 천천히 ', continueFrom })).toEqual({ videoMode: 'continue', continueFrom, note: '천천히', via: 'button' })
    expect(freshTakeFields({ mode: 'start_prompt', change: '', continueFrom })).not.toHaveProperty('continueFrom')
  })

  it('방식은 Take 값을 바꾸지 않는다 — 단추의 Take 값은 모델과 해상도로만 정해진다', () => {
    // 왜: fb-video 3-2 · take-cost — 방식마다 값이 다르면 단추 값과 실제 값이 어긋난다.
    expect(panel()).toMatch(/const count = takeCostForVideo\(setup\.model, setup\.resolution\)/)
  })
})

describe('Take 판의 방식 꼬리표', () => {
  it('Take 판에는 기본이 아닌 방식이면 그 방식 이름이 붙고, 앞 Take 와 방식이 바뀌면 바뀐 방식 이름이 붙는다', () => {
    // 왜: 이력에서 "어떻게 만들었나"를 읽는다 — 다 된 Take 는 그 영상을 낸 작업 기록(made_video_mode), 만드는 중이면 고른 방식.
    const t1 = { id: 't1', data: { ...take('t1', 'n1', 1).data, madeVideoMode: 'continue' } } as unknown as ShotDetailTake
    const t2 = { id: 't2', data: { ...take('t2', 'n1', 2).data, madeVideoMode: 'start_end' } } as unknown as ShotDetailTake
    const entries = shotHistory({ image: null, takes: [t1, t2], final: null, shot: { provider: 'seedance' } })
    const summary = (n: number) => entries.find((entry) => entry.kind === 'take' && entry.takeNumber === n)!.summary.map((p) => translate('ko', p.key, p.params))
    expect(summary(1)).toContain('이어서')
    expect(summary(2)).toContain('시작+끝')
  })
})
