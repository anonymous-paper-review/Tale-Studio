// 작품 스타일 기록(버전) 서버 쪽(2026-10-28 오너) — 버전 행 · 지금 그림 읽기, 버전 폴더에 남기기, 불러와 되돌리기, 재생성 칸 사실 모으기,
//   카드 기록에서 빠진 그림 파일 지우기. 판정 규칙은 style-versions.ts(순수)가 정하고 여기서는 DB · 보관함만 만진다(service role).
//   약속: tests/artist/style-version-routes.test.ts · tests/artist/image-files.test.ts
import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { displayNameOf } from '@/lib/display-name'
import { STALE_QUEUED_MS } from '@/lib/generation-job-timing'
import { styleIdOf } from '@/lib/series/snapshot'
import { thumbObjectPath } from '@/lib/storage-thumb'
import { storageKeySegment } from '@/lib/storage/key-segment'
import { mediaCopy, mediaPathFromUrl, mediaPublicUrl } from '@/lib/storage/media'
import { getActiveRun } from '@/lib/writer/run-store'
import { versionFolder } from '@/lib/artist/image-files'
import {
  closeActiveRange,
  historyPick,
  parseActive,
  parseCustomStyle,
  parseRegenRecord,
  parseVersionSnapshot,
  regenProgress,
  regenSlotKey,
  type RegenProgress,
  type RegenRecord,
  type RegenSlot,
  type RegenSlotFacts,
  type VersionImage,
  type VersionSnapshot,
  type VersionSummary,
  type VersionView,
} from '@/lib/artist/style-versions'

export interface VersionRow {
  id: string
  project_id: string
  n: number
  style_anchor_key: string | null
  custom_style_anchor: unknown
  snapshot: unknown
  is_current: boolean
  active: unknown
  regen: unknown
  created_at: string
  updated_at: string
}

export interface VersionProject {
  id: string
  workspace_id: string
  current_stage: string | null
  style_anchor_key: string | null
  custom_style_anchor: unknown
  design_tokens: unknown
}

const rowsOf = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : [])

export async function readVersionProject(projectId: string): Promise<VersionProject | null> {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, workspace_id, current_stage, style_anchor_key, custom_style_anchor, design_tokens')
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw new Error(`project read failed: ${error.message}`)
  return (data as VersionProject | null) ?? null
}

export async function readVersionRows(projectId: string): Promise<VersionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('artist_versions')
    .select('id, project_id, n, style_anchor_key, custom_style_anchor, snapshot, is_current, active, regen, created_at, updated_at')
    .eq('project_id', projectId)
    .order('n', { ascending: true })
  if (error) throw new Error(`artist versions read failed: ${error.message}`)
  return rowsOf<VersionRow>(data)
}

export function summaryOf(row: Pick<VersionRow, 'n' | 'style_anchor_key' | 'custom_style_anchor' | 'is_current' | 'active'>): VersionSummary {
  return { n: row.n, styleId: styleIdOf(row), current: row.is_current === true, active: parseActive(row.active) }
}

/** 바뀐 시각 — 앞 값보다 늘 뒤다(같은 밀리초에 두 번 바꿔도 비교로 가릴 수 있게). */
export function nextStamp(previous: string | null | undefined): string {
  const prev = previous ? Date.parse(previous) : Number.NaN
  const now = Date.now()
  return new Date(Number.isFinite(prev) && prev >= now ? prev + 1 : now).toISOString()
}

/** Storyboard 를 열었나([완료하기] 뒤 · 예전 흐름으로 샷까지 만든 프로젝트) — 화면 artistCompleted 와 같은 기준(stage-gate). */
export async function artistStyleLocked(project: Pick<VersionProject, 'id' | 'current_stage'>): Promise<boolean> {
  if (project.current_stage === 'writer' || project.current_stage === 'director' || project.current_stage === 'editor') return true
  const { data: shots, error } = await supabaseAdmin.from('shots').select('shot_id').eq('project_id', project.id).limit(1)
  if (error) throw new Error(`shots read failed: ${error.message}`)
  if (rowsOf(shots).length === 0) return false
  // 새 Writer 에서 산문을 확정한 실행은 [만들기]가 샷까지 먼저 만든다 — 그때는 [완료하기]로만 Storyboard 가 열린다.
  const run = await getActiveRun(project.id)
  return (run?.state as { _proseLocked?: unknown } | undefined)?._proseLocked !== true
}

