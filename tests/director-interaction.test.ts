import { describe, expect, it } from 'vitest'
import {
  compareDirectorVideoTakeOrder,
  selectLatestAttempt,
  selectNewestSuccessfulTake,
  type VideoTakeSelectionRecord,
} from '@/lib/director-video-take-selection'
import {
  editActionForKind,
  popupVisibleInView,
  doubleClickActionForKind,
  clickToggleSelection,
  connectRouteForTargetHandle,
} from '@/features/director/canvas-interaction'

import { selectGridVideoAttemptState } from '@/features/director/canvas-views/StoryboardGridView'
import { translate } from '@/lib/i18n'

// 테스트는 useT() 훅을 못 쓴다(React 렌더 밖) — 고정 locale로 바인딩한 t 스텁을 넘긴다.
const t = (text: string, params?: Record<string, string | number>) => translate('en', text, params)
describe('editActionForKind (BaseNode Edit 분기)', () => {
  // #panel-unify 2026-08-31: 생성 이미지/영상 편집은 좌측 패널 — 모달은 캔버스를 가린다.
  it('shot/video/asset Image는 좌측 패널 선택', () => {
    expect(editActionForKind('shot')).toBe('select')
    expect(editActionForKind('video')).toBe('select')
    expect(editActionForKind('asset')).toBe('select')
  })
  it('scene은 모달(패널 미지원)', () => {
    expect(editActionForKind('scene')).toBe('popup')
  })
  it('prompt는 액션 없음', () => {
    expect(editActionForKind('prompt')).toBe('none')
  })
})

describe('popupVisibleInView (DirectorNodePopup 가드)', () => {
  it('그리드 뷰는 scene/shot/video 모달 허용', () => {
    expect(popupVisibleInView('storyboard', 'shot')).toBe(true)
    expect(popupVisibleInView('storyboard', 'video')).toBe(true)
    expect(popupVisibleInView('storyboard', 'scene')).toBe(true)
  })
  it('노드 뷰는 scene만 모달 — shot/video는 좌측 패널 (#panel-unify)', () => {
    expect(popupVisibleInView('node', 'scene')).toBe(true)
    expect(popupVisibleInView('node', 'shot')).toBe(false)
    expect(popupVisibleInView('node', 'video')).toBe(false)
  })
  it('asset/prompt는 모달 없음', () => {
    expect(popupVisibleInView('node', 'asset')).toBe(false)
    expect(popupVisibleInView('storyboard', 'prompt')).toBe(false)
  })
})

describe('doubleClickActionForKind (노드 뷰 더블클릭)', () => {
  it('scene은 모달, shot/video/asset은 좌측 패널 (#panel-unify)', () => {
    expect(doubleClickActionForKind('scene')).toBe('popup')
    expect(doubleClickActionForKind('shot')).toBe('select')
    expect(doubleClickActionForKind('video')).toBe('select')
    expect(doubleClickActionForKind('asset')).toBe('select')
  })
  it('prompt는 no-op', () => {
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
  it('Shot 이미지 레퍼런스 핸들 → 이미지 와이어링', () => {
    expect(connectRouteForTargetHandle('image-reference')).toBe('image-wire')
  })
  it('Video 프레임 입력 핸들 → 프레임 와이어링', () => {
    expect(connectRouteForTargetHandle('frame-start')).toBe('frame-wire')
    expect(connectRouteForTargetHandle('frame-end')).toBe('frame-wire')
    expect(connectRouteForTargetHandle('frame-ref')).toBe('frame-wire')
  })
  it('이전 Video 마지막 프레임 핸들 → Video 체인 와이어링', () => {
    expect(connectRouteForTargetHandle('video-chain')).toBe('video-chain')
  })
  it('다른 핸들 → 관계 모달', () => {
    expect(connectRouteForTargetHandle('left')).toBe('relation')
    expect(connectRouteForTargetHandle(null)).toBe('relation')
    expect(connectRouteForTargetHandle(undefined)).toBe('relation')
  })
})

type TestVideoTake = VideoTakeSelectionRecord & {
  status: string
  last_attempt_status: 'pending' | 'generating' | 'completed' | 'failed' | null
  last_attempt_error: string | null
}

describe('Director video-take selection contracts', () => {
  const take = (
    id: string,
    takeNumber: number,
    status: TestVideoTake['status'],
    url: string | null,
    lastAttemptStatus: TestVideoTake['last_attempt_status'],
    lastAttemptAt: string,
    lastAttemptError: string | null = null,
  ): TestVideoTake => ({
    id,
    take_number: takeNumber,
    created_at: `2026-07-20T00:00:0${takeNumber}.000Z`,
    status,
    url,
    is_final: false,
    last_attempt_status: lastAttemptStatus,
    last_attempt_at: lastAttemptAt,
    last_attempt_error: lastAttemptError,
  })

  it('keeps the newest successful playback when a newer attempt fails', () => {
    const successful = take('success', 1, 'completed', 'https://video.example/success.mp4', 'completed', '2026-07-20T00:00:01.000Z')
    const failed = take('failed', 2, 'completed', 'https://video.example/previous.mp4', 'failed', '2026-07-20T00:00:02.000Z')

    expect(selectNewestSuccessfulTake([successful, failed])).toBe(failed)
    expect(selectLatestAttempt([successful, failed])).toBe(failed)
  })

  it('treats the latest overall attempt, rather than any historical failure, as the failure badge source', () => {
    const failed = take('failed', 1, 'failed', null, 'failed', '2026-07-20T00:00:01.000Z')
    const completed = take('completed', 2, 'completed', 'https://video.example/latest.mp4', 'completed', '2026-07-20T00:00:02.000Z')

    expect(selectNewestSuccessfulTake([failed, completed])).toBe(completed)
    expect(selectLatestAttempt([failed, completed])).toBe(completed)
  })
  it('derives generation and failure badges from the same newest attempt', () => {
    const oldGenerating = take(
      'old-generating',
      1,
      'completed',
      'https://video.example/old.mp4',
      'generating',
      '2026-07-20T00:00:01.000Z',
    )
    const latestFailure = take(
      'latest-failure',
      2,
      'completed',
      'https://video.example/current.mp4',
      'failed',
      '2026-07-20T00:00:02.000Z',
      'provider rejected request',
    )

    expect(selectGridVideoAttemptState([oldGenerating, latestFailure], t)).toMatchObject({
      latestAttempt: latestFailure,
      generating: false,
      failure: 'provider rejected request',
    })
  })
  it('orders malformed take values deterministically without NaN', () => {
    const malformed: VideoTakeSelectionRecord[] = [
      { id: 'a', take_number: null, created_at: '' },
      { id: 'z', take_number: 'not-a-number', created_at: '' },
      { id: 'newer', take_number: ' ', created_at: '2026-07-20T00:00:02.000Z' },
      { id: 'older', take_number: undefined, created_at: '2026-07-20T00:00:01.000Z' },
      { id: 'valid', take_number: 1, created_at: null },
    ]

    for (const a of malformed) {
      for (const b of malformed) {
        expect(Number.isNaN(compareDirectorVideoTakeOrder(a, b))).toBe(false)
      }
    }

    expect([...malformed].sort(compareDirectorVideoTakeOrder).map((take) => take.id)).toEqual([
      'valid',
      'newer',
      'older',
      'z',
      'a',
    ])
  })
})
