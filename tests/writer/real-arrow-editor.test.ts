// 콘티 화살표 편집기를 실사 가운데 장(N4b)에도 쓰는지 — 실사 주소로 보내기 · 실사용 읽은 줄 알림 · 그 샷을 그리는 중 잠금 · 콘티는 지금 그대로 — 를 검사한다
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

import { DirectingArrowEditor, arrowSaveNeeded, directingEditUrl, saveImageDataUrl } from '@/features/writer/directing-arrow-editor'
import { directingSaveBody } from '@/lib/writer/directing-edit-url'
import { KO as messagesKo } from '@/lib/i18n/messages-ko'

// 이 시험을 위해 지은 실사 가운데 장 — 사람이 고친 화살표를 AI 가 읽은 줄이 있고, 끝 장은 아직 그 줄로 그리지 않았다.
const FRAMES = { start: 'https://media.test/r/start.png', direction: 'https://media.test/r/direction.png', end: 'https://media.test/r/end.png' }
const READ = { en: 'She stands and walks out to the right.', ko: '그녀가 일어나 오른쪽으로 나간다.', source: 'ai', direction: FRAMES.direction, at: 1, endDrawn: null }
const panel = (directionRead: unknown = READ) => ({ url: FRAMES.start, status: 'completed' as const, errorMessage: null, generatedAt: 5, frames: FRAMES, directionRead })
const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(DirectingArrowEditor, { projectId: 'p1', shotId: 'sh_1', panel: panel(), onSaved: () => {}, onRedrawEnd: () => {}, ...props }))

