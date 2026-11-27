'use client'

// 연출 화살표 편집기의 저장하지 않은 화살표 지키기(2026-11-14 오너 "미들 프레임 수정이 안 된다" · 리드 ①②).
//   편집기 [저장]이 그림 아래 화면 밖이고 창 아래 [적용]은 길이만 저장해, 그린 화살표를 저장하지 못하고 [취소] · ✕ 로 닫아 잃었다.
//   ① 연출 탭의 창 아래 [적용]은 그린 화살표도 저장한다(그린 것이 있으면 켜진다). ② 그린 것이 있으면 닫기 전에 묻는다 —
//   Storyboard 샷 고치기 창(입구 A)과 Director 연출 화살표 편집 창(입구 B)이 같은 훅 · 같은 물음 창을 쓴다.
//   입구 A 에서 [시작] 탭으로 바꿀 때도 같은 물음을 거친다(편집기가 사라지며 그린 것이 없어진다, 리드 2026-11-14).
//   연출 장을 다시 만들 때도 묻는다 — 그때는 저장해도 바뀌니 [계속 그리기] · [버리고 다시 만들기] 둘(검토 a 54016e65).
//   페이지를 떠나거나 새로 고칠 때는 브라우저 기본 물음(beforeunload)을 띄운다 — 저장하면 푼다.
//   화살표를 저장하면 끝 장도 이 화살표대로 다시 그릴지 묻는다(D10 · 2026-11-22 리드 Q2) — 두 입구가 같은 물음(EndRedrawAsk)을 쓴다.
//   ②(오너 Q1 · Q3): 물음 창이 열리면 읽는 AI 가 연출 장을 한 줄로 읽는다(7~11초) — 그 줄을 화면 말로 보이고 고칠 수 있게 한다.
//   끝 장은 작업으로 그려 1분 넘게 걸린다 — 고르면 창은 바로 닫히고, 알림이 작업이 끝날 때까지 기다린다.
//   약속: tests/writer/directing-editor-unsaved.test.ts · tests/writer/end-frame-ask.test.ts
import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/lib/i18n'
import {
  askLineText,
  canRedrawEnd,
  editedLinePayload,
  keepEditedLine,
  redrawEndFrame,
  resolveEndAsk,
  type EditedEndLine,
  type EndAskChoice,
  type EndRedrawDeps,
  type KeepLineDeps,
} from '@/lib/writer/end-frame-ask'
import type { DirectionRead } from '@/lib/writer/direction-read'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import { reloadAfterRoughFrameEdit } from '@/lib/writer/rough-frame-refresh'
import { useLocaleStore } from '@/stores/locale-store'
import type { DirectingArrowEditorHandle } from '@/features/writer/directing-arrow-editor'
import { directingEditHeaders, directingEditUrl } from '@/lib/writer/directing-edit-url'

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

/** 끝 장 물음의 대상 — 어느 프로젝트의 어느 샷인지, 다시 그린 뒤 무엇을 다시 읽을지. */
export interface EndAskTarget {
  projectId: string
  shotId: string
  onRedrawn: () => void | Promise<void>
  /** 요청을 보낼 곳 — 없으면 콘티(러프) 주소. 실사 가운데 장(N4b)은 directingEditUrl('real'). */
  endpoint?: string
  /** 끝 장을 그리는 동안 켜고(true) 끝나면(실패해도) 끄는(false) 잠금 — 실사는 그 카드 표시(cardDrawing, 검토 rev-realarrow 2). */
  track?: (busy: boolean) => void
}

/** 끝 장 다시 그리기 — 대상의 잠금을 켜고 그리고, 끝나면(실패해도) 끈다. 물음 창 [다시 그리기] · 실사 저장 뒤 자동 길이 같이 쓴다. */
export function runEndRedraw(target: EndAskTarget, deps: EndRedrawDeps, line?: EditedEndLine | null): Promise<boolean> {
  target.track?.(true)
  return redrawEndFrame(target.projectId, target.shotId, deps, line).finally(() => target.track?.(false))
}

/** 대상의 요청 주소 — 넘긴 주소가 없으면 콘티(러프)의 지금 주소. */
function endpointOf(target: Pick<EndAskTarget, 'endpoint'>): string {
  return target.endpoint ?? directingEditUrl('rough')
}

/** 실사 가운데 장 길인가 — 알림 말이 달라진다(실사 상세에는 콘티의 "연출 탭"이 없다, 검토 rev-realarrow 8). */
function isRealTarget(target: Pick<EndAskTarget, 'endpoint'>): boolean {
  return endpointOf(target) === directingEditUrl('real')
}

