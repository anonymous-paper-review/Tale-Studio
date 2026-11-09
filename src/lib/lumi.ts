// Lumi(디자이너 v3 캐릭터) — 페르소나 · 상태 · 그림 경로 · 큰 Lumi 를 어떻게 보일지 정하는 순수 함수들.
//   화면 쪽은 components/lumi/lumi.tsx. 근거: Figma v3 Lumi 개발 가이드(lumi-persona.js · <lumi-persona> 태그).
//   약속: tests/chat/lumi-persona.test.ts · tests/chat/lumi-size.test.ts
import type { StageId } from '@/types'

/** 가이드의 persona 값 — 시작(화이트 펄) · 여섯 단계 · 작품 완성. */
export const LUMI_PERSONAS = ['pearl', 'producer', 'writer', 'artist', 'storyboard', 'director', 'editor', 'complete'] as const
export type LumiPersona = (typeof LUMI_PERSONAS)[number]
/** 단계 옷 — 화면 이름과 같고, 스튜디오 레이아웃의 data-stage 값이기도 하다(globals.css [data-stage]). */
export type LumiStagePersona = Exclude<LumiPersona, 'pearl' | 'complete'>

/** 가이드의 state 값 — 공통 다섯 + 단계를 넘어가는 동안의 loading. */
export const LUMI_STATES = ['idle', 'listening', 'thinking', 'complete', 'error', 'loading'] as const
export type LumiState = (typeof LUMI_STATES)[number]

export type LumiVariant = 'full' | 'avatar'

/** Lumi 크기 이름(11/5 Figma SYS) — 너비(px). 첫 인사 xl · 기다리는 팝업 · 페이지 머리 l · 팝업 제목 위 m ·
 *  노드 · 카드 위 기다림 s · 채팅 아바타 xs · 옆 채팅 아바타 chat. */
export const LUMI_SIZE = { xl: 150, l: 100, m: 78, s: 56, xs: 36, chat: 30 } as const
export type LumiSize = keyof typeof LUMI_SIZE
/** 전신 Lumi 상자의 세로 ÷ 가로(SYS 1:0.77). 그림 · 움직이는 Lumi(3:2)는 이 상자 가운데에 맞춘다. */
export const LUMI_BOX_RATIO = 0.77
/** 크기 이름으로 그릴 때 그림 배율 — 시안 Lumi 그림은 몸에 맞춰 잘라 몸이 폭의 98%, 우리 그림(가이드 480×320)은 둘레에
 *  소품 자리가 있어 몸이 폭의 약 68%다. 1.45배로 그려 몸이 상자 너비를 채우게 한다(상자 · 자리는 그대로, 둘레 빈 곳만 넘친다). */
export const LUMI_DRAW_SCALE = 1.45

/** 그 크기의 상자 — 이름이면 SYS 너비, 숫자면 그 너비(예전 호출). 전신은 높이 = 너비 × 0.77, 아바타는 정사각형. */
export function lumiBox(size: LumiSize | number, variant: LumiVariant = 'full'): { width: number; height: number } {
  const width = typeof size === 'number' ? size : LUMI_SIZE[size]
  return { width, height: variant === 'full' ? Math.round(width * LUMI_BOX_RATIO) : width }
}

/** 단계 id → 화면 이름과 같은 Lumi 옷. id 는 옛 이름이다(entry=Producer, producer=Writer, writer=Storyboard). */
export const STAGE_PERSONA: Record<StageId, LumiStagePersona> = {
  entry: 'producer',
  producer: 'writer',
  artist: 'artist',
  writer: 'storyboard',
  director: 'director',
  editor: 'editor',
}

/** 단계 옷이면 그 단계 색 이름(data-stage 값) — 화이트 펄 · 완성은 단계 색이 없다. */
export function lumiStageTheme(persona: LumiPersona): LumiStagePersona | undefined {
  return (Object.values(STAGE_PERSONA) as string[]).includes(persona) ? (persona as LumiStagePersona) : undefined
}

/** 움직이는 Lumi 파일(약 3.1MB, React · three.js 포함) — public/ 에 둔다. 큰 Lumi 가 처음 나올 때만 불러온다. */
export const LUMI_SCRIPT_SRC = '/lumi-persona.js'

