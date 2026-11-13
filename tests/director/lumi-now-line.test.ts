// Director 채팅 맨 위 "지금 할 일" 줄이 보드 상태에 따라 이미지 → 영상 → 다음: Editor로를 위쪽 툴바 예상 칸과 같은 셈으로 보이고, 만드는 중이면 끝난 수를 보이는지 검사한다 (11/13 시안 D5, 오너 2026-11-14 "추천대로")
import { describe, expect, it } from 'vitest'
import { lumiNowLine, type LumiNowInput } from '@/lib/director/lumi-now-line'
import { translate } from '@/lib/i18n/translate'
import type { DirectorShotState } from '@/lib/director/shot-state'

const ko = (key: string, vars?: Record<string, string | number>) => translate('ko', key, vars)
const en = (key: string, vars?: Record<string, string | number>) => translate('en', key, vars)
/** 샷 노드 id n1 · n2 … 에 상태를 차례로. */
const board = (...states: DirectorShotState[]) => new Map(states.map((state, i) => [`n${i + 1}`, state] as const))
const input = (states: ReadonlyMap<string, DirectorShotState>, over: Partial<LumiNowInput> = {}): LumiNowInput => ({
  states,
  imageBusy: false,
  videoBusy: false,
  progress: null,
  canHandOff: false,
  chain: false,
  modelOf: () => 'seedance',
  takesFor: (ids) => ids.length * 5,
  takesShown: true,
  ...over,
})

describe('지금 할 일 줄(시안 D5)', () => {
  // 왜: 정상 경로 고정 — 채팅을 열면 다음에 할 일과 걸리는 시간 · Take 를 먼저 본다(시안 D5 문장 그대로). 이미지 실패 샷도 이미지 할 일이다(위쪽 [이미지 만들기]와 같다).
  it('이미지가 필요한 샷이 있으면 "지금 할 일 · 이미지 4장 · 약 2분 · Takes 안 써요"처럼 이미지 장 수와 예상 시간을 보인다', () => {
    expect(lumiNowLine(input(board('image_needed', 'image_needed', 'image_failed', 'image_needed', 'image_done')), ko)).toBe('지금 할 일 · 이미지 4장 · 약 2분 · Takes 안 써요')
    expect(lumiNowLine(input(board('image_needed')), en)).toBe('Up next · 1 image · about 2 min · No Takes used')
  })

  // 왜: 정상 경로 고정 — 이미지가 다 있으면 다음 일은 영상이고, 영상은 Take 를 쓰니 몇 Take 인지 같이 본다.
  it('이미지가 필요한 샷이 없고 영상이 없는 샷이 있으면 "지금 할 일 · 영상 2개 · 약 3분 · Takes 10"처럼 영상 수 · 예상 시간 · 쓰는 Take 를 보인다', () => {
    expect(lumiNowLine(input(board('image_done', 'video_failed', 'video_done')), ko)).toBe('지금 할 일 · 영상 2개 · 약 3분 · Takes 10')
  })

  // 왜: Take 를 쓰지 않는 계정(과금 꺼짐 · 잔액을 못 읽음)에 Take 수를 보이면 쓰는 것으로 읽는다 — 툴바 예상 칸과 같다.
  it('Take 를 쓰지 않는 계정이면 영상 예상에 Take 수를 쓰지 않는다', () => {
    expect(lumiNowLine(input(board('image_done', 'image_done'), { takesShown: false }), ko)).toBe('지금 할 일 · 영상 2개 · 약 3분')
  })

  // 왜: set 528a9497(리드 11/14) — Take 를 세지 않는 계정에 "Takes 안 써요"를 붙이면 Take 이야기를 하는 셈이다. 툴바 예상 칸 · D0 와 같은 함수라 같게 따른다.
  it('Take 를 쓰지 않는 계정이면 이미지 예상에도 "Takes 안 써요"를 쓰지 않는다', () => {
    expect(lumiNowLine(input(board('image_needed', 'image_needed'), { takesShown: false }), ko)).toBe('지금 할 일 · 이미지 2장 · 약 2분')
  })

  // 왜: "영상까지 이어서"를 켜면 이미지 단추가 영상까지 만든다 — 줄도 이어서 만들 영상과 Take 를 같이 센다(툴바 예상 칸과 같은 셈).
  it('"영상까지 이어서"를 켰으면 이미지와 이어서 만들 영상 · 쓰는 Take 를 함께 보인다', () => {
    expect(lumiNowLine(input(board('image_needed', 'image_needed', 'video_done'), { chain: true }), ko)).toBe('지금 할 일 · 이미지 2장 · 영상 2개 · 약 5분 · Takes 10')
  })

  // 왜: 정상 경로 고정 — 만들 것이 다 됐으면 다음 일은 Editor 로 넘기기다(위쪽 [다음: Editor로]와 같은 조건 — 완성 영상이 하나라도 있으면).
  it('만들 것이 없고 완성 영상이 있으면 "지금 할 일 · 다음: Editor로"를 보인다', () => {
    expect(lumiNowLine(input(board('video_done', 'video_done'), { canHandOff: true }), ko)).toBe('지금 할 일 · 다음: Editor로')
  })

  // 왜: 만드는 동안은 남은 시간을 쓰지 않는다(오너 8/26) — 무엇을 몇 개 만드는지와 끝난 수만. 끝난 수는 위쪽 진행과 같은 서버 배치에서 온다.
  it('만드는 중이면 시간을 쓰지 않고 "지금 할 일 · 이미지 2장 만드는 중 · 4개 중 1개 끝남"처럼 끝난 수와 전체를 보인다', () => {
    expect(lumiNowLine(input(board('image_generating', 'image_generating', 'image_needed', 'video_done'), { imageBusy: true, progress: { done: 1, total: 4 } }), ko)).toBe('지금 할 일 · 이미지 2장 만드는 중 · 4개 중 1개 끝남')
    // 끝난 수를 아직 모르면(서버 배치가 아직 안 잡힘) 만드는 것만.
    expect(lumiNowLine(input(board('video_generating', 'image_done'), { videoBusy: true }), ko)).toBe('지금 할 일 · 영상 1개 만드는 중')
  })

  // 왜: 샷이 없는 보드(아직 Storyboard 에서 넘어오지 않음)에는 가리킬 일이 없다.
  it('샷이 없으면 지금 할 일 줄을 보이지 않는다', () => {
    expect(lumiNowLine(input(board()), ko)).toBeNull()
  })
})