/** 끝 장 다시 그리기의 실제 부품 — 요청 · 작업 기다리기 · 알림 · 다시 읽기. 물음의 [다시 그리기]와 [이 장만 다시 만들기](끝)가 같이 쓴다. */
export function endRedrawDeps(target: EndAskTarget, t: ReturnType<typeof useT>): EndRedrawDeps {
  const frame = t('End frame')
  return {
    post: async (body) => {
      const res = await fetch(endpointOf(target), {
        method: 'POST',
        headers: directingEditHeaders(useLocaleStore.getState().locale),
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => null)
      return {
        ok: res.ok,
        jobId: res.ok ? (j?.data?.jobId ?? null) : null,
        error: res.ok ? null : (j?.error ?? `HTTP ${res.status}`),
        code: res.ok ? null : (j?.code ?? null),
      }
    },
    waitJob: (jobId) => pollGenerationJob(jobId),
    reload: () => reloadAfterRoughFrameEdit(target.projectId, target.onRedrawn),
    notify: {
      info: (message) => toast.info(message),
      success: (message) => toast.success(message),
      error: (message, retry, detail) => toast.error(message, { description: detail ?? undefined, action: { label: t('Try again'), onClick: retry } }),
    },
    messages: {
      drawing: t('Redrawing the end frame, which takes over a minute'),
      done: t('Redrew the {frame}. The other two are unchanged.', { frame }),
      failed: t('Could not redraw the end frame. It stays as it was.'),
      unreadable: isRealTarget(target)
        ? t('The AI could not read the arrows, so the end frame was not redrawn. Press Edit and redraw the end frame and write the motion.')
        : t('The AI could not read the arrows, so the end frame was not redrawn. Write the motion in the directing tab.'),
      translateFailed: t('Could not translate the motion line. Try again.'),
    },
  }
}

/** [그대로] + 고친 줄 남기기의 실제 부품(리드 (A) 2026-11-23) — 요청 · 다시 읽기(편집기 아래 줄이 고친 줄로 바뀐다) · 알림. */
export function keepLineDeps(target: EndAskTarget, t: ReturnType<typeof useT>): KeepLineDeps {
  return {
    post: async (body) => {
      const res = await fetch(endpointOf(target), {
        method: 'POST',
        headers: directingEditHeaders(useLocaleStore.getState().locale),
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => null)
      return { ok: res.ok, code: res.ok ? null : (j?.code ?? null) }
    },
    reload: () => reloadAfterRoughFrameEdit(target.projectId, target.onRedrawn),
    notify: {
      success: (message) => toast.success(message),
      error: (message, retry) => toast.error(message, retry ? { action: { label: t('Try again'), onClick: retry } } : undefined),
    },
    messages: {
      kept: t('Kept your line. The end frame stays as it is.'),
      translateFailed: t('Could not translate your line, so it was not kept. The previous line stays. Try again.'),
      stale: isRealTarget(target)
        ? t('The middle frame changed meanwhile, so your line was not kept. Open Edit arrows again.')
        : t('The directing frame changed meanwhile, so your line was not kept. Open the directing tab again.'),
      failed: t('Could not keep your line. The previous line stays.'),
    },
  }
}

/** 지금 연출 장을 읽은 줄 — 이미 읽은 줄이 있으면 서버가 다시 읽지 않는다. 못 읽었거나 요청이 안 되면 null. */
async function fetchDirectionRead(projectId: string, shotId: string, endpoint: string): Promise<DirectionRead | null> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: directingEditHeaders(useLocaleStore.getState().locale),
      body: JSON.stringify({ action: 'read-direction', projectId, shotId }),
    })
    if (!res.ok) return null
    const j = await res.json().catch(() => null)
    return (j?.data?.read as DirectionRead | null) ?? null
  } catch {
    return null
  }
}

