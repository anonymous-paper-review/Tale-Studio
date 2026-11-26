'use client'

// 지난 판 줄(오너 2026-11-26 A4 · S3 · D2, 시안 없음) — 카드에 마우스를 올리면 카드 바로 아래에 지난 판이 작은 카드로 가장 새 것부터
//   5개까지 뜬다(넘치면 끝에 +N). 작은 카드를 누르면 그 판을 보여 주는 상세가 열리고, 상세의 [채택]이 그 판을 최종(지금) 판으로 만든다.
//   Artist · Storyboard · Director 가 이 부품 하나를 같이 쓴다 — 고를 판은 lib/version-history 가 정하고, 여는 상세는 부르는 쪽이 정한다.
//   지난 판이 없으면 뜨지 않는다. 마우스로만 열린다(터치 · 키보드는 상세의 버전 줄 · Take 목록이 같은 일을 한다).
//   작은 영상 칸은 저절로 틀지 않는다(design §10.3 마우스 올림 자동 재생 금지) — 썸네일, 없으면 첫 장면만.
//   약속: tests/director/version-history.test.ts
import { useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { ImageOff } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { ThumbImage } from '@/components/thumb-image'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { HISTORY_STRIP_SIZE, type PastImageVersion } from '@/lib/version-history'

/** 작은 카드 하나 — label 은 화면 글(v3 · Take 2), note 는 마우스를 올리면 보이는 덧말. */
export interface VersionStripCard {
  id: string
  label: string
  thumbUrl: string | null
  videoUrl?: string | null
  note?: string | null
  /** 채택할 수 없는 판(다른 작품 스타일 등) — 흐리게 보이되 눌러 상세는 볼 수 있다. */
  dimmed?: boolean
}

const stop = (event: SyntheticEvent) => event.stopPropagation()

/** 줄 폭 — 카드 폭을 따르되 작은 카드 5개가 보이게 256 ~ 416(아래 min-w-64 · max-w-[26rem]). */
const STRIP_MIN_W = 256
const STRIP_MAX_W = 416
const GAP = 6
const EDGE = 8

/** 줄 높이 어림 — 그리기 전에 자리를 정해야 해서 칸 폭 · 그림 비율로 센다(안쪽 8 · 테두리 1 · 칸 사이 6 · 이름 줄 17). */
function stripHeight(width: number, aspect: string, more: boolean): number {
  const cell = (width - 18 - (more ? 36 : 0) - 4 * GAP) / 5
  const [w, h] = aspect.split('/').map((value) => Number(value.trim()))
  const ratio = w && h ? h / w : 9 / 16
  return Math.ceil(18 + 2 + (cell - 4) * ratio + 4 + 17 + 2)
}

/** 줄을 놓을 자리(카드 기준 위아래 · 옆 어긋남) — 카드 바로 아래가 화면 안이면 아래(오너 "아래에 뜨기").
 *  화면 끝이라 아래에 자리가 없으면 위로 뒤집지 않고 카드 안 아래쪽에 겹쳐 둔다 — 위로 뒤집으면 윗줄 카드에 붙어 그 카드 것으로 보였다.
 *  카드 아래쪽이 화면 밖이면 화면 아래 끝에 맞춘다. 오른쪽 끝을 넘으면 왼쪽으로 민다. */
export function stripPlace(
  rect: { top: number; bottom: number; left: number; width: number },
  aspect: string,
  more: boolean,
  viewport: { width: number; height: number },
): { side: number; align: number } {
  const width = Math.min(STRIP_MAX_W, Math.max(STRIP_MIN_W, rect.width))
  const height = stripHeight(width, aspect, more)
  const below = rect.bottom + GAP
  const top = below + height <= viewport.height - EDGE
    ? below
    : Math.max(rect.top + EDGE, Math.min(rect.bottom - height - EDGE, viewport.height - EDGE - height))
  const overflowRight = rect.left + width - (viewport.width - EDGE)
  return { side: Math.round(top - rect.bottom), align: overflowRight > 0 ? -Math.round(overflowRight) : 0 }
}

/** 줄 자체(작은 카드들 + 넘치는 수). 마우스 올림 판 안에 들고, 시험은 이것만 그려 본다. */
export function VersionStrip({ cards, more, aspect, onOpen, onMore }: {
  cards: readonly VersionStripCard[]
  more: number
  /** 작은 그림 칸의 비율 — "16 / 9" 꼴(프로젝트 화면비). */
  aspect: string
  onOpen: (id: string) => void
  onMore: () => void
}) {
  const t = useT()
  return (
    <div
      role="group"
      aria-label={t('Earlier versions')}
      data-testid="version-strip"
      className="grid items-start gap-1.5"
      style={{ gridTemplateColumns: `repeat(${HISTORY_STRIP_SIZE}, minmax(0, 1fr))${more > 0 ? ' auto' : ''}` }}
    >
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onOpen(card.id)}
          title={card.note ? `${card.label} · ${card.note}` : card.label}
          aria-label={t('Open {label} in details', { label: card.label })}
          data-testid="version-strip-card"
          data-id={card.id}
          className={cn('flex min-w-0 flex-col gap-1 rounded-md p-0.5 text-left transition-colors duration-100 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', card.dimmed && 'opacity-50')}
        >
          <span className="relative block w-full overflow-hidden rounded-[6px] bg-art-placeholder" style={{ aspectRatio: aspect }}>
            {card.thumbUrl ? (
              <ThumbImage src={card.thumbUrl} alt={card.label} className="size-full object-cover" />
            ) : card.videoUrl ? (
              <video src={`${card.videoUrl}#t=0.1`} muted playsInline preload="metadata" aria-hidden className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-subtle-foreground"><ImageOff className="size-3.5" aria-hidden /></span>
            )}
          </span>
          <span className="truncate px-0.5 font-num text-micro text-muted-foreground">{card.label}</span>
        </button>
      ))}
      {more > 0 ? (
        <button
          type="button"
          onClick={onMore}
          aria-label={t('See all {count} more versions in details', { count: more })}
          title={t('See all {count} more versions in details', { count: more })}
          data-testid="version-strip-more"
          className="self-center rounded-full px-2 py-1 font-num text-micro text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground"
        >
          {`+${more}`}
        </button>
      ) : null}
    </div>
  )
}