/** 이 프로젝트의 인물 · 배경 그림이 그리는 중인가(10분 안의 대기 작업). */
export async function imagesDrawing(projectId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, kind, created_at')
    .eq('project_id', projectId)
    .eq('status', 'queued')
    .in('kind', ['character_view', 'world_shot'])
    .gte('created_at', new Date(Date.now() - STALE_QUEUED_MS).toISOString())
  if (error) throw new Error(`generation jobs read failed: ${error.message}`)
  return rowsOf(data).length > 0
}

/** 기록이 없으면 지금 그림 · 지금 스타일로 v1 을 만든다(이 기능 전 그림은 v1). 같이 만들어 겹치면 다시 읽는다. */
export async function ensureFirstVersion(project: VersionProject, rows: VersionRow[]): Promise<VersionRow[]> {
  if (rows.length > 0) return rows
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin.from('artist_versions').insert({
    project_id: project.id,
    n: 1,
    style_anchor_key: project.style_anchor_key || null,
    custom_style_anchor: (project.custom_style_anchor ?? null) as never,
    snapshot: null,
    is_current: true,
    active: [{ from: null, to: null }],
    regen: null,
    created_at: now,
    updated_at: now,
  })
  if (error && error.code !== '23505') throw new Error(`first version insert failed: ${error.message}`)
  return readVersionRows(project.id)
}

// ── 지금 그림 ────────────────────────────────────────────────────

export interface LiveImages {
  characters: Array<{ character_id: string; name: string | null; entity_type: string | null }>
  appearances: Array<{ character_id: string; appearance_key: string; is_default: boolean; sheet_url: string | null; portrait_url: string | null; derived_from_url: string | null }>
  characterCandidates: Array<{ id: string; character_id: string; appearance_key: string; view: string; url: string; source_hash: string | null; appearance_hash: string | null; is_selected: boolean; generated_at: string }>
  locations: Array<{ location_id: string; name: string | null; wide_shot: string | null }>
  locationAppearances: Array<{ location_id: string; appearance_key: string; wide_shot: string | null }>
  locationCandidates: Array<{ id: string; location_id: string; view: string; url: string; source_hash: string | null; appearance_hash: string | null; is_selected: boolean; generated_at: string; variant_key: string | null }>
}

export async function readLiveImages(projectId: string): Promise<LiveImages> {
  const read = async <T>(table: string, columns: string): Promise<T[]> => {
    const { data, error } = await supabaseAdmin.from(table).select(columns).eq('project_id', projectId)
    if (error) throw new Error(`${table} read failed: ${error.message}`)
    return rowsOf<T>(data)
  }
  const [characters, appearances, characterCandidates, locations, locationAppearances, locationCandidates] = await Promise.all([
    read<LiveImages['characters'][number]>('characters', 'character_id, name, entity_type'),
    read<LiveImages['appearances'][number]>('character_appearances', 'character_id, appearance_key, is_default, sheet_url, portrait_url, derived_from_url'),
    read<LiveImages['characterCandidates'][number]>('character_image_candidates', 'id, character_id, appearance_key, view, url, source_hash, appearance_hash, is_selected, generated_at'),
    read<LiveImages['locations'][number]>('locations', 'location_id, name, wide_shot'),
    read<LiveImages['locationAppearances'][number]>('location_appearances', 'location_id, appearance_key, wide_shot'),
    read<LiveImages['locationCandidates'][number]>('location_image_candidates', 'id, location_id, view, url, source_hash, appearance_hash, is_selected, generated_at, variant_key'),
  ])
  return { characters, appearances, characterCandidates, locations, locationAppearances, locationCandidates }
}

