'use client'

// 3프레임(START→DIRECTING→END) 순환 표시 — writer 러프 보드와 director 스토리보드(실사 3프레임,
//   #real-strip 2026-07-22)가 공유. 원래 rough-storyboard-view.tsx 로컬이던 것을 공용화.
import { useEffect, useState } from 'react'
import { Pause } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ThumbImage } from '@/components/thumb-image'
import type { RoughStoryboardImage } from '@/types/shot'
import { useT } from '@/lib/i18n'

// 재생성 즉시 반영: 스토리지 url 은 같은 경로 덮어쓰기(upsert)라 URL 이 동일 → 브라우저/CDN 캐시 잔상이 남는다.
//   generatedAt 을 쿼리로 붙여 매 생성마다 src 가 바뀌게 해 새 이미지를 즉시 가져온다.
export function withCacheBust(url: string, v?: number): string {
  if (!v) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${v}`
}

/** 순환에 쓸 프레임 원본 주소 목록 — frames 있으면 3장, 없으면(구버전 단일 패널) 1장.
 *  캐시버스트 쿼리는 여기서 붙고, 썸네일 치환은 ThumbImage 내부(thumbUrl)가 담당한다
 *  (toThumbUrl 이 쿼리를 분리해 확장자만 바꾸므로 ?v= 는 보존된다). 순수 함수 — 테스트 대상. */
export function cycleFrameUrls(
  panel: Pick<RoughStoryboardImage, 'url' | 'generatedAt' | 'frames'>,
): string[] {
  const f = panel.frames
  return f
    ? [f.start, f.direction, f.end].map((u) => withCacheBust(u, panel.generatedAt))
    : [withCacheBust(panel.url, panel.generatedAt)]
}

// 3프레임 순환 라벨 — START → DIRECTING(연출 화살표/지시) → END (2026-07-22 라벨 영문 통일).
const FRAME_LABELS = ['START', 'DIRECTING', 'END'] as const
// 순환 간격 — 1200ms 원복(2026-08-06 요청. 1000ms 상향분이 두 화면 모두 너무 빨랐다).
//   writer 러프 보드와 director Previz 가 같은 컴포넌트를 쓰므로 두 화면이 함께 느려진다.
const FRAME_CYCLE_MS = 1200

/** 3프레임 순환 표시(#rough-grid 2026-07-22) — 기본은 START 정지 프레임, hover 중에만 순환
 *  (전 카드 동시 재생은 정보 과다 — 2026-07-22 피드백). 점 클릭 = 그 프레임 고정(leave 시 리셋).
 *  frames 없는 구버전 패널(단일 이미지)은 정적 표시로 폴백.
 *  panel 은 RoughStoryboardImage 또는 구조 호환 StoryboardImage(실사 3프레임). */
export function RoughFrameCycle({
  panel,
  alt,
  introPlay = false,
  fit = 'cover',
  sizeToImage = false,
}: {
  panel: Pick<RoughStoryboardImage, 'url' | 'generatedAt' | 'frames'>
  alt: string
  /** 마운트 시 1회 전체 순환(START→DIRECTING→END→START) 후 정지 — writer 러프 보드 첫 진입용
   *  (#p1-quickwin W3 2026-08-05: "처음 탭 들어왔을 때 한 번에 모두 움직이고 그 다음은 호버만"). */
  introPlay?: boolean
  /** contain: 그림을 자르지 않고 전부 보여준다(러프 카드 — 연출 확인이 목적이라 잘리면 안 된다).
   *  cover: 상자를 꽉 채운다(썸네일 성격). */
  fit?: 'cover' | 'contain'
  /** 상자를 고정 16:9 로 두지 않고 **이미지 실제 비율**로 잡는다(#fit-tight 2026-08-11).
   *  러프 프레임은 그리드에서 잘려 나와 정확한 16:9 가 아니라, 고정 비율 상자 + contain 은
   *  좌우 띠를 남기고 cover 는 그림을 자른다 — 상자가 그림을 따라가면 둘 다 사라진다.
   *  이 모드에선 루트가 in-flow(w-full) 이므로 부모의 absolute 배치 상자가 필요 없다. */
  sizeToImage?: boolean
}) {
  const t = useT()
  const urls = cycleFrameUrls(panel)
  const [idx, setIdx] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [pinned, setPinned] = useState(false)
  // 클릭 = 현재 프레임 일시정지 잠금(중앙 ⏸) — director 영상 썸네일(HoverPlayVideo)과 같은 UX.
  //   잠금 중엔 인트로·hover 순환 모두 멈추고, 카드를 떠나도 프레임이 유지된다.
  const [pausedLock, setPausedLock] = useState(false)
  // sizeToImage: 첫 프레임 로드 시 실제 비율을 재서 상자에 반영. 로드 전엔 16:9 로 시작해
  //   레이아웃 점프를 한 번으로 줄인다(같은 세트는 비율이 같아 이후 프레임 전환엔 점프 없음).
  const [imageAr, setImageAr] = useState<number | null>(null)
  // reduced-motion 은 초기값에서 인트로를 건너뛴다 — effect 안 동기 setState 는 연쇄 렌더를
  //   유발해 lint 가 막는다(react-hooks/set-state-in-effect). SSR 은 matchMedia 부재 → 가드.
  const [introDone, setIntroDone] = useState(
    () =>
      !introPlay ||
      (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches),
  )
  const multi = urls.length > 1

  // 인트로 1회 재생 — hover 가 시작되면 즉시 양보한다.
  useEffect(() => {
    if (!multi || introDone || pausedLock) return
    let step = 0
    const t = setInterval(() => {
      step += 1
      if (step >= urls.length) {
        clearInterval(t)
        setIdx(0)
        setIntroDone(true)
        return
      }
      setIdx(step)
    }, FRAME_CYCLE_MS)
    return () => clearInterval(t)
  }, [multi, introDone, pausedLock, urls.length])

  useEffect(() => {
    if (!multi || !hovering || pinned || pausedLock) return
    const t = setInterval(() => setIdx((i) => (i + 1) % urls.length), FRAME_CYCLE_MS)
    return () => clearInterval(t)
  }, [multi, hovering, pinned, pausedLock, urls.length])

  const current = idx % urls.length
  return (
    <div
      className={sizeToImage ? 'relative w-full overflow-hidden bg-muted' : 'absolute inset-0'}
      style={sizeToImage ? { aspectRatio: imageAr ?? 16 / 9 } : undefined}
      onMouseEnter={() => {
        setIntroDone(true) // 인트로 중 hover 진입 → 인트로 중단, hover 순환이 이어받는다
        setHovering(true)
      }}
      onMouseLeave={() => {
        // 카드를 떠나면 START 정지 상태로 복귀 — 보드 전체가 조용해진다.
        //   단 일시정지 잠금 중엔 프레임 유지(영상 썸네일 잠금과 동일).
        setHovering(false)
        if (pausedLock) return
        setPinned(false)
        setIdx(0)
      }}
      onClick={(e) => {
        // 이미지 클릭 = 일시정지 토글. 카드의 클릭 액션(팝업 열기 등)과 충돌하지 않게 전파 차단
        //   — 단일 패널(순환 없음)은 개입하지 않고 카드 클릭으로 흘려보낸다.
        if (!multi) return
        e.stopPropagation()
        setIntroDone(true)
        setPausedLock((v) => !v)
      }}
    >
      {/* 프레임 전환 시 로딩 깜빡임 방지 — 3장을 모두 마운트하고 opacity 로 스위치.
          썸네일이면 3장 합쳐 ~45KB 라 동시 마운트와 궁합이 좋다. 각 장이 개별 404 폴백
          상태를 가져야 하므로 ThumbImage 인스턴스로 난다. sizeToImage 의 비율 측정은
          썸네일도 원본과 같은 비율이라 값이 같고, 폴백으로 onLoad 가 두 번 불려도
          같은 값 set 이라 무해. */}
      {urls.map((u, i) => (
        <ThumbImage
          key={u}
          src={u}
          alt={i === current ? alt : ''}
          aria-hidden={i !== current}
          onLoad={
            sizeToImage && i === 0
              ? (e) => {
                  const el = e.currentTarget
                  if (el.naturalWidth && el.naturalHeight) {
                    setImageAr(el.naturalWidth / el.naturalHeight)
                  }
                }
              : undefined
          }
          className={cn(
            'absolute inset-0 size-full transition-opacity duration-150',
            // sizeToImage 는 상자가 이미지 비율이라 cover=contain — 띠도 크롭도 없다.
            fit === 'contain' && !sizeToImage ? 'object-contain' : 'object-cover',
            i === current ? 'opacity-100' : 'opacity-0',
          )}
          draggable={false}
        />
      ))}
      {pausedLock && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <Pause className="size-6 fill-white text-white drop-shadow" />
        </span>
      )}
      {/* 인디케이터는 hover 중에만 — 기본 상태의 시각 노이즈 제거 */}
      {multi && hovering ? (
        <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-background/70 px-2 py-0.5 backdrop-blur-sm">
          {urls.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={t('Pin {label} frame', { label: FRAME_LABELS[i] })}
              onClick={(e) => {
                e.stopPropagation()
                setIdx(i)
                setPinned(true)
              }}
              className={cn(
                'size-1.5 rounded-full transition-colors',
                i === current ? 'bg-primary' : 'bg-muted-foreground/40 hover:bg-muted-foreground',
              )}
            />
          ))}
          <span className="ml-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">
            {FRAME_LABELS[current]}
          </span>
        </div>
      ) : null}
    </div>
  )
}
