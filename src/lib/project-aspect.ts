// 프로젝트 화면비(2026-09-30 오너 지시) — Producer 에서 정한 포맷(projects.settings.format)이 Director 의 실사 이미지·영상
//   생성과 화면 틀의 기준이다. 서버(영상 제출)와 화면(노드 뷰·스토리보드 뷰)이 같은 규칙을 쓰도록 한 곳에 둔다.
import { aspectRatioFromFormat, type ProjectFormat } from '@/types/project'

/** 영상 모델에 보낼 화면비. 영상 모델은 16:9·9:16·1:1 만 받으므로 시네마(2.39:1)는 지금처럼 16:9. 포맷 모름 = null(호출부 대비값). */
export function videoAspectRatioFromFormat(format: ProjectFormat | null): '16:9' | '9:16' | '1:1' | null {
  switch (format) {
    case 'vertical_9:16':
      return '9:16'
    case 'square_1:1':
      return '1:1'
    case 'horizontal_16:9':
    case 'cinema_2.39:1':
      return '16:9'
    default:
      return null
  }
}

/** 실사 이미지(수동 샷) 요청 비율 — Writer 샷 경로(generate-storyboard)와 같은 변환. 포맷 모름 = 16:9(종전). */
export function shotImageAspectRatio(format: ProjectFormat | null): string {
  return format ? aspectRatioFromFormat(format) : '16:9'
}

export interface MediaFrameStyle {
  aspectRatio: string
  width: string
  maxWidth?: string
  marginInline: string
}

/**
 * 화면 틀(이미지·영상 상자)의 모양. 가로 16:9 와 포맷 모름은 null — 호출부가 기존 16:9 틀(aspect-video)을 그대로 쓴다
 * (가로 프로젝트의 화면은 바꾸지 않는다). 그 밖의 포맷은 그 비율의 상자이고, maxHeightPx 를 주면 높이가 그 값을
 * 넘지 않도록 폭을 줄여 가운데 정렬한다(노드 캔버스의 줄 간격 보호).
 */
export function mediaFrameStyle(format: ProjectFormat | null, maxHeightPx?: number): MediaFrameStyle | null {
  if (!format || format === 'horizontal_16:9') return null
  const [w, h] = aspectRatioFromFormat(format).split(':').map(Number)
  if (!w || !h) return null
  return {
    aspectRatio: `${w} / ${h}`,
    width: '100%',
    ...(maxHeightPx ? { maxWidth: `${Math.round((maxHeightPx * w) / h)}px` } : {}),
    marginInline: 'auto',
  }
}
