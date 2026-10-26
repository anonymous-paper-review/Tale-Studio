// 채팅에 새 제안이 뜰 때 한 바퀴 도는 빛 테두리가 다 돈 뒤 흔적 없이 사라지는지 확인한다 (2026-10-27 디자이너 QA 1차)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

type CssRule = { at: string | null; selector: string; body: string }

const css = readFileSync(path.join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** 규칙을 선택자 · 본문으로 꺼낸다. @media 안의 규칙은 그 @media 를 함께 적는다. 중첩 괄호는 본문에 그대로 둔다. */
function rules(source: string, at: string | null = null): CssRule[] {
  const out: CssRule[] = []
  let index = 0
  while (index < source.length) {
    const open = source.indexOf('{', index)
    if (open === -1) break
    const selector = source.slice(index, open).split(';').pop()!.trim()
    let depth = 1
    let close = open + 1
    for (; close < source.length && depth > 0; close++) {
      if (source[close] === '{') depth++
      else if (source[close] === '}') depth--
    }
    const body = source.slice(open + 1, close - 1)
    if (selector.startsWith('@media')) out.push(...rules(body, selector))
    else out.push({ at, selector, body })
    index = close
  }
  return out
}

const declaration = (body: string, property: string) => body.match(new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+)`))?.[1].trim()

it('새 제안이 뜰 때 한 바퀴 도는 빛 테두리는 다 돈 뒤 흔적 없이 사라진다', () => {
  // 왜: 다 돈 뒤 멈춘 빛 조각이 '아니요, 더 고칠래요' 단추 둘레에 깨진 테두리처럼 남았다(디자이너 QA 1차 관찰 27).
  const all = rules(css)
  const once = all.filter((rule) => rule.selector === '.tale-beam-once')
  const resting = once.find((rule) => rule.at === null)
  expect(resting).toBeDefined()

  // 멈춰 있을 때(다 돈 뒤)는 보이지 않는다 — 마지막 모습을 붙잡아 두지도 않는다.
  expect(declaration(resting!.body, 'opacity')).toBe('0')
  const animation = declaration(resting!.body, 'animation') ?? ''
  expect(animation).not.toMatch(/\b(?:forwards|both)\b/)

  // 도는 동안만 보인다 — 한 바퀴 도는 키프레임이 빛을 켠다.
  const keyframes = all.filter((rule) => rule.selector.startsWith('@keyframes '))
  const name = animation.split(/\s+/).find((token) => keyframes.some((rule) => rule.selector === `@keyframes ${token}`))
  expect(name).toBeDefined()
  const frames = keyframes.find((rule) => rule.selector === `@keyframes ${name}`)!.body
  expect(frames).toMatch(/opacity:\s*1\b/)
  expect(frames).toMatch(/--beam-angle:\s*360deg/)

  // 모션을 줄인 화면에서는 아예 보이지 않는다.
  const reduced = once.find((rule) => rule.at?.includes('prefers-reduced-motion: reduce'))
  expect(reduced).toBeDefined()
  expect(declaration(reduced!.body, 'animation')).toBe('none')
  expect(reduced!.body).toMatch(/opacity:\s*0\b|background:\s*transparent/)
})
