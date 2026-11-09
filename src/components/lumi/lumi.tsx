'use client'

// Lumi(디자이너 v3) — 큰 Lumi(움직이는 웹 컴포넌트)와 채팅 아바타(그림). 근거: Figma v3 Lumi 개발 가이드.
//   - 큰 Lumi: 처음 그릴 때만 public/lumi-persona.js(약 3.1MB)를 불러온다. 다 불러오기 전 · WebGL 이 없을 때 ·
//     불러오지 못했을 때는 같은 모습의 그림을 보인다. 동작 줄이기를 켜 두면 멈춘 Lumi(paused).
//     한 화면에 큰 Lumi 는 하나만 두는 것을 권한다(가이드 "성능과 대체").
//   - 채팅 아바타: 그림만(가이드 — 아바타가 여러 개면 정지 이미지가 가볍다). 파일을 불러오지 않는다.
//   약속: tests/chat/lumi-persona.test.ts
import { useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from 'react'
import {
  LUMI_DRAW_SCALE,
  detectWebGL,
  lumiBox,
  lumiStageTheme,
  loadLumiScript,
  lumiRenderMode,
  lumiStillSrc,
  type LumiPersona,
  type LumiRenderMode,
  type LumiSize,
  type LumiScriptStatus,
  type LumiState,
  type LumiVariant,
} from '@/lib/lumi'
import { cn } from '@/lib/utils'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const reducedMotionNow = () => window.matchMedia(REDUCED_MOTION).matches

const noSubscribe = () => () => {}

let webglKnown: boolean | null = null
function webglAvailable(): boolean {
  if (webglKnown === null) webglKnown = detectWebGL(() => document.createElement('canvas'))
  return webglKnown
}

interface LumiElement extends HTMLElement {
  replay?: () => void
}

/** 큰 Lumi 를 밖에서 다시 재생할 때(가이드 replay()). */
export interface LumiHandle {
  replay: () => void
}

interface LumiViewProps {
  mode: LumiRenderMode
  persona: LumiPersona
  state: LumiState
  variant?: LumiVariant
  /** 크기 — SYS 이름(xl · l · m · s · xs · chat) 또는 너비(px). 큰 Lumi 상자는 1:0.77, 아바타는 정사각형. */
  size: LumiSize | number
  /** 읽어 줄 이름. 없으면 꾸밈으로 보고 읽지 않는다. */
  label?: string
  className?: string
  elementRef?: Ref<LumiElement>
}

/** 정해진 모습(mode) 그대로 그린다 — 그림 또는 <lumi-persona> 태그. 상태(파일 · WebGL · 동작 줄이기)는 Lumi 가 정한다. */
export function LumiView({ mode, persona, state, variant = 'full', size, label, className, elementRef }: LumiViewProps) {
  const { width, height } = lumiBox(size, variant)
  // 크기 이름(SYS)이면 몸이 상자 너비를 채우게 키워 그린다 — 숫자 크기(예전 자리)는 예전처럼.
  const scale = variant === 'full' && typeof size !== 'number' ? LUMI_DRAW_SCALE : 1
  if (mode === 'still') {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 작은 정지 그림(webp)이라 이미지 최적화가 필요 없다.
      <img
        src={lumiStillSrc(persona, state, variant)}
        alt={label ?? ''}
        aria-hidden={label ? undefined : true}
        width={width}
        height={height}
        draggable={false}
        className={cn('pointer-events-none select-none object-contain', className)}
        style={{ width, height, transform: scale === 1 ? undefined : `scale(${scale})` }}
      />
    )
  }
  // 움직이는 Lumi 는 너비로만 크기를 정한다(가이드, 3:2) — SYS 상자(1:0.77) 가운데에 놓는다.
  return (
    <span className={cn('inline-flex items-center justify-center', className)} style={{ width, height }}>
      <lumi-persona
        ref={elementRef}
        persona={persona}
        state={state}
        variant={variant}
        paused={mode === 'paused' ? '' : undefined}
        aria-label={label}
        // 사용자 정의 태그는 true 를 빈 값으로 적는다 — 읽지 않음은 글자 "true" 로 넘긴다.
        aria-hidden={label ? undefined : 'true'}
        style={{ width: Math.round(width * scale), flex: 'none' }}
      />
    </span>
  )
}

