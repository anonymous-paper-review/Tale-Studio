// 더한 샷 채우기의 DB 쪽(오너 2026-11-27 N2) — 같은 씬 샷 · 씬 무대 · 화면 비율을 읽어 stage/added_shot 으로 계산하고, 바뀐 것만 저장한다.
//   부르는 곳: 샷을 더한 직후(POST /api/writer/added-shot-fill) · 러프를 그리기 직전(api/writer/rough-storyboard — 고친 뒤 옛 자리가 남지 않게).
//   쓰는 행 = 사람이 더한 샷(source 'manual') 중 파이프라인 설계가 없고 설계 칸이 비었거나 이 채우기가 채운 행뿐 — 쓰기 조건에도 같은 거르개를 건다.
//   같은 입력이면 같은 값이라 두 곳이 동시에 돌아도 같은 값을 쓴다. 약속: tests/writer/added-shot-fill.test.ts
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'
import { fillAddedShot, isFillableAddedShot, type AddedShotRow } from '@/lib/writer/pipeline/stage/added_shot'

const SHOT_COLUMNS =
  'shot_id, scene_id, source, sort_order, shot_type, characters, character_appearance_keys, camera_config, lighting_config, static_spec, dynamic_spec, design_ref, action_description, action_description_native'

/** 러프 길이 이미 읽은 것 — 넘기면 다시 읽지 않는다(리드 2026-11-27 속도). rows = 프로젝트 샷 전부(보드 순서), 채우기가 읽는 칸을 담은 행. */
export interface AddedShotPreloaded {
  rows: readonly AddedShotRow[]
  stageByScene: ReadonlyMap<string, unknown>
  format: string | null
}

export interface AddedShotRefill {
  /** 지금 DB 에 있는 채운 칸(저장했으면 새 값, 못 썼으면 읽은 값). */
  static_spec: unknown
  character_appearance_keys: Record<string, string>
  /** 이번에 새로 저장했는가. */
  changed: boolean
}

/** 순서를 보지 않는 깊은 같음 — JSON 으로 오간 값끼리 견준다. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return (a ?? null) === (b ?? null)
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((v, i) => sameJson(v, (b as unknown[])[i]))
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined)
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined)
  return ka.length === kb.length && ka.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/**
 * 더한 샷들의 빈 칸을 다시 채운다. 돌려주는 표 = 채울 수 있는 더한 샷만(파이프라인 샷 · 다른 설계 샷은 빠진다).
 *   preloaded 를 넘기면 읽지 않는다(러프 길). 읽기 실패는 던진다 — 아직 아무것도 쓰지 않았고, 부르는 쪽이 채우기 없이 지금처럼 간다.
 *   한 샷의 계산 · 쓰기 실패는 그 샷만 읽은 값으로 돌려준다 — 다른 샷은 그대로 채운다(2026-11-27 검토 rev-addshot 3).
 */
export async function refillAddedShots(
  projectId: string,
  shotIds: readonly string[],
  preloaded?: AddedShotPreloaded,
): Promise<Map<string, AddedShotRefill>> {
  const out = new Map<string, AddedShotRefill>()
  if (!shotIds.length) return out
  let rowsRead: readonly AddedShotRow[]
  if (preloaded) {
    rowsRead = preloaded.rows
  } else {
    const { data: shotRows, error: shotErr } = await supabaseAdmin
      .from('shots')
      .select(SHOT_COLUMNS)
      .eq('project_id', projectId)
      .order('sort_order')
    if (shotErr) throw new Error(`added-shot fill: shots read failed: ${shotErr.message}`)
    rowsRead = (shotRows ?? []) as unknown as AddedShotRow[]
  }
  const rows = (rowsRead as Array<AddedShotRow & { sort_order?: number | null }>)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (a.row.sort_order ?? 0) - (b.row.sort_order ?? 0) || a.index - b.index)
    .map(({ row }) => row)
  const wanted = new Set(shotIds)
  const targets = rows.filter((row) => wanted.has(row.shot_id) && isFillableAddedShot(row))
  if (!targets.length) return out

  let stageByScene: ReadonlyMap<string, unknown>
  let formatText: string | null
  if (preloaded) {
    stageByScene = preloaded.stageByScene
    formatText = preloaded.format
  } else {
    const sceneIds = [...new Set(targets.map((row) => row.scene_id).filter((id): id is string => typeof id === 'string'))]
    const [{ data: scenes, error: sceneErr }, { data: project, error: projectErr }] = await Promise.all([
      supabaseAdmin.from('scenes').select('scene_id, stage').eq('project_id', projectId).in('scene_id', sceneIds),
      supabaseAdmin.from('projects').select('settings').eq('id', projectId).maybeSingle(),
    ])
    if (sceneErr) throw new Error(`added-shot fill: scenes read failed: ${sceneErr.message}`)
    if (projectErr) throw new Error(`added-shot fill: project read failed: ${projectErr.message}`)
    stageByScene = new Map(((scenes ?? []) as Array<{ scene_id: string; stage: unknown }>).map((s) => [s.scene_id, s.stage]))
    const format = (project as { settings?: { format?: unknown } | null } | null)?.settings?.format
    formatText = typeof format === 'string' ? format : null
  }

  for (const target of targets) {
    // 읽은 값 — 계산 · 쓰기에 실패하면 이 값을 돌려준다(러프는 DB 에 있는 그 칸으로 그린다).
    const stored = (): AddedShotRefill => ({
      static_spec: target.static_spec ?? null,
      character_appearance_keys: (target.character_appearance_keys ?? {}) as Record<string, string>,
      changed: false,
    })
    try {
      const fill = fillAddedShot({
        shot: target,
        sceneShots: rows.filter((row) => row.scene_id === target.scene_id),
        stage: stageByScene.get(target.scene_id ?? '') ?? null,
        format: formatText,
      })
      if (!fill) continue
      const storedKeys = (target.character_appearance_keys ?? {}) as Record<string, string>
      if (sameJson(fill.static_spec, target.static_spec ?? null) && sameJson(fill.character_appearance_keys, storedKeys)) {
        out.set(target.shot_id, stored())
        continue
      }
      const { data: written, error: writeErr } = await supabaseAdmin
        .from('shots')
        .update({ static_spec: fill.static_spec as unknown as Json, character_appearance_keys: fill.character_appearance_keys })
        .eq('project_id', projectId)
        .eq('shot_id', target.shot_id)
        .eq('source', 'manual')
        .is('design_ref', null)
        .is('dynamic_spec', null)
        .or('static_spec.is.null,static_spec->added_fill.not.is.null')
        .select('shot_id')
      if (writeErr || !written?.length) {
        if (writeErr) console.warn(`[added-shot fill] ${target.shot_id} write skipped:`, writeErr.message)
        out.set(target.shot_id, stored())
        continue
      }
      target.static_spec = fill.static_spec
      target.character_appearance_keys = fill.character_appearance_keys
      out.set(target.shot_id, { static_spec: fill.static_spec, character_appearance_keys: fill.character_appearance_keys, changed: true })
    } catch (e) {
      console.warn(`[added-shot fill] ${target.shot_id} skipped:`, e instanceof Error ? e.message : e)
      try {
        out.set(target.shot_id, stored())
      } catch {
        // 읽은 값조차 읽히지 않는 행 — 돌려주지 않는다(부르는 쪽이 그 샷을 지금 칸 그대로 둔다).
      }
    }
  }
  return out
}
