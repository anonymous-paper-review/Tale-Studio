// 큰 Lumi(움직이는 Lumi 파일)와 채팅 아바타(그림)가 언제 무엇으로 보이는지 검사한다 (2026-11-03 v3 디자인 · Lumi 개발 가이드)
import { createElement } from 'react'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  LUMI_PERSONAS,
  LUMI_STATES,
  STAGE_PERSONA,
  chatLumiState,
  createLumiScriptLoader,
  detectWebGL,
  lumiRenderMode,
  lumiStillSrc,
} from '@/lib/lumi'
import { Lumi, LumiAvatar, LumiView } from '@/components/lumi/lumi'

/** 브라우저 대신 쓰는 가짜 문서 — 붙인 script 태그를 모아 두고, 불러오기 성공 · 실패를 손으로 일으킨다. */
function fakeHost(defined = false) {
  const scripts: Array<{ src: string; onload: (() => void) | null; onerror: (() => void) | null; remove: () => void }> = []
  return {
    scripts,
    host: {
      isDefined: () => defined,
      createElement: () => {
        const el = { src: '', async: false, onload: null as (() => void) | null, onerror: null as (() => void) | null, remove: vi.fn() }
        return el
      },
      appendChild: (el: (typeof scripts)[number]) => {
        scripts.push(el)
      },
    },
  }
}

describe('큰 Lumi 파일 불러오기', () => {
  it('큰 Lumi를 여러 번 그려도 Lumi 파일은 한 번만 불러온다', async () => {
    // 왜: 파일이 약 3.1MB 다(React · three.js 포함). 화면에 큰 Lumi 가 여럿이어도 한 번만 받아야 한다(Lumi 개발 가이드 "한 번만 불러오세요").
    const { host, scripts } = fakeHost()
    const load = createLumiScriptLoader(() => host)
    const first = load()
    const second = load()
    expect(scripts).toHaveLength(1)
    expect(scripts[0].src).toBe('/lumi-persona.js')
    scripts[0].onload?.()
    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
    await load()
    expect(scripts).toHaveLength(1)
  })

  it('이미 Lumi 파일이 들어와 있으면 다시 불러오지 않는다', async () => {
    // 왜: 화면을 옮겨 다녀도 같은 파일을 또 붙이면 같은 태그를 두 번 정의하려다 오류가 난다.
    const { host, scripts } = fakeHost(true)
    await createLumiScriptLoader(() => host)()
    expect(scripts).toHaveLength(0)
  })

  it('Lumi 파일을 불러오지 못하면 그림으로 보이고, 다음에 큰 Lumi를 그릴 때 다시 불러온다', async () => {
    // 왜: 네트워크가 한 번 끊겼다고 그 뒤로 영영 그림만 보이면 안 된다. 실패한 동안은 빈자리 대신 그림을 보인다.
    const { host, scripts } = fakeHost()
    const load = createLumiScriptLoader(() => host)
    const failed = load()
    scripts[0].onerror?.()
    await expect(failed).rejects.toThrow()
    expect(scripts[0].remove).toHaveBeenCalled()
    expect(lumiRenderMode({ webgl: true, reducedMotion: false, script: 'failed' })).toBe('still')
    void load().catch(() => {})
    expect(scripts).toHaveLength(2)
  })
})