const withoutQuery = (url: string) => url.split('?')[0]

/** 지금 그림 → 버전 모양(복사 전). 기록 줄은 지금 그림과 같은 파일을 가리키는 선택본만 잇는다. */
export function liveSnapshot(live: LiveImages): VersionSnapshot {
  const image = (url: string, candidate: { id: string; url: string; source_hash: string | null; appearance_hash: string | null; generated_at: string } | undefined): VersionImage => {
    const same = candidate && withoutQuery(candidate.url) === withoutQuery(url)
    return {
      url,
      candidateId: same ? candidate.id : null,
      sourceHash: same ? candidate.source_hash ?? null : null,
      appearanceHash: same ? candidate.appearance_hash ?? null : null,
      generatedAt: same ? candidate.generated_at : null,
    }
  }
  return {
    characters: live.appearances.filter((a) => !!a.sheet_url).map((a) => ({
      characterId: a.character_id,
      appearanceKey: a.appearance_key,
      sheet: image(a.sheet_url!, live.characterCandidates.find((c) => c.character_id === a.character_id && c.appearance_key === a.appearance_key && c.view === 'main' && c.is_selected)),
      portraitUrl: a.portrait_url,
    })),
    locations: [
      ...live.locations.filter((l) => !!l.wide_shot).map((l) => ({
        locationId: l.location_id,
        appearanceKey: null,
        wideShot: image(l.wide_shot!, live.locationCandidates.find((c) => c.location_id === l.location_id && c.view === 'wide_shot' && (c.variant_key ?? null) === null && c.is_selected)),
      })),
      ...live.locationAppearances.filter((a) => !!a.wide_shot).map((a) => ({
        locationId: a.location_id,
        appearanceKey: a.appearance_key,
        wideShot: image(a.wide_shot!, live.locationCandidates.find((c) => c.location_id === a.location_id && c.view === 'wide_shot' && c.variant_key === a.appearance_key && c.is_selected)),
      })),
    ],
  }
}

/** 보관함 안 파일을 버전 폴더로 복사한다 — 실패하면 한 번 더, 그래도 안 되면 원래 주소를 남긴다(그 파일은 지우지 않게 보호된다).
 *  이미 이 버전 폴더에 있는 파일(불러온 뒤 그대로인 그림)은 다시 복사하지 않는다. */
async function copyIntoVersion(url: string, destination: string, folder: string): Promise<string> {
  const source = mediaPathFromUrl(url)
  if (!source || source.startsWith(folder)) return url
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await mediaCopy(source, destination)
    if (!error) {
      // 작은 미리보기도 함께 — 없으면 화면이 원본으로 폴백한다(ThumbImage).
      await mediaCopy(thumbObjectPath(source), thumbObjectPath(destination)).catch(() => null)
      return mediaPublicUrl(destination)
    }
    if (attempt === 1) console.warn('[artist-versions] copy failed, keeping the original:', source, error.message)
  }
  return url
}

/** 떠나는 버전의 그림을 버전 폴더({ws}/{project}/versions/v{n}/)에 복사해 남긴다 — 나중에 다시 그리거나 지워도 남긴 버전은 그대로다. */
export async function freezeSnapshot(project: Pick<VersionProject, 'id' | 'workspace_id'>, n: number, snapshot: VersionSnapshot): Promise<VersionSnapshot> {
  const folder = versionFolder(project.workspace_id, project.id, n)
  const token = randomUUID().slice(0, 8)
  const name = (kind: string, id: string, key: string | null, field: string) =>
    `${folder}${kind}-${storageKeySegment(id).slice(3, 19)}-${storageKeySegment(key ?? 'default').slice(3, 15)}-${field}-${token}.png`
  const characters = await Promise.all(snapshot.characters.map(async (entry) => {
    const sheetUrl = await copyIntoVersion(entry.sheet.url, name('c', entry.characterId, entry.appearanceKey, 'sheet'), folder)
    const portraitUrl = !entry.portraitUrl
      ? null
      : withoutQuery(entry.portraitUrl) === withoutQuery(entry.sheet.url)
        ? sheetUrl
        : await copyIntoVersion(entry.portraitUrl, name('c', entry.characterId, entry.appearanceKey, 'face'), folder)
    return { ...entry, sheet: { ...entry.sheet, url: sheetUrl }, portraitUrl }
  }))
  const locations = await Promise.all(snapshot.locations.map(async (entry) => ({
    ...entry,
    wideShot: { ...entry.wideShot, url: await copyIntoVersion(entry.wideShot.url, name('l', entry.locationId, entry.appearanceKey, 'wide'), folder) },
  })))
  return { characters, locations }
}

