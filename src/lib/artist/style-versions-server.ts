// 작품 스타일 기록(버전) 서버 쪽(2026-10-28 오너) — 버전 행 · 지금 그림 읽기, 버전 폴더에 남기기, 불러와 되돌리기, 재생성 칸 사실 모으기,
//   기록 바로잡기(지금 버전이 없을 때 · 불러오다 멈췄을 때). 판정 규칙은 style-versions.ts(순수)가 정하고 여기서는 DB · 보관함만 만진다(service role).
//   약속: tests/artist/style-version-routes.test.ts · tests/artist/style-version-fixes.test.ts · tests/artist/image-files.test.ts
import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { displayNameOf } from '@/lib/display-name'
import { failGenerationJob } from '@/lib/generation-jobs'
import { STALE_QUEUED_MS } from '@/lib/generation-job-timing'
import { styleIdOf } from '@/lib/series/snapshot'
import { thumbObjectPath } from '@/lib/storage-thumb'
import { storageKeySegment } from '@/lib/storage/key-segment'
import { mediaCopy, mediaPathFromUrl, mediaPublicUrl, mediaRemove } from '@/lib/storage/media'
import { portraitPathForSheet, versionFolder } from '@/lib/artist/image-files'
import { protectedImagePaths } from '@/lib/artist/image-file-cleanup'
import { portraitForSheetUrl } from '@/lib/artist/portrait-file'
import {
  closeActiveRange,
  historyPick,
  openActiveRange,
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
  type VersionCharacterImage,
  type VersionImage,
  type VersionLocationImage,
  type VersionSnapshot,
  type VersionSummary,
  type VersionView,
} from '@/lib/artist/style-versions'

/** 한 번에 함께 되돌리는 칸 수 — 칸마다 차례로 하면 큰 작품은 함수 시간 제한을 넘는다(2026-10-28 검토 지적). */
export const RESTORE_CONCURRENCY = 6
/** 한 번에 함께 복사하는 그림 수. */
const COPY_CONCURRENCY = 8
/** 불러오기가 맡는 시간 — 불러오기 창구의 함수 시간 제한(300초) + 여유. 지나도 불러오는 중 표시가 남았으면 멈춘 것이다. */
export const RESTORE_LEASE_MS = 305_000
/** 지금 버전이 없어진 뒤 되살리기까지 기다리는 시간 — 버전을 바꾸는 그 짧은 사이(떠남 → 지금으로)에는 되살리지 않는다. */
export const HEAL_GRACE_MS = 60_000

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