/** 두 입구가 같이 쓰는 지킴 — 편집기 ref · 저장하지 않은 화살표 여부 · 닫기 · 탭 바꾸기 요청 · 물음 창 props · 끝 장 물음. */
export function useUnsavedArrowsGuard(close: () => void) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
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
  /** 창을 떠나는 다른 일(실사 상세 [Lumi 에게 고쳐 달라고 하기] — 보내면 창이 닫힌다) — 그린 것이 있으면 닫기와 같은 물음을 거친 뒤 그 일을 한다(검토 rev-realarrow 6). */
  const requestLeave = (proceed: () => void) => {
    if (closeRequest(dirty) === 'ask') setPending({ purpose: 'close', proceed })
    else proceed()
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
  // 끝 장 물음 — 화살표를 저장한 뒤(또는 편집기 아래 줄 [고쳐서 끝 장 다시 그리기]로) 열고, 고르면 저장을 끝낸다
  //   (창 [적용] · [저장하고 닫기]는 고른 뒤 닫힌다). 열리자마자 지금 연출 장을 한 줄로 읽는다(이미 읽은 줄이면 바로). 그리기는 기다리지 않는다.
  const [endAsk, setEndAsk] = useState<{ target: EndAskTarget; done: () => void; reading: boolean; read: DirectionRead | null; text: string } | null>(null)
  const askEnd = (target: EndAskTarget) =>
    new Promise<void>((done) => {
      setEndAsk({ target, done, reading: true, read: null, text: '' })
      void fetchDirectionRead(target.projectId, target.shotId, endpointOf(target)).then((read) =>
        setEndAsk((current) => (current && current.target === target ? { ...current, reading: false, read, text: askLineText(read, locale) } : current)),
      )
    })
  const chooseEnd = (choice: EndAskChoice) => {
    const current = endAsk
    setEndAsk(null)
    if (!current) return
    if (choice === 'redraw' && !canRedrawEnd(current)) return current.done()
    const line = editedLinePayload(current.read, current.text, locale)
    // [그대로] 단추는 고친 줄만 남긴다(리드 (A)) — 안 고쳤으면 keepEditedLine 이 아무것도 보내지 않는다. Esc · ✕ 는 'keep' 이라 버린다.
    resolveEndAsk(
      choice,
      () => void runEndRedraw(current.target, endRedrawDeps(current.target, t), line),
      () => void keepEditedLine(current.target.projectId, current.target.shotId, keepLineDeps(current.target, t), line, current.read?.direction ?? null),
    )
    current.done()
  }
  const setEndText = (text: string) => setEndAsk((current) => (current ? { ...current, text } : current))
  return {
    editorRef,
    dirty,
    setDirty,
    saveArrows,
    requestClose,
    requestLeave,
    requestSwitch,
    requestRedraw,
    confirm: { open: pending !== null, purpose: pending?.purpose ?? 'close', saving, onChoose: choose },
    askEnd,
    endAsk: {
      open: endAsk !== null,
      reading: endAsk?.reading ?? false,
      unreadable: !!endAsk && !endAsk.reading && !endAsk.read,
      // 남은 줄이 사람이 고친 줄이면 이름표가 "고친 움직임"(리드 2026-11-23).
      userLine: endAsk?.read?.source === 'user',
      text: endAsk?.text ?? '',
      onTextChange: setEndText,
      onChoose: chooseEnd,
    },
  }
}

/** "끝 장도 이 화살표대로 다시 그릴까요?" — 읽은 한 줄(고칠 수 있음) · [그대로] · [다시 그리기].
 *  [그대로] 단추는 끝 장을 그리지 않고, 줄을 고쳤으면 고친 줄을 남긴다('keep-line' — 영상이 그 줄을 쓴다, 리드 (A) · D2 2026-11-23).
 *  Esc · ✕ · 바깥 누르기는 끝 장도 그리지 않고 고친 줄도 버린다('keep' — 그림 값이 들지 않는 쪽, 잘못 눌러도 아무것도 바뀌지 않는다).
 *  읽는 동안은 "화살표를 읽는 중…"으로 [다시 그리기]를 잠그고, 못 읽었으면 빈 줄에 직접 적게 한다(줄을 적어야 켜진다). */
export function EndRedrawAsk({
  open,
  reading,
  unreadable,
  userLine = false,
  text,
  onTextChange,
  onChoose,
}: {
  open: boolean
  reading: boolean
  unreadable: boolean
  /** 남은 줄이 사람이 고친 줄(source user)이면 true — 이름표가 "고친 움직임". */
  userLine?: boolean
  text: string
  onTextChange: (text: string) => void
  onChoose: (choice: EndAskChoice) => void
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onChoose('keep') }}>
      <DialogContent data-testid="end-redraw-ask">
        <DialogHeader>
          <DialogTitle>{t('Redraw the end frame to match these arrows?')}</DialogTitle>
          <DialogDescription className="break-keep">{t('The start and directing frames stay as they are. Only the end frame is redrawn, which takes over a minute.')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="end-redraw-line" className="text-label font-semibold text-foreground">
            {userLine ? t('Edited movement') : t('Motion the AI read')}
          </label>
          {reading ? (
            <p className="flex items-center gap-2 rounded-lg bg-card px-3 py-2.5 text-caption text-muted-foreground" data-testid="end-redraw-reading">
              <Loader2 className="size-3.5 animate-spin" />
              {t('Reading the arrows…')}
            </p>
          ) : (
            <Textarea
              id="end-redraw-line"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder={t('Describe how the shot ends, for example: the figure on the left walks out to the right.')}
              className="break-keep"
              data-testid="end-redraw-line"
            />
          )}
          <p className="break-keep text-caption text-muted-foreground">
            {unreadable ? t('The AI could not read the arrows. Write the motion yourself.') : t('You can edit the line. The end frame is drawn from it, and videos use it even if you choose Keep as is.')}
          </p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onChoose('keep-line')} data-testid="end-redraw-keep">
            {t('Keep as is')}
          </Button>
          <Button onClick={() => onChoose('redraw')} disabled={!canRedrawEnd({ reading, text })} data-testid="end-redraw-redraw">
            {t('Redraw')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
