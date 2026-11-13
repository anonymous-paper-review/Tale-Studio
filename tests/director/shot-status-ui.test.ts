// Director 카드 · 노드가 샷 상태를 꼬리 글 · 점 · 태그 · 상태 고르기로 보이는 모양 (시안 D1 406:3717 · R 416:4941, 오너 2026-11-14)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { readFileSync } from 'node:fs'
import {
  ImageFailedPanel,
  ImageNeededTag,
  ShotPipelineRow,
  ShotStateTail,
  ShotStatusFilterMenu,
  StateTailLine,
  StatusFilterRowMark,
  statusFilterRows,
} from '@/features/director/shot-status'
import { countStatusFilters, videoTakeTail } from '@/lib/director/shot-state'

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el)

describe('꼬리 글 · 점', () => {
  it('이미지 필요 샷의 꼬리는 "대기"이고 다른 상태 꼬리는 그 상태 이름이다', () => {
    // 왜: 시안 D1 의 "● 대기" · D3 의 "● 이미지 만드는 중" — 색만으로 상태를 말하지 않는다(design.md §12).
    expect(html(createElement(ShotStateTail, { state: 'image_needed' }))).toContain('대기')
    expect(html(createElement(ShotStateTail, { state: 'image_generating' }))).toContain('이미지 만드는 중')
    expect(html(createElement(ShotStateTail, { state: 'video_done' }))).toContain('영상 완성')
    expect(html(createElement(ShotStateTail, { state: 'video_failed' }))).toContain('영상 실패')
  })

  it('만드는 중인 꼬리 점은 테두리만 있는 고리이고 끝난 꼬리 점은 꽉 찬 점이다', () => {
    // 왜: 시안 R "테두리만 = 만드는 중, 꽉 찬 점 = 끝남".
    const making = html(createElement(ShotStateTail, { state: 'video_generating' }))
    expect(making).toContain('border-state-video')
    expect(making).not.toContain('bg-state-video')
    const done = html(createElement(ShotStateTail, { state: 'video_done' }))
    expect(done).toContain('bg-success')
  })

  it('카드 아래 줄은 "이미지 → 영상"이고 두 점이 각 단계 색이다', () => {
    // 왜: 시안 D1 · D3 — 어느 단계까지 왔는지 한눈에.
    const row = html(createElement(ShotPipelineRow, { state: 'video_generating' }))
    expect(row).toContain('이미지')
    expect(row).toContain('영상')
    expect(row).toContain('bg-stage-director')
    expect(row).toContain('border-state-video')
  })

  it('이미지 필요 태그는 주황 글자로 "이미지 필요"라고 쓴다', () => {
    // 왜: 시안 R "주황 태그 '이미지 필요'".
    const tag = html(createElement(ImageNeededTag))
    expect(tag).toContain('이미지 필요')
    expect(tag).toContain('text-stage-producer')
  })

  it('노드형 꼬리는 그림 위 알약이 아니라 노드 아래 줄이고, 흐린 덧말을 붙인다', () => {
    // 왜: 시안 D1 노드형(406:4051) "● 이미지 필요 러프만 있음" — 노드도 색만으로 말하지 않는다(리드 검토 c ②).
    const line = html(createElement(ShotStateTail, { state: 'image_needed', place: 'node', note: '러프만 있음' }))
    expect(line).toContain('이미지 필요')
    expect(line).toContain('러프만 있음')
    expect(line).not.toContain('bg-black/55')
  })

  it('다시 만들기가 실패한 꼬리는 빨강 점과 "다시 만들기 실패"를 쓴다', () => {
    // 왜: 리드 검토 c ① — 옛 그림이 남은 실패는 꼬리로 알린다. [다시 만들기] 단추는 꼬리 옆에 붙는다(카드 · 노드).
    const tail = html(createElement(ShotStateTail, { state: 'image_done', remakeFailed: true }))
    expect(tail).toContain('다시 만들기 실패')
    expect(tail).toContain('bg-destructive')
  })

  it('일괄이 맡아 차례를 기다리는 카드 꼬리는 "대기 중"이다', () => {
    // 왜: 리드 검토 c ④d — 아직 큐에 앉지 않은 샷.
    expect(html(createElement(ShotStateTail, { state: 'image_generating', waiting: true }))).toContain('대기 중')
  })

  it('영상 노드 꼬리 줄은 점과 Take 상태 글을 함께 보인다', () => {
    // 왜: 시안 D1 노드형 "● 영상 없음"(리드 검토 c ②).
    const line = html(createElement(StateTailLine, videoTakeTail({ status: 'pending', lastAttemptStatus: null, videoUrl: null })))
    expect(line).toContain('영상 없음')
    const video = readFileSync('src/features/director/canvas-nodes/VideoNode.tsx', 'utf8')
    expect(video).toMatch(/<StateTailLine \{\.\.\.videoTakeTail\(data\)\}/)
  })

  it('이미지를 못 만든 카드는 "이미지를 못 만들었어요"와 [다시 만들기]를 보인다', () => {
    // 왜: 시안에 없는 이미지 실패 상태 — 결정 페이지 추천(빨강 테두리 + 다시 만들기).
    const panel = html(createElement(ImageFailedPanel, { onRetry: () => {}, detail: 'fal 500' }))
    expect(panel).toContain('이미지를 못 만들었어요')
    expect(panel).toContain('다시 만들기')
  })
})

