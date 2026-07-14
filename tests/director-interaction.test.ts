import { describe, expect, it } from 'vitest'
import {
  editActionForKind,
  popupVisibleInView,
  doubleClickActionForKind,
  clickToggleSelection,
  connectRouteForTargetHandle,
} from '@/features/director/canvas-interaction'

describe('editActionForKind (BaseNode Edit 분기)', () => {
  // #e2 2026-07-14: shot/video도 Storyboard 뷰와 동일하게 모달로 통일 (좌측 패널 경로 폐기).
  it('scene/shot/video는 모달', () => {
    expect(editActionForKind('scene')).toBe('popup')
    expect(editActionForKind('shot')).toBe('popup')
    expect(editActionForKind('video')).toBe('popup')
  })
  it('asset/prompt는 액션 없음', () => {
    expect(editActionForKind('asset')).toBe('none')
    expect(editActionForKind('prompt')).toBe('none')
  })
})

describe('popupVisibleInView (DirectorNodePopup 가드)', () => {
  it('그리드 뷰는 scene/shot/video 모달 허용', () => {
    expect(popupVisibleInView('storyboard', 'shot')).toBe(true)
    expect(popupVisibleInView('storyboard', 'video')).toBe(true)
    expect(popupVisibleInView('storyboard', 'scene')).toBe(true)
  })
  it('노드 뷰도 scene/shot/video 모달 허용 (#e2)', () => {
    expect(popupVisibleInView('node', 'scene')).toBe(true)
    expect(popupVisibleInView('node', 'shot')).toBe(true)
    expect(popupVisibleInView('node', 'video')).toBe(true)
  })
  it('asset/prompt는 모달 없음', () => {
    expect(popupVisibleInView('node', 'asset')).toBe(false)
    expect(popupVisibleInView('storyboard', 'prompt')).toBe(false)
  })
})

describe('doubleClickActionForKind (노드 뷰 더블클릭)', () => {
  it('scene/shot/video는 모달 열기 (#e2 — Storyboard 더블클릭과 동일)', () => {
    expect(doubleClickActionForKind('scene')).toBe('popup')
    expect(doubleClickActionForKind('shot')).toBe('popup')
    expect(doubleClickActionForKind('video')).toBe('popup')
  })
  it('그 외는 no-op', () => {
    expect(doubleClickActionForKind('asset')).toBe('none')
    expect(doubleClickActionForKind('prompt')).toBe('none')
  })
})

describe('clickToggleSelection (재클릭 토글)', () => {
  it('같은 노드 재클릭 → 선택 해제(null)', () => {
    expect(clickToggleSelection('n1', 'n1')).toBeNull()
  })
  it('다른 노드 클릭 → 그 노드 선택', () => {
    expect(clickToggleSelection('n1', 'n2')).toBe('n2')
  })
  it('선택 없음에서 클릭 → 그 노드 선택', () => {
    expect(clickToggleSelection(null, 'n1')).toBe('n1')
  })
})

describe('connectRouteForTargetHandle (onConnect 라우팅)', () => {
  it('targetHandle=prompt → 프롬프트 와이어링', () => {
    expect(connectRouteForTargetHandle('prompt')).toBe('prompt-wire')
  })
  it('다른 핸들 → 관계 모달', () => {
    expect(connectRouteForTargetHandle('left')).toBe('relation')
    expect(connectRouteForTargetHandle(null)).toBe('relation')
    expect(connectRouteForTargetHandle(undefined)).toBe('relation')
  })
})
