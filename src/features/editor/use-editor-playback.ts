'use client'

import { useEffect, useRef } from 'react'
import { useEditorStore, selectVideoLayout } from '@/stores/editor-store'
import { editPointTarget } from '@/lib/editor/timeline-segments'
import { SEQUENCE_FPS, sequenceLengthSec } from '@/lib/editor/sequence-info'

// 한 장 — 시:분:초:장 · 내보내기와 같은 초당 장 수(2단계 ① 새 배치).
const FRAME = 1 / SEQUENCE_FPS

/** 글자 키 — 한글 입력 상태(M 자리 = ㅡ · V = ㅍ · C = ㅊ)여도 같은 자리 키면 맞다(2단계 ③ · 리드 11/14). Alt 조합은 빼고. */
const isLetter = (e: KeyboardEvent, letter: string) => !e.altKey && (e.key.toLowerCase() === letter || e.code === `Key${letter.toUpperCase()}`)

/**
 * Editor 전역 단축키(포커스 무관): Space(재생/정지), ←/→(프레임 이동), Ctrl+←/→(편집점), Ctrl+Z(undo),
 *   Ctrl+Y / Ctrl+Shift+Z(redo), Ctrl+K(플레이헤드 자리 나누기), V(선택), C(자르기), T(문자), M(마커), Delete.
 *   약속: tests/editor/panels.test.ts · tests/editor/split-snap-markers.test.ts · tests/editor/title-clips.test.ts
 */
export function handleEditorKey(e: KeyboardEvent) {
  // 입력 필드/셀렉트에서 조작 중이면 무시 (오디오 이름 input, 배속 select 등)
  const el = e.target as HTMLElement | null
  const tag = el?.tagName
  // 볼륨 등 range 슬라이더는 텍스트 입력이 아님 → 단축키 허용 (단, 화살표는 네이티브 볼륨 조절에 양보)
  //   효과 컨트롤의 슬라이더(role="slider")도 같다 — 화살표가 플레이헤드까지 움직였다(2단계 ④).
  const isRange = (tag === 'INPUT' && (el as HTMLInputElement | null)?.type === 'range') || el?.getAttribute?.('role') === 'slider'
  const editable =
    (tag === 'INPUT' && !isRange) ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el?.isContentEditable
  if (editable) return
  if (isRange && e.key.startsWith('Arrow')) return // 슬라이더 포커스 시 화살표는 네이티브 처리

  const s = useEditorStore.getState()
  // 편집 상태를 준비하는 동안(기다리는 카드)은 편집 화면이 없다 — 되돌리기 · 지우기가 막 놓은 오디오를 건드리지 않게 한다(2026-11-10).
  if (s.editorPrep) return
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
  // Ctrl+K — 플레이헤드 자리에서 나눈다(2단계 ③). 브라우저의 Ctrl+K(주소창 검색)로 새지 않게 막는다.
  if (meta && isLetter(e, 'k')) {
    e.preventDefault()
    s.splitAtPlayhead()
    return
  }
  // 프레임/컷 이동 (요청 8): ←/→ 1프레임, Shift+←/→ 5프레임, Ctrl/⌘+←/→ 다음·이전 컷(클립 경계)
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    const dir = e.key === 'ArrowRight' ? 1 : -1
    if (meta) {
      // 클립의 시작과 끝이 컷 경계다 — 빈 곳이 있으면 빈 곳의 양 끝도 멈춘다(자유 배치). 모니터의 편집점 단추와 같은 자리.
      const layout = selectVideoLayout(s)
      s.nudge(editPointTarget(layout, s.currentTime, dir) - s.currentTime)
    } else {
      s.nudge((e.shiftKey ? 5 : 1) * dir * FRAME)
    }
    return
  }
  if (meta) return // 다른 Ctrl 조합은 통과

  // 마커 — 플레이헤드 자리에 단다(프리미어와 같은 M, 2단계 ③).
  if (isLetter(e, 'm')) {
    s.addMarker()
    return
  }
  // V · C · T 도 키 자리로 알아본다 — 아래는 글자로 견준다.
  const key = isLetter(e, 'v') ? 'v' : isLetter(e, 'c') ? 'c' : isLetter(e, 't') ? 't' : e.key
  switch (key) {
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
    // 문자 도구 — V 트랙을 누르면 그 자리에 제목 클립(2단계 ⑥, 시안 E2 409:5374).
    case 't':
      s.setToolMode('text')
      break
    case 'Delete':
    case 'Backspace':
      // 선택된 타임라인 항목 제거 (오디오 우선, 없으면 선택된 비디오 클립 일괄). 영상 클립은 Delete = 빼고 빈 곳을 남김,
      //   Shift+Delete = 빼고 당겨 메움(잔물결 삭제) — 시안 E4 · 프리미어 관례(자유 배치, 2026-11-14).
      if (s.selectedAudioIds.length > 0) {
        e.preventDefault()
        s.deleteSelectedAudio()
      } else if (s.selectedShotIds.length > 0) {
        e.preventDefault()
        if (e.shiftKey) s.rippleDeleteSelectedClips()
        else s.deleteSelectedClips()
      }
      break
    default:
      break
  }
}

/**
 * Editor 재생 엔진 + 전역 단축키(handleEditorKey).
 *   - 연속 재생: rAF 루프로 currentTime 진행. 끝에서 자동 정지.
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

      // 시퀀스 길이까지 재생 — 빈 곳 · 눈 끈 줄 · 영상보다 긴 소리까지(요청 5 · 자유 배치 · 검토 c ② 낮음 4).
      const total = sequenceLengthSec(selectVideoLayout(st), st.audioClips)
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
    window.addEventListener('keydown', handleEditorKey)
    return () => window.removeEventListener('keydown', handleEditorKey)
  }, [])
}
