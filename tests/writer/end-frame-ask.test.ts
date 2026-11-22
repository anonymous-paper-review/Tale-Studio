// 가운데 장에 그린 화살표를 저장하면 끝 장도 다시 그릴지 묻고, 고른 대로만 끝 장을 다시 그리는지 검사한다(D10 · 2026-11-22 리드 Q2 "저장할 때마다 묻기")
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { endAskAfterSave, redrawEndFrame, resolveEndAsk, roughFrameRedrawBody, type EndRedrawDeps } from '@/lib/writer/end-frame-ask'
import { applyDirectionTab } from '@/features/writer/unsaved-arrows-confirm'
import { mergeRoughFrame } from '@/lib/writer/directing-edit'

const read = (rel: string) => readFileSync(rel, 'utf8')

function deps(post: EndRedrawDeps['post']) {
  return {
    post: vi.fn(post),
    reload: vi.fn(async () => undefined),
    notify: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
    messages: { drawing: 'drawing', done: 'done', failed: 'failed' },
  }
}

describe('가운데 장을 저장한 뒤 끝 장 물음', () => {
  // 왜: 화살표를 고쳐 저장해도 끝 장은 옛 움직임 그대로라 세 장이 서로 다른 이야기를 했다(피드백 7 · D10).
  //   약속 I(러프 세 장은 저절로 안 바뀐다) 대로 저절로 바꾸지 않고, 저장하는 세 길(편집기 [저장] · 창 [적용] · [저장하고 닫기]) 모두에서 묻는다.
  it('가운데 장에 그린 화살표를 저장하면([저장] · 창 [적용] · [저장하고 닫기]) 끝 장도 이 화살표대로 다시 그릴지 묻는다', () => {
    expect(endAskAfterSave(true)).toBe('ask')
    const editor = read('src/features/writer/directing-arrow-editor.tsx')
    // 세 길이 모두 편집기의 같은 저장을 거친다 — 창 [적용] · [저장하고 닫기]는 편집기 save() 를 부른다.
    expect(editor).toMatch(/useImperativeHandle\(ref, \(\) => \(\{ save: \(\) => handleSave\(\) \}\)\)/)
    expect(editor).toMatch(/if \(endAskAfterSave\(hadStrokes\) === 'ask'\) await onArrowsSaved\?\.\(\)/)
    // 두 입구(Storyboard 샷 고치기 창 · Director 연출 화살표 편집 창)가 같은 물음을 띄운다.
    for (const rel of ['src/features/writer/storyboard-shot-dialog.tsx', 'src/features/writer/shot-detail-dialog.tsx']) {
      const dialog = read(rel)
      expect(dialog, rel).toMatch(/onArrowsSaved=\{\(\) => guard\.askEnd\(/)
      expect(dialog, rel).toMatch(/<EndRedrawAsk \{\.\.\.guard\.endAsk\} \/>/)
    }
    // 따로 있던 [저장 후 END 재생성] 단추는 물음으로 합쳤다.
    expect(editor).not.toMatch(/Save, then regenerate END/)
  })

  // 왜: [다시 그리기]는 끝 장 한 장만 바꾼다 — 시작 · 가운데(방금 고친 화살표)가 함께 바뀌면 고친 것이 사라진다.
  it('물음에서 [다시 그리기]를 고르면 끝 장만 다시 그리고 시작 · 가운데 장은 그대로 둔다', () => {
    const redraw = vi.fn()
    expect(resolveEndAsk('redraw', redraw)).toBe(true)
    expect(redraw).toHaveBeenCalledTimes(1)
    expect(roughFrameRedrawBody('p1', 'sh_1', 'end')).toEqual({ action: 'regenerate-frame', projectId: 'p1', shotId: 'sh_1', frame: 'end' })
    const rough = { status: 'completed', generatedAt: 1, frames: { start: 's', direction: 'd-edited', end: 'e' } }
    expect(mergeRoughFrame(rough, 'end', 'e2', 2).frames).toEqual({ start: 's', direction: 'd-edited', end: 'e2' })
  })

  // 왜: 다시 그리기는 그림 한 장이 든다 — 고르지 않았거나 창을 닫으면(Esc · ✕) 아무것도 그리지 않는다.
  it('물음에서 [그대로]를 고르거나 창을 닫으면 끝 장을 다시 그리지 않는다', () => {
    const redraw = vi.fn()
    expect(resolveEndAsk('keep', redraw)).toBe(false)
    expect(redraw).not.toHaveBeenCalled()
    const confirm = read('src/features/writer/unsaved-arrows-confirm.tsx')
    expect(confirm).toMatch(/onOpenChange=\{\(next\) => \{ if \(!next\) onChoose\('keep'\) \}\}/)
  })

  // 왜: 길이만 바꾼 [적용]이나 그린 것 없는 [저장]은 끝 장과 상관없다 — 묻지 않는다.
  it('화살표 없이 길이만 바꿔 [적용]하거나 그린 것 없이 [저장]하면 끝 장을 묻지 않는다', async () => {
    expect(endAskAfterSave(false)).toBe('skip')
    const saveArrows = vi.fn(async () => true)
    const saveDuration = vi.fn(async () => undefined)
    await applyDirectionTab({ arrowsDirty: false, durationDirty: true }, { saveArrows, saveDuration, close: vi.fn() })
    expect(saveArrows).not.toHaveBeenCalled()
    expect(saveDuration).toHaveBeenCalledTimes(1)
  })

  // 왜: 실패하면 서버는 끝 장을 바꾸지 않는다 — 그대로라고 알리고, 같은 끝 장 다시 그리기를 한 번 더 누를 수 있게 한다.
  it('끝 장 다시 그리기가 실패하면 끝 장은 그대로이고 [다시 시도]가 달린 알림을 띄운다', async () => {
    const d = deps(async () => ({ ok: false, error: 'HTTP 500' }))
    await expect(redrawEndFrame('p1', 'sh_1', d)).resolves.toBe(false)
    expect(d.reload).not.toHaveBeenCalled()
    expect(d.notify.success).not.toHaveBeenCalled()
    expect(d.notify.error).toHaveBeenCalledTimes(1)
    const [message, retry] = d.notify.error.mock.calls[0]
    expect(message).toBe('failed')
    retry()
    expect(d.post).toHaveBeenCalledTimes(2)
    expect(d.post.mock.calls[1][0]).toEqual(roughFrameRedrawBody('p1', 'sh_1', 'end'))
    // 요청이 아예 안 닿아도 같은 길이다.
    const thrown = deps(async () => { throw new Error('offline') })
    await expect(redrawEndFrame('p1', 'sh_1', thrown)).resolves.toBe(false)
    expect(thrown.notify.error).toHaveBeenCalledTimes(1)
  })

  // 왜(정상 경로 고정): 다시 그린 뒤 샷 목록을 새로 읽어야 카드 · 팝업에 새 끝 장이 보인다(2026-10-31 실측: 안 읽으면 옛 그림이 남았다).
  it('끝 장 다시 그리기가 끝나면 샷 목록을 새로 읽고 다시 그렸다고 알린다', async () => {
    const d = deps(async () => ({ ok: true }))
    await expect(redrawEndFrame('p1', 'sh_1', d)).resolves.toBe(true)
    expect(d.post).toHaveBeenCalledWith({ action: 'regenerate-frame', projectId: 'p1', shotId: 'sh_1', frame: 'end' })
    expect(d.notify.info).toHaveBeenCalledWith('drawing')
    expect(d.reload).toHaveBeenCalledTimes(1)
    expect(d.notify.success).toHaveBeenCalledWith('done')
    const confirm = read('src/features/writer/unsaved-arrows-confirm.tsx')
    expect(confirm).toMatch(/reload: \(\) => reloadAfterRoughFrameEdit\(target\.projectId, target\.onRedrawn\)/)
  })

  // 왜: 두 단추가 다른 길로 그리면 같은 "끝 장 다시 그리기"가 다른 그림을 낸다 — 끝 장 그리는 방식은 서버 한 곳이 정한다.
  it('끝 장 [이 장만 다시 만들기]와 물음의 [다시 그리기]는 같은 요청을 보낸다', () => {
    const still = read('src/features/writer/rough-frames-still.tsx')
    expect(still).toMatch(/body: JSON\.stringify\(\{ action: 'regenerate-frame', projectId, shotId, frame \}\)/)
    expect(Object.keys(roughFrameRedrawBody('p1', 'sh_1', 'end'))).toEqual(['action', 'projectId', 'shotId', 'frame'])
    const confirm = read('src/features/writer/unsaved-arrows-confirm.tsx')
    expect(confirm).toMatch(/body: JSON\.stringify\(body\)/)
  })
})
