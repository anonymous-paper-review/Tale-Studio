'use client'

import { useEffect, useRef } from 'react'
import { useEditorStore, selectTimelineLayout } from '@/stores/editor-store'

const FRAME = 1 / 24 // 24fps 기준 한 프레임 (화살표 nudge)

/**
 * Editor 재생 엔진 + 전역 단축키.
 *   - 연속 재생: rAF 루프로 currentTime 진행. 끝에서 자동 정지.
 *   - 전역 키바인딩(포커스 무관): Space(재생/정지), ←/→(프레임 이동),
 *     Ctrl+Z(undo), Ctrl+Y / Ctrl+Shift+Z(redo), V(선택), C(자르기).
 * 페이지에서 1회 호출.
 */
export function useEditorPlayback() {
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  // ── 재생 루프 ──
  useEffect(() => {
    const tick = (ts: number) => {
      const { isPlaying, currentTime, seek, setPlaying } = useEditorStore.getState()
      if (!isPlaying) {
        lastTsRef.current = null
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts

      const layout = selectTimelineLayout(useEditorStore.getState())
      const total = layout.reduce((sum, l) => sum + l.durationSec, 0)
      const next = currentTime + dt
      if (next >= total) {
        seek(total)
        setPlaying(false)
      } else {
        seek(next)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // ── 전역 단축키 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 입력 필드에서 타이핑 중이면 무시 (오디오 이름 등 input/textarea)
      const tag = (e.target as HTMLElement | null)?.tagName
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable
      if (editable) return

      const s = useEditorStore.getState()
      const meta = e.ctrlKey || e.metaKey

      if (meta && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (meta && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        s.redo()
        return
      }
      if (meta) return // 다른 Ctrl 조합은 통과

      switch (e.key) {
        case ' ':
          e.preventDefault()
          s.togglePlay()
          break
        case 'ArrowRight':
          e.preventDefault()
          s.nudge(e.shiftKey ? 1 : FRAME)
          break
        case 'ArrowLeft':
          e.preventDefault()
          s.nudge(e.shiftKey ? -1 : -FRAME)
          break
        case 'v':
        case 'V':
          s.setToolMode('select')
          break
        case 'c':
        case 'C':
          s.setToolMode('cut')
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
