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
      const st = useEditorStore.getState()
      const { isPlaying, currentTime, seek, setPlaying } = st
      // 소스 미리보기 중에는 타임라인 시계를 멈춤 (프리뷰어가 단일 클립을 직접 재생)
      if (!isPlaying || st.previewSourceShotId) {
        lastTsRef.current = null
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts

      const layout = selectTimelineLayout(st)
      const videoTotal = layout.reduce((sum, l) => sum + l.durationSec, 0)
      // 오디오가 영상보다 길면 그 끝까지 재생 (영상 끝에서 멈추지 않음 — 요청 5)
      const audioEnd = st.audioClips.reduce((m, a) => Math.max(m, a.startSec + a.durationSec), 0)
      const total = Math.max(videoTotal, audioEnd)
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
      // 입력 필드/셀렉트에서 조작 중이면 무시 (오디오 이름 input, 배속 select 등)
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      // 볼륨 등 range 슬라이더는 텍스트 입력이 아님 → 단축키 허용 (단, 화살표는 네이티브 볼륨 조절에 양보)
      const isRange = tag === 'INPUT' && (el as HTMLInputElement | null)?.type === 'range'
      const editable =
        (tag === 'INPUT' && !isRange) ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el?.isContentEditable
      if (editable) return
      if (isRange && e.key.startsWith('Arrow')) return // 슬라이더 포커스 시 화살표는 네이티브 처리

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
      // 프레임/컷 이동 (요청 8): ←/→ 1프레임, Shift+←/→ 5프레임, Ctrl/⌘+←/→ 다음·이전 컷(클립 경계)
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const dir = e.key === 'ArrowRight' ? 1 : -1
        if (meta) {
          const layout = selectTimelineLayout(s)
          const bounds = [0]
          let acc = 0
          for (const l of layout) {
            acc += l.durationSec
            bounds.push(acc)
          }
          const cur = s.currentTime
          let target: number
          if (dir > 0) target = bounds.find((b) => b > cur + 1e-3) ?? bounds[bounds.length - 1] ?? cur
          else {
            const prevs = bounds.filter((b) => b < cur - 1e-3)
            target = prevs.length ? prevs[prevs.length - 1] : 0
          }
          s.nudge(target - cur)
        } else {
          s.nudge((e.shiftKey ? 5 : 1) * dir * FRAME)
        }
        return
      }
      if (meta) return // 다른 Ctrl 조합은 통과

      switch (e.key) {
        case ' ':
          e.preventDefault()
          s.togglePlay()
          break
        case 'v':
        case 'V':
          s.setToolMode('select')
          break
        case 'c':
        case 'C':
          s.setToolMode('cut')
          break
        case 'Delete':
        case 'Backspace':
          // 선택된 타임라인 항목 제거 (오디오 우선, 없으면 선택된 비디오 클립 일괄)
          if (s.selectedAudioId) {
            e.preventDefault()
            s.removeAudioClip(s.selectedAudioId)
          } else if (s.selectedShotIds.length > 0) {
            e.preventDefault()
            s.deleteSelectedClips()
          }
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
