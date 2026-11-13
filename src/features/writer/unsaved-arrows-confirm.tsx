'use client'

// 연출 화살표 편집기의 저장하지 않은 화살표 지키기(2026-11-14 오너 "미들 프레임 수정이 안 된다" · 리드 ①②).
//   편집기 [저장]이 그림 아래 화면 밖이고 창 아래 [적용]은 길이만 저장해, 그린 화살표를 저장하지 못하고 [취소] · ✕ 로 닫아 잃었다.
//   ① 연출 탭의 창 아래 [적용]은 그린 화살표도 저장한다(그린 것이 있으면 켜진다). ② 그린 것이 있으면 닫기 전에 묻는다 —
//   Storyboard 샷 고치기 창(입구 A)과 Director 연출 화살표 편집 창(입구 B)이 같은 훅 · 같은 물음 창을 쓴다.
//   입구 A 에서 [시작] 탭으로 바꿀 때도 같은 물음을 거친다(편집기가 사라지며 그린 것이 없어진다, 리드 2026-11-14).
//   연출 장을 다시 만들 때도 묻는다 — 그때는 저장해도 바뀌니 [계속 그리기] · [버리고 다시 만들기] 둘(검토 a 54016e65).
//   페이지를 떠나거나 새로 고칠 때는 브라우저 기본 물음(beforeunload)을 띄운다 — 저장하면 푼다.
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

/** 연출 탭에서 다른 탭으로 바꾸려 할 때 — 편집기가 사라지므로 저장하지 않은 화살표가 있으면 먼저 묻는다. 순수 함수 — 테스트 대상. */
export function tabSwitchRequest<Tab extends string>(current: Tab, next: Tab, dirty: boolean): 'ask' | 'switch' {
  return current !== next && dirty ? 'ask' : 'switch'
}

/** 러프 한 장을 다시 만들려 할 때 — 연출 장이면 그린 화살표가 사라지므로 먼저 묻는다. 시작 · 끝은 그린 것이 남는다(재검토 c 3). 테스트 대상. */
export function redrawRequest(frame: string, dirty: boolean): 'ask' | 'redraw' {
  return frame === 'direction' && dirty ? 'ask' : 'redraw'
}

/** 저장하지 않은 화살표가 있으면 페이지를 떠나거나 새로 고칠 때 브라우저 기본 물음을 띄운다 — 풀기 함수를 돌려준다(effect 정리). 테스트 대상. */
export function warnBeforeLeaving(target: Pick<Window, 'addEventListener' | 'removeEventListener'>, dirty: boolean): () => void {
  if (!dirty) return () => {}
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault()
    // 옛 브라우저는 returnValue 가 있어야 묻는다 — 브라우저의 BeforeUnloadEvent 에서만 쓸 수 있는 칸이다.
    if (typeof BeforeUnloadEvent !== 'undefined' && event instanceof BeforeUnloadEvent) event.returnValue = ''
  }
  target.addEventListener('beforeunload', onBeforeUnload)
  return () => target.removeEventListener('beforeunload', onBeforeUnload)
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

export type UnsavedPurpose = 'close' | 'switch' | 'redraw'

/** 두 입구가 같이 쓰는 지킴 — 편집기 ref · 저장하지 않은 화살표 여부 · 닫기 · 탭 바꾸기 요청 · 물음 창 props. */
export function useUnsavedArrowsGuard(close: () => void) {
  const editorRef = useRef<DirectingArrowEditorHandle>(null)
  const [dirty, setDirty] = useState(false)
  // 물음 창이 열려 있으면 무엇을 하려다 물었는지(닫기 · 탭 바꾸기)와 고른 뒤 이어서 할 일.
  const [pending, setPending] = useState<{ purpose: UnsavedPurpose; proceed: () => void } | null>(null)
  const [saving, setSaving] = useState(false)
  const saveArrows = () => editorRef.current?.save() ?? Promise.resolve(true)
  const requestClose = () => {
    if (closeRequest(dirty) === 'ask') setPending({ purpose: 'close', proceed: close })
    else close()
  }
  /** 탭 바꾸기 — 바꾸면 편집기가 사라지므로 그린 것이 있으면 닫기와 같은 물음을 거친다. */
  const requestSwitch = <Tab extends string>(current: Tab, next: Tab, proceed: () => void) => {
    if (tabSwitchRequest(current, next, dirty) === 'ask') setPending({ purpose: 'switch', proceed })
    else proceed()
  }
  /** 러프 한 장 다시 만들기 — 연출 장이면 그린 것이 사라지므로 묻는다(계속 그리기 · 버리고 다시 만들기). */
  const requestRedraw = (frame: string, proceed: () => void) => {
    if (redrawRequest(frame, dirty) === 'ask') setPending({ purpose: 'redraw', proceed })
    else proceed()
  }
  const choose = async (choice: UnsavedChoice) => {
    const proceed = pending?.proceed ?? close
    if (choice === 'save') setSaving(true)
    try {
      await resolveUnsavedClose(choice, { save: saveArrows, close: proceed })
    } finally {
      setSaving(false)
      setPending(null)
    }
  }
  return {
    editorRef,
    dirty,
    setDirty,
    saveArrows,
    requestClose,
    requestSwitch,
    requestRedraw,
    confirm: { open: pending !== null, purpose: pending?.purpose ?? 'close', saving, onChoose: choose },
  }
}

/** "저장하지 않은 화살표가 있어요" — [계속 그리기] · [버리고 닫기] · [저장하고 닫기](탭을 바꿀 때는 "…바꾸기"). Esc · ✕ 는 계속 그리기(그린 것을 지킨다). */
export function UnsavedArrowsConfirm({
  open,
  purpose,
  saving,
  onChoose,
}: {
  open: boolean
  purpose: UnsavedPurpose
  saving: boolean
  onChoose: (choice: UnsavedChoice) => void
}) {
  const t = useT()
  const switching = purpose === 'switch'
  // 연출 장을 다시 만들면 저장해도 바뀌므로 [저장하고 …]는 두지 않는다.
  const redrawing = purpose === 'redraw'
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onChoose('keep') }}>
      <DialogContent showCloseButton={!saving} data-testid="unsaved-arrows-confirm">
        <DialogHeader>
          <DialogTitle>{t('You have unsaved arrows')}</DialogTitle>
          <DialogDescription>
            {redrawing
              ? t('Remaking the directing frame replaces it, so the arrows you drew go away.')
              : switching
                ? t('Save them before switching tabs, or switch without saving them.')
                : t('Save them before closing, or close without saving them.')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" disabled={saving} onClick={() => onChoose('keep')} data-testid="unsaved-arrows-keep">
            {t('Keep drawing')}
          </Button>
          <Button variant={redrawing ? 'default' : 'secondary'} disabled={saving} onClick={() => onChoose('discard')} data-testid="unsaved-arrows-discard">
            {redrawing ? t('Discard and remake') : switching ? t('Discard and switch') : t('Discard and close')}
          </Button>
          {redrawing ? null : (
            <Button disabled={saving} onClick={() => onChoose('save')} data-testid="unsaved-arrows-save">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {switching ? t('Save and switch') : t('Save and close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
