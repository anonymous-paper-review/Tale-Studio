// 실사 이미지를 그릴 때 러프 가운데 장의 손글씨 · 연필 느낌을 옮기지 않고, 그 글씨가 나르던 빛 · 색 뜻은 글로 넘기는지 검사한다(D5 · 2026-11-22)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildRealGridPrompt, buildRealStripPrompt } from '@/lib/director/storyboard-strip'
import { realCineLine } from '@/lib/director/real-cine-line'

const read = (rel: string) => readFileSync(rel, 'utf8')
const strip = (opts: Partial<Parameters<typeof buildRealStripPrompt>[1]> = {}) =>
  buildRealStripPrompt('Two men sit against the wall and drink.', { characterRefCount: 2, hasStyleRef: false, ...opts })
const grid = (opts: Partial<Parameters<typeof buildRealGridPrompt>[1]> = {}) => buildRealGridPrompt(4, { characterRefCount: 2, hasStyleRef: false, ...opts })
// 이 시험을 위해 지은 샷 설계 — 러프 가운데 장 아래 글씨 칸(KEY · 렌즈 · FOCUS · 색온도)의 재료와 같은 칸들.
const SPEC = {
  shot_type: 'CU',
  camera_angle: 'eye_level',
  lens_mm: 85,
  depth_of_field: 'shallow',
  framing: { focal_point: "the man's eyes" },
  lighting: { key_direction: 'front_left', quality: 'hard', color_temp_kelvin: 6200 },
}

describe('실사 이미지에 러프 손글씨를 옮기지 않기', () => {
  // 왜: 지시문이 러프 가운데 장의 손글씨(DOLLY IN · COOL 6200K · 인물 이름)를 "굵게 다시" 쓰라고 해, 실사에 글자가 남았다(피드백 3 · D5).
  it('실사 이미지를 그릴 때 러프 가운데 장의 글씨를 다시 쓰라고 하지 않는다(한 샷 · 네 샷 지시문 모두)', () => {
    for (const prompt of [strip(), strip({ frameAxis: 'cols' }), grid()]) {
      expect(prompt).not.toMatch(/labels? (from reference panel 2 )?redrawn boldly/i)
      expect(prompt).not.toMatch(/except (the middle panel's|row 2's) arrow labels/)
      expect(prompt).not.toMatch(/This is the only panel with text/)
      expect(prompt).toMatch(/copy no words, labels or notes/i)
    }
  })

  // 왜: 연출 확인 칸(가운데)은 남기되 글자는 어느 칸에도 없어야 한다 — 화살표만 얇게 얹는다(혼자 정한 것 · 쉬움).
  it('실사 지시문은 어느 칸에도 글자를 쓰지 말라고 하고, 가운데 칸에는 러프의 화살표만 얹게 한다', () => {
    for (const prompt of [strip(), grid()]) {
      expect(prompt).toMatch(/No text, letters or numbers anywhere/)
      expect(prompt).toMatch(/only the (SAME )?direction ARROWS from reference (panel|row) 2 drawn (on top )?as thin, clean overlay lines/)
    }
    // 화살표 없는 러프(정지 샷)는 가운데 칸도 깨끗하다 — 지금 약속 그대로.
    expect(strip()).toMatch(/the middle panel stays clean with no annotation/)
  })

  // 왜: 흑백 러프에서 색온도 · 빛 방향 · 렌즈 · 초점은 가운데 장 글씨 칸만 날랐다(8/7 결정) — 글씨를 빼면 그 뜻을 샷 설계에서 글로 넘긴다.
  it('러프 가운데 장 글씨가 나르던 빛 · 색 · 렌즈 · 초점은 샷 설계에서 글로 실사 지시문에 넣는다', () => {
    const line = realCineLine(SPEC)
    expect(line).toContain('85mm lens')
    expect(line).toContain('6200K')
    expect(line).toContain('key from front left')
    expect(line).toContain("sharpest on the man's eyes")
    expect(realCineLine(null)).toBeNull()
    expect(realCineLine({})).toBeNull()
    expect(strip({ cineLine: line })).toContain(`Cinematography`)
    expect(grid({ cineLines: [line, null, null, null] })).toContain(`Column 1: ${line}`)
    // 두 실사 길(한 샷 · 네 샷 시트)이 모두 샷 설계로 글을 만들어 싣는다.
    const single = read('src/app/api/director/generate-storyboard/route.ts')
    expect(single).toMatch(/const cineLine = stripFrames \? realCineLine\(\(shot as \{ static_spec\?: unknown \} \| null\)\?\.static_spec\) : null/)
    expect(single).toMatch(/buildRealStripPrompt\(guardedPrompt, \{[\s\S]*?\n\s+cineLine,\n/)
    const batch = read('src/app/api/director/generate-storyboard-batch/route.ts')
    expect(batch).toMatch(/cineLine: realCineLine\(s\.static_spec\),/)
    expect(batch).toMatch(/cineLines: group\.map\(\(s\) => s\.cineLine\),/)
  })

  // 왜: 샷 설계의 글(FOCUS 의 인물 이름 같은 것)은 작가 AI 가 쓴 사용자 쪽 글이다 — 그림에 싣기 전에 내용 검사를 거친다(10/11 약속).
  it('실사 지시문에 새로 넣는 빛 · 색 글도 내용 검사를 거친다', () => {
    const single = read('src/app/api/director/generate-storyboard/route.ts')
    expect(single).toMatch(/assertUserTextAllowed\(\s*\[\s*promptEn,[\s\S]*?cineLine,[\s\S]*?\],\s*\{ projectId, kind: 'shot_storyboard'/)
    const batch = read('src/app/api/director/generate-storyboard-batch/route.ts')
    expect(batch).toMatch(/assertUserTextAllowed\(\s*\[[\s\S]*?sceneLighting,\s*\.\.\.group\.map\(\(s\) => s\.cineLine\),\s*\],\s*\{ projectId, kind: 'storyboard_real_grid'/)
  })

  // 왜: 실사 칸에 연필 선 · 빗금 · 종이 질감이 남아 "그림 느낌"이 났다(피드백 3) — 연필은 구도 · 자세만 나르고 결과에는 남지 않게 한다.
  it('실사 지시문은 연필 선 · 빗금 · 종이 질감이 남지 않게 하라고 한다', () => {
    for (const prompt of [strip(), grid()]) {
      expect(prompt).toMatch(/Nothing of the pencil drawing may remain: no pencil lines, hatching, sketch outlines, paper texture or handwriting/)
    }
  })
})