/** 카드를 감싸 마우스를 올리면 아래에 줄을 띄운다. children 은 DOM 요소 하나(카드 · 그림 칸)여야 한다 — 그 요소가 줄의 기준이 된다.
 *  지난 판이 없으면 감싸기만 하고 뜨지 않는다(판이 생겨도 카드를 다시 그리지 않게 늘 감싼다). 누르면(끌기 · 고르기) 닫는다.
 *  카드 안 단추에 초점이 가도 열지 않는다(마우스로만 — 키보드는 상세가 같은 일을 한다). */
export function VersionHistoryHover({ cards, more, aspect, onOpen, onMore, children }: {
  cards: readonly VersionStripCard[]
  more: number
  aspect: string
  onOpen: (id: string) => void
  onMore: () => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState({ side: GAP, align: 0 })
  const triggerRef = useRef<HTMLElement | null>(null)
  const has = cards.length > 0
  const changeOpen = (next: boolean) => {
    // 열 때 카드 자리를 재어 줄 자리를 정한다(stripPlace).
    const trigger = triggerRef.current
    if (next && trigger) setPlace(stripPlace(trigger.getBoundingClientRect(), aspect, more > 0, { width: window.innerWidth, height: window.innerHeight }))
    setOpen(next)
  }
  return (
    <HoverCard open={has && open} onOpenChange={changeOpen} openDelay={250} closeDelay={120}>
      <HoverCardTrigger
        asChild
        onPointerDown={() => setOpen(false)}
        onFocus={(event) => event.preventDefault()}
        // 카드 안에서 연 확인 창 · 편집 창(body 로 나간 창)에 마우스가 들어가도 React 에서는 카드 안이라 열리려 한다 — 카드 자리 밖이면 열지 않는다.
        onPointerEnter={(event) => {
          triggerRef.current = event.currentTarget
          if (!event.currentTarget.contains(event.target as Node)) event.preventDefault()
        }}
      >
        {children}
      </HoverCardTrigger>
      {has ? (
        // 줄은 카드 폭을 따른다(좁은 카드 · 축소한 캔버스에서도 작은 카드 5개가 보이게 최소 256). 자리는 stripPlace. 상세를 열면 닫는다.
        //   줄 안을 누르는 것이 카드(고르기 · 끌기)로 번지지 않게 막는다 — 줄은 body 로 나가 있어도 React 에서는 카드 아래다.
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={place.side}
          alignOffset={place.align}
          avoidCollisions={false}
          className="w-(--radix-hover-card-trigger-width) min-w-64 max-w-[26rem] p-2"
          onClick={stop}
          onPointerDown={stop}
          onDoubleClick={stop}
          data-testid="version-history-hover"
        >
          <VersionStrip
            cards={cards}
            more={more}
            aspect={aspect}
            onOpen={(id) => { setOpen(false); onOpen(id) }}
            onMore={() => { setOpen(false); onMore() }}
          />
        </HoverCardContent>
      ) : null}
    </HoverCard>
  )
}

/** 실사 이미지 판(Director · Storyboard 가 같은 판 기록)의 작은 카드 — 이름 v{n}, 올린 그림 · 멈춘 뒤 끝난 그림은 덧말. */
export function imageVersionCards(versions: readonly PastImageVersion[], t: ReturnType<typeof useT>): VersionStripCard[] {
  return versions.map((version) => ({
    id: version.id,
    label: `v${version.n}`,
    thumbUrl: version.thumbUrl,
    note: version.upload ? t('Uploaded image') : version.stopped ? t('Finished after it was stopped') : null,
  }))
}

/** 프로젝트 화면비("16:9")를 작은 칸 비율("16 / 9")로. 모르면 16:9. */
export function stripAspect(ratio: string | null | undefined): string {
  const [w, h] = (ratio ?? '16:9').split(':').map(Number)
  return w && h ? `${w} / ${h}` : '16 / 9'
}
