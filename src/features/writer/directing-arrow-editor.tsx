'use client'

// 연출 화살표 레이어 편집기(#arrow-layer 실험 2026-08-09) — 샷 상세 팝업의 새 본문.
//
// DIRECTING 프레임의 화살표는 픽셀에 구워져 있다. 레이어 트릭:
//   밑층 = Grok i2i 로 화살표만 지운 클린 플레이트(서버 캐시, 재생성 시 무효)
//   위층 = 원본 DIRECTING 프레임을 올린 캔버스
// 지우개(destination-out)로 위층을 긁으면 밑층이 드러난다 = 기존 화살표 삭제.
// 펜으로 위층에 새 화살표를 그리고, 저장 시 두 층을 평탄화해 direction 프레임에 upsert.
// 실사 가운데 장(오너 2026-11-27 N4b)도 같은 부품을 쓴다(surface 'real') — 요청은 실사 주소로 가고, 읽은 줄 알림 · 잠금만 다르다.
//   약속(실사): tests/writer/real-arrow-editor.test.ts
import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react'
import { Eraser, Layers, Loader2, Pen, RotateCcw, Save, Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { withCacheBust } from '@/components/rough-frame-cycle'
import { cn } from '@/lib/utils'
import type { RoughStoryboardImage } from '@/types'
import { translate, useT } from '@/lib/i18n'
import { reloadAfterRoughFrameEdit } from '@/lib/writer/rough-frame-refresh'
import { askLineText, endAskAfterSave } from '@/lib/writer/end-frame-ask'
import { freshDirectionRead } from '@/lib/writer/direction-read'
import { directingEditUrl, directingSaveBody, type DirectingSurface } from '@/lib/writer/directing-edit-url'
import { warnBeforeLeaving } from '@/features/writer/unsaved-arrows-confirm'
import { useLocaleStore } from '@/stores/locale-store'

const UNDO_LIMIT = 10
// 지우개는 같은 슬라이더 값에서 펜보다 넓게 — 화살표 한 획을 몇 번에 걷어낼 수 있는 실용 배율.
const ERASER_WIDTH_MULT = 3
// 모듈 상수는 영어 키, 번역은 렌더 지점에서 t() (writer-progress.tsx 의 STAGE_LABELS 패턴).
const PEN_COLORS = [
  { label: 'Pencil', value: '#333333' },
  { label: 'Marker', value: '#dc2626' },
] as const

type Tool = 'pen' | 'eraser'
type Pt = { x: number; y: number }

// 컴포넌트 밖 순수 함수라 훅을 못 쓴다 — translate() + 현재 locale 직접 조회로 번역(#i18n-s5-batch3).
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // supabase storage 는 ACAO:* — 캔버스 오염 없이 픽셀 접근 가능
    img.onload = () => resolve(img)
    img.onerror = () =>
      reject(
        new Error(
          translate(useLocaleStore.getState().locale, 'Failed to load image: {src}', { src }),
        ),
      )
    img.src = src
  })
}

// 층 나누기 · 저장 요청을 보낼 곳(콘티 · 실사) — 물음 창도 같이 쓰는 순수 파일에 둔다.
export { directingEditUrl, type DirectingSurface } from '@/lib/writer/directing-edit-url'

/** 이 편집기에서 분리한 밑층 — 서버가 화살표를 지운 연출 그림 주소(?v= 포함)와 함께 둔다. */
export type SeparatedPlate = { url: string; direction: string }

/** 편집기 밑층(화살표를 지운 그림) — 지금 연출 그림에서 만든 것만 쓴다. 서버 캐시(cleanDirection)가 지금 그림(generatedAt)의 것이면
 *  그것, 아니면 이 편집기에서 지금 연출 그림(주소)을 분리한 것. 팝업을 연 채로 연출 그림을 다시 만들면 둘 다 옛 그림의 것이라 밑층이 없다 —
 *  옛 밑층을 그대로 쓰면 지우개로 긁을 때 바뀌기 전 그림이 드러나고 저장하면 새 연출 그림에 박혔다(2026-11-14 미들 프레임 고장).
 *  분리값은 그림 시각이 아니라 연출 그림 주소로 묶는다 — 분리하는 동안 시작 · 끝만 다시 그려도 연출 그림은 그대로다(검토 낮음 2 ①).
 *  순수 함수 — 테스트 대상(tests/writer/directing-clean-plate.test.ts). */