/** 고른 후보를 그 칸의 "지금"으로 — 칸의 다른 선택을 먼저 내린다(칸마다 하나). */
async function selectCandidateRow(table: 'character_image_candidates' | 'location_image_candidates', clearIds: string[], id: string): Promise<void> {
  const others = clearIds.filter((other) => other !== id)
  if (others.length) {
    const { error } = await supabaseAdmin.from(table).update({ is_selected: false }).in('id', others)
    if (error) throw new Error(`${table} clear failed: ${error.message}`)
  }
  const { error } = await supabaseAdmin.from(table).update({ is_selected: true }).eq('id', id)
  if (error) throw new Error(`${table} select failed: ${error.message}`)
}

/**
 * 버전 그림으로 되돌린다(다시 그리지 않음). 그 버전에 있던 칸만 — 뒤에 새로 생긴 인물 · 배경 · 모습은 지금 그림 그대로.
 *   그 그림의 카드 기록 줄이 남아 있으면 그 줄을 "지금"으로 고르고, 빠졌으면 버전 폴더 그림으로 줄을 다시 만든다(그때의 지문 그대로).
 */
export async function restoreSnapshot(projectId: string, snapshot: VersionSnapshot, live: LiveImages, at: string): Promise<void> {
  for (const entry of snapshot.characters) {
    const appearance = live.appearances.find((a) => a.character_id === entry.characterId && a.appearance_key === entry.appearanceKey)
    if (!appearance) continue
    const slot = live.characterCandidates.filter((c) => c.character_id === entry.characterId && c.appearance_key === entry.appearanceKey && c.view === 'main')
    const selected = slot.filter((c) => c.is_selected).map((c) => c.id)
    const keep = entry.sheet.candidateId ? slot.find((c) => c.id === entry.sheet.candidateId) : undefined
    let sheetUrl = entry.sheet.url
    if (keep) {
      await selectCandidateRow('character_image_candidates', selected, keep.id)
      sheetUrl = keep.url
    } else {
      if (selected.length) {
        const { error } = await supabaseAdmin.from('character_image_candidates').update({ is_selected: false }).in('id', selected)
        if (error) throw new Error(`character candidates clear failed: ${error.message}`)
      }
      const { error } = await supabaseAdmin.from('character_image_candidates').insert({
        project_id: projectId,
        character_id: entry.characterId,
        appearance_key: entry.appearanceKey,
        view: 'main',
        url: entry.sheet.url,
        source_hash: entry.sheet.sourceHash,
        appearance_hash: entry.sheet.appearanceHash,
        job_id: null,
        is_selected: true,
        generated_at: entry.sheet.generatedAt ?? at,
      })
      if (error) throw new Error(`character candidate restore failed: ${error.message}`)
    }
    // 올린 원본이 있는 모습은 그 원본이 대표 얼굴이다(#image-to-artist) — 덮지 않는다.
    const patch: Record<string, unknown> = { sheet_url: sheetUrl, updated_at: at }
    if (!appearance.derived_from_url && entry.portraitUrl) patch.portrait_url = entry.portraitUrl
    const { error } = await supabaseAdmin
      .from('character_appearances')
      .update(patch)
      .eq('project_id', projectId)
      .eq('character_id', entry.characterId)
      .eq('appearance_key', entry.appearanceKey)
    if (error) throw new Error(`character appearance restore failed: ${error.message}`)
  }

  for (const entry of snapshot.locations) {
    const variant = entry.appearanceKey
    const exists = variant
      ? live.locationAppearances.some((a) => a.location_id === entry.locationId && a.appearance_key === variant)
      : live.locations.some((l) => l.location_id === entry.locationId)
    if (!exists) continue
    const slot = live.locationCandidates.filter((c) => c.location_id === entry.locationId && c.view === 'wide_shot' && (c.variant_key ?? null) === variant)
    const selected = slot.filter((c) => c.is_selected).map((c) => c.id)
    const keep = entry.wideShot.candidateId ? slot.find((c) => c.id === entry.wideShot.candidateId) : undefined
    let url = entry.wideShot.url
    if (keep) {
      await selectCandidateRow('location_image_candidates', selected, keep.id)
      url = keep.url
    } else {
      if (selected.length) {
        const { error } = await supabaseAdmin.from('location_image_candidates').update({ is_selected: false }).in('id', selected)
        if (error) throw new Error(`location candidates clear failed: ${error.message}`)
      }
      const { error } = await supabaseAdmin.from('location_image_candidates').insert({
        project_id: projectId,
        location_id: entry.locationId,
        view: 'wide_shot',
        variant_key: variant,
        url: entry.wideShot.url,
        source_hash: entry.wideShot.sourceHash,
        appearance_hash: entry.wideShot.appearanceHash,
        job_id: null,
        is_selected: true,
        generated_at: entry.wideShot.generatedAt ?? at,
      })
      if (error) throw new Error(`location candidate restore failed: ${error.message}`)
    }
    const { error } = variant
      ? await supabaseAdmin.from('location_appearances').update({ wide_shot: url, updated_at: at }).eq('project_id', projectId).eq('location_id', entry.locationId).eq('appearance_key', variant)
      : await supabaseAdmin.from('locations').update({ wide_shot: url }).eq('project_id', projectId).eq('location_id', entry.locationId)
    if (error) throw new Error(`location restore failed: ${error.message}`)
  }
}

