// Director 배선 5 — 영상의 참조 프레임은 서버가 DB 에서 읽는다 (2026-09-06, #ref-gate 와 같은 방향)
//
//   게이트만 DB 를 보고 제출 프레임은 로컬 노드 값이라, 스토어가 낡으면 이미지 없이 T2V 로 나가거나 옛 프레임이
//   실렸다. 자동 프레임(사람이 배선하지 않은 경우)은 서버가 shots.storyboard_image 로 정하고, 손으로 배선한
//   프레임은 존중하되 빠진 시작 프레임만 DB 로 채운다. 그리드 카드의 "영상 생성"은 이미지를 새로 만들기 전에
//   DB 를 먼저 다시 읽는다. 문장 하나 = 테스트 하나.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { resolveVideoReferenceFrames } from '@/lib/director/video-reference-frames'
import { storyboardImageEndFrame } from '@/lib/director/storyboard-image'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const SB = {
  url: 'https://s/shot-1_storyboard_start.png',
  frames: {
    start: 'https://s/shot-1_storyboard_start.png',
    direction: 'https://s/shot-1_storyboard_direction.png',
    end: 'https://s/shot-1_storyboard_end.png',
  },
  status: 'completed',
}

describe('Director 배선 5 — 영상의 참조 프레임은 서버가 DB 에서 읽는다', () => {
  it('클라가 이미지 없이(T2V) 보내도 DB 에 실사가 있으면 시작·끝 프레임을 DB 로 채워 I2V 로 낸다', () => {
    const r = resolveVideoReferenceFrames({
      frameSource: 'auto',
      referenceImageUrl: undefined,
      referenceImageUrls: undefined,
      referenceImageRoles: undefined,
      storyboardImage: SB,
    })
    expect(r).toEqual({
      generationMethod: 'I2V',
      referenceImageUrl: SB.frames.start,
      referenceImageUrls: [SB.frames.start, SB.frames.end],
      referenceImageRoles: ['start', 'end'],
      source: 'db',
    })
  })

  it('자동 프레임은 클라가 낡은 이미지를 보내도 DB 의 프레임으로 바꾼다', () => {
    const r = resolveVideoReferenceFrames({
      frameSource: 'auto',
      referenceImageUrl: 'https://s/old.png',
      referenceImageUrls: ['https://s/old.png'],
      referenceImageRoles: ['start'],
      storyboardImage: SB,
    })
    expect(r.referenceImageUrls).toEqual([SB.frames.start, SB.frames.end])
    expect(r.referenceImageUrl).toBe(SB.frames.start)
    expect(r.source).toBe('db')
  })

  it('손으로 배선한 프레임은 존중하고, 시작 프레임이 빠졌을 때만 DB 의 시작 프레임을 앞에 채운다', () => {
    const r = resolveVideoReferenceFrames({
      frameSource: 'manual',
      referenceImageUrl: 'https://s/asset.png',
      referenceImageUrls: ['https://s/asset.png'],
      referenceImageRoles: ['ref'],
      storyboardImage: SB,
    })
    expect(r.referenceImageUrls).toEqual([SB.frames.start, 'https://s/asset.png'])
    expect(r.referenceImageRoles).toEqual(['start', 'ref'])
    expect(r.referenceImageUrl).toBe(SB.frames.start)
    expect(r.generationMethod).toBe('I2V')
    expect(r.source).toBe('client')
    const manualStart = resolveVideoReferenceFrames({
      frameSource: 'manual',
      referenceImageUrl: 'https://s/mine.png',
      referenceImageUrls: ['https://s/mine.png', 'https://s/end.png'],
      referenceImageRoles: ['start', 'end'],
      storyboardImage: SB,
    })
    expect(manualStart.referenceImageUrls).toEqual(['https://s/mine.png', 'https://s/end.png'])
  })

  it('DB 에 실사가 없으면(독립 영상·미생성) 클라 값을 그대로 둔다', () => {
    const r = resolveVideoReferenceFrames({
      frameSource: 'auto',
      referenceImageUrl: undefined,
      referenceImageUrls: undefined,
      referenceImageRoles: undefined,
      storyboardImage: null,
    })
    expect(r).toEqual({
      generationMethod: 'T2V',
      referenceImageUrl: null,
      referenceImageUrls: undefined,
      referenceImageRoles: undefined,
      source: 'client',
    })
    expect(storyboardImageEndFrame({ url: 'https://s/only.png', status: 'completed' })).toBeNull()
    expect(storyboardImageEndFrame(SB)).toBe(SB.frames.end)
  })

  it('frameSource 를 보내지 않는 옛 호출은 종전대로 클라 값을 쓴다 — 새 클라는 항상 보낸다', () => {
    const r = resolveVideoReferenceFrames({
      frameSource: undefined,
      referenceImageUrl: undefined,
      referenceImageUrls: undefined,
      referenceImageRoles: undefined,
      storyboardImage: SB,
    })
    expect(r.generationMethod).toBe('T2V')
    expect(r.source).toBe('client')
  })

  it('영상 라우트는 게이트 뒤에 이 규칙으로 프레임을 정하고, 클라는 배선 여부(frameSource)를 보낸다', () => {
    const route = read('src/app/api/director/generate-video/route.ts')
    expect(route).toMatch(/resolveVideoReferenceFrames\(\{/)
    expect(route).toMatch(/storyboardImage: standalone \? null : shot!\.storyboard_image/)
    const store = read('src/stores/director-store.ts')
    expect(store).toMatch(/frameSource: chainFrameUrl \|\| hasManualFrameInputs \? 'manual' : 'auto'/)
  })

  it('그리드 카드의 "영상 생성"은 이미지를 새로 만들기 전에 DB 를 먼저 다시 읽는다 — 승인한 그림을 갈아치우지 않는다', () => {
    const grid = read('src/features/director/canvas-views/StoryboardGridView.tsx')
    expect(grid).toMatch(/if \(!hasImage\) \{\n\s*await useDirectorCanvasStore\.getState\(\)\.hydrateFreshFromDb\(\)/)
  })
})
