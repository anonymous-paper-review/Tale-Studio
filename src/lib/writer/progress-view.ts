import type { WriterStatus } from './use-writer-status'
import type { AppLocale } from '@/lib/locale'
import { translate } from '@/lib/i18n/translate'

// 현재 엔진의 씬 확정 경계. 단계 수는 시간 가중치가 아니다.
const DRAFT_STAGES = ['dramaturgy', 'narrativeStructure', 'scenes', 'storyCheck']
// 각 현재 단계 앞에서 충족된 단위. 병합/생략된 단계도 선행 결과가 있어야 여기에 도달한다.
// 서버의 실행 횟수 completed_units와 구분하며 shotsAndDialogue는 기존 4단위다.
const PRODUCTION_BEFORE: Record<string, number> = {
  visualFormat: 0, actVisualArc: 1, v2Design: 2, sceneCinematography: 3,
  decoupage: 4, sceneStage: 5, shotsAndDialogue: 6, persistShots: 10,
}
export function writerProgressView(status: Partial<WriterStatus> | null | undefined, locale: AppLocale = 'ko') {
  const awaiting = status?.current_status === 'awaiting_confirmation'
  const v2 = status?.engine === 'v2'
  const draft = !v2 && !status?.pipeline_completed && (awaiting || !status?.current_stage || DRAFT_STAGES.includes(status.current_stage))
  const scope = awaiting ? 'review' : draft ? 'draft' : 'production'
  const offset = !draft && !v2 ? DRAFT_STAGES.length : 0
  const total = draft ? DRAFT_STAGES.length : Math.max(0, (status?.total_units ?? 0) - offset)
  const stageIndex = DRAFT_STAGES.indexOf(status?.current_stage ?? '')
  const fulfilled = awaiting || status?.pipeline_completed ? total
    : !v2 && draft && stageIndex >= 0 ? stageIndex
    : !v2 && !draft && status?.current_stage && PRODUCTION_BEFORE[status.current_stage] != null
      ? PRODUCTION_BEFORE[status.current_stage]
      : (status?.completed_units ?? 0) - offset
  const done = Math.max(0, Math.min(total, fulfilled))
  const rawPercent = total ? Math.round(done / total * 100) : 0
  const percent = awaiting || status?.pipeline_completed ? 100 : Math.min(99, rawPercent)
  const label = translate(locale, awaiting ? 'Waiting for scene draft confirmation'
    : draft ? 'Preparing the scene draft' : 'Preparing and saving shots and dialogue')
  const detail = status?.pipeline_failed ? translate(locale, 'Work stopped. Review the error before continuing.')
    : awaiting ? translate(locale, 'Review and confirm the draft to continue.')
    : translate(locale, draft ? 'Arranging the scenes.'
      : status?.current_stage === 'persistShots' ? 'Saving shots and dialogue.' : 'Creating shots and dialogue.')
  const countLabel = translate(locale, 'Steps {done}/{total}', { done, total })
  // 옛 ETA 는 전체 벽시계에 승인 대기를 포함한다. 현재 구간의 남은 시간으로 사용하지 않는다.
  return { scope, done, total, percent, label, detail, countLabel, remaining: null }
}
