// 연출 화살표 편집기에 저장하지 않은 화살표가 있을 때 창 아래 [적용] · 닫기가 그 화살표를 지키는지 검사한다(2026-11-14 오너 고장 · 리드 ①②)
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { applyDirectionTab, closeRequest, directionApplyEnabled, redrawRequest, resolveUnsavedClose, tabSwitchRequest, warnBeforeLeaving } from '@/features/writer/unsaved-arrows-confirm'

describe('저장하지 않은 화살표', () => {
  // 왜: 연출 탭의 창 아래 [적용]은 길이만 저장하고 길이를 안 바꾸면 꺼져 있었다. 편집기 [저장]은 그림 아래 화면 밖이라,
  //   화살표를 그린 오너가 저장하지 못하고 [취소] · ✕ 로 닫아 화살표가 사라졌다(2026-11-14 개발 실측 · 운영 연출 고치기 0건과 맞음).
  it('연출 탭에서 저장하지 않은 화살표가 있으면 길이를 바꾸지 않아도 창 아래 [적용]이 켜지고, 누르면 화살표를 저장한 뒤 닫는다', async () => {
    expect(directionApplyEnabled({ arrowsDirty: true, durationDirty: false })).toBe(true)
    expect(directionApplyEnabled({ arrowsDirty: false, durationDirty: false })).toBe(false)
    const saveArrows = vi.fn(async () => true)
    const saveDuration = vi.fn(async () => undefined)
    const close = vi.fn()
    await applyDirectionTab({ arrowsDirty: true, durationDirty: false }, { saveArrows, saveDuration, close })
    expect(saveArrows).toHaveBeenCalledTimes(1)
    expect(saveDuration).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
    // 화살표 저장이 안 되면 길이도 저장하지 않고 창을 그대로 둔다(편집기가 알린다).
    const failed = vi.fn(async () => false)
    close.mockClear()
    await applyDirectionTab({ arrowsDirty: true, durationDirty: true }, { saveArrows: failed, saveDuration, close })
    expect(saveDuration).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })

  // 왜: [취소] · ✕ · Esc · 바깥 누르기가 묻지 않고 닫혀, 다시 열면 그린 화살표가 없었다(2026-11-14 실측).
  it('저장하지 않은 화살표가 있으면 창을 닫기 전에 묻고, [저장하고 닫기]는 저장된 뒤에만 닫는다', async () => {
    expect(closeRequest(true)).toBe('ask')
    const close = vi.fn()
    await expect(resolveUnsavedClose('save', { save: async () => true, close })).resolves.toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
    close.mockClear()
    await expect(resolveUnsavedClose('save', { save: async () => false, close })).resolves.toBe(false)
    expect(close).not.toHaveBeenCalled()
  })

  // 왜: 버릴지 더 그릴지는 사람이 고른다 — 버리면 저장 없이 닫고, 계속 그리면 창 · 그린 것을 그대로 둔다.
  it('[버리고 닫기]는 저장하지 않고 닫고, [계속 그리기]는 창을 그대로 둔다', async () => {
    const save = vi.fn(async () => true)
    const close = vi.fn()
    await expect(resolveUnsavedClose('discard', { save, close })).resolves.toBe(true)
    expect(save).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
    close.mockClear()
    await expect(resolveUnsavedClose('keep', { save, close })).resolves.toBe(false)
    expect(close).not.toHaveBeenCalled()
  })

  // 왜: 정상 경로 고정 — 그린 것이 없거나 다 저장했으면 지금처럼 바로 닫는다.
  it('저장하지 않은 화살표가 없으면 묻지 않고 닫는다', () => {
    expect(closeRequest(false)).toBe('close')
  })

  // 왜: 연출 화살표 편집기는 두 곳에서 열린다 — Storyboard 샷 고치기 창(입구 A)과 Director 연출 화살표 편집 창(입구 B). 둘 다 같은 물음을 거쳐 닫는다.
  it('Storyboard 샷 고치기 창과 Director 연출 화살표 편집 창은 둘 다 닫기 전에 저장하지 않은 화살표를 묻는다', () => {
    for (const file of ['src/features/writer/storyboard-shot-dialog.tsx', 'src/features/writer/shot-detail-dialog.tsx']) {
      const source = readFileSync(file, 'utf8')
      expect(source).toMatch(/useUnsavedArrowsGuard\(/)
      expect(source).toMatch(/<UnsavedArrowsConfirm /)
      expect(source).toMatch(/onDirtyChange=\{guard\.setDirty\}/)
      expect(source).toMatch(/if \(!open\) guard\.requestClose\(\)/)
    }
  })

  // 왜(리드 2026-11-14): 입구 A 에서 그린 채 [시작] 탭으로 바꾸면 편집기가 사라지며 그린 것이 묻지 않고 없어졌다 — 닫기와 같은 물음으로 막는다.
  it('연출 탭에 저장하지 않은 화살표가 있으면 [시작] 탭으로 바꾸기 전에 묻는다', () => {
    expect(tabSwitchRequest('direction', 'start', true)).toBe('ask')
    // 그린 것이 없거나 같은 탭이면 묻지 않는다(정상 경로).
    expect(tabSwitchRequest('direction', 'start', false)).toBe('switch')
    expect(tabSwitchRequest('direction', 'direction', true)).toBe('switch')
    expect(tabSwitchRequest('start', 'direction', false)).toBe('switch')
    // 탭을 바꾸는 두 자리(왼쪽 [시작 | 연출] · 오른쪽 고치기 카드)가 모두 이 물음을 거친다.
    const source = readFileSync('src/features/writer/storyboard-shot-dialog.tsx', 'utf8')
    expect(source.match(/onClick=\{\(\) => requestTab\(key\)\}/g)?.length).toBe(2)
  })

  // 왜(검토 a 54016e65): 그린 채 [연출 장만 다시 만들기]나 세 장 아래 연출 [이 장만 다시 만들기]를 누르면 연출 그림이 바뀌며 그린 것이
  //   묻지 않고 사라졌다. 저장해도 다시 만들면 바뀌니 고를 것은 둘 — 계속 그리기 · 버리고 다시 만들기. 시작 · 끝은 그린 것이 남는다(재검토 c 3).
  it('그린 채 연출 장을 다시 만들려 하면 묻고, [버리고 다시 만들기]를 골라야 다시 만든다', async () => {
    expect(redrawRequest('direction', true)).toBe('ask')
    expect(redrawRequest('end', true)).toBe('redraw')
    expect(redrawRequest('start', true)).toBe('redraw')
    expect(redrawRequest('direction', false)).toBe('redraw')
    const redraw = vi.fn()
    await resolveUnsavedClose('keep', { save: async () => true, close: redraw })
    expect(redraw).not.toHaveBeenCalled()
    await resolveUnsavedClose('discard', { save: async () => true, close: redraw })
    expect(redraw).toHaveBeenCalledTimes(1)
    // 다시 만드는 세 자리(입구 A 의 [연출 장만 다시 만들기] · 두 입구의 세 장 아래 단추)가 모두 이 물음을 거친다.
    const a = readFileSync('src/features/writer/storyboard-shot-dialog.tsx', 'utf8')
    const b = readFileSync('src/features/writer/shot-detail-dialog.tsx', 'utf8')
    const still = readFileSync('src/features/writer/rough-frames-still.tsx', 'utf8')
    expect(a).toMatch(/guard\.requestRedraw\('direction', \(\) => void redrawDirection\(\)\)/)
    for (const source of [a, b]) expect(source).toMatch(/confirmRedraw=\{guard\.requestRedraw\}/)
    expect(still).toMatch(/confirmRedraw\(frame, \(\) => void regenerate\(frame\)\)/)
  })

  // 왜(검토 a 54016e65): 그린 채 페이지를 떠나거나 새로 고치면 화살표가 묻지 않고 사라졌다 — 브라우저 기본 물음을 띄우고, 저장하면 풀어 준다.
  it('저장하지 않은 화살표가 있으면 페이지를 떠나거나 새로 고칠 때 브라우저가 묻고, 저장하면 묻지 않는다', () => {
    const page = new EventTarget()
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true })
      page.dispatchEvent(event)
      return event.defaultPrevented
    }
    const release = warnBeforeLeaving(page as unknown as Window, true)
    expect(leave()).toBe(true)
    release()
    expect(leave()).toBe(false)
    warnBeforeLeaving(page as unknown as Window, false)
    expect(leave()).toBe(false)
    // 편집기가 저장하지 않은 화살표(되돌리기 칸)에 따라 묶고 푼다.
    expect(readFileSync('src/features/writer/directing-arrow-editor.tsx', 'utf8')).toMatch(/useEffect\(\(\) => warnBeforeLeaving\(window, dirty\), \[dirty\]\)/)
  })
})
