// 리뉴얼 1차: Writer 산문 위 "지금 산문" 줄과 [AI 다시 쓰기 ▾] 옵션이 지금 산문의 조건을 읽고, 고른 조건을 다시 쓰기 요청으로 만든다 (2026-10-19)
import { describe, expect, it } from 'vitest'
import { conditionsFromPicks, moodIndexOf, proseConditionLine, proseTools, runtimeIndexOf } from '@/lib/prose/conditions'

describe('지금 산문 줄', () => {
  // 왜: 프로토타입 W1 "지금 산문 · 1~5분 · 코미디 · 소재 그대로" — 설정 칩 대신 한 줄 글로만 보여 준다.
  it('지금 산문의 러닝타임 · 장르·분위기 · 소재를 한 줄로 보여 준다', () => {
    expect(proseConditionLine({ runtimeSeconds: 300, genre: '코미디', seed: 'keep' }, 'ko')).toBe('1~5분 · 코미디 · 소재 그대로')
    expect(proseConditionLine({ runtimeSeconds: 15, genre: '호러', seed: 'new' }, 'ko')).toBe('15초 이하 · 호러 · 소재 새롭게')
  })

  // 왜: 예전 프로젝트는 길이가 네 구간 밖(예: 90초)일 수 있다 — 숫자 그대로 보여 준다.
  it('정한 길이 구간이 아닌 산문은 길이를 초로 보여 준다', () => {
    expect(proseConditionLine({ runtimeSeconds: 90, genre: '드라마', seed: 'keep' }, 'ko')).toBe('90초 · 드라마 · 소재 그대로')
  })

  // 왜: 대본을 그대로 쓰는 산문은 길이가 대본을 따른다(정한 길이 없음) — 없는 값은 빼고 보여 준다.
  it('길이나 장르가 없으면 그 칸을 빼고 보여 준다', () => {
    expect(proseConditionLine({ runtimeSeconds: null, genre: null, seed: 'keep' }, 'ko')).toBe('소재 그대로')
  })
})

describe('다시 쓰기 옵션', () => {
  // 왜: 옵션을 열면 지금 산문의 값이 골라져 있어야 [이 조건으로 다시 쓰기]가 바꾼 것만 바꾼다.
  it('옵션을 열면 지금 산문의 길이 · 장르가 골라져 있다', () => {
    expect(runtimeIndexOf(300)).toBe(2)
    expect(runtimeIndexOf(90)).toBe(2)
    expect(runtimeIndexOf(null)).toBe(1)
    expect(moodIndexOf('코미디', 'ko')).toBe(0)
    expect(moodIndexOf('Thriller', 'en')).toBe(3)
    expect(moodIndexOf('없는 장르', 'ko')).toBe(-1)
  })

  // 왜: 장르·분위기는 Producer 시작 화면처럼 프로젝트 언어 이름으로 저장한다.
  it('고른 조건을 다시 쓰기 요청으로 만들면 장르를 프로젝트 언어 이름으로 보낸다', () => {
    expect(conditionsFromPicks({ runtime: 3, mood: 9, seed: 'new' }, 'ko')).toEqual({ runtimeSeconds: 1200, genre: '일상·잔잔', seed: 'new' })
    expect(conditionsFromPicks({ runtime: 0, mood: 1, seed: 'keep' }, 'en')).toEqual({ runtimeSeconds: 15, genre: 'Drama', seed: 'keep' })
  })
})

describe('산문 도구', () => {
  // 왜: 프로토타입 W1r "대본을 그대로 쓰는 프로젝트예요. 산문을 고칠 수 없고, 확인한 뒤 브레이크다운만 할 수 있어요."
  it('대본을 그대로 쓰는 산문은 다시 쓰기와 직접 작성을 끄고 브레이크다운만 둔다', () => {
    expect(proseTools({ preserved: true, locked: false, hasProse: true, busy: false })).toEqual({ rewrite: false, manual: false, breakdown: true })
  })

  // 왜: 확정한 산문은 잠긴다 — 고칠 수 없고, 다음 단계(Artist)로 가기만 한다.
  it('확정한 산문은 다시 쓰기와 직접 작성을 끈다', () => {
    expect(proseTools({ preserved: false, locked: true, hasProse: true, busy: false })).toEqual({ rewrite: false, manual: false, breakdown: true })
  })

  // 왜: AI 가 일하는 동안이나 산문이 아직 없을 때는 아무것도 누를 수 없다.
  it('산문이 없거나 AI 가 일하는 동안은 산문 도구를 모두 끈다', () => {
    expect(proseTools({ preserved: false, locked: false, hasProse: false, busy: false })).toEqual({ rewrite: false, manual: false, breakdown: false })
    expect(proseTools({ preserved: false, locked: false, hasProse: true, busy: true })).toEqual({ rewrite: false, manual: false, breakdown: false })
  })

  // 왜: 정상 경로 고정 — 쓴 산문은 다시 쓰기 · 직접 작성 · 브레이크다운을 모두 할 수 있다.
  it('다 쓴 산문은 다시 쓰기 · 직접 작성 · 브레이크다운을 모두 할 수 있다', () => {
    expect(proseTools({ preserved: false, locked: false, hasProse: true, busy: false })).toEqual({ rewrite: true, manual: true, breakdown: true })
  })
})
