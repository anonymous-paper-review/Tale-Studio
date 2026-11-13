// Director 위쪽 단추 셋이 세는 일 · 가장 밝은 단추 · 예상 칸 글 (시안 D1 406:3717 · D2 406:4588 · R 416:4941, 오너 2026-11-14 · 답 11)
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import { realImageBatchMinutes } from '@/lib/director/generation-estimate'
import { readFileSync } from 'node:fs'
import {
  estimateVideoSeconds,
  imageWorkBlock,
  imageWorkShotIds,
  primaryWorkAction,
  videoWorkBlock,
  videoWorkShotIds,
  workBlockLine,
  workEstimateText,
  workScopeStates,
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

  it('상태를 골랐으면 아무것도 고르지 않아도 두 단추 숫자 · 예상은 보이는 샷만 센다', () => {
    // 왜: "전체 0개" 옆에 [이미지 만들기 · 4]가 보이면 보이지 않는 샷을 만든다(리드 11/14 답 1 "보이는 샷만").
    const visible = workScopeStates(states, 'image_done')
    expect([...visible.keys()]).toEqual(['d'])
    expect(imageWorkShotIds(visible, null)).toEqual([])
    expect(videoWorkShotIds(visible, null)).toEqual(['d'])
    expect(workScopeStates(states, 'all')).toBe(states)
    // 고른 상태 샷이 하나도 없으면 꺼진 까닭은 "이 상태의 샷이 없어요".
    expect(imageWorkBlock(new Map(), new Set(), false, true)).toBe('none_in_status')
    expect(videoWorkBlock(new Map(), new Set(), false, true)).toBe('none_in_status')
    expect(workBlockLine('none_in_status', 'none_in_status', ko)).toBe('이 상태의 샷이 없어요')
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    expect(page).toContain('const workStates = workScopeStates(shotStates, statusFilter)')
    expect(page).toContain('imageButtonMode(workStates, picked)')
    expect(page).toContain('videoWorkShotIds(workStates, picked)')
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

  it('Take 를 세지 않는 설정이면 이미지 일에도 "Takes 안 써요"를 쓰지 않는다', () => {
    // 왜: 과금이 꺼진 계정에 Take 를 말하지 않는다 — Storyboard → Director 넘기기 창(D0)은 이미 뺐다. 툴바 · Lumi "지금 할 일" · D0 세 곳이 같게(리드 11/14).
    expect(workEstimateText({ images: 4, videoModels: [], videoTakes: 0, takesShown: false, making: false }, ko)).toBe('이미지 4장 · 약 2분')
    expect(workEstimateText({ images: 1, videoModels: [], videoTakes: 0, takesShown: false, making: false }, en)).toBe('1 image · about 2 min')
  })

  it('Take 를 세지 않는 설정이면 예상 칸에 Take 를 쓰지 않는다', () => {
    // 왜: 영상 노드의 Take 배지와 같은 규칙(돈을 받지 않는 설정에서는 숨김).
    expect(workEstimateText({ images: 0, videoModels: ['seedance'], videoTakes: 5, takesShown: false, making: false }, ko))
      .toBe('영상 1개 · 약 3분')
  })

  it('만드는 중이면 남은 일이 있어도 예상 칸은 "만드는 중이에요"만 쓰고, 둘 다 없으면 쓰지 않는다', () => {
    // 왜: 시안 D4 "만드는 중이에요" — 만드는 중에는 남은 시간을 쓰지 않는다(8/26). 남은 샷이 있다고 "약 2분"을 쓰면 어긋났다(리드 검토 a 보통 1).
    expect(workEstimateText({ images: 0, videoModels: [], videoTakes: 0, takesShown: true, making: true }, ko)).toBe('만드는 중이에요')
    expect(workEstimateText({ images: 2, videoModels: ['seedance'], videoTakes: 5, takesShown: true, making: true }, ko)).toBe('만드는 중이에요')
    expect(workEstimateText({ images: 0, videoModels: [], videoTakes: 0, takesShown: true, making: false }, ko)).toBeNull()
  })

  it('영상 예상 시간은 동시에 3편씩으로 나눠 센다', () => {
    // 왜: 동시 생성 한도(영상 3)와 같게 센다. 이미지 쪽 셈은 넘기기 창과 같은 함수로 옮겼다(아래).
    expect(estimateVideoSeconds(['seedance', 'seedance', 'seedance', 'seedance'])).toBe(370)
    expect(estimateVideoSeconds(['happy-horse'])).toBe(105)
    expect(estimateVideoSeconds([])).toBe(0)
  })

  it('이미지 예상 분은 Storyboard → Director 넘기기 창과 같은 셈을 쓴다', () => {
    // 왜: 넘기기 창에서 "약 M분"을 보고 넘어왔는데 Director 툴바가 다른 분을 쓰면 어느 쪽을 믿을지 모른다(리드 11/14).
    for (const n of [1, 4, 8, 9, 16, 17, 40]) {
      expect(workEstimateText({ images: n, videoModels: [], videoTakes: 0, takesShown: true, making: false }, ko))
        .toBe(`이미지 ${n}장 · 약 ${realImageBatchMinutes(n)}분 · Takes 안 써요`)
    }
  })
})

describe('꺼진 단추와 그 까닭', () => {
  const none = new Set<string>()

  it('이미지 일괄이 도는 동안 [이미지 만들기]는 꺼지고, 그 까닭은 "이미지를 만드는 중이에요"다', () => {
    // 왜: 일괄이 도는 동안 눌러도 아무 일이 없었다 — 켜진 크림 단추가 말없이 무시됐다(리드 검토 a 보통 1).
    expect(imageWorkBlock(states, none, true)).toBe('busy')
    expect(workBlockLine('busy', null, ko)).toBe('이미지를 만드는 중이에요. 끝나면 다시 누를 수 있어요.')
  })

  it('영상 묶음이 도는 동안 [영상 만들기]는 꺼지고, 그 까닭은 "영상을 만드는 중이에요"다', () => {
    // 왜: 묶음이 도는 동안 확인 창이 확인 · 취소 둘 다 꺼진 채 떴다(리드 검토 a 보통 1).
    expect(videoWorkBlock(states, none, true)).toBe('busy')
    expect(workBlockLine(null, 'busy', ko)).toBe('영상을 만드는 중이에요. 끝나면 다시 누를 수 있어요.')
    expect(workBlockLine('busy', 'busy', ko)).toBe('이미지와 영상을 만드는 중이에요. 끝나면 다시 누를 수 있어요.')
  })

  it('꺼진 만들기 단추의 까닭은 상황마다 다르다 — 샷 없음 · 남은 샷 만드는 중 · 모두 이미지 있음 · 이미지 먼저 · 모두 영상 있음', () => {
    // 왜: 모두 영상이 있어도 "이미지가 먼저 있어야 해요", 샷이 없어도 "모두 이미지가 있어요"라고 했다(리드 검토 a 낮음 4).
    const of = (...list: DirectorShotState[]) => new Map(list.map((state, i) => [`s${i}`, state] as const))
    expect(imageWorkBlock(new Map(), none, false)).toBe('no_shots')
    expect(videoWorkBlock(new Map(), none, false)).toBe('no_shots')
    expect(imageWorkBlock(of('image_generating', 'image_done'), none, false)).toBe('all_making')
    expect(imageWorkBlock(of('image_done', 'video_done'), none, false)).toBe('all_have_images')
    expect(videoWorkBlock(of('image_needed', 'video_done'), none, false)).toBe('need_images')
    expect(videoWorkBlock(of('video_generating', 'video_done'), none, false)).toBe('all_making')
    expect(videoWorkBlock(of('video_done', 'video_done'), none, false)).toBe('all_have_videos')
    expect(imageWorkBlock(of('image_needed'), none, false)).toBeNull()
    expect(videoWorkBlock(of('image_done'), none, false)).toBeNull()
    expect(workBlockLine('all_have_images', 'all_have_videos', ko)).toBe('여기 있는 샷은 모두 이미지가 있어요. · 여기 있는 샷은 모두 영상이 있어요.')
    expect(workBlockLine('no_shots', 'no_shots', ko)).toBe('아직 샷이 없어요.')
    expect(workBlockLine(null, null, ko)).toBeNull()
  })

  it('꺼진 단추의 까닭은 마우스를 올리지 않아도 단추 아래 한 줄로 보이고, 단추가 꺼지면 크림은 다음 할 일로 간다', () => {
    // 왜: 결정 페이지 추천 "꺼진 단추 아래 이유 한 줄"(오너 "나머지는 추천대로") — 마우스 글(title)은 키보드 · 터치로 안 보였다(리드 검토 a 낮음 4).
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    expect(page).toContain('const blockLine = workBlockLine(imageBlock, videoBlock, t)')
    expect(page).toMatch(/<p id="director-work-block"[^>]*>\s*\{blockLine\}/)
    expect(page).toContain('disabled={imageBlock !== null}')
    expect(page).toContain('disabled={videoBlock !== null}')
    expect(page).not.toContain("title={imageMode.shotIds.length === 0 ? t('Every shot here already has an image.')")
    expect(page).toContain('imageCount: imageBlock === null ? imageWork.length : 0')
    expect(page).toContain('videoCount: videoBlock === null ? videoWork.length : 0')
  })
})