// ── 재생성 칸 사실 ───────────────────────────────────────────────

type JobRow = { id: string; kind: string; status: string; target: Record<string, unknown> | null; created_at: string }

/** 재생성 시작 뒤의 그림 작업 · 지금 그림으로 칸마다의 사실을 만든다. */
export async function regenProgressFor(projectId: string, n: number, record: RegenRecord, live: LiveImages): Promise<RegenProgress> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, kind, status, target, created_at')
    .eq('project_id', projectId)
    .in('kind', ['character_view', 'world_shot'])
    .gte('created_at', record.startedAt)
  if (error) throw new Error(`generation jobs read failed: ${error.message}`)
  const jobs = rowsOf<JobRow>(data)
  const now = Date.now()
  const jobsBySlot = new Map<string, RegenSlotFacts['jobs'][number][]>()
  for (const job of jobs) {
    const target = job.target ?? {}
    let key: string | null = null
    if (job.kind === 'character_view' && target.view === 'main' && typeof target.characterId === 'string' && typeof target.appearanceKey === 'string') {
      key = regenSlotKey({ kind: 'character', id: target.characterId, appearanceKey: target.appearanceKey })
    } else if (job.kind === 'world_shot' && typeof target.locationId === 'string' && (target.column ?? 'wide_shot') === 'wide_shot') {
      const variant = typeof target.appearanceKey === 'string' && target.appearanceKey && target.appearanceKey !== 'default' ? target.appearanceKey : null
      key = regenSlotKey({ kind: 'location', id: target.locationId, appearanceKey: variant })
    }
    if (!key) continue
    const list = jobsBySlot.get(key) ?? []
    list.push({ status: job.status, fresh: now - Date.parse(job.created_at) < STALE_QUEUED_MS })
    jobsBySlot.set(key, list)
  }
  const factsOf = (slot: RegenSlot): RegenSlotFacts => {
    const jobsOfSlot = jobsBySlot.get(regenSlotKey(slot)) ?? []
    if (slot.kind === 'character') {
      const appearance = live.appearances.find((a) => a.character_id === slot.id && a.appearance_key === slot.appearanceKey)
      return { exists: !!appearance, currentUrl: appearance?.sheet_url ?? null, jobs: jobsOfSlot }
    }
    if (slot.appearanceKey) {
      const appearance = live.locationAppearances.find((a) => a.location_id === slot.id && a.appearance_key === slot.appearanceKey)
      return { exists: !!appearance, currentUrl: appearance?.wide_shot ?? null, jobs: jobsOfSlot }
    }
    const location = live.locations.find((l) => l.location_id === slot.id)
    return { exists: !!location, currentUrl: location?.wide_shot ?? null, jobs: jobsOfSlot }
  }
  return regenProgress(n, record, factsOf)
}

