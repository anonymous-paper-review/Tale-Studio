'use client'

// AI 작업 중 전체 잠금 (리뉴얼 1차 2026-10-19, 프로토타입 원칙 "AI가 일하는 동안은 전체 잠금").
//   AI 에이전트가 일을 시작하면 단계 화면과 채팅을 덮고 입력을 막는다 — 끝나야 고칠 수 있고, 동시 작업은 없다.
//   왼쪽 단계 레일은 덮지 않지만, 일하는 동안은 단계 단추 · Alt 단축키로 다른 단계로 옮겨 가지 않는다(ai-busy-store,
//   디자이너 QA 1차 #07 — 초안을 쓰는 중에 Writer 로 넘어가 같은 산문을 두 번 쓰게 할 수 있었다). 홈(프로젝트 목록)으로는
//   나갈 수 있다 — 작업은 서버에서 계속 돈다. 실패 안내(busy=false)로 바뀌면 다시 옮겨 갈 수 있다.
//   document.body 로 띄운다 — 단계 화면 안에 그리면 뒤를 inert 로 막을 때 이 창의 버튼(다시 그리기 · 닫기)까지 막힌다.
//   v3(2026-11-03 오너 "큰 Lumi 를 단계 넘어갈 때 기다리는 화면에"): lumi 를 주면 도는 원 자리에 큰 Lumi(일하는 동안 loading,
//   실패 안내면 error)가 서고 카드는 기다리는 카드 모습이 된다 — 11/5 부터 Feedback/Loading Card(SYS 로딩 팝업, 372 · Lumi L ·
//   단계 ✓ · ● · ○ · 막대). 안 주면 예전 작은 카드 그대로. 약속: tests/project/busy-overlay-lumi.test.ts · tests/project/loading-card.test.ts
//   위 막대의 프로젝트 이름 칸은 막지 않고 덮지도 않는다(v3 2단계 2026-11-03) — 예전 레일 홈 카드처럼 일하는 동안에도 이름을 바꾼다.
//   무엇을 막고 남기는지는 lib/ai-busy-lock 한 곳(약속: tests/project/ai-busy-rename.test.ts).
//   11/9(prose 갈래 WL · AR "모양은 시안, 잠금은 그대로"): scrim="clear" 면 바탕을 칠하지 않고 카드만 가운데 — 잠금은 그대로고,
//   덮개가 받은 휠 · 손가락 끌기를 아래 [data-ai-busy-scroll] 칸으로 넘겨 보기 · 스크롤만 된다(lib/ai-busy-scroll).
//   card="loading" 이면 Lumi 없이도 새 기다리는 카드 모양(색은 놓인 화면의 지금 단계). 약속: tests/project/busy-overlay-clear.test.ts
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { Lumi } from '@/components/lumi/lumi'
import { cn } from '@/lib/utils'
import { SHELL_INSET, SHELL_RAIL_WIDTH } from '@/lib/constants'
import { lumiStageTheme, type LumiPersona } from '@/lib/lumi'
import { useT } from '@/lib/i18n'
import { lockForAiWork, overlayClipPath } from '@/lib/ai-busy-lock'
import { AI_BUSY_SCROLL_ATTR, createScrollRelay } from '@/lib/ai-busy-scroll'
import { aiBusyHolds, holdAiBusy } from '@/stores/ai-busy-store'

export interface AiBusyStep {
  label: string
  state: 'done' | 'current' | 'todo'
}

