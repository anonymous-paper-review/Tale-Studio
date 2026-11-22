// Cinema 영상 방식 넷 — 옛 시작+끝 Take 는 이력에 이름으로 남고, 실사가 "러프 바뀜"이면 시작+미들이 꺼지며, 꺼짐 까닭 · 방식 설명이 시작 그림 · 실사 가운데 장 기준인지 검사한다 (오너 2026-11-22 "시작+끝 폐기" · V2 · M1 · 리드 D1)
import { describe, expect, it } from 'vitest'
import { VIDEO_MODE_BLOCK_TEXT, VIDEO_MODE_HINT, cameraModeFacts } from '@/features/camera/video-mode'
import { shotHistory } from '@/features/camera/shot-history'
import { videoModeAvailability } from '@/lib/director/video-modes'
import { translate } from '@/lib/i18n/translate'
import type { ShotDetailTake } from '@/lib/director/shot-detail'
import type { DirectorNode, VideoNodeData } from '@/types/director'

const real = (roughGeneratedAt: number) => ({
  url: 'https://x/s.png', status: 'completed', errorMessage: null, generatedAt: 10, roughGeneratedAt,
  frames: { start: 'https://x/s.png', direction: 'https://x/d.png', end: 'https://x/e.png' },
})
const shotNode = (roughGeneratedAt: number) =>
  ({ id: 'n1', data: { kind: 'shot', label: 'n1', writerShotId: 'w1', parentSceneNodeId: 'sc', provider: 'seedance', durationSeconds: 4, storyboardImage: real(roughGeneratedAt) } }) as unknown as DirectorNode
const writerShots = [{ shotId: 'w1', sceneId: 'sc_a', sortOrder: 1, roughStoryboard: { status: 'completed', generatedAt: 5, frames: { start: 'r', direction: 'r', end: 'r' } } }] as unknown as Parameters<typeof cameraModeFacts>[0]['writerShots']
const take = (n: number, extra: Partial<VideoNodeData>): ShotDetailTake => ({
  id: `t${n}`,
  data: {
    kind: 'video', takeNumber: n, parentShotNodeId: 'n1', videoClipId: `c${n}`, generationJobId: `j${n}`, status: 'completed', lastAttemptStatus: 'completed',
    videoUrl: `https://x/${n}.mp4`, final: false, createdAt: `2026-11-22T10:0${n}:00Z`, lastAttemptAt: `2026-11-22T10:0${n}:00Z`, cancelledAt: null, override: {}, ...extra,
  } as unknown as VideoNodeData,
})

describe('방식 넷', () => {
  it('옛 시작+끝 Take 는 이력 판에 "시작+끝"이라는 이름으로 남는다', () => {
    // 왜: 오너 "시작+끝 폐기" — 고를 수는 없지만 그 방식으로 만든 옛 영상은 이력에서 무엇으로 만들었는지 읽혀야 한다.
    const [entry] = shotHistory({ image: null, takes: [take(1, { madeVideoMode: 'start_end' })], final: null, shot: { provider: 'seedance' } })
    expect(entry && entry.summary.map((p) => translate('ko', p.key, p.params))).toContain('시작+끝')
  })

  it('실사가 "러프 바뀜"이면 ③ 시작+미들이 꺼지고 "러프를 고친 뒤 이미지를 다시 만들어야 시작+미들을 쓸 수 있어요."가 보인다', () => {
    // 왜: 리드 D1 — 미들은 실사 시트의 가운데 장이라(V2) 러프를 고친 뒤 실사를 다시 그리지 않으면 옛 연출을 따른다. 서버도 409 middle_outdated 로 막는다.
    //   말은 Cinema 의 다른 곳처럼 "이미지" · "images"(리드 G 11/23 — 영어가 "live-action storyboard"였다).
    const outdated = cameraModeFacts({ shotNodeId: 'n1', nodes: [shotNode(3)], writerShots })
    expect(outdated.facts.middleOutdated).toBe(true)
    expect(videoModeAvailability('start_middle', outdated.facts)).toEqual({ enabled: false, reason: 'middle_outdated' })
    expect(translate('ko', VIDEO_MODE_BLOCK_TEXT.middle_outdated)).toBe('러프를 고친 뒤 이미지를 다시 만들어야 시작+미들을 쓸 수 있어요.')
    expect(VIDEO_MODE_BLOCK_TEXT.middle_outdated).toBe('Remake the images after editing the rough to use Start + middle.')
    const fresh = cameraModeFacts({ shotNodeId: 'n1', nodes: [shotNode(5)], writerShots })
    expect(videoModeAvailability('start_middle', fresh.facts)).toEqual({ enabled: true, reason: null })
  })

  it('그림이 없을 때 까닭은 시작 그림만 묻고, 미들이 없을 때 까닭은 이미지의 가운데 장을 말한다', () => {
    // 왜: 오너 "시작+끝 폐기" — 새 Take 는 끝 그림을 쓰지 않는다. V2 — 미들은 러프가 아니라 실사 가운데 장이다.
    //   말은 Cinema 의 다른 곳처럼 "이미지"(리드 G 11/23 — 한국어가 "실사 이미지"였다).
    expect(VIDEO_MODE_BLOCK_TEXT.storyboard_missing).toBe('Make the start image first.')
    expect(translate('ko', VIDEO_MODE_BLOCK_TEXT.storyboard_missing)).toBe('시작 이미지를 먼저 만들어요.')
    expect(VIDEO_MODE_BLOCK_TEXT.middle_missing).toBe("This shot's images have no middle frame yet. Remake images first.")
    expect(translate('ko', VIDEO_MODE_BLOCK_TEXT.middle_missing)).toBe('이 샷의 이미지에 가운데 장이 아직 없어요. 이미지를 다시 만들어 주세요.')
  })

  it('방식 설명은 고를 수 있는 넷만 있고 끝 그림을 말하지 않는다 — 시작+미들은 실사 가운데 장의 화살표, 시작+프롬프트는 글을 따른다', () => {
    // 왜: 끝 그림은 어느 방식에도 쓰이지 않는다(fb-video) — "끝 그림은 쓰지 않아요" 같은 비교 말은 이제 필요 없다.
    expect(Object.keys(VIDEO_MODE_HINT).sort()).toEqual(['continue', 'reference', 'start_middle', 'start_prompt'])
    for (const hint of Object.values(VIDEO_MODE_HINT)) expect(hint, hint).not.toMatch(/end image|direction sketch/i)
    expect(translate('ko', VIDEO_MODE_HINT.start_middle)).toBe('시작 그림에서 시작해 실사 가운데 장의 화살표대로 움직여요.')
    expect(translate('ko', VIDEO_MODE_HINT.start_prompt)).toBe('시작 그림에서 시작해 글대로 움직여요.')
  })
})
