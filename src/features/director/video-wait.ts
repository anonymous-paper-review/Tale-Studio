// 영상을 만드는 동안 노드에 보일 것(11/5 시안 DG, 리드 2026-11-09): 화면이 아는 것만 쓴다.
//   남은 시간은 쓰지 않는다(오너 2026-08-26 "경과 초를 보이지 않는다"). 막대는 묶음 진행(끝난 수 / 전체)이고 낱개면 없다.
//   다음 차례는 묶음일 때만, 서버가 알려 준 낼 순서 그대로. 약속: tests/director/video-wait-card.test.ts
import { clampDuration, normalizeProvider, VIDEO_MODELS } from '@/lib/video-models'
import { directorNodeLabel, type BoardNodeNames } from '@/features/director/node-label'
import { isShotData, type DirectorNode } from '@/types/director'

type Translate = (text: string, params?: Record<string, string | number>) => string

/** 카드에 이름을 몇 개까지 늘어놓나: 카드 폭 240 에서 한 줄에 들어가는 만큼. 나머지는 "외 N개". */
const NEXT_NAMES_SHOWN = 2

/** 모델에 실제로 요청하는 영상 길이(초). 모델이 못 내는 길이는 모델 범위로 맞춘다(fal-video-request 와 같은 계산). */
export function requestedVideoSeconds(provider: string, seconds: number): number {
  return clampDuration(VIDEO_MODELS[normalizeProvider(provider)], seconds)
}

/** 아직 안 낸 샷(Writer 샷 id, 낼 순서)을 캔버스 노드 이름(보드와 같은 "Shot 8")으로. 캔버스에 없는 샷은 건너뛴다. */
export function pendingShotNames(
  nodes: readonly DirectorNode[],
  pendingShotIds: readonly string[],
  names: BoardNodeNames,
): string[] {
  return pendingShotIds.flatMap((writerShotId) => {
    const node = nodes.find((candidate) => isShotData(candidate.data) && candidate.data.writerShotId === writerShotId)
    return node && isShotData(node.data) ? [directorNodeLabel(node.data, names)] : []
  })
}

/** "다음 차례: Shot 3 → Shot 2" · 셋 이상이면 "… 외 N개". 없으면 undefined. */
export function nextInLineNote(names: readonly string[], t: Translate): string | undefined {
  if (names.length === 0) return undefined
  const shown = names.slice(0, NEXT_NAMES_SHOWN).join(' → ')
  const rest = names.length - NEXT_NAMES_SHOWN
  return t('Up next: {names}', { names: rest > 0 ? t('{names} and {count} more', { names: shown, count: rest }) : shown })
}
