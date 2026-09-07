// 카드를 누르거나 연결할 때 알맞은 편집 화면과 관계를 보여준다
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
describe('editActionForKind (카드 종류별 편집 화면)', () => {
  // #panel-unify 2026-08-31: 생성 이미지/영상 편집은 좌측 패널 — 모달은 캔버스를 가린다.
  it('Shot·Video·asset Image를 누르면 왼쪽 패널에서 편집한다', () => {
    expect(editActionForKind('shot')).toBe('select')
    expect(editActionForKind('video')).toBe('select')
    expect(editActionForKind('asset')).toBe('select')
  })
  it('Scene을 누르면 편집 창에서 연다', () => {
    expect(editActionForKind('scene')).toBe('popup')
  })
  it('prompt를 눌러도 아무 동작을 하지 않는다', () => {
    expect(editActionForKind('prompt')).toBe('none')
  })
})

describe('popupVisibleInView (화면별 팝업 표시 여부)', () => {
  it('그리드 화면에서는 Scene·Shot·Video를 눌러 편집 창을 열 수 있다', () => {
    expect(popupVisibleInView('storyboard', 'shot')).toBe(true)
    expect(popupVisibleInView('storyboard', 'video')).toBe(true)
    expect(popupVisibleInView('storyboard', 'scene')).toBe(true)
  })
  it('카드 화면에서는 Scene만 편집 창을 열고 Shot·Video는 왼쪽 패널에서 연다 (#panel-unify)', () => {
    expect(popupVisibleInView('node', 'scene')).toBe(true)
    expect(popupVisibleInView('node', 'shot')).toBe(false)
    expect(popupVisibleInView('node', 'video')).toBe(false)
  })
  it('asset과 prompt는 편집 창을 열지 않는다', () => {
    expect(popupVisibleInView('node', 'asset')).toBe(false)
    expect(popupVisibleInView('storyboard', 'prompt')).toBe(false)
  })
})

describe('doubleClickActionForKind (카드 더블클릭 동작)', () => {
  it('Scene은 편집 창에서, Shot·Video·asset은 왼쪽 패널에서 연다 (#panel-unify)', () => {
    expect(doubleClickActionForKind('scene')).toBe('popup')
    expect(doubleClickActionForKind('shot')).toBe('select')
    expect(doubleClickActionForKind('video')).toBe('select')
    expect(doubleClickActionForKind('asset')).toBe('select')
  })
  it('prompt를 더블클릭해도 아무 동작을 하지 않는다', () => {
    expect(doubleClickActionForKind('prompt')).toBe('none')
  })
})

describe('clickToggleSelection (다시 누른 카드 선택)', () => {
  it('같은 카드를 다시 누르면 선택을 해제한다', () => {
    expect(clickToggleSelection('n1', 'n1')).toBeNull()
  })
  it('다른 카드를 누르면 그 카드만 선택한다', () => {
    expect(clickToggleSelection('n1', 'n2')).toBe('n2')
  })
  it('선택된 카드가 없을 때 누른 카드를 선택한다', () => {
    expect(clickToggleSelection(null, 'n1')).toBe('n1')
  })
})

describe('connectRouteForTargetHandle (연결할 곳에 따른 처리)', () => {
  it('프롬프트 칸에 연결하면 프롬프트 내용으로 이어진다', () => {
    expect(connectRouteForTargetHandle('prompt')).toBe('prompt-wire')
  })
  it('Shot의 참고 이미지 칸에 연결하면 이미지로 이어진다', () => {
    expect(connectRouteForTargetHandle('image-reference')).toBe('image-wire')
  })
  it('Video의 START·END·REF 칸에 연결하면 장면 입력으로 이어진다', () => {
    expect(connectRouteForTargetHandle('frame-start')).toBe('frame-wire')
    expect(connectRouteForTargetHandle('frame-end')).toBe('frame-wire')
    expect(connectRouteForTargetHandle('frame-ref')).toBe('frame-wire')
  })
  it('이전 Video의 마지막 장면을 연결하면 다음 Video로 이어진다', () => {
    expect(connectRouteForTargetHandle('video-chain')).toBe('video-chain')
  })
  it('그 밖의 연결은 관계 선택 창을 연다', () => {
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

describe('Director 영상 선택 약속', () => {
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

  it('새 시도가 실패해도 가장 최근 성공한 영상을 계속 재생한다', () => {
    const successful = take('success', 1, 'completed', 'https://video.example/success.mp4', 'completed', '2026-07-20T00:00:01.000Z')
    const failed = take('failed', 2, 'completed', 'https://video.example/previous.mp4', 'failed', '2026-07-20T00:00:02.000Z')

    expect(selectNewestSuccessfulTake([successful, failed])).toBe(failed)
    expect(selectLatestAttempt([successful, failed])).toBe(failed)
  })

  it('이전 실패가 있어도 가장 최근 시도의 결과만 실패 안내로 보여준다', () => {
    const failed = take('failed', 1, 'failed', null, 'failed', '2026-07-20T00:00:01.000Z')
    const completed = take('completed', 2, 'completed', 'https://video.example/latest.mp4', 'completed', '2026-07-20T00:00:02.000Z')

    expect(selectNewestSuccessfulTake([failed, completed])).toBe(completed)
    expect(selectLatestAttempt([failed, completed])).toBe(completed)
  })
  it('생성 중 표시와 실패 안내는 같은 최신 시도 결과에서 정한다', () => {
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
  it('영상 순서 정보가 잘못돼도 결과를 일정하게 정한다', () => {
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
