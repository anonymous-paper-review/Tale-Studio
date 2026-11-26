// 레일 Artist 칸이 그림 실패 · 오래 걸림을 칸 색과 따로 아이콘 모서리 점으로 알리고, 눌러도 다시 그리기 대신 Artist 화면으로 가는지 검사한다 (오너 2026-11-27 N7)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { railArtistAttention } from '@/lib/stage-rail'

const sidebar = readFileSync('src/components/layout/sidebar.tsx', 'utf8')
// 단계 칸 묶음(아래 [메뉴] · Take 잔액 앞까지) — Take 잔액의 빨강은 이 시험의 관심이 아니다.
const stageCells = sidebar.slice(sidebar.indexOf('sidebar-stage-nav'), sidebar.indexOf('sidebar-footer-wrap'))
const base = { stage: 'artist' as const, reached: 'writer' as const, imagesReady: false, failed: false, stalled: false }

describe('레일 Artist 칸 표시', () => {
  // 왜(오너 N7): 그림이 실패했으면 Artist 화면에서 다시 그려야 한다 — 레일에서 그 까닭이 보여야 Artist 로 간다.
  it('Artist 그림이 실패했으면 Artist 칸 표시는 실패다', () => {
    expect(railArtistAttention({ ...base, failed: true })).toBe('failed')
    expect(railArtistAttention({ ...base, failed: true, stalled: true })).toBe('failed')
  })

  // 왜(#stale-gate — 오래 걸림은 실패가 아니다): 실패 0건인데 실패로 보이면 사고로 읽힌다 — 오래 걸림은 따로 표시한다.
  it('Artist 그림이 오래 걸리면 Artist 칸 표시는 실패와 다른 오래 걸림이다', () => {
    expect(railArtistAttention({ ...base, stalled: true })).toBe('stalled')
  })

  // 왜(정상 경로 고정): 다 그렸거나 아직 Artist 를 열지 않았거나 Artist 칸이 아니면 알릴 것이 없다.
  it('그림이 다 있거나 아직 Artist 를 열지 않았거나 Artist 칸이 아니면 표시가 없다', () => {
    expect(railArtistAttention({ ...base, failed: true, imagesReady: true })).toBeNull()
    expect(railArtistAttention({ ...base, failed: true, reached: 'conti' })).toBeNull()
    expect(railArtistAttention({ ...base, failed: true, stage: 'writer' })).toBeNull()
    expect(railArtistAttention(base)).toBeNull()
  })

  // 왜(오너 N7 "빨간 표시가 칸 색에 덮여 안 보여서 왜 안 열리는지 알 수 없어요"): 칸 글자 색으로 칠하면 칸 모습 색이 이긴다 —
  //   아이콘 모서리에 따로 그린 점(실패 = destructive · 오래 걸림 = warning, 디자인 토큰만)과 툴팁 · 읽기 글로 알린다(design §2.5 색 + 아이콘 + 글).
  it('실패 · 오래 걸림 표시는 칸 글자 색이 아니라 아이콘 모서리에 따로 그린 점과 툴팁 글이다', () => {
    expect(stageCells.length).toBeGreaterThan(0)
    expect(stageCells).toMatch(/railArtistAttention\(\{/)
    expect(stageCells).toMatch(/data-testid="rail-artist-attention"/)
    expect(stageCells).toMatch(/bg-destructive/)
    expect(stageCells).toMatch(/bg-warning/)
    expect(stageCells).not.toMatch(/text-destructive/)
    expect(stageCells).toMatch(/artistAttention\s*\?\s*artistImageLockCopy/)
  })
})
