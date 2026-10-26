// 시리즈 다음 화 첫 샷의 앞 화 끝 장면 참고(2026-10-26 오너 승인 · 방향 문서 .claude/docs/2026-10-22/series-brief.html).
//   [다음 화 만들기]에서 "앞 화 마지막 장면에서 이어 시작하기"를 고른 화만, 이 화의 첫 샷 스토리보드에
//   앞 화 마지막 샷의 끝 장면(projects.optional_reference_frame_url)을 참고 그림으로 하나 더 넣는다.
//   단건(스트립)과 묶음(그리드) 두 라우트가 같은 판정을 쓰게 한 곳에 둔다 — 한쪽만 고쳐져 어긋나지 않게.
//   서버 전용(DB 를 읽는다) — 화면 코드는 이 파일을 가져다 쓰지 않는다.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { parseSeries } from './snapshot'

export interface SeriesFirstShotContinuity {
  /** 앞 화 마지막 샷의 끝 장면 그림. */
  frameUrl: string
  /** 이 프로젝트의 첫 샷(씬 순서 → 샷 순서). 샷이 아직 없으면 null. */
  firstShotId: string | null
}

/**
 * 첫 샷 프롬프트에 더하는 한 줄. 묶음 시트는 칸이 여러 개라 어느 칸인지 적는다(column 1부터).
 *   참고 그림 순서 계약은 두 라우트가 같다 — 인물 · 배경 뒤, 화풍 참고 앞에 이 그림 한 장이 들어간다.
 */
export function seriesContinuityPromptLine(column: number | null = null): string {
  const subject = column === null ? 'this shot' : `column ${column}`
  return (
    `Series continuity: ${subject} continues from the final moment of the previous episode, ` +
    'given as the extra reference image that comes after the character and location references. ' +
    'Keep its wardrobe, lighting and location continuous, and follow this shot\'s own framing and composition.'
  )
}

/** 씬 순서 → 샷 순서로 가장 앞선 샷. 씬이나 샷이 아직 없으면 null. */
async function firstShotIdOf(projectId: string): Promise<string | null> {
  const { data: scene, error: sceneError } = await supabaseAdmin
    .from('scenes')
    .select('scene_id')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (sceneError) throw new Error(`series first scene failed: ${sceneError.message}`)
  if (typeof scene?.scene_id !== 'string' || !scene.scene_id) return null
  const { data: shot, error: shotError } = await supabaseAdmin
    .from('shots')
    .select('shot_id')
    .eq('project_id', projectId)
    .eq('scene_id', scene.scene_id)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (shotError) throw new Error(`series first shot failed: ${shotError.message}`)
  return typeof shot?.shot_id === 'string' && shot.shot_id ? shot.shot_id : null
}

/**
 * 이 프로젝트가 앞 화 마지막 장면에서 이어 시작한 화면 그 끝 장면 그림과 첫 샷 번호를 돌려준다. 그 외(시리즈가
 *   아님 · 잇기를 고르지 않음 · 끝 장면 그림을 복사하지 못함)는 null — 호출자는 null 이면 종전대로 동작한다.
 *   호출자가 이미 읽은 projects 행을 넘긴다 — 시리즈가 아닌 프로젝트는 추가 조회가 한 번도 나가지 않는다.
 */
export async function loadSeriesFirstShotContinuity(
  projectId: string,
  project: { series?: unknown; optional_reference_frame_url?: unknown } | null,
): Promise<SeriesFirstShotContinuity | null> {
  if (parseSeries(project?.series)?.continuesLastScene !== true) return null
  const frameUrl = typeof project?.optional_reference_frame_url === 'string' ? project.optional_reference_frame_url.trim() : ''
  if (!frameUrl) return null
  return { frameUrl, firstShotId: await firstShotIdOf(projectId) }
}