interface AiBusyOverlayProps {
  open: boolean
  /** 이미 번역된 제목(예: "산문 초안을 쓰고 있어요"). */
  title: string
  /** 이미 번역된 설명. 안 주면 잠금 안내를 쓰고, null 이면 설명 줄을 비운다(할 말이 없는 화면). */
  description?: string | null
  steps?: AiBusyStep[]
  /** 0~100. 없으면 막대를 그리지 않는다. */
  progress?: number | null
  /** 이미 번역된 진행 문구(예: "러프 3/8 · 40%"). */
  progressLabel?: string
  /** 실패 시 다시 하기 같은 버튼 자리. */
  footer?: React.ReactNode
  /** false = 일이 멈췄다(실패 안내) — 도는 원 대신 경고 표시를 두고 aria-busy 를 끈다. 기본 true. */
  busy?: boolean
  /** 'dialog' = 열린 팝업 위를 덮는다(팝업에서 시작한 AI 작업, 2026-10-20 Artist 상세 · 샷 고치기). 기본은 단계 화면만 덮는다.
   *  팝업이 열려 있으면 body 가 클릭을 받지 않는다(Radix) — 덮개가 클릭을 직접 받아 밑의 팝업 버튼으로 새지 않게 한다. */
  layer?: 'stage' | 'dialog'
  /** 큰 Lumi 옷(단계 넘어가며 기다리면 다음 단계 옷). 주면 도는 원 · 경고 표시 자리에 큰 Lumi — 일하는 동안 loading, 멈추면 error. */
  lumi?: LumiPersona
  /** 'loading' = Lumi 를 안 줘도 새 기다리는 카드 모양(그림만 없음, 색은 지금 단계). 안 주고 lumi 도 없으면 예전 작은 카드. */
  card?: 'loading'
  /** 'dim'(기본) = 바탕을 덮는다. 'clear' = 칠하지 않고 카드만 가운데 — 잠금은 그대로, 휠 · 끌기는 아래 보기 칸으로 넘긴다. */
  scrim?: 'dim' | 'clear'
}

/** 덮개 틀 — 'dim' 은 바탕을 85% 덮고 'clear' 는 칠하지 않는다. 어느 쪽이든 그 자리를 덮어 누르기를 받는다(뒤로 새지 않는다). */
export function aiBusyOverlayFrame(layer: 'stage' | 'dialog', scrim: 'dim' | 'clear' = 'dim'): string {
  return cn(
    layer === 'dialog' ? 'pointer-events-auto fixed inset-0 z-popover' : 'fixed inset-y-0 right-0 z-overlay',
    'flex items-center justify-center p-6',
    scrim === 'dim' && 'bg-background/85',
  )
}

const subscribeNothing = () => () => {}

