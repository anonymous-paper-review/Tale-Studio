// 샷 정보를 다 읽기 전 · 못 읽었을 때 Director 캔버스 · 툴바가 "샷이 없음" 대신 불러오는 중 · 불러오지 못함 + [다시 불러오기]를 보이고, 만들기 단추와 두 번 눌러 만들기를 막는지 검사한다 (fb-blur QA 2026-11-23 · 리드, Cinema 와 같은 문구 · 상태)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 화면 말 — 서버 그리기는 스토어의 처음 값(영어)을 읽으므로 번역 훅을 직접 고른 말로 돌린다(Cinema 시험과 같은 방법).
const lang = vi.hoisted(() => ({ locale: 'ko' as 'ko' | 'en' }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate(lang.locale, text, params) }
})

import { DirectorCanvasLoadNote, canvasCreateAllowed, directorCanvasNote, noShotsNoteAllowed } from '@/features/director/canvas-load-note'
import { PickAllBar } from '@/features/director/shot-status'
import { markBoardLoad, retryBoardLoad, useBoardLoadStore } from '@/stores/board-load-store'

const PAGE = 'src/app/studio/director/page.tsx'
const page = () => readFileSync(PAGE, 'utf8')
const note = (value: 'loading' | 'failed' | 'failed-over-canvas', onRetry = () => {}) =>
  renderToStaticMarkup(createElement(DirectorCanvasLoadNote, { note: value, onRetry }))
/** page.tsx 에서 한 함수 몸만 — 이름부터 그다음 같은 들여쓰기의 닫는 줄까지. */
const body = (source: string, start: string, end: string) => {
  const from = source.indexOf(start)
  return from < 0 ? '' : source.slice(from, source.indexOf(end, from))
}

beforeEach(() => {
  lang.locale = 'ko'
  useBoardLoadStore.setState({ projectId: null, status: 'loading', retry: null })
})

