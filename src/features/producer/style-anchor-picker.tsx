'use client'

// 스타일 선택기 — 트리거(children) 클릭 시 그리드/슬라이더 두 뷰 팝업(#b1 2026-07-18).
//   readiness-board 의 Story Foundation 줄에서 살다가 퀘스트 저널 뱃지로 이사(#quest-journal
//   2026-08-07) — 트리거를 children 으로 받아 호출자가 모양(뱃지/콤보박스)을 정한다.
//   실제 I2I 레퍼런스 이미지(anchor.imageUrl)는 노출하지 않는다. 선택 표시는 라벨 텍스트로만.

import { useCallback, useRef, useState, type ReactNode } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GalleryHorizontal,
  ImageIcon,
  LayoutGrid,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { StyleAnchor } from '@/stores/producer-store'
import { cn } from '@/lib/utils'
import { ThumbImage } from '@/components/thumb-image'

// medium 슬러그(2d_cartoon 등)를 표시용으로 정리 — 언더바 제거 + 단어별 대문자, 2d/3d는 통째 대문자.
//   예) 2d_cartoon → "2D Cartoon", live_action → "Live Action", 3d → "3D".
function prettyMedium(medium: string): string {
  return medium
    .split('_')
    .map((w) => (/^\d+d$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** 예시 이미지 + 라벨 카드 내용(그리드·슬라이더 공용). */
function StyleAnchorCardBody({ anchor, active }: { anchor: StyleAnchor; active: boolean }) {
  return (
    <>
      {/* 예시 이미지(preview_url) — I2I 레퍼런스(anchor.imageUrl)와 분리된 표시 전용.
          정사각 원본을 그대로 보여준다. 프리뷰 없으면 플레이스홀더 폴백. */}
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted">
        {anchor.previewUrl ? (
          <ThumbImage
            src={anchor.previewUrl}
            alt={anchor.label}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground opacity-40" />
        )}
        {active ? (
          <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="size-3" />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2">
        <span className="line-clamp-1 text-sm font-medium text-foreground">{anchor.label}</span>
        {anchor.medium ? (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {anchor.subtitle ?? prettyMedium(anchor.medium)}
          </span>
        ) : null}
      </div>
    </>
  )
}

type StyleView = 'grid' | 'slider'

export function StyleAnchorPicker({
  anchors,
  value,
  onSelect,
  children,
  open: openProp,
  onOpenChange,
}: {
  anchors: StyleAnchor[]
  value: string | null
  onSelect: (key: string) => void
  /** 팝업을 여는 트리거 — 호출자가 모양을 정한다 (퀘스트 저널에선 설정 뱃지). */
  children: ReactNode
  /** 제어 모드 — 호출자가 열림을 소유한다(스토리 확정 시 자동 오픈, #style-timing). 미지정이면 내부 상태. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const setOpen = (o: boolean) => {
    setUncontrolledOpen(o)
    onOpenChange?.(o)
  }
  // stacked deck(slider)를 기본 뷰로(#b1 2026-07-18).
  const [view, setView] = useState<StyleView>('slider')
  const [slide, setSlide] = useState(0)
  const selectedIdx = Math.max(0, anchors.findIndex((a) => a.key === value))

  // 슬라이더로 전환하거나 팝업을 열 때 현재 선택 카드로 위치를 맞춘다.
  const syncSlideToSelected = () => setSlide(selectedIdx)

  // 뷰 전환 애니메이션(#b1):
  //   - 팝업 크기: 뷰별 max-width(위 DialogContent) + 내용 높이를 측정해 래퍼 height 트랜지션.
  //   - 카드 진입("딜"): 덱/그리드 카드가 각자 자리로 날아든다 — 위치 transform 은 바깥 래퍼가,
  //     진입 애니메이션은 안쪽 버튼의 CSS animate-in 이 담당(둘이 곱해져 충돌 없음). 뷰를 바꾸면
  //     카드가 새로 마운트돼 애니메이션이 다시 재생된다(별도 상태 불요).
  // 내용 높이 측정 → 래퍼 height 트랜지션(뷰 전환 시 팝업 높이가 부드럽게 변함).
  //   콜백 ref 로 ResizeObserver 를 붙인다 — 포털(radix Dialog) 콘텐츠가 부모 effect 보다
  //   늦게 마운트돼도, 노드가 실제로 붙는 그 순간 관찰이 시작돼 측정이 누락되지 않는다.
  //   (닫힘/재오픈 시 내용이 안 보이던 버그 수정, 2026-07-18)
  const [bodyH, setBodyH] = useState<number>()
  const roRef = useRef<ResizeObserver | null>(null)
  const bodyRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    const ro = new ResizeObserver(() => setBodyH(el.offsetHeight))
    ro.observe(el)
    roRef.current = ro
  }, [])

  const choose = (key: string) => {
    onSelect(key)
    setOpen(false)
  }
  const move = (dir: 1 | -1) =>
    setSlide((i) => (i + dir + anchors.length) % anchors.length)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) syncSlideToSelected()
        // 닫을 때 측정 높이 리셋 → 재오픈 시 auto 로 시작해 stale 높이로 클리핑되지 않는다.
        else setBodyH(undefined)
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className={cn(
          // 뷰별 팝업 폭 + 전환 애니메이션(#b1) — 덱은 좁게, 그리드는 넓게, max-width 를 트랜지션.
          'transition-[max-width] duration-300 ease-out',
          view === 'grid' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
        // 키보드 확정(#style-keys 2026-08-11) — ←/→ 로 덱을 넘기고 Enter 로 앞 카드를 확정한다.
        //   자동 오픈된 팝업을 마우스 없이 닫을 수 있는 유일한 긍정 경로(Esc 는 취소).
        onKeyDown={(e) => {
          if (anchors.length === 0 || view !== 'slider') return
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            move(e.key === 'ArrowRight' ? 1 : -1)
            return
          }
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            const front = anchors[((slide % anchors.length) + anchors.length) % anchors.length]
            if (front) choose(front.key)
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>스타일 선택</DialogTitle>
          <DialogDescription>
            영상 전체에 적용할 시각 스타일을 골라 주세요.
          </DialogDescription>
          {/* 뷰 전환 토글 — 우상단(닫기 X 왼쪽). grid ↔ sliding card. */}
          {anchors.length > 0 ? (
            <div className="absolute right-12 top-4 inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5">
              <button
                type="button"
                aria-label="그리드 보기"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
                className={cn(
                  'flex size-6 items-center justify-center rounded transition-colors',
                  view === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutGrid className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="슬라이드 보기"
                aria-pressed={view === 'slider'}
                onClick={() => {
                  syncSlideToSelected()
                  setView('slider')
                }}
                className={cn(
                  'flex size-6 items-center justify-center rounded transition-colors',
                  view === 'slider' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <GalleryHorizontal className="size-3.5" />
              </button>
            </div>
          ) : null}
        </DialogHeader>
        {/* 뷰 전환 시 팝업 높이가 부드럽게 변하도록, 내용 높이를 측정해 래퍼 height 를 트랜지션. */}
        <div
          className="overflow-hidden transition-[height] duration-300 ease-out"
          style={{ height: bodyH }}
        >
        <div ref={bodyRef}>
        {anchors.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            아직 등록된 스타일이 없어요.
          </p>
        ) : view === 'grid' ? (
          // 그리드 진입 시 카드가 아래에서 살짝 확대되며 순차로 날아든다(#b1).
          <div
            key="grid"
            className="scrollbar-thin grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto p-0.5 sm:grid-cols-3"
          >
            {anchors.map((anchor, i) => (
              <button
                key={anchor.key}
                type="button"
                onClick={() => choose(anchor.key)}
                style={{ animationDelay: `${i * 35}ms`, animationFillMode: 'backwards' }}
                className={cn(
                  'group flex flex-col overflow-hidden rounded-lg border text-left transition-colors',
                  'animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-300',
                  anchor.key === value
                    ? 'border-primary ring-2 ring-primary/50'
                    : 'border-border hover:border-primary/60',
                )}
              >
                <StyleAnchorCardBody anchor={anchor} active={anchor.key === value} />
              </button>
            ))}
          </div>
        ) : (
          <div className="p-0.5">
            {/* Stacked sliding card(#b1 2026-07-18) — 활성 카드를 앞으로, 양옆은 뒤로 겹쳐 쌓는 덱.
                각 카드 위치를 활성 인덱스와의 wrap-around 거리(offset)로 계산 → 마지막→첫 카드로
                넘어가도 offset 이 1씩 밀릴 뿐이라 트랙 리셋 없는 자연스러운 무한 루프. */}
            <div className="relative flex h-[19rem] items-center justify-center overflow-hidden">
              {anchors.map((anchor, i) => {
                const n = anchors.length
                // 활성(slide)로부터의 최단 부호 거리 — 무한 루프의 핵심.
                let off = i - slide
                if (off > n / 2) off -= n
                if (off < -n / 2) off += n
                const abs = Math.abs(off)
                const hidden = abs > 2
                const isFront = off === 0
                return (
                  <div
                    key={anchor.key}
                    // 숨은 카드는 transition 없이 순간이동(opacity 0이라 안 보임) → 마지막↔첫 카드
                    //   전환 시 반대편 카드가 화면을 가로질러 슬라이드하는 어색함을 없앤다(무한 루프).
                    className={cn(
                      'absolute',
                      hidden ? 'transition-none' : 'transition-all duration-300 ease-out',
                    )}
                    style={{
                      transform: `translateX(${off * 42}%) scale(${1 - abs * 0.16})`,
                      opacity: hidden ? 0 : 1 - abs * 0.32,
                      zIndex: 30 - abs,
                      pointerEvents: hidden ? 'none' : 'auto',
                    }}
                    aria-hidden={hidden}
                  >
                    <button
                      type="button"
                      // 앞 카드 클릭 = 선택, 옆 카드 클릭 = 그 카드를 앞으로.
                      onClick={() => (isFront ? choose(anchor.key) : setSlide(i))}
                      tabIndex={hidden ? -1 : 0}
                      // 진입 딜(#b1): 마운트 시 작게 튀어나오듯 확대+페이드, 바깥 카드일수록 늦게(cascade).
                      //   위치는 래퍼가 잡으므로 여기선 scale/opacity만 → 스택 transform과 곱해져 충돌 없음.
                      style={{ animationDelay: `${abs * 55}ms`, animationFillMode: 'backwards' }}
                      className={cn(
                        'group flex w-56 flex-col overflow-hidden rounded-xl border bg-card text-left shadow-lg transition-colors',
                        'animate-in fade-in-0 zoom-in-50 duration-500',
                        anchor.key === value
                          ? 'border-primary ring-2 ring-primary/50'
                          : isFront
                            ? 'border-border hover:border-primary/60'
                            : 'border-border',
                      )}
                    >
                      <StyleAnchorCardBody anchor={anchor} active={anchor.key === value} />
                    </button>
                  </div>
                )
              })}
              {/* 좌우 이동 화살표 — 덱 위(z 최상단) */}
              <button
                type="button"
                aria-label="이전 스타일"
                onClick={() => move(-1)}
                className="absolute left-1 top-1/2 z-40 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                aria-label="다음 스타일"
                onClick={() => move(1)}
                className="absolute right-1 top-1/2 z-40 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            {/* 도트 인디케이터 — 클릭 시 해당 카드로 이동 */}
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {anchors.map((anchor, i) => (
                <button
                  key={anchor.key}
                  type="button"
                  aria-label={`${anchor.label}로 이동`}
                  onClick={() => setSlide(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === slide ? 'w-4 bg-primary' : 'w-1.5 bg-border hover:bg-muted-foreground',
                  )}
                />
              ))}
            </div>
          </div>
        )}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