/** 일을 limit 개씩 함께 돌린다 — 하나라도 실패하면 새 일은 시작하지 않고, 돌던 일이 끝난 뒤 첫 실패를 던진다. */
async function runLimited(tasks: ReadonlyArray<() => Promise<void>>, limit: number): Promise<void> {
  const state: { next: number; failure: { error: unknown } | null } = { next: 0, failure: null }
  const worker = async () => {
    while (!state.failure && state.next < tasks.length) {
      const task = tasks[state.next++]
      try {
        await task()
      } catch (error) {
        state.failure ??= { error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  if (state.failure) throw state.failure.error
}

/** 보관함 파일 지우기(작은 미리보기 함께) — 최선. */
async function removeFiles(paths: readonly string[], why: string): Promise<void> {
  if (paths.length === 0) return
  try {
    const { error } = await mediaRemove([...paths, ...paths.map(thumbObjectPath)])
    if (error) throw error
  } catch (e) {
    console.warn(`[artist-versions] ${why} kept:`, e instanceof Error ? e.message : e)
  }
}

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
  //   가장 최근 실행(getActiveRun 과 같은 행)의 산문 확정 표시만 읽는다 — 그리는 동안 몇 초마다 부르므로 큰 실행 기록 전체를 읽지 않는다(2026-10-28 검토 지적).
  const { data: run, error: runError } = await supabaseAdmin
    .from('writer_runs')
    .select('prose_locked:state->>_proseLocked')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (runError) throw new Error(`writer run read failed: ${runError.message}`)
  return (run as { prose_locked?: unknown } | null)?.prose_locked !== 'true'
}

/** 10분 넘게 대기로 멈춘 이 작품의 인물 · 배경 그림 작업을 실패로 정리한다 — 버전을 바꾼 뒤 늦게 끝나 되돌린 그림을 덮지 않게
 *  (늦게 온 결과는 대기 중인 작업만 받는다, fal webhook · 확인). 최선 — 정리하지 못해도 버전은 바꾼다. */
export async function failStaleImageJobs(projectId: string): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin
      .from('generation_jobs')
      .select('id')
      .eq('project_id', projectId)
      .eq('status', 'queued')
      .in('kind', ['character_view', 'world_shot'])
      .lt('created_at', new Date(Date.now() - STALE_QUEUED_MS).toISOString())
    if (error) throw new Error(error.message)
    for (const job of rowsOf<{ id: string }>(data)) {
      await failGenerationJob(job.id, 'stale queued reaped: superseded by an artist version switch').catch((e) => {
        console.warn('[artist-versions] stale job left queued:', job.id, e instanceof Error ? e.message : e)
      })
    }
  } catch (e) {
    console.warn('[artist-versions] stale job cleanup skipped:', e instanceof Error ? e.message : e)
  }
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
/** 버전 폴더의 그림인가 — 지금 그림이 이것이면 불러오기가 그 칸의 기록 줄을 골라 둔 것이다(restoreSnapshot). */
const isVersionCopy = (url: string) => /\/versions\/v\d+\//.test(mediaPathFromUrl(url) ?? '')

/** 지금 그림 → 버전 모양(복사 전). 기록 줄은 지금 그림과 같은 파일을 가리키는 선택본만 잇는다 —
 *  불러온 버전의 그림(버전 폴더 복사본)이면 불러오기가 고른 선택본(그때의 줄 · 지문)을 잇는다. */
export function liveSnapshot(live: LiveImages): VersionSnapshot {
  const image = (url: string, candidate: { id: string; url: string; source_hash: string | null; appearance_hash: string | null; generated_at: string } | undefined): VersionImage => {
    const same = candidate && (withoutQuery(candidate.url) === withoutQuery(url) || isVersionCopy(url))
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

type FrozenImage = { url: string; sourceUrl: string | null; created: string | null }

/**
 * 그림 한 장을 버전 폴더에 남긴다 — 이미 이 버전 폴더 것(불러온 뒤 그대로인 그림)이면 그대로, 지난번에 같은 그림(같은 주소)을
 *   복사해 뒀으면 그 복사본을 다시 쓴다(오갈 때마다 복사하면 보관함이 끝없이 커진다, 2026-10-28 검토 지적).
 *   아니면 새로 복사 — 실패하면 한 번 더, 그래도 안 되면 원래 주소를 남긴다(그 파일은 지우지 않게 보호된다).
 */
async function freezeImage(url: string, previous: { url: string; sourceUrl: string | null } | null, destination: string, folder: string): Promise<FrozenImage> {
  const source = mediaPathFromUrl(url)
  if (!source) return { url, sourceUrl: url, created: null }
  if (source.startsWith(folder)) return { url, sourceUrl: previous && previous.url === url ? previous.sourceUrl : null, created: null }
  if (previous && previous.sourceUrl === url && mediaPathFromUrl(previous.url)?.startsWith(folder)) return { url: previous.url, sourceUrl: url, created: null }
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await mediaCopy(source, destination)
    if (!error) {
      // 작은 미리보기도 함께 — 없으면 화면이 원본으로 폴백한다(ThumbImage).
      await mediaCopy(thumbObjectPath(source), thumbObjectPath(destination)).catch(() => null)
      return { url: mediaPublicUrl(destination), sourceUrl: url, created: destination }
    }
    if (attempt === 1) console.warn('[artist-versions] copy failed, keeping the original:', source, error.message)
  }
  return { url, sourceUrl: url, created: null }
}

/**
 * 떠나는 버전의 그림을 버전 폴더({ws}/{project}/versions/v{n}/)에 남긴다 — 나중에 다시 그리거나 지워도 남긴 버전은 그대로다.
 *   previous = 그 버전이 지난번에 남긴 기록(다시 쓸 복사본). created = 이번에 새로 복사한 파일(바꾸기가 무르면 거둔다).
 */
export async function freezeSnapshot(
  project: Pick<VersionProject, 'id' | 'workspace_id'>,
  n: number,
  snapshot: VersionSnapshot,
  previous: VersionSnapshot | null = null,
): Promise<{ snapshot: VersionSnapshot; created: string[] }> {
  const folder = versionFolder(project.workspace_id, project.id, n)
  const token = randomUUID().slice(0, 8)
  const name = (kind: string, id: string, key: string | null, field: string) =>
    `${folder}${kind}-${storageKeySegment(id).slice(3, 19)}-${storageKeySegment(key ?? 'default').slice(3, 15)}-${field}-${token}.png`
  const created: string[] = []
  const kept = (frozen: FrozenImage) => {
    if (frozen.created) created.push(frozen.created)
    return frozen
  }
  const characters: VersionCharacterImage[] = new Array(snapshot.characters.length)
  const locations: VersionLocationImage[] = new Array(snapshot.locations.length)
  const tasks = [
    ...snapshot.characters.map((entry, i) => async () => {
      const before = previous?.characters.find((e) => e.characterId === entry.characterId && e.appearanceKey === entry.appearanceKey) ?? null
      const sheet = kept(await freezeImage(entry.sheet.url, before ? { url: before.sheet.url, sourceUrl: before.sheet.sourceUrl ?? null } : null, name('c', entry.characterId, entry.appearanceKey, 'sheet'), folder))
      let face: { url: string | null; sourceUrl: string | null } = { url: null, sourceUrl: null }
      if (entry.portraitUrl && withoutQuery(entry.portraitUrl) === withoutQuery(entry.sheet.url)) face = sheet
      else if (entry.portraitUrl) {
        face = kept(await freezeImage(entry.portraitUrl, before?.portraitUrl ? { url: before.portraitUrl, sourceUrl: before.portraitSourceUrl ?? null } : null, name('c', entry.characterId, entry.appearanceKey, 'face'), folder))
      }
      characters[i] = { ...entry, sheet: { ...entry.sheet, url: sheet.url, sourceUrl: sheet.sourceUrl }, portraitUrl: face.url, portraitSourceUrl: face.sourceUrl }
    }),
    ...snapshot.locations.map((entry, i) => async () => {
      const before = previous?.locations.find((e) => e.locationId === entry.locationId && e.appearanceKey === entry.appearanceKey) ?? null
      const wide = kept(await freezeImage(entry.wideShot.url, before ? { url: before.wideShot.url, sourceUrl: before.wideShot.sourceUrl ?? null } : null, name('l', entry.locationId, entry.appearanceKey, 'wide'), folder))
      locations[i] = { ...entry, wideShot: { ...entry.wideShot, url: wide.url, sourceUrl: wide.sourceUrl } }
    }),
  ]
  try {
    await runLimited(tasks, COPY_CONCURRENCY)
  } catch (e) {
    await removeFiles(created, 'half-made version copies')
    throw e
  }
  return { snapshot: { characters, locations }, created }
}

/** 떠난 버전 기록이 더는 가리키지 않는 그 버전 폴더의 옛 복사본을 지운다 — 다른 버전 기록 · 지금 그림 · 카드 기록 줄이 가리키는 파일은 남긴다(최선). */
async function pruneVersionCopies(projectId: string, folder: string, previous: VersionSnapshot | null, next: VersionSnapshot): Promise<void> {
  if (!previous) return
  const pathsOf = (snapshot: VersionSnapshot) => [
    ...snapshot.characters.flatMap((entry) => [entry.sheet.url, entry.portraitUrl]),
    ...snapshot.locations.map((entry) => entry.wideShot.url),
  ].flatMap((url) => {
    const path = url ? mediaPathFromUrl(url) : null
    return path ? [path] : []
  })
  const still = new Set(pathsOf(next))
  const stale = [...new Set(pathsOf(previous))].filter((path) => path.startsWith(folder) && !still.has(path))
  if (stale.length === 0) return
  try {
    const keep = await protectedImagePaths(projectId)
    await removeFiles(stale.filter((path) => !keep.has(path)), 'old version copies')
  } catch (e) {
    console.warn('[artist-versions] old version copies kept:', e instanceof Error ? e.message : e)
  }
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

type SlotCandidate = { id: string; url: string; is_selected: boolean }

/**
 * 그 칸의 기록 줄을 "지금"으로 — 그때의 줄이 남아 있으면 그 줄(같은 지문), 앞서 되살린 줄(같은 복사본)이 있으면 그 줄,
 *   둘 다 없으면 버전 폴더 그림으로 줄을 새로 만든다. 이미 그렇게 되어 있으면 아무것도 쓰지 않는다(다시 돌려도 같다).
 */
async function pickRestoredCandidate(
  table: 'character_image_candidates' | 'location_image_candidates',
  slot: readonly SlotCandidate[],
  image: VersionImage,
  newRow: () => Record<string, unknown>,
): Promise<void> {
  const keep = (image.candidateId ? slot.find((c) => c.id === image.candidateId) : undefined) ?? slot.find((c) => withoutQuery(c.url) === withoutQuery(image.url))
  const selected = slot.filter((c) => c.is_selected).map((c) => c.id)
  if (keep) {
    if (selected.length === 1 && selected[0] === keep.id) return
    await selectCandidateRow(table, selected, keep.id)
    return
  }
  if (selected.length) {
    const { error } = await supabaseAdmin.from(table).update({ is_selected: false }).in('id', selected)
    if (error) throw new Error(`${table} clear failed: ${error.message}`)
  }
  const { error } = await supabaseAdmin.from(table).insert(newRow())
  if (error) throw new Error(`${table} restore failed: ${error.message}`)
}

/** 얼굴 없이 남은 버전의 대표 얼굴 — 불러온 시트에서 다시 자른다(select-candidate 와 같은 규칙). 못 자르면 비운다(다른 스타일 얼굴을 남기지 않게). */
async function restoredPortrait(sheetUrl: string, entityType: string | null | undefined): Promise<string | null> {
  try {
    return await portraitForSheetUrl(sheetUrl, entityType)
  } catch (e) {
    console.warn('[artist-versions] portrait crop skipped, clearing:', e instanceof Error ? e.message : e)
    return null
  }
}

async function restoreCharacter(projectId: string, entry: VersionCharacterImage, live: LiveImages, at: string): Promise<void> {
  const appearance = live.appearances.find((a) => a.character_id === entry.characterId && a.appearance_key === entry.appearanceKey)
  if (!appearance) return
  const slot = live.characterCandidates.filter((c) => c.character_id === entry.characterId && c.appearance_key === entry.appearanceKey && c.view === 'main')
  await pickRestoredCandidate('character_image_candidates', slot, entry.sheet, () => ({
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
  }))
  // 지금 그림은 버전 폴더에 남긴 그림이다 — 원래 파일은 나중에 같은 자리에 덮이거나(예전 고정 경로) 지워질 수 있다(2026-10-28 검토 지적).
  const patch: Record<string, unknown> = { sheet_url: entry.sheet.url }
  // 올린 원본이 있는 모습은 그 원본이 대표 얼굴이다(#image-to-artist) — 덮지 않는다.
  if (!appearance.derived_from_url) {
    if (entry.portraitUrl) patch.portrait_url = entry.portraitUrl
    else {
      const sheetPath = mediaPathFromUrl(entry.sheet.url)
      const cropped = !!sheetPath && !!appearance.portrait_url && mediaPathFromUrl(appearance.portrait_url) === portraitPathForSheet(sheetPath)
      if (!cropped) {
        const entityType = live.characters.find((c) => c.character_id === entry.characterId)?.entity_type
        patch.portrait_url = await restoredPortrait(entry.sheet.url, entityType)
      }
    }
  }
  if (appearance.sheet_url === patch.sheet_url && (!('portrait_url' in patch) || appearance.portrait_url === patch.portrait_url)) return
  const { error } = await supabaseAdmin
    .from('character_appearances')
    .update({ ...patch, updated_at: at })
    .eq('project_id', projectId)
    .eq('character_id', entry.characterId)
    .eq('appearance_key', entry.appearanceKey)
  if (error) throw new Error(`character appearance restore failed: ${error.message}`)
}

async function restoreLocation(projectId: string, entry: VersionLocationImage, live: LiveImages, at: string): Promise<void> {
  const variant = entry.appearanceKey
  const target = variant
    ? live.locationAppearances.find((a) => a.location_id === entry.locationId && a.appearance_key === variant)
    : live.locations.find((l) => l.location_id === entry.locationId)
  if (!target) return
  const slot = live.locationCandidates.filter((c) => c.location_id === entry.locationId && c.view === 'wide_shot' && (c.variant_key ?? null) === variant)
  await pickRestoredCandidate('location_image_candidates', slot, entry.wideShot, () => ({
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
  }))
  if (target.wide_shot === entry.wideShot.url) return
  const { error } = variant
    ? await supabaseAdmin.from('location_appearances').update({ wide_shot: entry.wideShot.url, updated_at: at }).eq('project_id', projectId).eq('location_id', entry.locationId).eq('appearance_key', variant)
    : await supabaseAdmin.from('locations').update({ wide_shot: entry.wideShot.url }).eq('project_id', projectId).eq('location_id', entry.locationId)
  if (error) throw new Error(`location restore failed: ${error.message}`)
}

/**
 * 버전 그림으로 되돌린다(다시 그리지 않음). 그 버전에 있던 칸만 — 뒤에 새로 생긴 인물 · 배경 · 모습은 지금 그림 그대로.
 *   칸마다 따로라 여러 칸을 함께(RESTORE_CONCURRENCY) 되돌린다. 칸마다 이미 되돌린 것은 건너뛰어, 멈춘 뒤 다시 돌려도 같다.
 */
export async function restoreSnapshot(projectId: string, snapshot: VersionSnapshot, live: LiveImages, at: string): Promise<void> {
  await runLimited([
    ...snapshot.characters.map((entry) => () => restoreCharacter(projectId, entry, live, at)),
    ...snapshot.locations.map((entry) => () => restoreLocation(projectId, entry, live, at)),
  ], RESTORE_CONCURRENCY)
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
  if (!record || record.doneAt || record.cancelledAt) return false
  return !(await regenProgressFor(projectId, current.n, record, live)).complete
}

/** [완료하기]를 막을 버전 일 — 불러오다 멈춘 채(restoring) · 다 그리기 전 재생성(regen). 덧붙인 검사라 기록을 못 읽으면 막지 않는다. */
export async function versionWorkPending(projectId: string): Promise<'restoring' | 'regen' | null> {
  try {
    const current = (await readVersionRows(projectId)).find((row) => row.is_current)
    if (!current) return null
    if (restoringMarkOf(current.snapshot)) return 'restoring'
    return (await regenStillPending(projectId, current, await readLiveImages(projectId))) ? 'regen' : null
  } catch (e) {
    console.warn('[artist-versions] version check skipped:', e instanceof Error ? e.message : e)
    return null
  }
}

export type LeftVersion = { ok: true; frozen: VersionSnapshot; updatedAt: string }

/**
 * 지금 버전을 떠난다 — 지금 그림을 버전 폴더에 남기고, 지금이었던 때를 닫는다. 그 버전 기록이 더는 가리키지 않는 옛 복사본은 지운다.
 *   지금 버전 행이 읽은 뒤에 바뀌지 않았을 때만(바뀐 시각 비교) — 다른 창이 먼저 바꿨으면 ok:false(이번에 만든 복사본은 거둔다).
 *   cancelRegen = 다 그리기 전에 멈춘 재생성을 그만두고 떠난다(그만둔 재생성은 다시 와도 이어 그리지 않는다).
 */
export async function leaveCurrentVersion(
  project: VersionProject,
  current: VersionRow,
  live: LiveImages,
  at: string,
  opts: { cancelRegen?: boolean } = {},
): Promise<LeftVersion | { ok: false }> {
  const folder = versionFolder(project.workspace_id, project.id, current.n)
  const previous = parseVersionSnapshot(current.snapshot)
  const { snapshot, created } = await freezeSnapshot(project, current.n, liveSnapshot(live), previous)
  // 그때의 그림 지시 그림체 값도 남긴다 — 불러오면 그림과 함께 이 값으로 돌아간다(styleLookTokens).
  const frozen: VersionSnapshot = { ...snapshot, look: { l1: designL1(project.design_tokens) } }
  // 떠날 수 있는 버전의 재생성은 다 그린 것이다(남은 그림이 있으면 부르는 쪽이 막는다) — 아직 알리지 않았으면 다 그렸다고 적어,
  //   나중에 이 버전을 다시 불러와도 "만들었어요"를 또 알리지 않는다. 그만두고 떠나면 그만둔 때를 적는다.
  const record = parseRegenRecord(current.regen)
  const open = !!record && !record.doneAt && !record.cancelledAt
  const regen = open ? (opts.cancelRegen ? { ...record, cancelledAt: at } : { ...record, doneAt: at }) : current.regen
  const updatedAt = nextStamp(current.updated_at)
  const { data, error } = await supabaseAdmin
    .from('artist_versions')
    .update({
      is_current: false,
      snapshot: frozen,
      active: closeActiveRange(parseActive(current.active), at),
      regen: regen as never,
      // 그 버전의 스타일도 작품에 지금 걸린 것으로 남긴다 — 직접 올린 그림체는 버전을 만든 뒤에 분석 결과가 붙는다(2026-10-28 검토 지적).
      style_anchor_key: project.style_anchor_key || null,
      custom_style_anchor: (project.custom_style_anchor ?? null) as never,
      updated_at: updatedAt,
    })
    .eq('id', current.id)
    .eq('is_current', true)
    .eq('updated_at', current.updated_at)
    .select('id')
  if (error || rowsOf(data).length !== 1) {
    await removeFiles(created, 'unused version copies')
    if (error) throw new Error(`current version update failed: ${error.message}`)
    return { ok: false }
  }
  await pruneVersionCopies(project.id, folder, previous, frozen)
  return { ok: true, frozen, updatedAt }
}

/** 떠난 버전을 되돌린다(뒤 단계가 실패했을 때) — 최선. 그림 기록은 떠날 때 남긴 것으로 둔다(그때 옛 복사본을 거뒀다). */
export async function returnToVersion(current: VersionRow, left: LeftVersion): Promise<void> {
  const { error } = await supabaseAdmin
    .from('artist_versions')
    .update({ is_current: true, snapshot: left.frozen as never, active: current.active as never, regen: current.regen as never, updated_at: nextStamp(left.updatedAt) })
    .eq('id', current.id)
  if (error) console.error('[artist-versions] could not return to the version:', current.n, error.message)
}

// ── 기록 바로잡기 ─────────────────────────────────────────────────

/** 불러오는 중 표시(버전 행 snapshot.restoring) — 그림을 다 되돌리면 지운다. 끝 시각(until)이 지나도 남았으면 불러오기가 멈춘 것이다. */
export interface RestoringMark { at: string; until: string }

export function restoringMarkOf(snapshot: unknown): RestoringMark | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const mark = (snapshot as { restoring?: unknown }).restoring
  if (!mark || typeof mark !== 'object') return null
  const { at, until } = mark as { at?: unknown; until?: unknown }
  return typeof at === 'string' && typeof until === 'string' ? { at, until } : null
}

/** 버전 행 snapshot 에 불러오는 중 표시를 달거나(mark) 뗀다(null). */
export function withRestoringMark(snapshot: unknown, mark: RestoringMark | null): Record<string, unknown> {
  const base = snapshot && typeof snapshot === 'object' ? { ...(snapshot as Record<string, unknown>) } : {}
  delete base.restoring
  return mark ? { ...base, restoring: mark } : base
}

export const restoringMarkFrom = (at: string): RestoringMark => ({ at, until: new Date(Date.parse(at) + RESTORE_LEASE_MS).toISOString() })

/** 다 되돌렸으면 불러오는 중 표시를 뗀다 — 그 사이 다른 창구가 행을 바꿨으면 그쪽에 맡긴다(최선). */
export async function clearRestoringMark(id: string, snapshot: unknown, updatedAt: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('artist_versions')
    .update({ snapshot: withRestoringMark(snapshot, null) as never, updated_at: nextStamp(updatedAt) })
    .eq('id', id)
    .eq('updated_at', updatedAt)
  if (error) console.warn('[artist-versions] restoring mark left:', error.message)
}

/** 지금 버전이 없으면(되돌리기마저 실패) 마지막에 떠난 버전을 지금으로 되살린다 — 지금이었던 때를 다시 연다. 되살렸으면 true. */
async function healCurrentVersion(rows: readonly VersionRow[]): Promise<boolean> {
  const lastChange = Math.max(...rows.map((row) => Date.parse(row.updated_at)).filter(Number.isFinite))
  if (Number.isFinite(lastChange) && Date.now() - lastChange < HEAL_GRACE_MS) return false
  const closedAt = (row: VersionRow) => {
    const last = parseActive(row.active).at(-1)
    return last?.to ? Date.parse(last.to) : Number.NEGATIVE_INFINITY
  }
  const pick = [...rows].sort((a, b) => closedAt(b) - closedAt(a) || b.n - a.n)[0]
  const active = parseActive(pick.active)
  const last = active.at(-1)
  const reopened = last?.to ? [...active.slice(0, -1), { from: last.from, to: null }] : openActiveRange(active, new Date().toISOString())
  const { data, error } = await supabaseAdmin
    .from('artist_versions')
    .update({ is_current: true, active: reopened, updated_at: nextStamp(pick.updated_at) })
    .eq('id', pick.id)
    .eq('is_current', false)
    .eq('updated_at', pick.updated_at)
    .select('id')
  if (error && error.code !== '23505') throw new Error(`version heal failed: ${error.message}`)
  return !!error || rowsOf(data).length === 1
}

/** 불러오다 멈춘 버전을 마저 불러온다 — 표시의 끝 시각을 늘려 맡은 뒤(바뀐 시각 비교) 스타일 · 그림을 그 버전 것으로. 맡았으면 true. */
async function finishRestore(project: VersionProject, row: VersionRow, mark: RestoringMark): Promise<boolean> {
  const claimedAt = nextStamp(row.updated_at)
  const claimed = withRestoringMark(row.snapshot, { at: mark.at, until: new Date(Date.now() + RESTORE_LEASE_MS).toISOString() })
  const { data, error } = await supabaseAdmin
    .from('artist_versions')
    .update({ snapshot: claimed as never, updated_at: claimedAt })
    .eq('id', row.id)
    .eq('is_current', true)
    .eq('updated_at', row.updated_at)
    .select('id')
  if (error) throw new Error(`restore claim failed: ${error.message}`)
  if (rowsOf(data).length !== 1) return false
  try {
    const snapshot = parseVersionSnapshot(row.snapshot)
    const designTokens = snapshot?.look?.l1 ? withDesignL1(project.design_tokens, snapshot.look.l1) : undefined
    await setProjectStyle(project.id, row.style_anchor_key, row.custom_style_anchor, designTokens)
    if (snapshot) await restoreSnapshot(project.id, snapshot, await readLiveImages(project.id), mark.at)
  } catch (e) {
    // 다음 요청이 곧바로 다시 맡을 수 있게 끝 시각을 되돌려 둔다.
    await supabaseAdmin.from('artist_versions').update({ snapshot: withRestoringMark(row.snapshot, mark) as never, updated_at: nextStamp(claimedAt) }).eq('id', row.id).eq('updated_at', claimedAt)
    throw e
  }
  await clearRestoringMark(row.id, claimed, claimedAt)
  return true
}

/**
 * 버전 기록을 바로잡는다(기록 읽기 · 불러오기 · 재생성이 먼저 부른다).
 *   지금 버전이 없으면 마지막에 떠난 버전을 되살리고, 불러오다 멈춘 지금 버전(끝 시각이 지난 표시)은 마저 불러온다.
 *   finishedN = 방금 마저 불러온 버전. restoringN = 아직 불러오는 중인 버전(멈췄는지 모를 때) — 그동안 다른 바꾸기는 받지 않는다.
 *   바로잡다 실패하면 읽은 그대로 돌려준다(다음 요청이 다시 한다).
 */
export async function settleVersions(project: VersionProject, rows: VersionRow[]): Promise<{ rows: VersionRow[]; changed: boolean; finishedN: number | null; restoringN: number | null }> {
  let current = rows.find((row) => row.is_current) ?? null
  let changed = false
  try {
    if (!current && rows.length > 0 && (await healCurrentVersion(rows))) {
      rows = await readVersionRows(project.id)
      current = rows.find((row) => row.is_current) ?? null
      changed = true
    }
    const mark = current ? restoringMarkOf(current.snapshot) : null
    if (!current || !mark) return { rows, changed, finishedN: null, restoringN: null }
    if (Date.now() <= Date.parse(mark.until)) return { rows, changed, finishedN: null, restoringN: current.n }
    const finished = await finishRestore(project, current, mark)
    return { rows: await readVersionRows(project.id), changed: true, finishedN: finished ? current.n : null, restoringN: finished ? null : current.n }
  } catch (e) {
    console.warn('[artist-versions] settle skipped:', e instanceof Error ? e.message : e)
    return { rows, changed, finishedN: null, restoringN: current && restoringMarkOf(current.snapshot) ? current.n : null }
  }
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