export function cleanPlateFor(
  panel: Pick<RoughStoryboardImage, 'generatedAt' | 'cleanDirection' | 'frames'>,
  separated: SeparatedPlate | null,
): string | null {
  if (panel.cleanDirection && panel.cleanDirection.for === panel.generatedAt) return panel.cleanDirection.url
  if (separated && !!panel.frames?.direction && separated.direction === panel.frames.direction) return separated.url
  return null
}

/** 밑층이 없으면 지우개는 그릴 수 없다 — 펜으로 돌린다(검토 낮음 1: 지우개가 눌린 채 금지 커서로 남았다). 순수 함수 — 테스트 대상. */
export function toolWithPlate(tool: Tool, hasPlate: boolean): Tool {
  return tool === 'eraser' && !hasPlate ? 'pen' : tool
}

/** 위층(원본 + 그리던 자국 · 되돌리기)을 다시 깔지 — 연출 그림(주소, ?v= 포함)이 바뀔 때만. 시작 · 끝만 다시 그리면
 *  그림 시각만 바뀌므로 그리던 화살표를 그대로 둔다(재검토 c 3 — 예전엔 그림 시각으로 다시 깔아 저장 전 자국이 사라졌다). 순수 함수 — 테스트 대상. */
export function reloadsTopLayer(loaded: string | null, direction: string | null | undefined): boolean {
  return !!direction && direction !== loaded
}

/** 세로 · 정사각 그림 칸의 높이 상한 — 화면 높이에서 창 머리 · 도구 줄 · 저장 줄 · 창 아래 단추 몫(26rem)을 뺀다.
 *  1440×900 · 1280×720 · 400 폭에서 잰 값(리드 2026-11-23 QA 본 것 b). 아주 낮은 화면에서도 그릴 수 있게 12rem 아래로는 줄이지 않는다. */
const EDITOR_FRAME_MAX_HEIGHT = 'max(12rem, 100dvh - 26rem)'

/** 편집기 그림 칸 — 원본 프레임 비율로 고정해 좌표가 어긋나지 않게 한다. 세로 · 정사각 그림은 높이가 화면 안에 들어오게 폭을 줄인다
 *  (세로 9:16 이 칸 폭을 다 써 984px 높이가 되어 저장 줄이 그림 아래를 덮었다). 가로 그림은 지금처럼 칸 폭을 다 쓴다. 순수 함수 — 테스트 대상. */
export function editorFrameStyle(dims: { w: number; h: number } | null): CSSProperties {
  if (!dims) return { aspectRatio: '16 / 9' }
  const aspectRatio = `${dims.w} / ${dims.h}`
  if (dims.h < dims.w) return { aspectRatio }
  return { aspectRatio, width: `min(100%, calc(${EDITOR_FRAME_MAX_HEIGHT} * ${dims.w} / ${dims.h}))` }
}

/** 화면 좌표 → 위층 캔버스(원래 그림 해상도) 좌표 — 그림 칸이 줄어 보여도 비율로 옮기므로, 저장하면(위층 크기 그대로 합침)
 *  원래 그림의 같은 자리에 남는다(리드 2026-11-23). 순수 함수 — 테스트 대상. */
export function displayToCanvasPoint(
  client: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  canvas: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: ((client.x - rect.left) / rect.width) * canvas.width,
    y: ((client.y - rect.top) / rect.height) * canvas.height,
  }
}

