// 샷 고치기 팝업에서 저장 뒤 그리기만 실패했을 때 [다시 그리기]만 남는지(다시 읽은 대사의 칸 순서를 고침으로 보지 않는지) 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { startChanges } from '@/lib/writer/shot-edit'

const draft = {
  actionDescription: '민호가 자판기 앞에 선다',
  shotType: 'CU' as const,
  durationSeconds: 5,
  dialogueLines: [{ characterId: 'min_ho', text: '아, 또야?', emotion: '', delivery: '낮게', durationHint: 1 }],
}

describe('샷 고치기 팝업 — 저장 뒤 남은 일', () => {
  // 왜: 2026-10-31 QA — 저장은 됐고 그리기만 실패하면 단추가 [다시 그리기]여야 하는데, 다시 읽은 대사는 저장소가 칸 순서를 바꿔(jsonb)
  //   "바뀐 것이 있다"로 보여 [적용 · 러프 다시 그리기]가 남고, 누르면 같은 내용을 한 번 더 저장했다.
  it('저장한 대사를 다시 읽어 칸 순서만 바뀌었으면 바뀐 것이 없다고 보고 [다시 그리기]만 남긴다', () => {
    const reloaded = { ...draft, dialogueLines: [{ text: '아, 또야?', emotion: '', delivery: '낮게', characterId: 'min_ho', durationHint: 1 }] }
    expect(startChanges(reloaded, draft)).toEqual({})
    const dialog = readFileSync('src/features/writer/storyboard-shot-dialog.tsx', 'utf8')
    expect(dialog).toMatch(/import \{[^}]*\bstartChanges\b[^}]*\} from '@\/lib\/writer\/shot-edit'/)
    expect(dialog).toContain("retryStep === 'redraw' && !startDirty ? t('Redraw')")
  })

  // 왜: 순서만 무시할 뿐 — 글 · 화자 · 샷 타입 · 스토리를 바꾸면 저장할 고침으로 남아야 한다(정상 경로 고정).
  it('대사 글 · 샷 타입 · 스토리를 바꾸면 바꾼 칸만 저장할 고침으로 본다', () => {
    const saved = { ...draft, shotType: 'MS' as const, dialogueLines: [{ ...draft.dialogueLines[0], text: '아' }] }
    expect(startChanges(saved, { ...draft, actionDescription: `${draft.actionDescription}  ` })).toEqual({
      shotType: 'CU',
      dialogueLines: draft.dialogueLines,
    })
    expect(startChanges(draft, { ...draft, actionDescription: '민호가 돌아선다', dialogueLines: [...draft.dialogueLines, { characterId: null, text: '  ', emotion: '', delivery: '', durationHint: 0 }] })).toEqual({
      actionDescription: '민호가 돌아선다',
      dialogueLines: draft.dialogueLines,
    })
  })
})