describe('Director 판 읽기 — 같이 정한 것(리드 11/23, Cinema 와 같은 문구 · 상태)', () => {
  it('샷 정보를 다시 시도까지 모두 읽지 못하면 빈 캔버스 안내 대신 "샷 정보를 불러오지 못했어요" · "샷은 그대로 있어요. 다시 불러와 주세요."와 [다시 불러오기]를 보이고, 노드가 남아 있으면 캔버스는 그대로 두고 가운데에 같은 글을 띄운다', () => {
    // 왜: 샷 설정 읽기(/api/writer/shot-configs)만 실패해도 Director 가 빈 캔버스에 "Writer에서 씬을 만들면 자동으로 들어와요"를 띄워
    //   샷이 사라진 것처럼 보였다(fb-blur QA 11/23). 이 브라우저에 남은 노드가 있으면 그 노드는 그대로 보이되 읽지 못했다고 알린다.
    expect(directorCanvasNote({ status: 'failed', nodeCount: 0 })).toBe('failed')
    expect(directorCanvasNote({ status: 'failed', nodeCount: 12 })).toBe('failed-over-canvas')
    for (const value of ['failed', 'failed-over-canvas'] as const) {
      const html = note(value)
      expect(html).toContain('샷 정보를 불러오지 못했어요.')
      expect(html).toContain('샷은 그대로 있어요. 다시 불러와 주세요.')
      expect(html).toMatch(/<button[^>]*>[\s\S]*다시 불러오기[\s\S]*<\/button>/)
      expect(html).not.toContain('자동으로 들어와요')
    }
    lang.locale = 'en'
    expect(note('failed')).toContain('Could not load the shots.')
    // 캔버스 위에 띄울 때는 노드를 가리지 않게 글 상자만 누를 수 있다.
    expect(note('failed-over-canvas')).toMatch(/class="pointer-events-none absolute inset-0[^"]*"/)
    // 페이지: 빈 캔버스 안내는 다 읽고 정말 노드가 0개일 때만, 읽기 상태는 그 자리(또는 캔버스 가운데)에 이 조각으로.
    const source = page()
    expect(source).toMatch(/const canvasNote = directorCanvasNote\(\{ status: boardLoad, nodeCount: nodes\.length \}\)/)
    expect(source).toMatch(/\{canvasNote === 'empty' && \(\s*<div className="pointer-events-none absolute inset-0 flex items-center justify-center">\s*<div className="text-center text-label text-muted-foreground">\s*\{t\('Scenes come in automatically once you create them in Writer\.'\)\}/)
    expect(source).toMatch(/\{\(canvasNote === 'loading' \|\| canvasNote === 'failed' \|\| canvasNote === 'failed-over-canvas'\) && \(\s*<DirectorCanvasLoadNote note=\{canvasNote\} onRetry=\{retryBoardLoad\} \/>/)
    expect(source).not.toMatch(/\{nodes\.length === 0 && \(/)
  })

  it('다 읽기 전에는 빈 캔버스 안내 자리에 "샷을 불러오고 있어요."를 보이고, 툴바의 "아직 샷이 없어요."도 다 읽은 뒤 정말 0개일 때만 보인다', () => {
    // 왜: 들어오자마자(읽기 전) 빈 판에 "Writer에서 씬을 만들면…" · 툴바에 "아직 샷이 없어요."가 잠깐 떠, 샷이 없는 프로젝트로 보였다.
    expect(directorCanvasNote({ status: 'loading', nodeCount: 0 })).toBe('loading')
    expect(directorCanvasNote({ status: 'ready', nodeCount: 0 })).toBe('empty')
    const html = note('loading')
    expect(html).toContain('샷을 불러오고 있어요.')
    expect(html).not.toContain('<button')
    lang.locale = 'en'
    expect(note('loading')).toContain('Loading the shots.')
    // 툴바 까닭 줄은 읽기 상태가 먼저 — 그때는 "아직 샷이 없어요."(단추별 까닭)가 아니라 불러오는 중 · 못 불러옴.
    expect(page()).toMatch(/const blockLine = boardLoadLine \? t\(boardLoadLine\) : takesUnknown && takeState\.failed \? t\(TAKES_UNKNOWN_TEXT\) : workBlockLine\(imageBlock, videoBlock, t\)/)
  })

  it('다 읽기 전 · 못 불러옴일 때 툴바 [이미지 만들기] · [영상 만들기]는 꺼지고, 숫자를 적지 않으며, 까닭 한 줄을 보인다', () => {
    // 왜: 읽지 못한 판은 샷이 0개(또는 그림 · Take 없는 샷)로 세어져 숫자가 사실과 다르고, 읽기 전 숫자로 누르면 있는 그림을 다시 그린다(Cinema QA B 와 같은 뿌리).
    const source = page()
    expect(source).toMatch(/const boardLoadLine = boardLoadBlockText\(useBoardLoadStatus\(boardProjectId\)\)/)
    expect(source).toMatch(/disabled=\{imageBlock !== null \|\| boardOff\}/)
    expect(source).toMatch(/aria-describedby=\{imageBlock !== null \|\| boardOff \? 'director-work-block' : undefined\}/)
    expect(source).toMatch(/disabled=\{videoBlock !== null \|\| boardOff\}/)
    expect(source).toMatch(/aria-describedby=\{videoBlock !== null \|\| boardOff \? 'director-work-block' : undefined\}/)
    expect(source).toMatch(/\{!boardOff && \(\s*<>\s*<span aria-hidden className="opacity-60">·<\/span>\s*<span className="font-num tabular-nums">\{imageMode\.shotIds\.length\}<\/span>/)
    expect(source).toMatch(/\{!boardOff && \(\s*<>\s*<span aria-hidden className="opacity-60">·<\/span>\s*<span className="font-num tabular-nums">\{videoWork\.length\}<\/span>/)
    // 단추가 꺼지기 직전에 눌러도 시작하지 않는다.
    expect(source).toMatch(/const runImages = async \(\) => \{\s*if \(boardOff\) return/)
    expect(source).toMatch(/const runVideos = async \(\) => \{\s*if \(boardOff\) return/)
  })

  it('다 읽기 전 · 못 불러옴일 때는 캔버스를 두 번 눌러 씬을 만들지 않는다', () => {
    // 왜: 읽지 못한 판 위에 새 카드가 생기면 다시 읽었을 때 그 판과 섞인다(main 에서도 같은 고장).
    expect(canvasCreateAllowed('loading')).toBe(false)
    expect(canvasCreateAllowed('failed')).toBe(false)
    expect(canvasCreateAllowed('ready')).toBe(true)
    const handler = body(page(), 'const onPaneDoubleClick = useCallback(', '\n  )\n')
    // 누르는 그때의 상태를 읽는다 — 훅 deps 에 넣지 않는다(tests/ops/unstable-hook-deps).
    expect(handler).toMatch(/if \(!canvasCreateAllowed\(boardLoadStatusOf\(useBoardLoadStore\.getState\(\), useDirectorCanvasStore\.getState\(\)\.projectId\)\)\) return[\s\S]*addShotNode\(null, position\)/)
    expect(handler).toMatch(/\[screenToFlowPosition, selectNode\]/)
  })

  it('[다시 불러오기]를 누르면 새로 고침 없이 다시 읽고, 읽히면 노드가 선다', () => {
    // 왜: 잠깐 끊긴 뒤 새로 고치지 않고 이어 가게 — 다시 읽기는 동기화 훅이 적어 둔 일을 부른다(Cinema 와 같은 길).
    let retried = 0
    markBoardLoad('p1', 'failed', () => { retried += 1 })
    retryBoardLoad()
    expect(retried).toBe(1)
    // 조각의 단추가 받은 일을 부르고, 페이지는 그 일로 retryBoardLoad 를 넘긴다(위 첫 시험). 새로 고침은 쓰지 않는다.
    let clicked = 0
    const element = DirectorCanvasLoadNote({ note: 'failed', onRetry: () => { clicked += 1 } })
    const find = (node: unknown): { props: { onClick?: () => void } } | null => {
      if (!node || typeof node !== 'object') return null
      const el = node as { type?: unknown; props?: { onRetry?: () => void; onClick?: () => void; children?: unknown } }
      if (el.props?.onRetry) return { props: { onClick: el.props.onRetry } }
      const kids = el.props?.children
      for (const kid of Array.isArray(kids) ? kids : [kids]) { const hit = find(kid); if (hit) return hit }
      return null
    }
    find(element)?.props.onClick?.()
    expect(clicked).toBe(1)
    expect(readFileSync('src/features/director/canvas-load-note.tsx', 'utf8')).not.toMatch(/location\.reload/)
    // 읽히면(다 읽음) 노드가 있는 캔버스에는 아무 글도 띄우지 않는다.
    expect(directorCanvasNote({ status: 'ready', nodeCount: 12 })).toBeNull()
  })
})

describe('Director 판 읽기 — 혼자 정한 것(되돌리기 쉬움)', () => {
  it('다 읽기 전에 이 브라우저에 남은 노드가 있으면 캔버스를 그대로 두고 불러오는 글을 띄우지 않는다', () => {
    // 왜: 같이 정한 것 2 는 "빈 캔버스 안내 자리"에만 — 노드가 이미 보이면 가운데 글이 노드를 가린다. 못 불러옴이 되면 그때 띄운다.
    expect(directorCanvasNote({ status: 'loading', nodeCount: 12 })).toBeNull()
  })

  it('다 읽기 전 · 못 불러옴일 때는 "이 씬에는 아직 샷이 없어요." 안내도 띄우지 않는다', () => {
    // 왜: 같은 "없음" 안내다 — 읽기 전 씬은 샷이 없어 보일 수 있다. 다 읽은 뒤 정말 없을 때만.
    expect(noShotsNoteAllowed('loading')).toBe(false)
    expect(noShotsNoteAllowed('failed')).toBe(false)
    expect(noShotsNoteAllowed('ready')).toBe(true)
    // 씬 안내 조각이 스스로 읽기 상태를 본다 — 부르는 자리(nodes.length > 0 && !sceneHasShots)는 그대로.
    const note = body(page(), 'function SceneEmptyNote() {', '\n}\n')
    expect(note).toMatch(/const boardLoad = useBoardLoadStatus\(useDirectorCanvasStore\(\(s\) => s\.projectId\)\)\s*if \(!noShotsNoteAllowed\(boardLoad\)\) return null/)
  })

  it('다 읽기 전 · 못 불러옴일 때는 예상 칸을 비우고 [다음: Editor로]를 크림으로 칠하지 않는다(Cinema 와 같게)', () => {
    // 왜: 예상 칸 · 크림도 읽기 전 판으로 센 숫자다 — Cinema 가 같은 자리를 막았다(a76bee8c).
    const source = page()
    // 크림(가장 밝은 단추)은 읽기 전이면 어디에도 칠하지 않는다 — 셈 줄은 그대로 두고 결과만 비운다.
    expect(source).toMatch(/const primary = boardOff \? null : primaryWorkAction\(\{/)
    expect(source).toMatch(/\{estimate && !boardOff && \(/)
  })
})

describe('판 읽기 뒷마무리 — 같이 정한 것(리드 11/23)', () => {
  it('다 읽기 전 · 못 불러옴일 때 캔버스 오른쪽 누르기 메뉴의 카드 만들기와 툴바 [+ 프롬프트 노드]는 카드를 만들지 않는다', () => {
    // 왜: 두 번 누르기와 같은 위험 — 읽지 못한 판 위에 새 카드가 생기면 다시 읽은 판과 섞인다(리드 11/23, 찾은 것).
    const source = page()
    // 빈 캔버스 오른쪽 누르기: 브라우저 메뉴는 막고, 판을 다 읽지 않았으면 만들기 메뉴를 열지 않는다(누르는 그때의 상태).
    const menu = body(source, 'onPaneContextMenu={(event) => {', '\n        }}\n')
    expect(menu).toMatch(/event\.preventDefault\(\)\s*\n\s*(?:\/\/[^\n]*\n\s*)*if \(!canvasCreateAllowed\(boardLoadStatusOf\(useBoardLoadStore\.getState\(\), useDirectorCanvasStore\.getState\(\)\.projectId\)\)\) return[\s\S]*setContextMenu\(\{\s*type: 'pane'/)
    // 툴바 [+ 프롬프트 노드]: 꺼지고, 눌러도 만들지 않는다.
    const prompt = body(source, "t('Adds a standalone prompt node.", "</button>")
    const button = source.slice(source.lastIndexOf('<button', source.indexOf("t('Adds a standalone prompt node.")), source.indexOf("t('Adds a standalone prompt node."))
    expect(button).toMatch(/disabled=\{boardOff\}/)
    expect(button).toMatch(/onClick=\{\(\) => \{\s*if \(boardOff\) return\s*addPromptNode\(promptNodePlace\(/)
    expect(prompt).toContain("t('Prompt node')")
  })

  it('다 읽기 전 · 못 불러옴일 때 고르기 줄은 "전체 0개" 대신 숫자를 적지 않는다', () => {
    // 왜: 읽다 만 판으로 센 "전체 0개"는 샷이 없는 것처럼 보인다(리드 11/23, 찾은 것).
    const off = renderToStaticMarkup(createElement(PickAllBar, { total: 0, picked: 0, countShown: false, onToggleAll: () => {}, onClear: () => {} }))
    // 화면에 보이는 글만(속성 · 모양 이름의 숫자는 빼고) 본다.
    const shown = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    expect(off).toContain('>전체</span>')
    expect(shown(off)).toBe('전체')
    const offPicked = renderToStaticMarkup(createElement(PickAllBar, { total: 3, picked: 1, countShown: false, onToggleAll: () => {}, onClear: () => {} }))
    expect(offPicked).toContain('>전체</span>')
    expect(shown(offPicked)).not.toMatch(/\d/)
    // 다 읽은 뒤는 지금 그대로.
    const on = renderToStaticMarkup(createElement(PickAllBar, { total: 3, picked: 0, onToggleAll: () => {}, onClear: () => {} }))
    expect(on).toContain('전체 3개')
    lang.locale = 'en'
    expect(renderToStaticMarkup(createElement(PickAllBar, { total: 0, picked: 0, countShown: false, onToggleAll: () => {}, onClear: () => {} }))).toContain('>All</span>')
    expect(page()).toMatch(/<PickAllBar\s+total=\{visibleShotIds\.length\}\s+picked=\{picked\.size\}\s+countShown=\{!boardOff\}/)
  })
})
