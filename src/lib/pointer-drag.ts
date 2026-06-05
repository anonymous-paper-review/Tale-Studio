// Pointer-event 기반 bin→트랙 드래그. HTML5 DnD 가 이 앱의 pointer 기반 타임라인/Radix ScrollArea 와
// 충돌해 drop 이 안 잡히는 문제를 우회한다. 임계값 이동 전까지는 클릭으로 처리.
//
// 드롭 판정: pointerup 위치의 elementFromPoint → closest(dropSelector).
//   고스트는 pointer-events:none 라 elementFromPoint 가 그 아래 드롭존을 본다.

interface BinDragArgs {
  event: { button: number; clientX: number; clientY: number }
  label: string
  dropSelector: string
  onClick?: () => void
  onDrop: (info: { target: Element; clientX: number; clientY: number }) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  threshold?: number
}

export function startBinDrag({
  event,
  label,
  dropSelector,
  onClick,
  onDrop,
  onDragStart,
  onDragEnd,
  threshold = 5,
}: BinDragArgs): void {
  if (event.button !== 0) return
  const startX = event.clientX
  const startY = event.clientY
  let dragging = false
  let ghost: HTMLDivElement | null = null

  const makeGhost = () => {
    ghost = document.createElement('div')
    ghost.textContent = label
    ghost.style.cssText =
      'position:fixed;z-index:9999;pointer-events:none;left:0;top:0;' +
      'padding:2px 8px;border-radius:4px;background:rgba(0,0,0,.82);color:#fff;' +
      'font-size:11px;font-family:var(--font-geist-mono,monospace);' +
      'transform:translate(-50%,-160%);white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4);'
    document.body.appendChild(ghost)
  }

  const move = (ev: PointerEvent) => {
    if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) > threshold) {
      dragging = true
      onDragStart?.()
      makeGhost()
      document.body.style.cursor = 'grabbing'
    }
    if (dragging && ghost) {
      ghost.style.left = `${ev.clientX}px`
      ghost.style.top = `${ev.clientY}px`
    }
  }

  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    if (ghost) ghost.remove()
    document.body.style.cursor = ''

    if (!dragging) {
      onClick?.()
      return
    }
    onDragEnd?.()
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(dropSelector)
    if (target) onDrop({ target, clientX: ev.clientX, clientY: ev.clientY })
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/** 드롭 대상(data-pps 속성 보유)의 화면 위치 + pxPerSec 로 클릭 X → 타임라인 초 변환 */
export function dropTargetSec(target: Element, clientX: number): number {
  const pps = Number((target as HTMLElement).dataset.pps) || 40
  const rect = target.getBoundingClientRect()
  return Math.max(0, (clientX - rect.left) / pps)
}