describe('큰 Lumi를 어떻게 보이나', () => {
  it('동작 줄이기를 켜 둔 사용자에게는 멈춘 Lumi를 보인다', () => {
    // 왜: Lumi 개발 가이드 — 사용자가 "동작 줄이기"를 켜 두었으면 paused 속성을 붙여 멈춘 모습만 보여 준다.
    expect(lumiRenderMode({ webgl: true, reducedMotion: true, script: 'ready' })).toBe('paused')
    expect(lumiRenderMode({ webgl: true, reducedMotion: false, script: 'ready' })).toBe('animated')
    const paused = renderToStaticMarkup(createElement(LumiView, { mode: 'paused', persona: 'writer', state: 'idle', size: 320 }))
    expect(paused).toMatch(/<lumi-persona[^>]*\bpaused=""/)
    const moving = renderToStaticMarkup(createElement(LumiView, { mode: 'animated', persona: 'writer', state: 'idle', size: 320 }))
    expect(moving).toMatch(/<lumi-persona[^>]*persona="writer"[^>]*state="idle"/)
    expect(moving).not.toMatch(/\bpaused=/)
  })

  it('WebGL을 쓸 수 없는 브라우저에서는 움직이는 Lumi 대신 같은 단계 · 상태의 그림을 보인다', () => {
    // 왜: 가이드의 파일은 WebGL 이 없으면 태그 자리에 안내 문구만 나온다 — 빈 안내 대신 같은 모습의 그림을 보인다.
    expect(detectWebGL(() => ({ getContext: () => null }))).toBe(false)
    expect(detectWebGL(() => { throw new Error('no canvas') })).toBe(false)
    expect(detectWebGL(() => ({ getContext: (kind: string) => (kind === 'webgl' ? {} : null) }))).toBe(true)
    expect(lumiRenderMode({ webgl: false, reducedMotion: false, script: 'ready' })).toBe('still')
    const html = renderToStaticMarkup(createElement(LumiView, { mode: 'still', persona: 'artist', state: 'thinking', size: 300 }))
    expect(html).toContain('src="/lumi/full/artist-thinking.webp"')
    expect(html).not.toContain('<lumi-persona')
  })

  it('Lumi 파일을 다 불러오기 전에는 같은 모습의 그림을 먼저 보인다', () => {
    // 왜: 3MB 파일이 오는 동안 자리가 비어 있으면 화면이 깜빡인다. 서버에서 그린 첫 화면도 그림으로 시작한다.
    expect(lumiRenderMode({ webgl: true, reducedMotion: false, script: 'loading' })).toBe('still')
    expect(lumiRenderMode({ webgl: null, reducedMotion: false, script: 'idle' })).toBe('still')
    const html = renderToStaticMarkup(createElement(Lumi, { persona: 'storyboard', state: 'loading', size: 320 }))
    expect(html).toContain('src="/lumi/full/storyboard-loading.webp"')
    expect(html).not.toContain('<lumi-persona')
  })
})

describe('채팅 아바타 · Lumi 그림', () => {
  it('채팅 아바타는 Lumi 파일 없이 지금 단계 · 상태의 그림만 쓴다', () => {
    // 왜: 가이드 — 채팅 목록처럼 아바타가 여러 개면 정지 이미지가 가볍다(오너 11/3: 채팅 아바타는 그림).
    const html = renderToStaticMarkup(createElement(LumiAvatar, { persona: 'writer', state: 'thinking', size: 28 }))
    expect(html).toContain('src="/lumi/avatar/writer-thinking.webp"')
    expect(html).not.toContain('<lumi-persona')
  })

  it('모든 단계 · 상태의 Lumi 그림 파일이 있고, 그림이 없는 로딩 상태는 기본 모습 그림을 쓴다', () => {
    // 왜: 그림 파일이 하나라도 빠지면 그 자리가 깨진 그림으로 보인다. 아바타와 화이트 펄은 로딩 그림이 없다.
    expect(lumiStillSrc('writer', 'loading', 'avatar')).toBe('/lumi/avatar/writer-idle.webp')
    expect(lumiStillSrc('pearl', 'loading', 'full')).toBe('/lumi/full/pearl-idle.webp')
    expect(lumiStillSrc('writer', 'loading', 'full')).toBe('/lumi/full/writer-loading.webp')
    for (const persona of LUMI_PERSONAS) {
      for (const state of LUMI_STATES) {
        for (const variant of ['avatar', 'full'] as const) {
          const src = lumiStillSrc(persona, state, variant)
          expect(existsSync(path.join(process.cwd(), 'public', src)), src).toBe(true)
        }
      }
    }
    expect(existsSync(path.join(process.cwd(), 'public', 'lumi-persona.js'))).toBe(true)
  })

  it('채팅 머리의 Lumi는 답을 기다리는 동안 생각하는 모습, 오류가 떠 있으면 오류 모습이다', () => {
    // 왜: 가이드의 채팅 흐름 — 보낸 뒤 기다릴 때 thinking, 실패하면 error. 그 밖에는 기본 모습.
    expect(chatLumiState({ loading: true, error: false })).toBe('thinking')
    expect(chatLumiState({ loading: false, error: true })).toBe('error')
    expect(chatLumiState({ loading: false, error: false })).toBe('idle')
  })

  it('단계마다 화면 이름과 같은 Lumi 옷을 입는다', () => {
    // 왜: 단계 id 는 옛 이름이다(entry=Producer, producer=Writer, writer=Storyboard) — id 그대로 옷을 고르면 Writer 화면에 Producer Lumi 가 나온다.
    expect(STAGE_PERSONA).toEqual({
      entry: 'producer',
      producer: 'writer',
      artist: 'artist',
      writer: 'storyboard',
      director: 'director',
      editor: 'editor',
    })
  })
})
