// 왼쪽 레일의 Take · 공유 · 내보내기 · Help 가 화면 높이와 상관없이 늘 [메뉴] 하나로 접혀 있고, 프로필은 레일에 남는지 검사한다 (오너 2026-11-26 m1126 G2)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { SidebarActions } from '@/components/layout/sidebar-actions'

const css = readFileSync('src/components/layout/sidebar-responsive.css', 'utf8')
const sidebar = readFileSync('src/components/layout/sidebar.tsx', 'utf8')

/** 레일 아래 묶음을 그린다 — 네 단추와 프로필 자리에 표시만 둔다. */
function rail(blocked = false) {
  const item = (name: string) => createElement('span', { key: name, 'data-marker': name }, name)
  return renderToStaticMarkup(
    createElement(SidebarActions, {
      blocked,
      profile: createElement('span', { 'data-marker': 'profile' }, 'profile'),
      children: [item('take'), item('share'), item('export'), item('help')],
    }),
  )
}

/** class 에 그 이름(낱말 하나 그대로)이 든 첫 div 의 [시작, 끝) — 정적 그림에서 무엇이 그 안에 들었는지 가린다. */
function divRange(html: string, className: string): [number, number] {
  const start = html.search(new RegExp(`<div[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"`))
  if (start < 0) throw new Error(`no div .${className}`)
  const tag = /<\/?div\b[^>]*>/g
  tag.lastIndex = start
  let depth = 0
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1
    if (depth === 0) return [start, m.index + m[0].length]
  }
  throw new Error(`unclosed div .${className}`)
}
const inside = (html: string, className: string, marker: string) => {
  const [from, to] = divRange(html, className)
  const at = html.indexOf(`data-marker="${marker}"`)
  return at > from && at < to
}

/** @media 묶음을 뺀 맨 바깥 규칙만 — 화면 높이와 상관없이 늘 걸리는 규칙. */
function topLevelRules(source: string): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    const media = source.indexOf('@media', i)
    if (media < 0) {
      out += source.slice(i)
      break
    }
    out += source.slice(i, media)
    let depth = 0
    let j = source.indexOf('{', media)
    for (; j < source.length; j++) {
      if (source[j] === '{') depth++
      else if (source[j] === '}' && --depth === 0) break
    }
    i = j + 1
  }
  return out.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('레일 아래 단추는 늘 [메뉴] 안에', () => {
  // 왜: 오너 2026-11-26 "왼쪽 사이드바 햄버거 버튼 만들어서 Take, 공유, 내보내기, Help 줄이기". 예전에는 높이 800px 이하에서만 접혔다(285305c2).
  it('화면 높이와 상관없이 Take · 공유 · 내보내기 · Help 는 레일의 [메뉴] 단추 하나로 접혀 있다', () => {
    const html = rail()
    expect(html).toMatch(/<button[^>]*aria-label="메뉴"[^>]*aria-expanded="false"/)
    for (const name of ['take', 'share', 'export', 'help']) expect(inside(html, 'sidebar-actions-panel', name), name).toBe(true)
    const always = topLevelRules(css)
    // 닫힌 메뉴 판은 화면 높이와 상관없이 숨는다 — [메뉴] 단추는 어느 높이에서도 숨기지 않는다.
    expect(always).toMatch(/\.sidebar-actions:not\(\[data-open\]\)\s+\.sidebar-actions-panel\s*\{[^}]*display:\s*none/)
    expect(always).toMatch(/\.sidebar-actions-panel\s*\{[^}]*position:\s*absolute/)
    expect(css).not.toMatch(/\.sidebar-actions-toggle\s*\{[^}]*display:\s*none/)
  })

  // 왜: 요청에는 네 단추만 적혔다(리드 추천 — 프로필은 레일에 남긴다). 예전 짧은 화면은 프로필도 메뉴에 넣었다.
  it('프로필은 메뉴 안이 아니라 레일에 그대로 남는다', () => {
    const html = rail()
    expect(html).toContain('data-marker="profile"')
    expect(inside(html, 'sidebar-actions-panel', 'profile')).toBe(false)
    expect(inside(html, 'sidebar-actions', 'profile')).toBe(false)
  })

  // 왜: 285305c2 약속 — 메뉴를 닫을 때 단추를 내려 버리면 Help 에 쓰던 글과 내보내기 진행 상태가 사라진다. 닫힌 판은 그려 둔 채 숨긴다.
  it('메뉴를 닫아도 Help 에 쓰던 글과 내보내기 진행 상태는 그대로 남는다', () => {
    const html = rail()
    expect(html).toMatch(/aria-expanded="false"/)
    for (const name of ['take', 'share', 'export', 'help']) expect(html, name).toContain(`data-marker="${name}"`)
    const source = readFileSync('src/components/layout/sidebar-actions.tsx', 'utf8')
    expect(source).not.toMatch(/\{open && [^}]*children/)
  })

  // 왜: 2026-10-27 오너 재확인 "AI 작업 중에도 사이드바가 눌림" — 메뉴 안 단추로 계정 화면에 나가거나 프로필 메뉴에서 지금 프로젝트를 지울 수 있었다.
  it('AI 가 일하는 동안에는 [메뉴]와 프로필이 눌리지 않고, 열려 있던 메뉴는 닫힌다', () => {
    const html = rail(true)
    expect(html).toMatch(/aria-expanded="false"/)
    const [from] = divRange(html, 'sidebar-actions-panel')
    expect(html.slice(from, html.indexOf('>', from))).toContain('inert=""')
    expect(readFileSync('src/components/layout/sidebar-actions.tsx', 'utf8')).toContain('if (blocked && open) setOpen(false)')
    // [메뉴] · 프로필 모두 아래 묶음(AI 가 일하는 동안 inert) 안에 그린다.
    expect(sidebar).toMatch(/data-testid="sidebar-footer"\s+inert=\{footerBlocked \|\| undefined\}\s*>\s*<SidebarActions[\s\S]*?profile=\{[\s\S]*?<\/SidebarActions>\s*<\/div>/)
  })
})
