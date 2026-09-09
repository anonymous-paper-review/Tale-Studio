// 이름 영어 표기 한 번 정해 저장(#name-en 2026-09-08, 오너 지시) — server-only(supabaseAdmin).
//   실측 겨울_8: 러프 요청마다 deriveEnBatch 로 이름을 새로 번역해 프레임 밖 인물이 "Fairy Clan Chief" 였다가
//   "Yojeong Sujang" 이 됐다. 여기서 characters.name_en / locations.name_en 을 한 번 정해 저장하고 다음부터는
//   저장값을 쓴다. 이름이 바뀌면(name_en_source ≠ name) 다시 정한다. 무대 표지 라벨은 scenes.stage.landmarks[]
//   .label_en 에 같은 방식으로 저장한다. 파생 실패는 원문 폴백(저장하지 않아 다음에 다시 시도).
import { supabaseAdmin } from '@/lib/supabase/admin'
import { deriveEnBatch } from '@/lib/writer/i18n/derive-en'

export interface NameRow {
  id: string
  name: string | null
  name_en: string | null
  name_en_source: string | null
}

/** 순수: 저장값이 없거나 원문이 바뀐 행 — 다시 정할 대상. 이름이 빈 행은 대상이 아니다. */
export function staleNameRows<T extends NameRow>(rows: T[]): T[] {
  return rows.filter((r) => !!(r.name ?? '').trim() && (!(r.name_en ?? '').trim() || r.name_en_source !== r.name))
}

export const CHARACTER_NAME_KIND =
  'character name (short natural English name for image prompts; translate descriptive titles, transliterate coined proper names)'
export const LOCATION_NAME_KIND = 'location name (short English place name for image prompts)'

type Table = { table: 'characters'; idCol: 'character_id' } | { table: 'locations'; idCol: 'location_id' }

async function ensureTableNamesEn(t: Table, projectId: string, ids: string[] | undefined, kind: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  let query = supabaseAdmin.from(t.table).select(`${t.idCol}, name, name_en, name_en_source`).eq('project_id', projectId)
  if (ids?.length) query = query.in(t.idCol, ids)
  const { data, error } = await query
  if (error || !data) return out
  const rows: NameRow[] = (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r[t.idCol] ?? ''),
    name: typeof r.name === 'string' ? r.name : null,
    name_en: typeof r.name_en === 'string' ? r.name_en : null,
    name_en_source: typeof r.name_en_source === 'string' ? r.name_en_source : null,
  }))
  for (const r of rows) if (r.name_en && r.name_en_source === r.name) out.set(r.id, r.name_en)
  const stale = staleNameRows(rows)
  if (stale.length) {
    const en = await deriveEnBatch(stale.map((r) => ({ id: r.id, native: r.name as string })), kind)
    await Promise.all(
      stale.map(async (r) => {
        const v = en.get(r.id)
        if (!v) return
        out.set(r.id, v)
        const { error: upErr } = await supabaseAdmin
          .from(t.table)
          .update({ name_en: v, name_en_source: r.name })
          .eq('project_id', projectId)
          .eq(t.idCol, r.id)
        if (upErr) console.warn(`[i18n/entity-names] ${t.table}.name_en save failed:`, r.id, upErr.message)
      }),
    )
  }
  for (const r of rows) if (!out.has(r.id) && r.name) out.set(r.id, r.name) // 못 정했으면 원문(저장 안 함)
  return out
}

/** 인물·배경의 영어 이름 — 저장값을 쓰고, 없거나 바뀐 것만 정해 저장한다. Map<id, en>. */
export async function ensureEntityNamesEn(
  projectId: string,
  opts?: { characterIds?: string[]; locationIds?: string[] },
): Promise<{ characters: Map<string, string>; locations: Map<string, string> }> {
  const [characters, locations] = await Promise.all([
    ensureTableNamesEn({ table: 'characters', idCol: 'character_id' }, projectId, opts?.characterIds, CHARACTER_NAME_KIND),
    ensureTableNamesEn({ table: 'locations', idCol: 'location_id' }, projectId, opts?.locationIds, LOCATION_NAME_KIND),
  ])
  return { characters, locations }
}

/**
 * 씬의 장소 라벨 EN — scenes.location 이 배경 id 면 저장된 locations.name_en, 아니면(자유 라벨) 종전대로 번역.
 *   Map<scene_id, en>.
 */
export async function sceneLocationLabelsEn(
  projectId: string,
  scenes: ReadonlyArray<{ scene_id: string; location: string | null | undefined }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const wanted = scenes.filter((s) => !!(s.location ?? '').trim())
  if (!wanted.length) return out
  const { locations } = await ensureEntityNamesEn(projectId, { locationIds: [...new Set(wanted.map((s) => s.location as string))] })
  const free: Array<{ id: string; native: string }> = []
  for (const s of wanted) {
    const en = locations.get(s.location as string)
    if (en) out.set(s.scene_id, en)
    else free.push({ id: s.scene_id, native: s.location as string })
  }
  if (free.length) {
    const en = await deriveEnBatch(free, 'location place label')
    for (const [k, v] of en) out.set(k, v)
  }
  return out
}

interface LandmarkLike {
  id?: unknown
  label?: unknown
  label_en?: unknown
  label_en_source?: unknown
}

/**
 * 무대 표지 라벨 EN — scenes.stage.landmarks[].label_en 을 쓰고, 없거나 라벨이 바뀐 것만 정해 무대에 저장한다.
 *   키 `${scene_id}|${landmark.id}` (러프 라우트의 종전 키와 같다).
 */
export async function ensureStageLandmarkLabelsEn(
  projectId: string,
  scenes: ReadonlyArray<{ scene_id: string; stage: unknown }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const todo: Array<{ id: string; native: string }> = []
  const marks = new Map<string, { sceneId: string; landmark: LandmarkLike }>()
  for (const sc of scenes) {
    const stage = sc.stage as { landmarks?: unknown } | null
    if (!stage || !Array.isArray(stage.landmarks)) continue
    for (const raw of stage.landmarks as LandmarkLike[]) {
      if (typeof raw?.id !== 'string' || typeof raw.label !== 'string' || !raw.label.trim()) continue
      const key = `${sc.scene_id}|${raw.id}`
      if (typeof raw.label_en === 'string' && raw.label_en.trim() && raw.label_en_source === raw.label) {
        out.set(key, raw.label_en)
        continue
      }
      marks.set(key, { sceneId: sc.scene_id, landmark: raw })
      todo.push({ id: key, native: raw.label })
    }
  }
  if (!todo.length) return out
  const en = await deriveEnBatch(todo, 'stage landmark label (short English noun phrase)')
  const touched = new Set<string>()
  for (const [key, v] of en) {
    const m = marks.get(key)
    if (!m) continue
    out.set(key, v)
    m.landmark.label_en = v
    m.landmark.label_en_source = m.landmark.label
    touched.add(m.sceneId)
  }
  await Promise.all(
    [...touched].map(async (sceneId) => {
      const sc = scenes.find((s) => s.scene_id === sceneId)
      if (!sc) return
      const { error } = await supabaseAdmin.from('scenes').update({ stage: sc.stage }).eq('project_id', projectId).eq('scene_id', sceneId)
      if (error) console.warn('[i18n/entity-names] scenes.stage label_en save failed:', sceneId, error.message)
    }),
  )
  return out
}