/** 그림 파일이 있는 상태인가 — 아바타는 로딩 그림이 없고, 화이트 펄은 앞 단계가 없어 로딩 그림이 없다. */
function stillExists(persona: LumiPersona, state: LumiState, variant: LumiVariant): boolean {
  if (state !== 'loading') return true
  return variant === 'full' && persona !== 'pearl'
}

/** 움직이지 않는 Lumi 그림 경로. 그림이 없는 상태는 기본 모습(idle) 그림을 쓴다. */
export function lumiStillSrc(persona: LumiPersona, state: LumiState, variant: LumiVariant): string {
  const shown = stillExists(persona, state, variant) ? state : 'idle'
  return `/lumi/${variant}/${persona}-${shown}.webp`
}

export type LumiScriptStatus = 'idle' | 'loading' | 'ready' | 'failed'
/** animated = 움직이는 Lumi · paused = 멈춘 Lumi(동작 줄이기) · still = 같은 모습의 그림. */
export type LumiRenderMode = 'animated' | 'paused' | 'still'

/**
 * 큰 Lumi 를 어떻게 보일지. 파일을 다 불러오기 전 · WebGL 을 모를 때(서버) · WebGL 이 없을 때 · 불러오지 못했을 때는
 * 같은 단계 · 상태의 그림이다. 동작 줄이기를 켜 두었으면 멈춘 Lumi(가이드: paused 속성).
 */
export function lumiRenderMode({
  webgl,
  reducedMotion,
  script,
}: {
  webgl: boolean | null
  reducedMotion: boolean
  script: LumiScriptStatus
}): LumiRenderMode {
  if (webgl !== true || script !== 'ready') return 'still'
  return reducedMotion ? 'paused' : 'animated'
}

/** WebGL 을 쓸 수 있나 — 캔버스를 하나 만들어 컨텍스트를 받아 본다. 만들다 예외가 나도 "못 쓴다"로 본다. */
export function detectWebGL(createCanvas: () => { getContext: (kind: string) => unknown } | null): boolean {
  try {
    const canvas = createCanvas()
    if (!canvas) return false
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** 채팅 머리 Lumi 의 모습 — 답을 기다리는 동안 생각하는 모습, 오류가 떠 있으면 오류 모습, 그 밖에는 기본 모습. */
export function chatLumiState({ loading, error }: { loading: boolean; error: boolean }): LumiState {
  if (loading) return 'thinking'
  if (error) return 'error'
  return 'idle'
}

interface LumiScriptElement {
  src: string
  async: boolean
  onload: (() => void) | null
  onerror: (() => void) | null
  remove: () => void
}

/** 파일을 붙일 곳(브라우저 문서). 시험은 가짜를 넘긴다. */
export interface LumiScriptHost {
  /** 이미 <lumi-persona> 가 정의돼 있나(다른 경로로 이미 들어온 경우). */
  isDefined: () => boolean
  createElement: () => LumiScriptElement
  appendChild: (el: LumiScriptElement) => void
}

/**
 * Lumi 파일을 한 번만 불러오는 함수를 만든다. 여러 번 불러도 같은 약속을 돌려주고,
 * 불러오지 못하면 붙였던 태그를 걷고 다음 호출에서 다시 시도한다.
 */
export function createLumiScriptLoader(getHost: () => LumiScriptHost): () => Promise<void> {
  let pending: Promise<void> | null = null
  return () => {
    if (pending) return pending
    const host = getHost()
    if (host.isDefined()) {
      pending = Promise.resolve()
      return pending
    }
    pending = new Promise<void>((resolve, reject) => {
      const el = host.createElement()
      el.src = LUMI_SCRIPT_SRC
      el.async = true
      el.onload = () => resolve()
      el.onerror = () => {
        el.remove()
        pending = null
        reject(new Error(`${LUMI_SCRIPT_SRC} failed to load`))
      }
      host.appendChild(el)
    })
    return pending
  }
}

/** 브라우저에서 쓰는 하나뿐인 불러오기 — 큰 Lumi 컴포넌트가 처음 보일 때 부른다. */
export const loadLumiScript = createLumiScriptLoader(() => ({
  isDefined: () => typeof customElements !== 'undefined' && !!customElements.get('lumi-persona'),
  createElement: () => document.createElement('script') as unknown as LumiScriptElement,
  appendChild: (el) => {
    document.head.appendChild(el as unknown as HTMLScriptElement)
  },
}))