export function AiBusyOverlay({ open, title, description, steps, progress, progressLabel, footer, busy = true, layer = 'stage', lumi, card, scrim = 'dim' }: AiBusyOverlayProps) {
  // 서버 렌더에는 body 가 없다 — 브라우저에서만 띄운다(하이드레이션이 어긋나지 않게).
  const inBrowser = useSyncExternalStore(subscribeNothing, () => true, () => false)

  // 덮는 동안 단계 화면과 채팅을 inert 로 — 키보드 포커스도 뒤로 들어가지 못한다. 단계 화면 위 잠금은 위 막대의 이름 칸만 남긴다.
  //   일하는 동안 화면이 바뀌어 길 옆에 새 조각이 붙으면 그 조각도 막는다.
  useEffect(() => {
    if (!open) return
    const stage = document.querySelector<HTMLElement>('[data-stage-content]')
    const lock = lockForAiWork<HTMLElement>({
      stage,
      chats: Array.from(document.querySelectorAll<HTMLElement>('[data-chat-panel]')),
      keep: layer === 'stage' && stage ? Array.from(stage.querySelectorAll<HTMLElement>('[data-ai-lock-keep]')) : [],
    })
    const observer = new MutationObserver(() => lock.refresh())
    for (const node of lock.watch) observer.observe(node, { childList: true })
    return () => {
      observer.disconnect()
      lock.release()
    }
  }, [open, layer])

  // 단계 화면 위 잠금은 위 막대 자리를 오려 내고 덮는다 — 막이 이름 칸 위에 놓이지 않게. 채팅 폭 · 창 크기가 바뀌면 다시 잰다.
  const overlayRef = useRef<HTMLDivElement>(null)
  const [clipPath, setClipPath] = useState<string | undefined>(undefined)
  useLayoutEffect(() => {
    const overlay = overlayRef.current
    const bar = document.querySelector<HTMLElement>('[data-stage-content] [data-testid="studio-top-bar"]')
    if (!open || !inBrowser || layer !== 'stage' || !overlay || !bar) return
    const measure = () => setClipPath(overlayClipPath(overlay.getBoundingClientRect(), bar.getBoundingClientRect()))
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(bar)
    resize.observe(overlay)
    return () => {
      resize.disconnect()
      setClipPath(undefined)
    }
  }, [open, inBrowser, layer])

  // 일하는 동안 왼쪽 레일의 단계 이동을 막는다 — 닫히거나 실패 안내로 바뀌거나 이 화면이 사라지면 푼다.
  const holdId = useId()
  const holding = aiBusyHolds({ open, busy })
  useEffect(() => {
    if (!holding) return
    return holdAiBusy(holdId)
  }, [holding, holdId])

  // 투명 덮개는 잠근 칸이 못 받는 휠 · 끌기를 대신 받아 아래 보기 칸([data-ai-busy-scroll])으로 넘긴다.
  const relay = useMemo(() => createScrollRelay(() => document.querySelectorAll<HTMLElement>(`[${AI_BUSY_SCROLL_ATTR}]`)), [])
  const clear = scrim === 'clear'

  if (!open || !inBrowser) return null

  return createPortal(
    <div
      ref={overlayRef}
      className={aiBusyOverlayFrame(layer, scrim)}
      style={layer === 'dialog' ? undefined : { left: SHELL_INSET * 2 + SHELL_RAIL_WIDTH, clipPath }}
      role="status"
      aria-live="polite"
      aria-busy={busy}
      data-testid="ai-busy-overlay"
      data-scrim={scrim}
      onWheel={clear ? (e) => relay.wheel(e) : undefined}
      onTouchStart={clear ? (e) => relay.touchStart(e) : undefined}
      onTouchMove={clear ? (e) => relay.touchMove(e) : undefined}
      onTouchEnd={clear ? () => relay.touchEnd() : undefined}
      onTouchCancel={clear ? () => relay.touchEnd() : undefined}
    >
      <AiBusyCard
        title={title}
        description={description}
        steps={steps}
        progress={progress}
        progressLabel={progressLabel}
        footer={footer}
        busy={busy}
        lumi={lumi}
        card={card}
      />
    </div>,
    document.body,
  )
}


/** 단계 줄의 숨은 글 — 끝난 줄 "완료", 남은 줄 "남음"(지금 줄은 li 의 aria-current 가 알린다). */
function StepStateLabel({ state }: { state: AiBusyStep['state'] }) {
  const t = useT()
  if (state === 'current') return null
  return <span className="sr-only">{state === 'done' ? t('Done') : t('Remaining')}</span>
}