// ── 화면이 받는 모양 ─────────────────────────────────────────────

/** 버전 줄마다 인물(기본 모습 대표 얼굴) · 배경(기본 그림) 썸네일 — 지금 버전은 지금 그림, 남긴 버전은 그때 그림. 뒤에 생긴 것은 빈칸. */
export function versionViews(rows: VersionRow[], live: LiveImages): VersionView[] {
  const current = liveSnapshot(live)
  const persons = live.characters.filter((c) => c.entity_type !== 'object')
  return rows.map((row) => {
    const snapshot = row.is_current ? current : parseVersionSnapshot(row.snapshot) ?? { characters: [], locations: [] }
    const defaults = new Map(live.appearances.filter((a) => a.is_default).map((a) => [a.character_id, a.appearance_key]))
    const thumbs: VersionView['thumbs'] = [
      ...persons.map((c) => {
        const entry = snapshot.characters.find((e) => e.characterId === c.character_id && e.appearanceKey === defaults.get(c.character_id))
        return { kind: 'character' as const, id: c.character_id, name: displayNameOf(c.name ?? '', c.character_id), url: entry ? entry.portraitUrl ?? entry.sheet.url : null }
      }),
      ...live.locations.map((l) => {
        const entry = snapshot.locations.find((e) => e.locationId === l.location_id && e.appearanceKey === null)
        return { kind: 'location' as const, id: l.location_id, name: displayNameOf(l.name ?? '', l.location_id), url: entry?.wideShot.url ?? null }
      }),
    ]
    return {
      ...summaryOf(row),
      styleKey: row.style_anchor_key,
      customStyle: parseCustomStyle(row.custom_style_anchor),
      createdAt: row.created_at,
      thumbs,
    }
  })
}

/** 카드 기록 줄의 그림이 지금 작품 스타일 것인가(서버 쪽 확인) — 기록이 없으면 가리지 않는다.
 *  덧붙인 검사라 기록을 못 읽으면(기록 표가 아직 없는 곳 등) 막지 않는다 — 카드 기록 되돌리기는 지금처럼 된다. */
export async function candidateStyleAllowed(projectId: string, generatedAt: string | null | undefined): Promise<boolean> {
  if (!generatedAt) return true
  try {
    const [rows, project] = await Promise.all([readVersionRows(projectId), readVersionProject(projectId)])
    if (!project || rows.length === 0) return true
    return historyPick({ generatedAt, versions: rows.map(summaryOf), currentStyleId: styleIdOf(project) }).loadable
  } catch (e) {
    console.warn('[artist-versions] style check skipped:', e instanceof Error ? e.message : e)
    return true
  }
}

// ── 버전 바꾸기(재생성 · 불러오기 공용) ─────────────────────────────

/** 지금 버전에 그리다 남은 재생성 그림이 있나 — 다 그렸는데 아직 알리지 않은 것은 남은 것이 아니다. */
export async function regenStillPending(projectId: string, current: VersionRow, live: LiveImages): Promise<boolean> {
  const record = parseRegenRecord(current.regen)
  if (!record || record.doneAt) return false
  return !(await regenProgressFor(projectId, current.n, record, live)).complete
}

