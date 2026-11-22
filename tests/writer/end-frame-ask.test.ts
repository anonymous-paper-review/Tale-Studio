// 가운데 장에 그린 화살표를 저장하면 끝 장도 다시 그릴지 묻고(읽은 한 줄을 보이고 고칠 수 있게), 고른 대로만 끝 장을 다시 그리는지 검사한다(D10 · 2026-11-22 리드 Q2 · 오너 Q1 · Q3)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { askLineText, canRedrawEnd, editedLinePayload, endAskAfterSave, redrawEndFrame, resolveEndAsk, roughFrameRedrawBody, type EndRedrawDeps } from '@/lib/writer/end-frame-ask'
import { applyDirectionTab } from '@/features/writer/unsaved-arrows-confirm'
import { DirectingArrowEditor } from '@/features/writer/directing-arrow-editor'
import { mergeRoughFrame } from '@/lib/writer/directing-edit'
import { KO as messagesKo } from '@/lib/i18n/messages-ko'

const read = (rel: string) => readFileSync(rel, 'utf8')
const LINE = { en: 'The figure on the left walks out of frame to the right.', ko: '왼쪽 인물이 화면 오른쪽 밖으로 걸어 나간다.', source: 'ai' as const, direction: 'd', at: 1, endDrawn: null }

