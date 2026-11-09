// Director 툴바 영상 단추의 글(11/5 시안 DG, 리드 2026-11-09): 도는 동안 "영상 만드는 중 · 끝난 수/전체"(누르면 멈춘다는 것은 마우스 올림 글과
//   화면 읽기 이름으로), 쉴 때 "영상 생성 · N개 가능". 숫자 뜻은 예전 그대로 끝난 수(실패 포함) / 전체. 약속: tests/director/video-batch-button.test.ts
type Translate = (text: string, params?: Record<string, string | number>) => string

/** 도는 동안의 영상 단추(오너 2026-11-09 결정 10, 추천대로): 시안 DG 처럼 단계 그라데이션(위 막대 단계 칩과 같은 칠)으로 칠한다.
 *  시안의 파란 빛(glow)은 design.md §9 라 넣지 않는다. 알약 모양 · 그림자는 툴바 알약 그대로. */
export const RUNNING_VIDEO_PILL = 'bg-stage-badge text-stage-badge-foreground hover:bg-stage-badge hover:opacity-90'

export interface VideoBatchButtonState {
  busy: boolean
  cancelled: boolean
  /** 끝난 수 · 전체. 도는 영상이 없으면 null(쉴 때도 따로 누른 영상이 돌면 그 수를 보인다). */
  done: number | null
  total: number | null
  /** 그중 실패한 수. 화면 읽기 이름에도 넣는다. */
  failed?: number
  /** 지금 영상을 만들 수 있는 샷 수(쉴 때). */
  available: number
}

export function videoBatchButtonText(state: VideoBatchButtonState, t: Translate): {
  label: string
  /** 글 뒤 " · " 다음에 붙는 숫자. 없으면 null. */
  count: string | null
  title: string
  /** 화면 읽기 이름. 도는 동안만 있다: 마우스 올림 글(title)은 키보드 · 터치로 볼 수 없어 "누르면 멈춰요"를 여기에도 넣는다(검토 B 5a). */
  ariaLabel?: string
  /** stage = 도는 동안(단계 그라데이션 RUNNING_VIDEO_PILL), plain = 쉴 때 · 멈추는 중(보통 알약). */
  tone: 'stage' | 'plain'
} {
  const progress = state.done !== null && state.total !== null ? `${state.done}/${state.total}` : null
  if (state.busy) {
    if (state.cancelled) return { label: t('Stopping'), count: progress, title: t('Stop after current videos finish.'), tone: 'plain' }
    const label = t('Making videos')
    const failed = state.failed ? t('{count} failed', { count: state.failed }) : null
    const status = [label, progress, failed].filter(Boolean).join(' ')
    return { label, count: progress, title: t('Click to stop'), ariaLabel: t('{status}, click to stop', { status }), tone: 'stage' }
  }
  return {
    label: t('Generate videos'),
    count: progress ?? (state.available > 0 ? t('{count} available', { count: state.available }) : null),
    title: t('Generate videos for every eligible shot'),
    tone: 'plain',
  }
}
