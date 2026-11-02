// 샷 고치기 팝업에서 대사만 고치면 [적용]이 저장만 하고(러프는 다시 그리지 않고), 그림에 보이는 칸을 고치면 지금처럼 다시 그리는지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { startApplyKind } from '@/lib/writer/shot-edit'

const line = { characterId: 'min_ho', text: '아, 또야?', emotion: '', delivery: '', durationHint: 1 }

describe('샷 고치기 팝업 [적용]', () => {
  // 왜: 러프 라우트는 대사 · 화자를 읽지 않는다(샷에서 읽는 칸에 dialogue_lines 가 없다 — 2026-11-02 확인). 대사만 고쳐도 러프를 다시 그리면
  //   그림 값만 들고 그림은 그대로다(리드 결정 D2).
  it('팝업에서 대사만 고치면 단추가 [적용]이고 저장만 한다 — 러프는 다시 그리지 않는다', () => {
    expect(startApplyKind({ dialogueLines: [line] }, true)).toBe('save')
    const route = readFileSync('src/app/api/writer/rough-storyboard/route.ts', 'utf8')
    const shotColumns = /\.from\('shots'\)\s*\.select\(\s*'([^']+)'/.exec(route)?.[1] ?? ''
    expect(shotColumns).toContain('action_description')
    expect(shotColumns).not.toContain('dialogue')
    const dialog = readFileSync('src/features/writer/storyboard-shot-dialog.tsx', 'utf8')
    expect(dialog).toMatch(/startApplyKind\(changes, completed\)/)
  })

  // 왜: 정상 경로 고정 — 스토리 · 샷 타입은 러프에 그려지므로 지금처럼 [적용 · 러프 다시 그리기]로 저장하고 다시 그린다. 러프가 없는 샷은 저장만.
  it('스토리 · 샷 타입을 고치면 지금처럼 [적용 · 러프 다시 그리기]로 저장하고 다시 그린다', () => {
    expect(startApplyKind({ shotType: 'CU', dialogueLines: [line] }, true)).toBe('redraw')
    expect(startApplyKind({ actionDescription: '민호가 돌아선다' }, true)).toBe('redraw')
    expect(startApplyKind({ actionDescription: '민호가 돌아선다' }, false)).toBe('save')
  })
})
