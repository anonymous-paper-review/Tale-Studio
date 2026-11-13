// Director 위쪽 단추 셋이 세는 일 · 가장 밝은 단추 · 예상 칸 글 (시안 D1 406:3717 · D2 406:4588 · R 416:4941, 오너 2026-11-14 · 답 11)
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import {
  estimateWorkSeconds,
  imageWorkShotIds,
  primaryWorkAction,
  videoWorkShotIds,
  workEstimateText,
} from '@/lib/director/toolbar-work'
import type { DirectorShotState } from '@/lib/director/shot-state'

const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const en = (text: string, params?: Record<string, string | number>) => translate('en', text, params)

const states = new Map<string, DirectorShotState>([
  ['a', 'image_needed'],
  ['b', 'image_failed'],
  ['c', 'image_generating'],
  ['d', 'image_done'],
  ['e', 'video_failed'],
  ['f', 'video_done'],
  ['g', 'video_generating'],
])

describe('단추가 세는 일', () => {
  it('[이미지 만들기 · N]의 N 은 이미지가 없는 샷(이미지 필요 · 이미지 실패) 수다', () => {
    // 왜: 단추 숫자는 "남은 일"이어야 한다(N 보드 "10 available" 지적, 결정 페이지 추천).
    expect(imageWorkShotIds(states, null)).toEqual(['a', 'b'])
  })

  it('[영상 만들기 · N]의 N 은 이미지가 있고 완성 영상이 없는 샷(이미지 완료 · 영상 실패) 수다', () => {
    // 왜: 이미지가 없는 샷을 영상 숫자에 넣으면 서버가 말없이 빼던 고장이 생긴다.
    expect(videoWorkShotIds(states, null)).toEqual(['d', 'e'])
  })

  it('고른 샷이 있으면 두 단추 숫자는 고른 샷 안에서만 센다', () => {
    // 왜: 시안 D2 "위 버튼이 고른 샷에만".
    const picked = new Set(['a', 'd', 'f'])
    expect(imageWorkShotIds(states, picked)).toEqual(['a'])
    expect(videoWorkShotIds(states, picked)).toEqual(['d'])
  })
})

describe('가장 밝은 단추', () => {
  it('이미지가 필요한 샷이 있으면 가장 밝은 단추는 [이미지 만들기]다', () => {
    // 왜: 시안 R "가장 밝은 버튼 = 지금 할 일 하나" — 이미지가 먼저다.
    expect(primaryWorkAction({ imageCount: 2, videoCount: 3, canHandOff: true })).toBe('image')
  })

  it('이미지가 다 있고 영상이 필요한 샷이 있으면 가장 밝은 단추는 [영상 만들기]다', () => {
    // 왜: 다음 할 일이 영상이다(시안 D7 "영상 만들기 · 1" 크림).
    expect(primaryWorkAction({ imageCount: 0, videoCount: 1, canHandOff: true })).toBe('video')
  })

  it('만들 것이 없고 넘길 수 있으면 가장 밝은 단추는 [다음: Editor로]다', () => {
    // 왜: 다 만든 뒤의 할 일은 넘기기.
    expect(primaryWorkAction({ imageCount: 0, videoCount: 0, canHandOff: true })).toBe('editor')
    expect(primaryWorkAction({ imageCount: 0, videoCount: 0, canHandOff: false })).toBeNull()
  })
})

describe('예상 칸', () => {
  it('예상 칸은 이미지 N장이면 "이미지 N장 · 약 M분 · Takes 안 써요"라고 쓴다', () => {
    // 왜: 시안 D1 — 시작 전 예상만(오너 8/26 · 결정 페이지 추천).
    expect(workEstimateText({ images: 4, videoModels: [], videoTakes: 0, takesShown: true, making: false }, ko))
      .toBe('이미지 4장 · 약 2분 · Takes 안 써요')
    expect(workEstimateText({ images: 4, videoModels: [], videoTakes: 0, takesShown: true, making: false }, en))
      .toBe('4 images · about 2 min · No Takes used')
  })

  it('예상 칸은 영상 N개면 "영상 N개 · 약 M분 · Takes T"라고 쓰고 T 는 고른 모델 · 해상도의 Take 합이다', () => {
    // 왜: 오너 답 11 — 지금 계산 그대로(1080p 두 배)를 단추 · 예상 칸에.
    expect(workEstimateText({ images: 0, videoModels: ['seedance'], videoTakes: 5, takesShown: true, making: false }, ko))
      .toBe('영상 1개 · 약 3분 · Takes 5')
  })

  it('영상까지 이어서로 만들면 예상 칸은 이미지와 영상을 함께 센다', () => {
    // 왜: 시안 D4 — 이미지가 끝나면 영상이 이어서 시작된다.
    expect(workEstimateText({ images: 2, videoModels: ['seedance', 'seedance'], videoTakes: 10, takesShown: true, making: false, chain: true }, ko))
      .toBe('이미지 2장 · 영상 2개 · 약 5분 · Takes 10')
  })

  it('Take 를 세지 않는 설정이면 예상 칸에 Take 를 쓰지 않는다', () => {
    // 왜: 영상 노드의 Take 배지와 같은 규칙(돈을 받지 않는 설정에서는 숨김).
    expect(workEstimateText({ images: 0, videoModels: ['seedance'], videoTakes: 5, takesShown: false, making: false }, ko))
      .toBe('영상 1개 · 약 3분')
  })

  it('남은 일이 없고 만드는 중이면 예상 칸은 "만드는 중이에요"라고만 쓰고, 둘 다 없으면 쓰지 않는다', () => {
    // 왜: 시안 D4 "만드는 중이에요" — 만드는 중에는 남은 시간을 쓰지 않는다(8/26).
    expect(workEstimateText({ images: 0, videoModels: [], videoTakes: 0, takesShown: true, making: true }, ko)).toBe('만드는 중이에요')
    expect(workEstimateText({ images: 0, videoModels: [], videoTakes: 0, takesShown: true, making: false }, ko)).toBeNull()
  })

  it('예상 시간은 이미지 4샷 한 장 · 영상은 동시에 3편씩으로 나눠 센다', () => {
    // 왜: 지금 일괄(4샷 한 장 · 한 번에 두 장)과 동시 생성 한도(영상 3)와 같게 센다.
    expect(estimateWorkSeconds({ images: 4, videoModels: [] })).toBe(100)
    expect(estimateWorkSeconds({ images: 9, videoModels: [] })).toBe(200)
    expect(estimateWorkSeconds({ images: 0, videoModels: ['seedance', 'seedance', 'seedance', 'seedance'] })).toBe(370)
  })
})