/** 잠금 카드 — 덮개 안의 내용(큰 Lumi 또는 도는 원 · 제목 · 설명 · 단계 · 진행 · 단추). 포털 · 잠금 없이 그리기만 한다. */
export function AiBusyCard({
  title,
  description,
  steps,
  progress,
  progressLabel,
  footer,
  busy = true,
  lumi,
  card,
}: Omit<AiBusyOverlayProps, 'open' | 'layer' | 'scrim'>) {
  const t = useT()
  const pct = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : null
  const lockNote = description === null ? null : (description ?? t('While AI is working, the screen and chat are locked. You can edit once it finishes.'))
  if (lumi || card === 'loading') {
    return (
      <div
        // 11/5 기다리는 카드(Feedback/Loading Card · SYS 로딩 팝업) — 폭 372 · 안쪽 50/30 · 사이 15 · 모서리 20 · 그림자 하나.
        //   Lumi(L) → 제목(16 Bold) → 설명(12.5) → 단계(✓ 흰 · ● 단계 색 · ○ 흐림) → 진행 막대(4 · 모서리 2).
        //   색은 Lumi 가 입은 옷(data-stage) — 화이트 펄 · 완성 · Lumi 없음(card="loading")은 놓인 화면의 색(지금 단계, 프로젝트 목록이면 크림).
        data-stage={lumi ? lumiStageTheme(lumi) : undefined}
        className="flex w-full max-w-[372px] flex-col items-center gap-[15px] rounded-[20px] bg-side px-[30px] py-[50px] text-center shadow-loading"
      >
        {/* 일하는 동안 loading, 멈추면 error(가이드 상태). */}
        {lumi ? <Lumi persona={lumi} state={busy ? 'loading' : 'error'} size="l" /> : null}
        <div className="flex w-full flex-col items-center gap-[9px]">
          <h2 className="text-[16px] font-bold leading-[1.2] text-foreground">{title}</h2>
          {lockNote ? <p className="text-caption leading-[1.55] text-subtle-foreground">{lockNote}</p> : null}
        </div>
        {steps && steps.length > 0 ? (
          <ol className="flex w-full flex-col gap-3 p-3 text-left">
            {steps.map((step, i) => {
              // 멈춘 일(busy=false)의 지금 줄은 단계 색으로 칠하지 않는다 — 아직 하는 중처럼 보이지 않게(2026-10-27 QA).
              const live = step.state === 'current' && busy
              // ✓ · ● · ○ 는 화면 읽기가 읽지 않는다 — 지금 줄은 aria-current, 끝난 · 남은 줄은 숨은 글(검토 A L5).
              return (
                <li
                  key={`${i}-${step.label}`}
                  aria-current={step.state === 'current' ? 'step' : undefined}
                  className="flex items-center gap-2.5 text-[13px] font-medium leading-tight"
                >
                  <StepStateLabel state={step.state} />
                  <span
                    aria-hidden
                    className={cn(
                      'w-[11px] shrink-0 font-num text-xs font-semibold leading-none',
                      step.state === 'done' && 'text-foreground',
                      live && 'text-stage',
                      step.state === 'current' && !busy && 'text-subtle-foreground',
                      step.state === 'todo' && 'text-faint-foreground',
                    )}
                  >
                    {step.state === 'done' ? '✓' : step.state === 'current' ? '●' : '○'}
                  </span>
                  <span className={step.state === 'todo' ? 'text-subtle-foreground' : 'text-foreground'}>{step.label}</span>
                </li>
              )
            })}
          </ol>
        ) : null}
        {pct !== null ? (
          <div className="h-1 w-full overflow-hidden rounded-[2px] bg-progress-track" aria-hidden>
            <div className="h-full rounded-[2px] bg-stage-gradient transition-[width] duration-350 ease-out" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {progressLabel ? <p className="font-num text-micro tabular-nums text-subtle-foreground">{progressLabel}</p> : null}
        {footer ? <div className="flex flex-wrap justify-center gap-2">{footer}</div> : null}
      </div>
    )
  }
  return (
    <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-lg">
      <div className="flex items-start gap-3">
        {busy ? (
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
        ) : (
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        )}
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium leading-7">{title}</h2>
          {lockNote ? <p className="text-sm text-muted-foreground">{lockNote}</p> : null}
        </div>
      </div>
      {pct !== null || progressLabel ? (
        <div className="flex flex-col gap-1.5">
          {pct !== null ? (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-[width] duration-350 ease-out" style={{ width: `${pct}%` }} />
            </div>
          ) : null}
          {progressLabel ? <p className="font-mono text-xs tabular-nums text-muted-foreground">{progressLabel}</p> : null}
        </div>
      ) : null}
      {steps && steps.length > 0 ? (
        <ol className="flex flex-col gap-1.5 text-sm">
          {steps.map((step, i) => (
            <li
              key={`${i}-${step.label}`}
              aria-current={step.state === 'current' ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2',
                step.state === 'todo' && 'text-muted-foreground opacity-70',
                step.state === 'current' && 'font-medium',
              )}
            >
              {step.state === 'done' ? (
                <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : step.state === 'current' && busy ? (
                <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : step.state === 'current' ? (
                // 일이 멈췄으면(busy=false) 멈춘 줄은 돌지 않는다 — 아직 하는 중처럼 보이지 않게(2026-10-27 QA).
                <AlertCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <span className="mx-1 size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
              )}
              <StepStateLabel state={step.state} />
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {footer ? <div className="flex flex-wrap justify-end gap-2">{footer}</div> : null}
    </div>
  )
}