function deps(post: EndRedrawDeps['post'], waitJob: EndRedrawDeps['waitJob'] = async () => undefined) {
  return {
    post: vi.fn(post),
    waitJob: vi.fn(waitJob),
    reload: vi.fn(async () => undefined),
    notify: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
    messages: { drawing: 'drawing', done: 'done', failed: 'failed', unreadable: 'unreadable', translateFailed: 'translate-failed' },
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

  // 왜: 요청이 안 닿거나 끝 장 작업이 실패 · 버려지면 서버는 끝 장을 바꾸지 않는다 — 그대로라고 알리고, 같은 줄로 한 번 더 그릴 수 있게 한다.
  //   2026-11-22(오너 Q1 · Q3): 끝 장은 작업으로 그려 작업이 끝날 때까지 기다린다 — 작업 실패도 같은 알림.
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
    // 작업이 실패해도(그사이 러프가 바뀌어 버려짐 포함) 끝 장은 그대로다.
    const failedJob = deps(async () => ({ ok: true, jobId: 'job-1' }), async () => { throw new Error('[finalize] The rough changed') })
    await expect(redrawEndFrame('p1', 'sh_1', failedJob)).resolves.toBe(false)
    expect(failedJob.reload).not.toHaveBeenCalled()
    expect(failedJob.notify.error.mock.calls[0][0]).toBe('failed')
  })

  // 왜(정상 경로 고정): 다시 그린 뒤 샷 목록을 새로 읽어야 카드 · 팝업에 새 끝 장이 보인다(2026-10-31 실측: 안 읽으면 옛 그림이 남았다).
  //   그리기는 1분 넘게 걸린다 — 요청은 작업 번호만 돌려주고, 화면은 그 작업이 끝날 때까지 기다린다(리드 9 "적게 말하지 않는 문구").
  it('끝 장 다시 그리기가 끝나면 샷 목록을 새로 읽고 다시 그렸다고 알린다', async () => {
    const d = deps(async () => ({ ok: true, jobId: 'job-1' }))
    await expect(redrawEndFrame('p1', 'sh_1', d)).resolves.toBe(true)
    expect(d.post).toHaveBeenCalledWith({ action: 'regenerate-frame', projectId: 'p1', shotId: 'sh_1', frame: 'end' })
    expect(d.notify.info).toHaveBeenCalledWith('drawing')
    expect(d.waitJob).toHaveBeenCalledWith('job-1')
    expect(d.waitJob.mock.invocationCallOrder[0]).toBeLessThan(d.reload.mock.invocationCallOrder[0])
    expect(d.notify.success).toHaveBeenCalledWith('done')
    const confirm = read('src/features/writer/unsaved-arrows-confirm.tsx')
    expect(confirm).toMatch(/reload: \(\) => reloadAfterRoughFrameEdit\(target\.projectId, target\.onRedrawn\)/)
    expect(confirm).toMatch(/waitJob: \(jobId\) => pollGenerationJob\(jobId\)/)
    expect(messagesKo['Redrawing the end frame, which takes over a minute']).toBe('끝 장을 다시 그리는 중이에요. 1분 넘게 걸려요.')
    expect(messagesKo['The start and directing frames stay as they are. Only the end frame is redrawn, which takes over a minute.']).toBe('시작 · 연출 장은 그대로 두고 끝 장만 다시 그려요. 1분 넘게 걸려요.')
  })

  // 왜: 끝 장 [이 장만 다시 만들기]와 물음의 [다시 그리기]가 다른 길로 그리면 같은 "끝 장 다시 그리기"가 다른 그림을 낸다 — 끝 장 그리는 방식은 서버 한 곳이 정한다.
  it('끝 장 [이 장만 다시 만들기]와 물음의 [다시 그리기]는 같은 요청을 보낸다', () => {
    const still = read('src/features/writer/rough-frames-still.tsx')
    expect(still).toMatch(/body: JSON\.stringify\(\{ action: 'regenerate-frame', projectId, shotId, frame \}\)/)
    expect(still).toMatch(/if \(frame === 'end'\) \{\s*await redrawEndFrame\(projectId, shotId, endRedrawDeps\(/)
    expect(Object.keys(roughFrameRedrawBody('p1', 'sh_1', 'end'))).toEqual(['action', 'projectId', 'shotId', 'frame'])
    const confirm = read('src/features/writer/unsaved-arrows-confirm.tsx')
    expect(confirm).toMatch(/body: JSON\.stringify\(body\)/)
  })
})

describe('물음 창의 읽은 한 줄', () => {
  // 왜(혼자 정한 것 b · e): 사람이 그리기 전에 줄을 보고 고칠 수 있게 — 읽는 7~11초 동안은 그릴 줄이 없다.
  //   줄은 화면 말로 보인다(한국어 화면 = 한국어 줄, 없으면 영어 줄 · 영어 화면 = 영어 줄).
  it('물음 창은 줄을 읽는 동안 [다시 그리기]를 잠그고, 다 읽으면 화면 말로 줄을 보인다', () => {
    expect(canRedrawEnd({ reading: true, text: LINE.ko })).toBe(false)
    expect(canRedrawEnd({ reading: false, text: LINE.ko })).toBe(true)
    expect(askLineText(LINE, 'ko')).toBe(LINE.ko)
    expect(askLineText(LINE, 'en')).toBe(LINE.en)
    expect(askLineText({ ...LINE, ko: null }, 'ko')).toBe(LINE.en)
    const confirm = read('src/features/writer/unsaved-arrows-confirm.tsx')
    expect(confirm).toMatch(/t\('Reading the arrows…'\)/)
    expect(messagesKo['Reading the arrows…']).toBe('화살표를 읽는 중…')
  })

  // 왜(혼자 정한 것 f): 읽는 AI 가 못 읽으면 줄 없이 그리면 ② 가 아니다 — 사람이 줄을 적어야 그린다.
  it('읽지 못했으면 빈 줄과 직접 적으라는 말을 보이고, 줄을 적어야 [다시 그리기]가 켜진다', () => {
    expect(askLineText(null, 'ko')).toBe('')
    expect(canRedrawEnd({ reading: false, text: '  ' })).toBe(false)
    expect(canRedrawEnd({ reading: false, text: '왼쪽 인물이 쓰러진다' })).toBe(true)
    const confirm = read('src/features/writer/unsaved-arrows-confirm.tsx')
    expect(confirm).toMatch(/t\('The AI could not read the arrows\. Write the motion yourself\.'\)/)
    expect(messagesKo['The AI could not read the arrows. Write the motion yourself.']).toBe('AI 가 화살표를 읽지 못했어요. 움직임을 직접 적어 주세요.')
  })

  // 왜(혼자 정한 것 c · d): 고친 줄은 다시 읽지 않고 그대로 지시가 된다 — 화면 말을 같이 보내 서버가 한국어면 영어로 옮긴다. 안 고쳤으면 서버의 읽은 줄을 쓴다.
  it('사람이 줄을 고치면 고친 줄과 화면 말을 같이 보내고, 안 고쳤으면 줄을 보내지 않는다', () => {
    expect(editedLinePayload(LINE, LINE.ko, 'ko')).toBeNull()
    expect(editedLinePayload(LINE, `  ${LINE.en} `, 'en')).toBeNull()
    expect(editedLinePayload(LINE, '왼쪽 인물이 바닥에 쓰러진다.', 'ko')).toEqual({ text: '왼쪽 인물이 바닥에 쓰러진다.', lang: 'ko' })
    expect(editedLinePayload(null, 'Camera pulls back.', 'en')).toEqual({ text: 'Camera pulls back.', lang: 'en' })
    expect(roughFrameRedrawBody('p1', 'sh_1', 'end', { text: 'Camera pulls back.', lang: 'en' })).toEqual({ action: 'regenerate-frame', projectId: 'p1', shotId: 'sh_1', frame: 'end', line: { text: 'Camera pulls back.', lang: 'en' } })
  })

  // 왜: 서버가 못 읽었거나(줄 없음) 한국어 줄을 옮기지 못하면 그림 값을 쓰지 않는다 — 그 까닭을 화면 말로 알린다(서버 글은 화면 말이 아닐 수 있다).
  it('읽는 AI 가 못 읽어 그리지 못했거나 고친 줄을 영어로 옮기지 못했으면 그 까닭을 화면 말로 알린다', async () => {
    const unreadable = deps(async () => ({ ok: false, code: 'direction_unreadable', error: '서버 글' }))
    await redrawEndFrame('p1', 'sh_1', unreadable)
    expect(unreadable.notify.error.mock.calls[0][0]).toBe('unreadable')
    const translate = deps(async () => ({ ok: false, code: 'direction_translate_failed', error: '서버 글' }))
    await redrawEndFrame('p1', 'sh_1', translate, { text: '쓰러진다', lang: 'ko' })
    expect(translate.notify.error.mock.calls[0][0]).toBe('translate-failed')
    expect(translate.post.mock.calls[0][0]).toMatchObject({ line: { text: '쓰러진다', lang: 'ko' } })
  })
})

describe('연출 탭의 읽은 한 줄', () => {
  const panel = (directionRead: unknown) => ({
    url: 'https://media.test/r/start.png',
    status: 'completed' as const,
    errorMessage: null,
    generatedAt: 5,
    frames: { start: 'https://media.test/r/start.png', direction: 'https://media.test/r/direction.png', end: 'https://media.test/r/end.png' },
    directionRead,
  })
  const render = (directionRead: unknown) =>
    renderToStaticMarkup(createElement(DirectingArrowEditor, { projectId: 'p1', shotId: 'sh_1', panel: panel(directionRead), onSaved: () => {}, onRedrawEnd: () => {} }))

  // 왜(리드 Q-b · D2): 물음 창을 닫은 뒤에도 줄을 보고 고칠 수 있게 연출 탭 편집기 아래에 둔다. [그대로]를 고른 줄은 영상에는 이미 들어가지만
  //   (리드 D2 2026-11-23 — 영상은 지금 연출 장을 읽은 줄을 쓴다) 끝 장 · 실사에는 아직 안 쓰였다 — 실사는 끝 장을 그 줄로 그린 뒤에만 줄을 싣는다.
  //   2026-11-23 문장 바꿈(리드 D2): 예전 '…아직 끝 장에 안 쓴 줄이면 그렇다고 알린다' — 그때 알림은 "아직 쓰지 않은 줄이에요(끝 장 · 영상)"였다.
  it('연출 탭 편집기 아래에 지금 연출 장을 읽은 줄과 [고쳐서 끝 장 다시 그리기]가 보이고, 아직 끝 장에 안 쓴 줄이면 영상에는 들어가고 끝 장 · 실사는 다시 그려야 맞는다고 알린다', () => {
    const unused = render({ ...LINE, direction: 'https://media.test/r/direction.png' })
    expect(unused).toContain(LINE.en) // 시험은 영어 화면(기본 말)이다.
    expect(unused).toContain('Edit and redraw the end frame')
    expect(unused).toContain('Videos use this line. To match, redraw the end frame with it, then the live-action images.')
    expect(messagesKo['Videos use this line. To match, redraw the end frame with it, then the live-action images.']).toBe('영상에는 이 줄이 들어가요. 끝 장을 이 줄로 다시 그린 뒤 실사도 다시 그려야 맞아요.')
    const used = render({ ...LINE, direction: 'https://media.test/r/direction.png', endDrawn: 'https://media.test/r/end.png' })
    expect(used).toContain(LINE.en)
    expect(used).not.toContain('Videos use this line.')
    // 줄이 없거나 낡았으면(옛 연출 장을 읽은 줄) 보이지 않는다.
    expect(render({ ...LINE, direction: 'https://media.test/r/old-direction.png' })).not.toContain(LINE.en)
    for (const rel of ['src/features/writer/storyboard-shot-dialog.tsx', 'src/features/writer/shot-detail-dialog.tsx']) {
      expect(read(rel), rel).toMatch(/onRedrawEnd=\{\(\) => guard\.askEnd\(/)
    }
    expect(messagesKo['Edit and redraw the end frame']).toBe('고쳐서 끝 장 다시 그리기')
  })
})