/** 분리 답 읽기 — 409(stale_direction)면 화면이 서버보다 낡았다: 알리고 지금 그림을 다시 읽는다(위층도 맞춘다). 테스트 대상. */
export async function readSeparateResponse(
  res: Response,
  onStale: { notify: () => void; reload: () => Promise<void> },
): Promise<{ cleanUrl: string; cached: boolean } | null> {
  const j = await res.json().catch(() => null)
  if (res.status === 409 && j?.code === 'stale_direction') {
    onStale.notify()
    await onStale.reload()
    return null
  }
  if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`)
  return { cleanUrl: j.data.cleanUrl as string, cached: !!j.data.cached }
}

/** 편집기를 연 창이 부르는 것 — 창 아래 [적용] · 물음 창 [저장하고 닫기]가 그린 것을 저장한다(2026-11-14 리드 ①②). */
export interface DirectingArrowEditorHandle {
  /** 그린 것을 저장한다(편집기 [저장]과 같다) — 저장했으면 true, 안 됐으면 알리고 false. */
  save: () => Promise<boolean>
}

export function DirectingArrowEditor({
  projectId,
  shotId,
  panel,
  onSaved,
  onDirtyChange,
  onArrowsSaved,
  onRedrawEnd,
  surface = 'rough',
  lockedReason = null,
  ref,
}: {
  projectId: string
  shotId: string
  panel: RoughStoryboardImage
  /** 고치는 그림 — 기본 콘티. 'real' 이면 요청이 실사 주소로 가고 읽은 줄 알림이 실사 말이다. */
  surface?: DirectingSurface
  /** 지금 고칠 수 없는 까닭(그 샷을 그리는 중 — 실사 N4b 혼자 정한 것 g). 있으면 그리기 · 층 나누기 · 저장을 끄고 까닭을 보인다. */
  lockedReason?: string | null
  onSaved: () => void
  /** 저장하지 않은 화살표(되돌리기 칸)가 생기거나 없어질 때 — 창이 [적용]을 켜고 닫기 전에 묻는다. */
  onDirtyChange?: (dirty: boolean) => void
  /** 그린 화살표를 저장한 뒤 — 창이 끝 장도 다시 그릴지 묻는다(D10). 고를 때까지 저장이 끝나지 않는다([적용] · [저장하고 닫기]는 고른 뒤 닫힌다). */
  onArrowsSaved?: () => Promise<void> | void
  /** 편집기 아래 "AI 가 읽은 움직임" 줄의 [고쳐서 끝 장 다시 그리기] — 창이 끝 장 물음을 연다(D10 ② · 리드 Q-b). */
  onRedrawEnd?: () => void
  ref?: React.Ref<DirectingArrowEditorHandle>
}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  // 지금 연출 장을 읽은 줄(낡은 줄은 안 보인다). 영상은 이 줄을 바로 쓴다(리드 D2 2026-11-23). 그 줄로 그린 끝 장이 지금 끝 장이 아니면
  //   끝 장 · 실사에는 아직 안 쓴 줄이다 — 실사는 끝 장을 그 줄로 그린 뒤에만 줄을 싣는다(리드 Q-a · 오너 R1).
  const directionRead = freshDirectionRead(panel)
  const readUnused = !!directionRead && directionRead.endDrawn !== (panel.frames?.end ?? null)
  const directionUrl = panel.frames?.direction
    ? withCacheBust(panel.frames.direction, panel.generatedAt)
    : null
  // 서버 캐시가 현 generatedAt 파생이면 재분리 없이 바로 밑층으로 쓴다(재과금 방지). 이 편집기에서 분리한 밑층은
  //   어느 연출 그림(주소)에서 지운 것인지 함께 두어, 연출 그림이 다시 만들어지면 버린다(cleanPlateFor).
  const [separated, setSeparated] = useState<SeparatedPlate | null>(null)
  const effectiveClean = cleanPlateFor(panel, separated)

  const topCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPtRef = useRef<Pt | null>(null)
  const undoStackRef = useRef<ImageData[]>([])
  const [undoCount, setUndoCount] = useState(0)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0].value)
  const [penWidth, setPenWidth] = useState(6)
  const [separating, setSeparating] = useState(false)
  const [saving, setSaving] = useState(false)
  // 브러시 커서(#brush-cursor 2026-08-11) — 어느 굵기로 칠해지는지는 그어 보기 전엔 알 수 없다.
  //   화살표 커서 대신 **실제 크기의 원**을 따라다니게 해 "이만큼 칠해진다"를 미리 보여준다.
  //   좌표는 표시 크기(CSS px), 굵기는 캔버스 내부 픽셀이라 배율(displayScale)로 환산한다.
  const [hoverPt, setHoverPt] = useState<Pt | null>(null)
  const [displayScale, setDisplayScale] = useState(1)
  // 밑층이 없어지면(연출 그림을 다시 만듦) 지우개 대신 펜 — 안내("펜은 바로 써요")대로 바로 그린다(검토 낮음 1).
  useEffect(() => {
    const next = toolWithPlate(tool, !!effectiveClean)
    if (next !== tool) setTool(next)
  }, [tool, effectiveClean])

  // effect 의 .catch() 안에서 쓸 문자열은 미리 번역해 둔다 — t 자체를 deps 에 넣으면 매 렌더
  //   재실행되므로, 값(문자열)만 deps 에 넣어 로케일이 실제로 바뀔 때만 재실행되게 한다.
  const failedToLoadFrameMsg = t('Could not load the DIRECTING frame')

  // 원본 DIRECTING 프레임 → 위층 캔버스. 저장하거나 연출 그림을 다시 만들면 연출 그림 주소가 바뀌어 이 effect 가
  //   그 그림을 새 "원본"으로 다시 깐다. 시작 · 끝만 다시 그리면(그림 시각만 바뀜) 그리던 자국 · 되돌리기를 남긴다(재검토 c 3).
  const loadedDirectionRef = useRef<string | null>(null)
  const directionKey = panel.frames?.direction ?? null
  useEffect(() => {
    if (!directionUrl || !reloadsTopLayer(loadedDirectionRef.current, directionKey)) return
    let cancelled = false
    void loadImage(directionUrl)
      .then((img) => {
        if (cancelled) return
        const canvas = topCanvasRef.current
        if (!canvas) return
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d')?.drawImage(img, 0, 0)
        undoStackRef.current = []
        setUndoCount(0)
        setDims({ w: img.naturalWidth, h: img.naturalHeight })
        loadedDirectionRef.current = directionKey
      })
      .catch(() => {
        if (!cancelled) toast.error(failedToLoadFrameMsg)
      })
    return () => {
      cancelled = true
    }
  }, [directionUrl, directionKey, failedToLoadFrameMsg])

  // 저장하지 않은 화살표 = 되돌리기 칸이 하나라도 있음(불러오기 · 저장 뒤에는 비워진다). 사라지면(탭을 바꿈) 없는 것으로 알린다.
  const dirty = undoCount > 0
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  // 그린 채 페이지를 떠나거나 새로 고치면 브라우저가 묻는다 — 저장하면(되돌리기 칸이 비면) 푼다(검토 a 54016e65).
  useEffect(() => warnBeforeLeaving(window, dirty), [dirty])

  // 잠금(그 샷을 그리는 중)은 일하는 중(busy)과 같이 모든 단추를 끈다 — 커서만 다르다(기다림이 아니라 못 함).
  const locked = !!lockedReason
  const busy = separating || saving || locked
  const ready = !!dims
  // 지우개는 밑층이 있어야 의미가 있다 — 못 그리는 상태에선 원도 띄우지 않는다(거짓 신호 금지).
  const canDraw = ready && !busy && !(tool === 'eraser' && !effectiveClean)
  const brushWidth = tool === 'eraser' ? penWidth * ERASER_WIDTH_MULT : penWidth
  const cursorDiameter = Math.max(6, brushWidth * displayScale)

  const trackCursor = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    if (canvas.width > 0) setDisplayScale(rect.width / canvas.width)
    setHoverPt({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const canvas = e.currentTarget
    return displayToCanvasPoint({ x: e.clientX, y: e.clientY }, canvas.getBoundingClientRect(), canvas)
  }

  const drawSegment = (ctx: CanvasRenderingContext2D, from: Pt, to: Pt) => {
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth = penWidth * ERASER_WIDTH_MULT
    } else {
      ctx.strokeStyle = penColor
      ctx.lineWidth = penWidth
    }
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.restore()
  }

  const pushUndo = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const stack = undoStackRef.current
    stack.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (stack.length > UNDO_LIMIT) stack.shift()
    setUndoCount(stack.length)
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready || busy) return
    if (e.button !== 0) return
    // 지우개는 밑층(클린 플레이트)이 있어야 의미가 있다 — 없으면 구멍만 뚫린다.
    if (tool === 'eraser' && !effectiveClean) return
    const canvas = topCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    pushUndo(ctx, canvas)
    canvas.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const p = toCanvasPoint(e)
    lastPtRef.current = p
    drawSegment(ctx, p, p) // 클릭 한 번 = 점
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPtRef.current) return
    const ctx = topCanvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = toCanvasPoint(e)
    drawSegment(ctx, lastPtRef.current, p)
    lastPtRef.current = p
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false
    lastPtRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handleUndo = () => {
    const canvas = topCanvasRef.current
    const ctx = canvas?.getContext('2d')
    const snap = undoStackRef.current.pop()
    if (!canvas || !ctx || !snap) return
    ctx.putImageData(snap, 0, 0)
    setUndoCount(undoStackRef.current.length)
  }

  // 위층 전체 비우기 — 클린 플레이트만 남는다(화살표 전부 삭제 후 새로 그리는 흐름).
  const handleClearLayer = () => {
    const canvas = topCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !effectiveClean) return
    pushUndo(ctx, canvas)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  // 원본 복원 — 위층을 원본 DIRECTING 프레임으로 다시 채운다(펜·지우개 흔적 폐기).
  const handleReset = async () => {
    const canvas = topCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !directionUrl) return
    try {
      const img = await loadImage(directionUrl)
      pushUndo(ctx, canvas)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    } catch {
      toast.error(t('Could not reload the original'))
    }
  }

  const handleSeparate = async () => {
    setSeparating(true)
    try {
      // 화면이 보고 있는 연출 그림(주소)을 같이 보낸다 — 서버 그림이 그사이 바뀌었으면 서버가 그림 값을 쓰기 전에 거절한다(검토 낮음 2 ②).
      const direction = panel.frames?.direction ?? ''
      const res = await fetch(directingEditUrl(surface), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'separate', projectId, shotId, direction }),
      })
      // 낡은 화면 위에 새 그림의 밑층을 섞지 않는다 — 409 면 알리고 화면을 다시 읽어 위층도 지금 그림으로 맞춘다.
      const separatedPlate = await readSeparateResponse(res, {
        notify: () => toast.info(t('The directing frame changed in the meantime, so we loaded it again. Separate the layer again.')),
        // 감싼 까닭: 출시 시험 rough-frame-edit-refresh 가 저장 길의 다시 읽기 줄을 글자 그대로 세어 1개여야 한다 — 이 길은 그 셈 밖에 둔다.
        reload: () => reloadAfterRoughFrameEdit(projectId, () => onSaved()),
      })
      if (!separatedPlate) return
      setSeparated({ url: separatedPlate.cleanUrl, direction })
      setTool('eraser') // 분리 직후 자연스러운 다음 동작 = 긁어보기
      toast.success(
        separatedPlate.cached
          ? t('Loaded the previously separated layer')
          : t('Separated the arrow layer. Scrape with the eraser to reveal the layer underneath'),
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('Layer separation failed'))
    } finally {
      setSeparating(false)
    }
  }

  /**
   * 저장 — 편집기 [저장] · 창 [적용] · 물음 창 [저장하고 닫기] 셋 다 여기로 온다.
   * 화살표를 고쳤으면 "그 화살표가 끝난 뒤의 그림"인 끝 장도 따라가야 한다 — 안 그러면 세 장이 서로 다른 이야기를 한다.
   *   저절로 다시 그리지 않고(약속 I) 저장한 뒤 창이 묻는다(D10 · 2026-11-22 리드 Q2). 예전 [저장 후 END 재생성] 단추는 이 물음으로 합쳤다.
   */
  const handleSave = async (): Promise<boolean> => {
    const top = topCanvasRef.current
    if (!top || !ready) return false
    // 저장 전에 그린 것(되돌리기 칸)이 있었을 때만 끝 장을 묻는다 — 그린 것 없는 [저장]은 끝 장과 상관없다.
    const hadStrokes = undoStackRef.current.length > 0
    setSaving(true)
    try {
      // 평탄화: 밑층(클린 플레이트) → 위층 순서로 합성. 분리 전이면 위층 단독(원본+펜, 전면 불투명).
      const out = document.createElement('canvas')
      out.width = top.width
      out.height = top.height
      const ctx = out.getContext('2d')
      if (!ctx) throw new Error(t('Could not create a canvas context'))
      if (effectiveClean) {
        const base = await loadImage(effectiveClean)
        ctx.drawImage(base, 0, 0, out.width, out.height)
      }
      ctx.drawImage(top, 0, 0)
      const res = await fetch(directingEditUrl(surface), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(directingSaveBody(surface, { projectId, shotId, image: out.toDataURL('image/png'), direction: panel.frames?.direction })),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`)
      // 저장했으면 저장하지 않은 화살표는 없다 — 다시 불러오기(새 주소)를 기다리지 않고 바로 비운다(닫을 때 묻지 않게).
      undoStackRef.current = []
      setUndoCount(0)
      toast.success(t('Saved the DIRECTING frame'))
      await reloadAfterRoughFrameEdit(projectId, onSaved)
      // 저장은 끝났다 — 물음이 열려 있는 동안 편집기 단추가 돌지 않게 먼저 푼다.
      setSaving(false)
      if (endAskAfterSave(hadStrokes) === 'ask') await onArrowsSaved?.()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('Save failed'))
      return false
    } finally {
      setSaving(false)
    }
  }
  useImperativeHandle(ref, () => ({ save: () => handleSave() }))

  if (!directionUrl) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t('You need a 3-frame rough set to edit. Generate a panel first.')}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={effectiveClean ? 'outline' : 'secondary'}
          disabled={busy || !ready}
          onClick={() => void handleSeparate()}
          className="hover-red-beam"
        >
          {separating ? <Loader2 className="size-3.5 animate-spin" /> : <Layers className="size-3.5" />}
          {effectiveClean ? t('Re-separate layer') : t('Separate arrow layer')}
        </Button>

        <div className="ml-1 flex items-center gap-1">
          <Button
            size="icon"
            variant={tool === 'pen' ? 'default' : 'ghost'}
            className="size-8"
            aria-label={t('Pen')}
            disabled={busy}
            onClick={() => setTool('pen')}
          >
            <Pen className="size-4" />
          </Button>
          <Button
            size="icon"
            variant={tool === 'eraser' ? 'default' : 'ghost'}
            className="size-8"
            aria-label={t('Eraser (available after separating layers)')}
            title={effectiveClean ? t('Eraser') : t('Available after separating layers')}
            disabled={busy || !effectiveClean}
            onClick={() => setTool('eraser')}
          >
            <Eraser className="size-4" />
          </Button>
        </div>

        {tool === 'pen' && (
          <div className="flex items-center gap-1">
            {PEN_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={t('Pen color: {color}', { color: t(c.label) })}
                onClick={() => setPenColor(c.value)}
                className={cn(
                  'size-5 rounded-full border-2 transition-transform',
                  penColor === c.value ? 'scale-110 border-ring' : 'border-transparent',
                )}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        )}

        <Slider
          className="w-24"
          min={2}
          max={24}
          step={1}
          value={[penWidth]}
          onValueChange={([v]) => setPenWidth(v)}
          aria-label={t('Thickness')}
        />
        {/* 실제 칠해지는 굵기 — 지우개는 배율이 붙으므로 슬라이더 값과 다르다. 그 값을 그대로 보여준다. */}
        <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {brushWidth}px
        </span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t('Undo')}
            disabled={busy || undoCount === 0}
            onClick={handleUndo}
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t('Erase all arrows (clear top layer)')}
            title={t('Erase all arrows')}
            disabled={busy || !effectiveClean}
            onClick={handleClearLayer}
          >
            <Trash2 className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t('Restore original')}
            title={t('Restore original')}
            disabled={busy || !ready}
            onClick={() => void handleReset()}
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
      </div>

      {/* 캔버스 — 밑층(클린 플레이트 img) 위에 위층 캔버스. 두 층 모두 컨테이너를 가득 채우고,
          컨테이너 비율을 원본 프레임 비율로 고정해 좌표가 어긋나지 않게 한다. 세로 · 정사각 그림은 화면 높이 안에 들어오게
          폭을 줄여 가운데 둔다 — 저장 줄이 그림을 덮지 않게(editorFrameStyle, 리드 2026-11-23). */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-lg border bg-muted"
        style={editorFrameStyle(dims)}
      >
        {effectiveClean ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={effectiveClean}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 size-full"
          />
        ) : null}
        <canvas
          ref={topCanvasRef}
          className={cn(
            'absolute inset-0 size-full touch-none',
            // 그릴 수 있을 땐 네이티브 커서를 감춘다 — 아래 원이 커서 역할을 대신한다.
            locked ? 'cursor-not-allowed' : !ready || busy ? 'cursor-wait' : canDraw ? 'cursor-none' : 'cursor-not-allowed',
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={(e) => {
            trackCursor(e)
            handlePointerMove(e)
          }}
          onPointerEnter={trackCursor}
          onPointerLeave={() => setHoverPt(null)}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {/* 브러시 미리보기 원 — 실제 칠해지는 지름. 밝은 그림 위에서도 보이게 안팎 두 겹 테두리. */}
        {canDraw && hoverPt && (
          <span
            aria-hidden
            className="pointer-events-none absolute z-10 rounded-full border border-foreground/80 ring-1 ring-background/90"
            style={{
              width: cursorDiameter,
              height: cursorDiameter,
              left: hoverPt.x,
              top: hoverPt.y,
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center" aria-busy="true">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* 저장 줄 · 안내 줄은 그림 크기와 상관없이 늘 보인다 — 세로 그림이면 그림 아래 화면 밖이라 저장을 못 찾았다(리드 ③). */}
      <div className="sticky bottom-0 z-20 flex items-center gap-3 bg-side py-2" data-testid="directing-editor-save-row" data-locked={locked ? 'true' : undefined}>
        {/* 한국어 안내가 낱말 가운데서 끊기지 않게 낱말 단위로 줄을 바꾼다("…새 화살표 / 를 그려요" — 2026-11-14 다시 돌리기). */}
        {/* 잠겨 있으면(그 샷을 그리는 중) 쓰는 법 대신 고칠 수 없는 까닭을 보인다. */}
        <p className="min-w-0 flex-1 break-keep text-xs text-muted-foreground" role={locked ? 'status' : undefined}>
          {lockedReason ? lockedReason : effectiveClean
            ? t(
                'Scrape the top layer with the eraser to reveal the arrow-free layer underneath. Draw new arrows with the pen.',
              )
            : t('The pen works right away. To erase existing arrows, separate the layers first.')}
        </p>
        {/* 끝 장 다시 그리기는 저장한 뒤 창이 묻는다(D10) — 따로 있던 [저장 후 END 재생성] 단추를 합쳤다. */}
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !ready}
          onClick={() => void handleSave()}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {t('Save')}
        </Button>
      </div>

      {/* AI 가 읽은 움직임(D10 ② · 리드 Q-b) — 물음 창을 닫은 뒤에도 보고 고친다. 끝 장에 아직 안 쓴 줄이면 영상에는 들어가고
          끝 장 · 실사는 이 줄로 다시 그려야 맞는다고 알린다(리드 D2 2026-11-23 — 끝 장을 먼저 그려야 실사에 줄이 실린다). */}
      {directionRead ? (
        <div className="flex flex-col gap-1.5 rounded-lg bg-card px-3 py-2.5" data-testid="directing-read-line">
          {/* 사람이 고친 줄이면 "고친 움직임"(리드 2026-11-23) — [그대로]에서도 고친 줄이 남아 누가 쓴 줄인지 보이게. */}
          <span className="text-caption font-semibold text-subtle-foreground">{directionRead.source === 'user' ? t('Edited movement') : t('Motion the AI read')}</span>
          <p className="break-keep text-caption text-foreground">{askLineText(directionRead, locale)}</p>
          {readUnused && surface === 'rough' ? (
            <p className="break-keep text-caption text-muted-foreground">{t('Videos use this line. To match, redraw the end frame with it, then the live-action images.')}</p>
          ) : null}
          {/* 실사(N4b)는 저장하면 끝 장을 저절로 다시 그린다 — 아직 그 줄로 안 그렸으면(그리는 중 · 실패) 그렇다고만 알린다. 잠겨 있으면 까닭 줄이 대신한다. */}
          {readUnused && surface === 'real' && !locked ? (
            <p className="break-keep text-caption text-muted-foreground">{t('The end frame is not drawn from this line yet. Videos use this line.')}</p>
          ) : null}
          {onRedrawEnd ? (
            <Button size="sm" variant="outline" className="self-start" disabled={busy} onClick={onRedrawEnd} data-testid="directing-read-line-redraw">
              {t('Edit and redraw the end frame')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
