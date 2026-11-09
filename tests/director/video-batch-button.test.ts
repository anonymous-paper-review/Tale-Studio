// Director 툴바의 영상 단추가 시안 DG 의 글로 지금 상태를 말한다 (11/5 시안, 리드 2026-11-09)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import { RUNNING_VIDEO_PILL, videoBatchButtonText } from '@/features/director/video-batch-button'

const t = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)

describe('혼자 정한 것', () => {
  // 왜: 시안 DG "■ 영상 만드는 중 · 2/8"(리드 b6). 숫자 뜻은 예전처럼 끝난 수 / 전체다.
  it("영상 묶음이 도는 동안 툴바 영상 단추는 '영상 만드는 중 · 끝난 수/전체'를 쓴다", () => {
    const text = videoBatchButtonText({ busy: true, cancelled: false, done: 2, total: 8, available: 0 }, t)

    expect(`${text.label} · ${text.count}`).toBe('영상 만드는 중 · 2/8')
  })

  // 왜: 글이 할 일("만들기 중단")에서 상태("영상 만드는 중")로 바뀌어, 누르면 멈춘다는 것을 마우스를 올렸을 때 알린다(리드 b6).
  it("영상 묶음이 도는 동안 툴바 영상 단추에 마우스를 올리면 '누르면 멈춰요'가 뜬다", () => {
    expect(videoBatchButtonText({ busy: true, cancelled: false, done: 0, total: 8, available: 0 }, t).title).toBe('누르면 멈춰요')
  })

  // 왜: 시안 D1 · DG "▶ 영상 생성 · 8개 가능". 예전 "생성 가능 8개"와 뜻이 같아 시안 글로 맞춘다(리드 11/9).
  it("쉴 때 툴바 영상 단추는 '영상 생성 · N개 가능'을 쓴다", () => {
    const text = videoBatchButtonText({ busy: false, cancelled: false, done: null, total: null, available: 8 }, t)

    expect(`${text.label} · ${text.count}`).toBe('영상 생성 · 8개 가능')
  })

  // 왜: 정상 경로 고정. 멈추기를 누른 뒤 이미 접수된 영상이 끝나기를 기다리는 동안은 "중단하는 중"이다.
  it("멈추는 중이면 툴바 영상 단추는 '중단하는 중'을 쓴다", () => {
    expect(videoBatchButtonText({ busy: true, cancelled: true, done: 3, total: 8, available: 0 }, t).label).toBe('중단하는 중')
  })

  // 왜: 마우스 올림 글(title)은 키보드 · 터치로는 볼 수 없다. 화면 읽기 이름에 누르면 멈춘다는 말을 넣는다(검토 B 5a, 리드 2026-11-09).
  it("영상 묶음이 도는 동안 툴바 영상 단추의 화면 읽기 이름에 '누르면 멈춰요'가 들어간다", () => {
    expect(videoBatchButtonText({ busy: true, cancelled: false, done: 2, total: 8, available: 0 }, t).ariaLabel)
      .toBe('영상 만드는 중 2/8, 누르면 멈춰요')
    expect(videoBatchButtonText({ busy: true, cancelled: false, done: 2, total: 8, failed: 1, available: 0 }, t).ariaLabel)
      .toBe('영상 만드는 중 2/8 1개 실패, 누르면 멈춰요')
    expect(readFileSync('src/app/studio/director/page.tsx', 'utf8')).toContain('aria-label={videoButton.ariaLabel}')
  })
})

describe('같이 정한 것', () => {
  // 왜: 오너 2026-11-09 결정 10(추천대로): 시안 DG 처럼 도는 동안의 영상 단추를 단계 그라데이션으로 칠한다. 시안의 파란 빛은 넣지 않는다(design.md §9).
  it('영상 묶음이 도는 동안 툴바 영상 단추는 단계 그라데이션으로 칠하고 빛은 넣지 않는다', () => {
    expect(videoBatchButtonText({ busy: true, cancelled: false, done: 2, total: 8, available: 0 }, t).tone).toBe('stage')
    expect(RUNNING_VIDEO_PILL).toContain('bg-stage-badge')
    expect(RUNNING_VIDEO_PILL).not.toMatch(/shadow|glow|drop-shadow|ring/)
    expect(readFileSync('src/app/studio/director/page.tsx', 'utf8')).toContain("videoButton.tone === 'stage' && RUNNING_VIDEO_PILL")
  })

  // 왜: 정상 경로 고정. 쉴 때와 멈추는 중(이미 낸 영상만 마저 받는 중)의 단추는 지금처럼 보통 알약이다.
  it('쉴 때와 멈추는 중의 툴바 영상 단추는 지금처럼 보통 알약이다', () => {
    expect(videoBatchButtonText({ busy: false, cancelled: false, done: null, total: null, available: 8 }, t).tone).toBe('plain')
    expect(videoBatchButtonText({ busy: true, cancelled: true, done: 3, total: 8, available: 0 }, t).tone).toBe('plain')
  })
})
