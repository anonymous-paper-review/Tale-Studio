// "영상까지 이어서"를 켜고 만들면 이미지가 끝난 샷부터 영상이 저절로 시작된다 — 이 화면(브라우저)이 이어 보낸다 (시안 D4 406:5275 · R 416:4941, 오너 답 6)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { chainStep } from '@/lib/director/toolbar-work'
import type { DirectorShotState } from '@/lib/director/shot-state'

const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const page = () => readFileSync('src/app/studio/director/page.tsx', 'utf8')

beforeEach(() => {
  useDirectorCanvasStore.setState({ projectId: 'p1', chainVideoAfterImage: false, chainWaitingShotIds: [] })
})

describe('영상까지 이어서 스위치', () => {
  it('"영상까지 이어서"를 켜면 이미지 단추 이름이 "이미지+영상 만들기"가 된다', () => {
    // 왜: 시안 R "'영상까지 이어서'를 켜면 이미지 버튼이 '이미지+영상 만들기'로".
    expect(ko('Make images + videos')).toBe('이미지+영상 만들기')
    expect(ko('Also make videos')).toBe('영상까지 이어서')
    expect(page()).toMatch(/chainVideoAfterImage \? t\('Make images \+ videos'\)/)
  })

  it('스위치는 화면에 들어오면 꺼져 있고, 다른 프로젝트로 가면 꺼지며 기다림도 비운다', () => {
    // 왜: 돈 드는 기본값을 남기지 않는다(혼자 정한 것 c, 오너 답 6 = 브라우저가 이어 보냄).
    useDirectorCanvasStore.getState().setChainVideoAfterImage(true)
    useDirectorCanvasStore.getState().setChainWaitingShots(['a'])
    useDirectorCanvasStore.getState().setProjectId('p2')
    expect(useDirectorCanvasStore.getState().chainVideoAfterImage).toBe(false)
    expect(useDirectorCanvasStore.getState().chainWaitingShotIds).toEqual([])
  })

  it('켜 둔 채 [이미지+영상 만들기]를 누르면 먼저 영상 확인 창을 거치고, 확인하면 "이 화면을 닫으면 영상은 시작되지 않아요"를 알린다', () => {
    // 왜: Take 를 쓰니 확인을 받는다(약속 E) · 오너 답 6 "브라우저가 이어 보내고 화면을 닫으면 시작되지 않음을 알린다".
    expect(ko("If you close this screen, the videos won't start.")).toBe('이 화면을 닫으면 영상은 시작되지 않아요')
    expect(page()).toContain('setConfirmChain(true)')
    expect(page()).toContain(`toast.info(t("If you close this screen, the videos won't start."))`)
  })
})

describe('이미지가 끝나면 영상 시작', () => {
  const step = (waiting: string[], states: Record<string, DirectorShotState>, imageBusy: boolean) =>
    chainStep(waiting, new Map(Object.entries(states)), imageBusy)

  it('기다리던 샷의 이미지가 끝나면 그 샷 영상을 시작하고 기다림에서 뺀다', () => {
    // 왜: 시안 D4 "이미지가 끝나면 자동으로 시작해요".
    expect(step(['a', 'b'], { a: 'image_done', b: 'image_generating' }, true)).toEqual({ start: ['a'], drop: [], keep: ['b'] })
  })

  it('이미지가 실패하거나, 일괄이 끝났는데도 이미지가 없으면 영상을 시작하지 않고 기다림에서 뺀다', () => {
    // 왜: 쓸 그림이 없다(혼자 정한 것 b).
    expect(step(['a', 'b', 'c'], { a: 'image_failed', b: 'image_needed', c: 'image_needed' }, false)).toEqual({ start: [], drop: ['a', 'b', 'c'], keep: [] })
    expect(step(['b'], { b: 'image_needed' }, true)).toEqual({ start: [], drop: [], keep: ['b'] })
  })

  it('다른 길로 이미 영상을 만들고 있거나 영상이 있으면 다시 시작하지 않고 기다림에서 뺀다', () => {
    // 왜: 같은 샷 영상을 두 번 만들어 Take 를 두 번 쓰지 않게.
    expect(step(['a', 'b'], { a: 'video_generating', b: 'video_done' }, false)).toEqual({ start: [], drop: ['a', 'b'], keep: [] })
  })

  it('기다리는 영상 노드는 "이미지가 끝나면 자동으로 시작해요"를 보인다', () => {
    // 왜: 시안 D4 의 기다리는 영상 노드 글.
    expect(ko('Starts by itself when the image is done')).toBe('이미지가 끝나면 자동으로 시작해요')
    const videoNode = readFileSync('src/features/director/canvas-nodes/VideoNode.tsx', 'utf8')
    expect(videoNode).toContain("t('Starts by itself when the image is done')")
  })
})