describe('실사 가운데 장 편집기', () => {
  // 왜: 콘티 편집기와 같은 부품을 쓰되 층 나누기 · 저장은 실사 시트(shots.storyboard_image)를 바꿔야 한다 — 콘티 주소로 가면 목각 러프가 바뀐다.
  it('실사 편집기는 층 나누기 · 저장을 실사 주소로 보내고 콘티 편집기는 지금 주소로 보낸다', () => {
    expect(directingEditUrl('real')).toBe('/api/storyboard/real-directing-edit')
    expect(directingEditUrl('rough')).toBe('/api/writer/rough-directing-edit')
    expect(directingEditUrl()).toBe('/api/writer/rough-directing-edit')
    const source = readFileSync('src/features/writer/directing-arrow-editor.tsx', 'utf8')
    // 층 나누기 · 저장 두 요청이 모두 이 주소를 쓴다(편집기 안에 박힌 주소가 남지 않는다).
    expect(source.match(/fetch\(directingEditUrl\(surface\), \{/g)?.length).toBe(2)
    expect(source).not.toMatch(/fetch\('\/api\/writer\/rough-directing-edit'/)
  })

  // 왜: 다른 창에서 다른 판을 [채택]한 사이 저장하면 다른 판의 가운데 장 위에 그린 그림이 지금 판의 시작 · 끝과 짝지어진다 — 서버가 거절하게 고친 장 주소를 같이 보낸다.
  it('실사 편집기는 저장할 때 고친 가운데 장 주소를 같이 보내고 콘티 편집기는 지금 모양 그대로 보낸다', () => {
    expect(directingSaveBody('real', { projectId: 'p1', shotId: 'sh_1', image: 'data:x', direction: FRAMES.direction })).toEqual({ action: 'save', projectId: 'p1', shotId: 'sh_1', image: 'data:x', direction: FRAMES.direction })
    expect(directingSaveBody('rough', { projectId: 'p1', shotId: 'sh_1', image: 'data:x', direction: FRAMES.direction })).toEqual({ action: 'save', projectId: 'p1', shotId: 'sh_1', image: 'data:x' })
    expect(readFileSync('src/features/writer/directing-arrow-editor.tsx', 'utf8')).toMatch(/body: JSON\.stringify\(directingSaveBody\(surface, \{/)
  })

  // 왜: 실사는 저장하면 묻지 않고 끝 장을 다시 그린다(N4b) — 콘티 알림("끝 장을 다시 그린 뒤 실사도 다시 그려야")은 실사에서는 틀린 말이다.
  //   끝 장을 그리는 중이거나 실패해 아직 그 줄로 안 그렸으면 그렇다고, 영상에는 그 줄이 들어간다고(리드 — 영상은 실사 줄을 쓴다) 알린다.
  it('실사 편집기 아래 읽은 줄이 아직 끝 장에 안 쓴 줄이면 끝 장은 아직 그 줄로 그리지 않았고 영상에는 그 줄이 들어간다고 알린다', () => {
    const real = render({ surface: 'real' })
    expect(real).toContain(READ.en)
    expect(real).toContain('The end frame is not drawn from this line yet. Videos use this line.')
    expect(real).not.toContain('Videos use this line. To match, redraw the end frame with it, then the live-action images.')
    expect(messagesKo['The end frame is not drawn from this line yet. Videos use this line.']).toBe('끝 장은 아직 이 줄로 그리지 않았어요. 영상에는 이 줄이 들어가요.')
    const drawn = render({ surface: 'real', panel: panel({ ...READ, endDrawn: FRAMES.end }) })
    expect(drawn).toContain(READ.en)
    expect(drawn).not.toContain('The end frame is not drawn from this line yet.')
  })

  // 왜: 정상 경로 고정 — 콘티 편집기 아래 알림은 지금 문장 그대로다(m-director 가 되돌린 dev 문장).
  it('콘티 편집기 아래 알림은 지금 문장 그대로다', () => {
    const rough = render({})
    expect(rough).toContain('Videos use this line. To match, redraw the end frame with it, then the live-action images.')
    expect(rough).not.toContain('The end frame is not drawn from this line yet.')
  })

  // 왜(혼자 정한 것 g): 끝 장이 오기 전에 또 저장하면 옛 줄의 끝 장이 새 판에 끼거나 엉뚱한 작업을 기다린다 — 그 샷을 그리는 동안은 고칠 수 없게 하고 까닭을 보인다.
  it('그 샷을 그리는 중이면 실사 편집기는 그리기 · 층 나누기 · 저장을 끄고 까닭을 보인다', () => {
    const reason = 'This shot is being drawn. You can change it when it is done.'
    const locked = render({ surface: 'real', lockedReason: reason })
    expect(locked).toContain(reason)
    expect(locked).toContain('data-locked="true"')
    // 까닭을 보이는 동안은 "그리던 줄이 아직" 알림을 겹쳐 보이지 않는다.
    expect(locked).not.toContain('The end frame is not drawn from this line yet.')
    expect(render({ surface: 'real' })).not.toContain('data-locked="true"')
  })
})

describe('검토 rev-realarrow — 실사 편집기', () => {
  // 왜(검토 rev-realarrow 3): 그린 것 없이 저장하면 새 판이 하나 더 생기고 읽은 줄이 낡는다(가운데 장 주소가 바뀐다) — 실사는 그린 것이 있을 때만 저장한다.
  it('실사 편집기는 그린 것이 없으면 저장하지 않고, 콘티 편집기는 지금처럼 저장한다', () => {
    expect(arrowSaveNeeded('real', false)).toBe(false)
    expect(arrowSaveNeeded('real', true)).toBe(true)
    expect(arrowSaveNeeded('rough', false)).toBe(true)
    const source = readFileSync('src/features/writer/directing-arrow-editor.tsx', 'utf8')
    expect(source).toMatch(/if \(!arrowSaveNeeded\(surface, hadStrokes\)\) return true/)
    expect(source).toMatch(/disabled=\{busy \|\| !ready \|\| !arrowSaveNeeded\(surface, undoCount > 0\)\}/)
  })

  // 왜(리드 D): 16:9 큰 칸 PNG 가 요청 몸 상한(4.5MB)에 닿지 않게 — 실사 길은 PNG 가 3MB 를 넘으면 JPEG 로 보낸다. 콘티는 서버가 PNG 만 받아 늘 PNG.
  it('실사 편집기는 저장할 PNG 가 3MB 를 넘으면 JPEG 로 보내고, 콘티는 늘 PNG 로 보낸다', () => {
    const canvas = (pngLength: number) => ({ toDataURL: (type?: string) => (type === 'image/jpeg' ? 'data:image/jpeg;base64,J' : `data:image/png;base64,${'P'.repeat(pngLength)}`) })
    expect(saveImageDataUrl(canvas(10), 'real')).toMatch(/^data:image\/png/)
    expect(saveImageDataUrl(canvas(3 * 1024 * 1024), 'real')).toBe('data:image/jpeg;base64,J')
    expect(saveImageDataUrl(canvas(3 * 1024 * 1024), 'rough')).toMatch(/^data:image\/png/)
    expect(readFileSync('src/features/writer/directing-arrow-editor.tsx', 'utf8')).toMatch(/image: saveImageDataUrl\(out, surface\)/)
  })

  // 왜(같이 정한 것 · 리드 · D10): [그대로]로 남긴 고친 줄도 편집기 아래에 남는다 — 누가 쓴 줄인지 이름표로 보인다(실사 편집기도 콘티와 같다).
  it('AI 가 읽은 움직임 한 줄이 편집기 아래에 보이고, 사람이 고친 줄이면 "고친 움직임"이다', () => {
    const ai = render({ surface: 'real' })
    expect(ai).toContain('data-testid="directing-read-line"')
    expect(ai).toContain(READ.en)
    expect(ai).toContain('Motion the AI read')
    expect(ai).not.toContain('Edited movement')
    const user = render({ surface: 'real', panel: panel({ ...READ, source: 'user', en: 'She sits back down.' }) })
    expect(user).toContain('She sits back down.')
    expect(user).toContain('Edited movement')
    expect(user).not.toContain('Motion the AI read')
  })
})