describe('상태 고르기', () => {
  it('상태 고르기 단추는 지금 고른 상태 이름과 그 수를 보인다', () => {
    // 왜: 시안 D1 "전체 4 ▾".
    const counts = countStatusFilters(['image_needed', 'image_needed', 'image_done', 'video_done'])
    const button = html(createElement(ShotStatusFilterMenu, { counts, value: 'all', onChange: () => {} }))
    expect(button).toContain('전체')
    expect(button).toContain('>4<')
    const picked = html(createElement(ShotStatusFilterMenu, { counts, value: 'image_needed', onChange: () => {} }))
    expect(picked).toContain('이미지 필요')
    expect(picked).toContain('>2<')
  })

  it('상태 고르기를 펼치면 줄마다 점 · 이름 · 수가 있고 고른 줄에 체크가 있다', () => {
    // 왜: 드롭다운이 그대로 범례다(시안 R).
    const counts = countStatusFilters(['image_needed', 'video_generating'])
    const rows = statusFilterRows(counts, 'video_generating')
    expect(rows.map((r) => r.key)).toEqual([
      'all',
      'image_needed',
      'image_generating',
      'image_done',
      'video_generating',
      'video_done',
      'video_failed',
    ])
    expect(rows.find((r) => r.key === 'video_generating')).toMatchObject({ count: 1, checked: true, ring: true })
    expect(rows.find((r) => r.key === 'all')).toMatchObject({ count: 2, checked: false })
  })

  it('상태 고르기에서 고른 줄은 점 자리에 체크를 보이고(상태 줄은 그 상태 색), 고르지 않은 줄은 점이다', () => {
    // 왜: 리드 검토 c ④b — 전체가 아닌 줄을 골라도 어느 줄을 골랐는지 보여야 한다(시안 D1 은 고른 "전체"에 체크).
    const counts = countStatusFilters(['image_needed', 'video_generating'])
    const rows = statusFilterRows(counts, 'video_generating')
    const mark = (key: string) => html(createElement(StatusFilterRowMark, { row: rows.find((r) => r.key === key)! }))
    expect(mark('video_generating')).toContain('lucide-check')
    expect(mark('video_generating')).toContain('text-state-video')
    expect(mark('image_needed')).not.toContain('lucide-check')
    expect(mark('image_needed')).toContain('bg-stage-producer')
    expect(mark('all')).not.toContain('lucide-check')
    const allRows = statusFilterRows(counts, 'all')
    expect(html(createElement(StatusFilterRowMark, { row: allRows[0] }))).toContain('lucide-check')
  })
})