interface LumiProps {
  persona?: LumiPersona
  state?: LumiState
  variant?: LumiVariant
  /** 크기 — SYS 이름(xl · l · m · s · xs) 또는 너비(px). 기본 320(가이드 예시). */
  size?: LumiSize | number
  label?: string
  className?: string
  /** complete 처럼 한 번 재생하는 상태가 끝나 idle 로 돌아오면 알려 준다(가이드 statechange). */
  onStateChange?: (state: LumiState) => void
  ref?: Ref<LumiHandle>
}

/**
 * 큰 Lumi — 단계 넘어가는 로딩 · 프로젝트 목록 첫 화면 · 확인 팝업 자리(v3, 오너 11/3). 상태는 속성으로만 바꾼다.
 * 예: <Lumi persona="writer" state="loading" size={320} />
 */
export function Lumi({ persona = 'pearl', state = 'idle', variant = 'full', size = 320, label, className, onStateChange, ref }: LumiProps) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => false)
  // WebGL 은 서버에서 모른다(null → 그림). 붙은 뒤 한 번 재고 기억한다.
  const webgl = useSyncExternalStore(noSubscribe, webglAvailable, () => null)
  const [script, setScript] = useState<LumiScriptStatus>('loading')
  const elementRef = useRef<LumiElement>(null)

  useEffect(() => {
    if (!webgl) return
    let alive = true
    loadLumiScript().then(
      () => {
        if (alive) setScript('ready')
      },
      () => {
        if (alive) setScript('failed')
      },
    )
    return () => {
      alive = false
    }
  }, [webgl])

  const mode = lumiRenderMode({ webgl, reducedMotion, script })

  useEffect(() => {
    const el = elementRef.current
    if (!el || !onStateChange) return
    const handler = (event: Event) => {
      const next = (event as CustomEvent<{ state?: LumiState }>).detail?.state
      if (next) onStateChange(next)
    }
    el.addEventListener('statechange', handler)
    return () => el.removeEventListener('statechange', handler)
  }, [onStateChange, mode])

  useImperativeHandle(ref, () => ({ replay: () => elementRef.current?.replay?.() }), [])

  return (
    <span data-stage={lumiStageTheme(persona)} className={cn('inline-block', className)}>
      <LumiView mode={mode} persona={persona} state={state} variant={variant} size={size} label={label} elementRef={elementRef} />
    </span>
  )
}

interface LumiAvatarProps {
  persona: LumiPersona
  state?: LumiState
  /** 지름 — SYS 이름(채팅 xs 36 · 옆 채팅 chat 30) 또는 px. 기본은 옆 채팅(30). */
  size?: LumiSize | number
  /** 둥근 바탕 없이 Lumi 만(채팅 머리). */
  bare?: boolean
  className?: string
}

/** 채팅 아바타 — 움직이지 않는 그림. 바탕은 그 단계 색 12%(가이드 .chat-avatar). */
export function LumiAvatar({ persona, state = 'idle', size = 'chat', bare = false, className }: LumiAvatarProps) {
  const { width } = lumiBox(size, 'avatar')
  return (
    <span
      data-stage={lumiStageTheme(persona)}
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full', !bare && 'bg-stage/12', className)}
      style={{ width, height: width }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 2KB 정지 그림(webp), 최적화 불필요 */}
      <img
        src={lumiStillSrc(persona, state, 'avatar')}
        alt=""
        width={width}
        height={width}
        draggable={false}
        className={cn('pointer-events-none select-none object-contain', bare ? 'size-full' : 'size-[86%]')}
      />
    </span>
  )
}
