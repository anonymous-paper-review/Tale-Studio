'use client'

// 연출 화살표 레이어 편집기(#arrow-layer 실험 2026-08-09) — 샷 상세 팝업의 새 본문.
//
// DIRECTING 프레임의 화살표는 픽셀에 구워져 있다. 레이어 트릭:
//   밑층 = Grok i2i 로 화살표만 지운 클린 플레이트(서버 캐시, 재생성 시 무효)
//   위층 = 원본 DIRECTING 프레임을 올린 캔버스
// 지우개(destination-out)로 위층을 긁으면 밑층이 드러난다 = 기존 화살표 삭제.
// 펜으로 위층에 새 화살표를 그리고, 저장 시 두 층을 평탄화해 direction 프레임에 upsert.
import { useEffect, useRef, useState } from 'react'
import { Eraser, Layers, Loader2, Pen, RotateCcw, Save, Trash2, Undo2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { withCacheBust } from '@/components/rough-frame-cycle'
import { cn } from '@/lib/utils'
import type { RoughStoryboardImage } from '@/types'
import { translate, useT } from '@/lib/i18n'
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

export function DirectingArrowEditor({
  projectId,
  shotId,
  panel,
  onSaved,
}: {
  projectId: string
  shotId: string
  panel: RoughStoryboardImage
  onSaved: () => void
}) {
  const t = useT()
  const directionUrl = panel.frames?.direction
    ? withCacheBust(panel.frames.direction, panel.generatedAt)
    : null
  // 서버 캐시가 현 generatedAt 파생이면 재분리 없이 바로 밑층으로 쓴다(재과금 방지).
  const freshClean =
    panel.cleanDirection && panel.cleanDirection.for === panel.generatedAt
      ? panel.cleanDirection.url
      : null
  const [cleanUrl, setCleanUrl] = useState<string | null>(freshClean)
  const effectiveClean = cleanUrl ?? freshClean

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

  // effect 의 .catch() 안에서 쓸 문자열은 미리 번역해 둔다 — t 자체를 deps 에 넣으면 매 렌더
  //   재실행되므로, 값(문자열)만 deps 에 넣어 로케일이 실제로 바뀔 때만 재실행되게 한다.
  const failedToLoadFrameMsg = t('Could not load the DIRECTING frame')

  // 원본 DIRECTING 프레임 → 위층 캔버스. directionUrl 은 generatedAt 캐시버스트를 포함하므로
  //   저장 후(loadProject 로 generatedAt 갱신) 이 effect 가 저장본을 새 "원본"으로 다시 깐다.
  useEffect(() => {
    if (!directionUrl) return
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
      })
      .catch(() => {
        if (!cancelled) toast.error(failedToLoadFrameMsg)
      })
    return () => {
      cancelled = true
    }
  }, [directionUrl, failedToLoadFrameMsg])

  const busy = separating || saving
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
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
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
      const res = await fetch('/api/writer/rough-directing-edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'separate', projectId, shotId }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`)
      setCleanUrl(j.data.cleanUrl as string)
      setTool('eraser') // 분리 직후 자연스러운 다음 동작 = 긁어보기
      toast.success(
        j.data.cached
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
   * 저장 (+ 선택적으로 END 재생성).
   * regenerateEnd: 화살표를 고쳤으면 "그 화살표가 끝난 뒤의 그림"인 END 도 따라가야 한다 —
   *   안 그러면 편집이 DIRECTING 한 장에만 남고 3프레임 세트가 서로 다른 이야기를 한다.
   *   과금이 걸리므로 기본 [저장]과 갈라 놓고, 누른 사람만 i2i 를 태운다.
   */
  const handleSave = async (regenerateEnd = false) => {
    const top = topCanvasRef.current
    if (!top || !ready) return
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
      const res = await fetch('/api/writer/rough-directing-edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          projectId,
          shotId,
          image: out.toDataURL('image/png'),
        }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`)
      if (!regenerateEnd) {
        toast.success(t('Saved the DIRECTING frame'))
        onSaved()
        return
      }
      // 저장이 끝난 뒤(= 서버가 새 DIRECTING 을 갖고 있는 상태) END 를 그 그림 기준으로 다시 그린다.
      toast.info(t('Redrawing the END frame, about 30 seconds'))
      const endRes = await fetch('/api/writer/rough-directing-edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate-end', projectId, shotId }),
      })
      const endJson = await endRes.json().catch(() => null)
      if (!endRes.ok) throw new Error(endJson?.error ?? `HTTP ${endRes.status}`)
      toast.success(t('Saved DIRECTING and regenerated the END frame'))
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('Save failed'))
    } finally {
      setSaving(false)
    }
  }

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
          컨테이너 비율을 원본 프레임 비율로 고정해 좌표가 어긋나지 않게 한다. */}
      <div
        className="relative w-full overflow-hidden rounded-lg border bg-muted"
        style={{ aspectRatio: dims ? `${dims.w} / ${dims.h}` : '16 / 9' }}
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
            !ready || busy ? 'cursor-wait' : canDraw ? 'cursor-none' : 'cursor-not-allowed',
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

      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {effectiveClean
            ? t(
                'Scrape the top layer with the eraser to reveal the arrow-free layer underneath. Draw new arrows with the pen.',
              )
            : t('The pen works right away. To erase existing arrows, separate the layers first.')}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !ready}
          onClick={() => void handleSave()}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {t('Save')}
        </Button>
        {/* 화살표를 고쳤으면 END 도 그 화살표를 따라가야 한다(#end-from-direction). 이미지 생성이
            한 번 걸리므로 기본 저장과 갈라 두고, 누른 사람만 과금을 태운다. */}
        <Button
          size="sm"
          disabled={busy || !ready}
          onClick={() => void handleSave(true)}
          title={t('Redraw the END frame based on the saved DIRECTING frame (1 image generation)')}
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Wand2 className="size-3.5" />
          )}
          {t('Save, then regenerate END')}
        </Button>
      </div>
    </div>
  )
}
