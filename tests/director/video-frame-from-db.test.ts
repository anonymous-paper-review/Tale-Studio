// 승인된 스토리보드 화면은 영상에 우선 사용하고, 화면이 없으면 입력한 선택을 지킨다 (Director 배선 5, #ref-gate 2026-09-06)
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

describe('승인된 스토리보드 화면을 영상에 쓰는 약속 (Director 배선 5)', () => {
  it('그림 없이 요청해도 승인된 스토리보드가 있으면 시작과 끝 화면을 채워 영상으로 만든다', () => {
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

  it('자동으로 화면을 고르면 오래된 그림 대신 승인된 스토리보드 화면을 쓴다', () => {
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

  it('직접 연결한 그림은 그대로 쓰고 시작 그림이 없을 때만 승인된 시작 화면을 앞에 더한다', () => {
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

  it('승인된 스토리보드가 없으면 독립 영상은 입력한 그림을 그대로 사용한다', () => {
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

  it('연결 정보를 보내지 않은 예전 요청은 입력한 그림을 그대로 사용한다', () => {
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

  it('영상 생성은 먼저 그림을 확인하고 연결한 그림인지 구분해 사용한다', () => {
    expect(read('src/app/api/director/generate-video/route.ts')).toMatch(/submitDirectorVideoRequest\(req\)/)
    const route = read('src/lib/director/video-submit.ts')
    expect(route).toMatch(/resolveVideoReferenceFrames\(\{/)
    expect(route).toMatch(/storyboardImage: standalone \? null : shot!\.storyboard_image/)
    const store = read('src/stores/director-store.ts')
    expect(store).toMatch(/frameSource: chainFrameUrl \|\| hasManualFrameInputs \? 'manual' : 'auto'/)
  })

  it('그리드의 "영상 생성"은 새 그림을 만들기 전에 저장된 그림을 다시 확인해 승인한 그림을 지킨다', () => {
    const grid = read('src/features/director/canvas-views/StoryboardGridView.tsx')
    expect(grid).toMatch(/if \(!hasImage\) \{\n\s*await useDirectorCanvasStore\.getState\(\)\.hydrateFreshFromDb\(\)/)
  })
})
