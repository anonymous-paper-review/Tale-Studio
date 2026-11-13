// Director 위쪽 영상 단추는 늘 "영상 만들기 · N"이고, 진행 · 멈추기는 2줄 왼쪽에 있다 (1110 확정 시안 D1 · D3 · D4 · R, 오너 2026-11-14)
//   11/9 시안 DG 의 "영상 만드는 중 · 2/8" 단추 · 단계 그라데이션 칠(11/9 결정 10)은 1110 확정안에서 사라졌다(결정 페이지 추천).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'

const t = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const page = () => readFileSync('src/app/studio/director/page.tsx', 'utf8')

describe('혼자 정한 것', () => {
  // 왜: 시안 D3 · D4 — 만드는 중이면 2줄 왼쪽(체크 옆)에 "영상 N개 만드는 중"과 끝난 수/전체가 보인다. 숫자는 핀과 같은 서버 배치(약속 D7).
  it("영상 묶음이 도는 동안 진행은 2줄 왼쪽에 '영상 N개 만드는 중'과 끝난 수/전체로 보인다", () => {
    expect(t('Making {count} videos', { count: 2 })).toBe('영상 2개 만드는 중')
    expect(page()).toContain("t('Making {count} videos'")
    expect(page()).toMatch(/\{videoBatch\.done\}\/\{videoBatch\.total\}/)
  })

  // 왜: 오너 답 7 · 시안 D3 — 멈추는 단추는 2줄의 [모두 멈추기]. 영상 묶음은 지금 만드는 영상까지만 마치고 멈춘다(#batch-resume ①).
  it('영상 묶음을 멈추는 단추는 2줄의 [모두 멈추기]이고, 누르면 지금 만드는 영상까지만 마치고 멈춘다', () => {
    expect(t('Stop all')).toBe('모두 멈추기')
    expect(page()).toMatch(/await run\.cancelVideoBatch\(\)/)
    expect(page()).toContain("toast.info(t('Stop after current videos finish.'))")
  })

  // 왜: 시안 D1 · R "영상 만들기 · N" — 이미지가 있고 영상이 없는 샷 수. 이름이 상태에 따라 바뀌지 않는다(늘 같은 자리).
  it("툴바 영상 단추는 늘 '영상 만들기 · N'을 쓴다", () => {
    expect(t('Make videos')).toBe('영상 만들기')
    expect(page()).toContain("{t('Make videos')}")
    expect(page()).toContain('{videoWork.length}')
  })

  // 왜: 정상 경로 고정. 멈추기를 누른 뒤 이미 접수된 영상이 끝나기를 기다리는 동안은 "중단하는 중"이다.
  it("멈추는 중이면 [모두 멈추기] 자리에 '중단하는 중'을 쓴다", () => {
    expect(t('Stopping')).toBe('중단하는 중')
    expect(page()).toContain("videoBatchCancelled ? t('Stopping') : t('Stop all')")
  })
})

describe('같이 정한 것', () => {
  // 왜: 시안 R — 영상 만드는 중의 색은 보라(Director 생성 상태, design.md §2.5). 단추는 상태 색으로 칠하지 않는다(§1 규칙 2 · §2.5).
  it('영상을 만드는 동안 진행 막대는 영상 보라이고 만들기 단추는 상태 색으로 칠하지 않는다', () => {
    expect(page()).toContain("makingVideos > 0 || videoBatchBusy ? 'bg-state-video' : 'bg-stage-director'")
    expect(page()).not.toContain('RUNNING_VIDEO_PILL')
    const workButton = page().match(/function workButtonClass[\s\S]*?\n\}/)?.[0] ?? ''
    expect(workButton).toContain('bg-primary')
    expect(workButton).not.toMatch(/state-video|stage-badge|bg-stage/)
  })

  // 왜: 시안 R "가장 밝은 버튼 = 지금 할 일 하나" — 영상이 지금 할 일일 때만 크림, 아니면 보조 단추.
  it('영상 단추는 지금 할 일일 때만 크림이고 아니면 보조 단추다', () => {
    expect(page()).toContain("className={workButtonClass(primary === 'video')}")
  })
})
