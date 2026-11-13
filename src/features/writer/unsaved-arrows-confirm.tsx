'use client'

// 연출 화살표 편집기의 저장하지 않은 화살표 지키기(2026-11-14 오너 "미들 프레임 수정이 안 된다" · 리드 ①②).
//   편집기 [저장]이 그림 아래 화면 밖이고 창 아래 [적용]은 길이만 저장해, 그린 화살표를 저장하지 못하고 [취소] · ✕ 로 닫아 잃었다.
//   ① 연출 탭의 창 아래 [적용]은 그린 화살표도 저장한다(그린 것이 있으면 켜진다). ② 그린 것이 있으면 닫기 전에 묻는다 —
//   Storyboard 샷 고치기 창(입구 A)과 Director 연출 화살표 편집 창(입구 B)이 같은 훅 · 같은 물음 창을 쓴다.
//   약속: tests/writer/directing-editor-unsaved.test.ts
import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'
import type { DirectingArrowEditorHandle } from '@/features/writer/directing-arrow-editor'

export type UnsavedChoice = 'save' | 'discard' | 'keep'

/** 창을 닫으려 할 때 — 저장하지 않은 화살표가 있으면 먼저 묻는다. 순수 함수 — 테스트 대상. */
export function closeRequest(dirty: boolean): 'ask' | 'close' {
  return dirty ? 'ask' : 'close'
}

/** 물음 창에서 고른 것 — [저장하고 닫기]는 저장된 뒤에만 닫는다(실패하면 창을 그대로 두고 편집기가 알린다). 닫았으면 true. */
export async function resolveUnsavedClose(
  choice: UnsavedChoice,
  actions: { save: () => Promise<boolean>; close: () => void },
): Promise<boolean> {
  if (choice === 'keep') return false
  if (choice === 'save' && !(await actions.save())) return false
  actions.close()
  return true
}

/** 연출 탭의 창 아래 [적용] — 저장하지 않은 화살표가 있으면 길이를 안 바꿔도 켜진다. 순수 함수 — 테스트 대상. */
export function directionApplyEnabled(state: { arrowsDirty: boolean; durationDirty: boolean }): boolean {
  return state.arrowsDirty || state.durationDirty
}

/** 연출 탭 [적용] — 화살표부터 저장하고(안 되면 멈춘다), 길이를 바꿨으면 길이를 저장한다(그 저장이 창을 닫는다). 아니면 닫는다. */
export async function applyDirectionTab(
  state: { arrowsDirty: boolean; durationDirty: boolean },
  actions: { saveArrows: () => Promise<boolean>; saveDuration: () => Promise<void>; close: () => void },
): Promise<void> {
  if (state.arrowsDirty && !(await actions.saveArrows())) return
  if (state.durationDirty) {
    await actions.saveDuration()
    return
  }
  actions.close()
}

/** 두 입구가 같이 쓰는 지킴 — 편집기 ref · 저장하지 않은 화살표 여부 · 닫기 요청 · 물음 창 props. */
export function useUnsavedArrowsGuard(close: () => void) {
  const editorRef = useRef<DirectingArrowEditorHandle>(null)
  const [dirty, setDirty] = useState(false)
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveArrows = () => editorRef.current?.save() ?? Promise.resolve(true)
  const requestClose = () => {
    if (closeRequest(dirty) === 'ask') setAsking(true)
    else close()
  }
  const choose = async (choice: UnsavedChoice) => {
    if (choice === 'save') setSaving(true)
    try {
      await resolveUnsavedClose(choice, { save: saveArrows, close })
    } finally {
      setSaving(false)
      setAsking(false)
    }
  }
  return { editorRef, dirty, setDirty, saveArrows, requestClose, confirm: { open: asking, saving, onChoose: choose } }
}

/** "저장하지 않은 화살표가 있어요" — [계속 그리기] · [버리고 닫기] · [저장하고 닫기]. Esc · ✕ 는 계속 그리기(그린 것을 지킨다). */
export function UnsavedArrowsConfirm({ open, saving, onChoose }: { open: boolean; saving: boolean; onChoose: (choice: UnsavedChoice) => void }) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onChoose('keep') }}>
      <DialogContent showCloseButton={!saving} data-testid="unsaved-arrows-confirm">
        <DialogHeader>
          <DialogTitle>{t('You have unsaved arrows')}</DialogTitle>
          <DialogDescription>{t('Save them before closing, or close without saving them.')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" disabled={saving} onClick={() => onChoose('keep')} data-testid="unsaved-arrows-keep">
            {t('Keep drawing')}
          </Button>
          <Button variant="secondary" disabled={saving} onClick={() => onChoose('discard')} data-testid="unsaved-arrows-discard">
            {t('Discard and close')}
          </Button>
          <Button disabled={saving} onClick={() => onChoose('save')} data-testid="unsaved-arrows-save">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t('Save and close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
