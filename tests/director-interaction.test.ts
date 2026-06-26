import { describe, expect, it } from 'vitest'
import {
  editActionForKind,
  popupVisibleInView,
  doubleClickActionForKind,
  clickToggleSelection,
  connectRouteForTargetHandle,
} from '@/features/director/canvas-interaction'

describe('editActionForKind (BaseNode Edit 분기)', () => {
  it('scene은 모달', () => {
    expect(editActionForKind('scene')).toBe('popup')
  })
  it('shot/video는 좌측 패널 선택', () => {
    expect(editActionForKind('shot')).toBe('select')
    expect(editActionForKind('video')).toBe('select')
  })
  it('asset/prompt는 액션 없음', () => {
    expect(editActionForKind('asset')).toBe('none')
    expect(editActionForKind('prompt')).toBe('none')
  })
})

describe('popupVisibleInView (DirectorNodePopup 가드)', () => {
  it('그리드 뷰는 모든 종류 모달 허용', () => {
    expect(popupVisibleInView('storyboard', 'shot')).toBe(true)
    expect(popupVisibleInView('storyboard', 'video')).toBe(true)
    expect(popupVisibleInView('storyboard', 'scene')).toBe(true)
  })
  it('노드 뷰는 Scene만 모달 허용', () => {
    expect(popupVisibleInView('node', 'scene')).toBe(true)
    expect(popupVisibleInView('node', 'shot')).toBe(false)
    expect(popupVisibleInView('node', 'video')).toBe(false)
  })
})

describe('doubleClickActionForKind (노드 뷰 더블클릭)', () => {
  it('scene은 모달 열기', () => {
    expect(doubleClickActionForKind('scene')).toBe('popup')
  })
  it('shot/video는 패널 닫기', () => {
    expect(doubleClickActionForKind('shot')).toBe('close-panel')
    expect(doubleClickActionForKind('video')).toBe('close-panel')
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
