// 캐릭터 양식 v4 — 색 팔레트 · 포즈 1 · 포즈 2 · 3/4 정면 칸을 빼고 남은 칸을 다시 배치한다 (2026-10-27 오너)
import { describe, expect, it } from 'vitest'
import { CHARACTER_SHEET_SPEC, TURNAROUND_VIEW_LABELS, turnaroundSlots, type SheetBox } from '@/lib/artist/sheet-template'
import { buildCharacterTurnaroundPrompt } from '@/lib/artist/turnaround'

const PERSON = {
  name: 'Mara',
  role: 'protagonist',
  appearance: 'A woman in her mid-thirties with sharp, observant eyes and wind-tangled brown hair.',
  costumes: ['practical dark coat'],
}

function allBoxes(): SheetBox[] {
  const spec = CHARACTER_SHEET_SPEC as unknown as Record<string, SheetBox | SheetBox[] | { width: number; height: number }>
  return Object.entries(spec)
    .filter(([key]) => key !== 'canvas')
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value as SheetBox]))
}

describe('캐릭터 양식 v4', () => {
  it('캐릭터 양식에는 색 팔레트 · 포즈 1 · 포즈 2 · 3/4 정면 칸이 없다', () => {
    // 왜: 2026-10-27 오너 — 시트 양식에서 네 칸을 지운다.
    const labels = [...allBoxes().map((b) => b.label), ...turnaroundSlots().map((s) => s.label)]
    for (const removed of ['PALETTE', 'POSE 1', 'POSE 2', '3/4 FRONT']) expect(labels, removed).not.toContain(removed)
    expect([...TURNAROUND_VIEW_LABELS]).toEqual(['FRONT', 'SIDE', 'BACK'])
  })

  it('남은 칸은 대표 얼굴 · 표정 넷 · 정면 · 옆 · 뒤 · 디테일 둘이다', () => {
    // 왜: 오너가 남기라고 한 칸이 빠지지 않게 고정한다.
    const labels = allBoxes().map((b) => b.label).sort()
    expect(labels).toEqual(['ANGER', 'DETAIL 1', 'DETAIL 2', 'JOY', 'PORTRAIT', 'SORROW', 'SURPRISE', 'TURNAROUND'].sort())
    expect(turnaroundSlots().map((s) => s.label)).toEqual(['FRONT', 'SIDE', 'BACK'])
  })

  it('남은 칸이 그림을 빈자리 없이 채운다', () => {
    // 왜: 칸을 빼고 자리를 그대로 두면 큰 빈자리가 생긴다 — 남은 칸이 그 자리를 나눠 가져야 자연스럽다(오너 "배치 및 크기도 그에 맞춰줘").
    const { width: W, height: H } = CHARACTER_SHEET_SPEC.canvas
    const boxes = allBoxes()
    const margin = Math.min(...boxes.map((b) => b.x))
    expect(Math.min(...boxes.map((b) => b.y))).toBe(margin)
    expect(Math.max(...boxes.map((b) => b.x + b.w))).toBe(W - margin)
    expect(Math.max(...boxes.map((b) => b.y + b.h))).toBe(H - margin)
    const inner = (W - 2 * margin) * (H - 2 * margin)
    const used = boxes.reduce((sum, b) => sum + b.w * b.h, 0)
    expect(used / inner).toBeGreaterThan(0.9)
  })

  it('대표 얼굴 칸은 예전 양식과 같은 자리에 있다', () => {
    // 왜: 대표 얼굴은 시트에서 좌표로 잘라 낸다 — 자리가 같으면 배포 순간 그리던 예전 양식 시트도 바르게 잘린다.
    expect(CHARACTER_SHEET_SPEC.portrait).toEqual({ x: 24, y: 24, w: 360, h: 360, label: 'PORTRAIT' })
  })

  it('턴어라운드 정면 · 옆 · 뒤 칸은 예전보다 세로로 두 배쯤 크다', () => {
    // 왜: 3/4 정면과 포즈 두 칸이 빠진 자리를 전신 세 칸이 나눠 가진다 — 전신이 커야 의상 · 비율이 잘 보인다.
    for (const slot of turnaroundSlots()) {
      expect(slot.h).toBeGreaterThanOrEqual(2 * 372 - 20)
      expect(slot.w).toBeGreaterThanOrEqual(240)
    }
  })

  it('인물 시트 지시문은 없앤 칸을 그리라고 하지 않고 정면 · 옆 · 뒤 세 방향을 그리라고 한다', () => {
    // 왜: 양식에 없는 칸을 지시문이 요구하면 모델이 빈자리에 팔레트 · 포즈를 지어 넣는다.
    const prompt = buildCharacterTurnaroundPrompt(PERSON)
    for (const removed of ['PALETTE', 'POSE tiles', '3/4 FRONT', 'four full-body']) expect(prompt, removed).not.toContain(removed)
    expect(prompt).toContain('FRONT, SIDE, BACK')
    expect(prompt).toContain('DETAIL tiles')
    expect(prompt).toContain('EXPRESSION tiles')
  })

  it('예전 시트를 참고로 붙이면 칸 배치는 양식만 따르라고 한다', () => {
    // 왜: 다시 만들기 · 시리즈는 예전 양식(팔레트 · 포즈 칸이 있는) 시트를 정체성 참고로 붙인다 — 그 칸 배치를 베끼지 않게.
    for (const opts of [{ hasPriorRender: true }, { hasSeriesSheet: true }, { hasSeriesStyleSample: true }]) {
      const prompt = buildCharacterTurnaroundPrompt(PERSON, opts)
      expect(prompt, JSON.stringify(opts)).toContain('take the tile layout ONLY from the template')
    }
    expect(buildCharacterTurnaroundPrompt(PERSON)).not.toContain('take the tile layout ONLY from the template')
  })
})
