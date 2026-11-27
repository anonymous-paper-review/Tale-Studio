'use client'

// 대사 줄 바로 고치기의 화면 쪽 — 대사 탭 · Storyboard 샷 팝업 · Director 샷 상세가 같이 쓴다(오너 2026-11-02 "탭 안에서 바로 고치기" · 2026-11-27 Q1).
//   고치는 차례는 lib/writer/dialogue-line-edits 가 맡고 여기는 React 상태 · 알림 · 포커스만. 저장은 대사 탭과 같은 길(dialogue-line-save).
//   Enter · Esc 로 끝내면 그 줄로 포커스를 돌린다(바깥 누르기로 끝내면 끌어오지 않는다 — 다른 곳으로 가려는 것이다).
//   빈 줄 알림은 화면마다 줄을 지우는 곳을 말한다(emptyLineNoticeKey). 창이 닫히면 저장 못 한 줄을 저장된 글로 되돌리고 알린다.
//   약속: tests/writer/dialogue-line-edits.test.ts · dialogue-tab-flow.test.ts
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { saveShotDialogue, shotDialogueLines } from '@/features/writer/dialogue-line-save'
import { useT } from '@/lib/i18n'
import { createLineEdits, emptyLineNoticeKey, lineStateOf, NO_LINE_EDITS, type LineEdits, type LineKey } from '@/lib/writer/dialogue-line-edits'
import type { DialogueLine } from '@/types'

export type DialogueLineScreen = 'conti' | 'storyboard' | 'director'

export function useDialogueLineEdits(screen: DialogueLineScreen) {
  const t = useT()
  const [state, setState] = useState(NO_LINE_EDITS)
  // 알림 글은 부를 때의 화면 말 · 화면으로 — 한 번 만든 고치기 한 벌이 옛 값을 붙잡지 않게.
  const latest = useRef({ t, screen })
  latest.current = { t, screen }
  const edits = useRef<LineEdits | null>(null)
  if (!edits.current) {
    edits.current = createLineEdits(() => ({
      lines: shotDialogueLines,
      save: saveShotDialogue,
      notify: (reason) => {
        const { t: translateNow, screen: screenNow } = latest.current
        const key = reason === 'empty'
          ? emptyLineNoticeKey(screenNow)
          : reason === 'reverted'
            ? 'The line could not be saved, so it went back to the saved text.'
            : 'This line changed while you were editing. Click it to edit again.'
        toast.info(translateNow(key))
      },
    }), setState)
  }
  const line = edits.current
  // 창(팝업 · 대사 탭)이 닫히면 저장 못 한 줄을 저장된 글로 되돌린다 — [다시 저장] · [되돌리기]가 사라진 뒤 화면이 저장 안 된 글을 보이지 않게(검토 rev-flow-2-4 낮음 2).
  //   붙을 때 다시 연다(개발 모드는 붙였다 떼었다 다시 붙인다).
  useEffect(() => {
    line.arm()
    return () => line.dispose()
  }, [line])
  const rowRefs = useRef(new Map<LineKey, HTMLDivElement>())
  const [focusKey, setFocusKey] = useState<LineKey | null>(null)
  useEffect(() => {
    if (!focusKey) return
    rowRefs.current.get(focusKey)?.focus()
    setFocusKey(null)
  }, [focusKey])
  return {
    /** 줄 하나의 모습 — display 는 보기 글로 바꾸기(인물 id → 이름). */
    lineState: (key: LineKey, display: (text: string) => string) => lineStateOf(state, key, display),
    start: (shotId: string, index: number, original: DialogueLine) => line.start(shotId, index, original),
    setDraft: (key: LineKey, draft: string) => line.setDraft(key, draft),
    commit: (via: 'key' | 'blur') => {
      const key = line.commit()
      if (key && via === 'key') setFocusKey(key)
    },
    cancel: () => {
      const key = line.cancel()
      if (key) setFocusKey(key)
    },
    retry: (key: LineKey) => line.retry(key),
    revert: (key: LineKey) => {
      line.revert(key)
      setFocusKey(key)
    },
    rowRef: (key: LineKey) => (element: HTMLDivElement | null) => {
      if (element) rowRefs.current.set(key, element)
      else rowRefs.current.delete(key)
    },
  }
}

/** 창(Radix Dialog)의 Esc 닫기 — 대사 줄을 고치는 중이면 닫지 않는다(그 Esc 는 고치기 취소). 창은 Esc 를 문서 capture 에서 먼저 받는다.
 *  고치는 줄 밖에서 누른 Esc 는 그대로 닫는다. Storyboard 샷 팝업 · Director 샷 팝업의 DialogContent onEscapeKeyDown. */
export function keepOpenWhileEditingLine(event: { target: EventTarget | null; preventDefault: () => void }): void {
  const target = event.target as { closest?: (selector: string) => unknown } | null
  if (target?.closest?.('[data-testid="dialogue-line"][data-state="editing"]')) event.preventDefault()
}