/**
 * 지금 버전을 떠난다 — 지금 그림을 버전 폴더에 남기고, 지금이었던 때를 닫는다.
 *   지금 버전 행이 읽은 뒤에 바뀌지 않았을 때만(바뀐 시각 비교) — 다른 창이 먼저 바꿨으면 ok:false.
 */
export async function leaveCurrentVersion(project: VersionProject, current: VersionRow, live: LiveImages, at: string): Promise<{ ok: true; frozen: VersionSnapshot } | { ok: false }> {
  // 그때의 그림 지시 그림체 값도 남긴다 — 불러오면 그림과 함께 이 값으로 돌아간다(styleLookTokens).
  const frozen = { ...(await freezeSnapshot(project, current.n, liveSnapshot(live))), look: { l1: designL1(project.design_tokens) } }
  // 떠날 수 있는 버전의 재생성은 다 그린 것이다(남은 그림이 있으면 부르는 쪽이 막는다) — 아직 알리지 않았으면 다 그렸다고 적어,
  //   나중에 이 버전을 다시 불러와도 "만들었어요"를 또 알리지 않는다.
  const record = parseRegenRecord(current.regen)
  const regen = record && !record.doneAt ? { ...record, doneAt: at } : current.regen
  const { data, error } = await supabaseAdmin
    .from('artist_versions')
    .update({ is_current: false, snapshot: frozen, active: closeActiveRange(parseActive(current.active), at), regen: regen as never, updated_at: nextStamp(current.updated_at) })
    .eq('id', current.id)
    .eq('is_current', true)
    .eq('updated_at', current.updated_at)
    .select('id')
  if (error) throw new Error(`current version update failed: ${error.message}`)
  return rowsOf(data).length === 1 ? { ok: true, frozen } : { ok: false }
}

/** 떠난 버전을 되돌린다(뒤 단계가 실패했을 때) — 최선. */
export async function returnToVersion(current: VersionRow): Promise<void> {
  const { error } = await supabaseAdmin
    .from('artist_versions')
    .update({ is_current: true, snapshot: current.snapshot as never, active: current.active as never, regen: current.regen as never, updated_at: nextStamp(current.updated_at) })
    .eq('id', current.id)
  if (error) console.error('[artist-versions] could not return to the version:', current.n, error.message)
}

/** 그림 지시 그림체 값(design_tokens.l1) — 없거나 모양이 다르면 null. */
export function designL1(designTokens: unknown): Record<string, unknown> | null {
  if (!designTokens || typeof designTokens !== 'object') return null
  const l1 = (designTokens as { l1?: unknown }).l1
  return l1 && typeof l1 === 'object' && !Array.isArray(l1) ? (l1 as Record<string, unknown>) : null
}

/** design_tokens 의 l1 만 바꾼 값 — 디자인 값이 없던 작품(예전 흐름)은 만들지 않는다(룩 없음 판정이 바뀐다). */
export function withDesignL1(designTokens: unknown, l1: Record<string, unknown> | null): unknown {
  if (!designTokens || typeof designTokens !== 'object' || !l1) return designTokens
  return { ...(designTokens as Record<string, unknown>), l1 }
}

/** 작품 스타일을 바꾼다 — 직접 올린 그림체면 그 그림체를 함께, 아니면 지운다(producer-store setStyleAnchor 와 같은 규칙).
 *  designTokens 를 주면 그림 지시 값(design_tokens)도 함께 바꾼다(스타일이 바뀌면 그림체 값도 바뀐다). */
export async function setProjectStyle(projectId: string, styleKey: string | null, customStyleAnchor: unknown, designTokens?: unknown): Promise<void> {
  const { error } = await supabaseAdmin
    .from('projects')
    .update({
      style_anchor_key: styleKey ?? '',
      custom_style_anchor: (customStyleAnchor ?? null) as never,
      ...(designTokens !== undefined ? { design_tokens: designTokens as never } : {}),
    })
    .eq('id', projectId)
  if (error) throw new Error(`project style update failed: ${error.message}`)
}
