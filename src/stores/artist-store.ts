import { create } from 'zustand'
import type { Scene, SceneManifest, Location as ManifestLocation, CharacterAsset, WorldAsset } from '@/types'
import { type CharacterViewKey } from '@/types/asset'
import { CHARACTER_DIRECTIONAL_VIEWS } from '@/lib/artist/turnaround'
import { candidateViewToViewKey, computeLookFingerprint, computeWorldImageSourceHash, type CandidateImage, type LookTokens } from '@/lib/image-provenance'
import { buildWorldPrompt } from '@/lib/prompts'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { createClient } from '@/lib/supabase/client'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import { notifyGenerationComplete } from '@/lib/generation-notify'
import { registerCharacterCard } from '@/stores/asset-storage-store'

export type ImageProvider = 'fal' | 'gemini' | 'tailscale'

export type CharacterRole = 'protagonist' | 'antagonist' | 'supporting'

/** 새 캐릭터 생성 입력 (+버튼 Dialog / 채팅 createCharacter 공용) */
export interface NewCharacterInput {
  name: string
  role?: CharacterRole
  entityType?: 'person' | 'object'
  /** 설정/배경 메모 — 카드 hover + asset-storage description 으로 전파 */
  description?: string
  /** 외형 prose — 이미지 생성 프롬프트(fixedPrompt/appearance)로 사용 */
  appearance?: string
}

export type ArtistUpdate =
  | {
      type: 'regenerateCharacter'
      characterId: string
      views?: CharacterViewKey[]
      /** 재생성 시 유저 요청 델타(merge, AC13) — generate-sheet instruction 으로 전달. */
      instruction?: string
    }
  | { type: 'regenerateWorldAsset'; locationId: string }
  | ({ type: 'createCharacter' } & NewCharacterInput)

/** 생성 트리거 주체. `auto`는 Artist 자동 first-fill 내부 표식이며 서버 job actor 로는 ui 처리된다. */
export type GenerationActor = 'ui' | 'chat' | 'auto'

// fal 계정 concurrent limit을 여러 유저가 공유하므로, dispatcher 전 단계에서는 화면별 submit 풀을
// 보수적으로 유지한다. 계정 전역 공정성은 generation_jobs dispatcher 도입 시 중앙화한다.
const ARTIST_GENERATION_CONCURRENCY = 2

// World 샷 (wide/establishing) — 캐릭터 뷰와 대칭 구조
export type WorldShotKey = 'wideShot' | 'establishingShot'

const WORLD_SHOT_SUFFIX: Record<WorldShotKey, string> = {
  wideShot: 'wide shot, panoramic',
  establishingShot: 'establishing shot, aerial view',
}
const WORLD_SHOT_COLUMN: Record<WorldShotKey, string> = {
  wideShot: 'wide_shot',
  establishingShot: 'establishing_shot',
}
export const WORLD_SHOT_LABELS: Record<WorldShotKey, string> = {
  wideShot: 'Wide Shot',
  establishingShot: 'Establishing',
}

function worldShotPrompt(
  visualDescription: string,
  timeOfDay: string,
  mood: string,
  boost: string | null,
  shot: WorldShotKey,
): string {
  return `${buildWorldPrompt(visualDescription, timeOfDay, mood, boost)}, ${WORLD_SHOT_SUFFIX[shot]}`
}

function joinPromptParts(parts: Array<string | null | undefined>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(', ')
}

export function buildWorldShotPromptForLocation(
  location: ManifestLocation,
  scene: Scene | null | undefined,
  boost: string | null,
  shot: WorldShotKey,
): string {
  // writer(v2 worldVisual)가 visual_description==style_description, lighting_direction==lighting_sources
  //   처럼 같은 내용을 두 칸에 채우는 경우가 있어 동일 내용은 한 번만 넣는다(프롬프트 중복·토큰 낭비 방지).
  const visualDesc = location.visualDescription?.trim() ?? ''
  const styleDesc = location.styleDescription?.trim() ?? ''
  const lightDir = location.lightingDirection?.trim() ?? ''
  const lightSrc = location.lightingSources?.length
    ? location.lightingSources.join(', ').trim()
    : ''

  const visual = joinPromptParts([
    visualDesc,
    styleDesc && styleDesc !== visualDesc ? styleDesc : '',
    lightDir ? `lighting direction: ${lightDir}` : '',
    lightSrc && lightSrc !== lightDir ? `lighting sources: ${lightSrc}` : '',
    location.props?.length ? `key props: ${location.props.join(', ')}` : '',
    location.purpose ? `story purpose: ${location.purpose}` : '',
    location.name,
  ])

  const timeOfDay = location.timeOfDay || scene?.timeOfDay || ''
  const mood = joinPromptParts([
    scene?.mood,
    scene?.narrativeSummary ? `scene context: ${scene.narrativeSummary}` : '',
    !scene && location.purpose ? `producer background purpose: ${location.purpose}` : '',
  ])

  return worldShotPrompt(visual, timeOfDay, mood, boost, shot)
}

export function shouldMarkWorldGenerationUserEdited(actor: GenerationActor): boolean {
  return actor !== 'auto'
}

async function markLocationUserEdited(projectId: string, locationId: string): Promise<void> {
  const { error } = await createClient()
    .from('locations')
    .update({ user_edited: true })
    .eq('project_id', projectId)
    .eq('location_id', locationId)

  if (error) throw new Error(`location user_edited update failed: ${error.message}`)
}

async function generateImage(
  prompt: string,
  aspectRatio: '1:1' | '16:9' = '1:1',
  provider: ImageProvider = 'fal',
): Promise<string> {
  const res = await fetch('/api/generate/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspectRatio, provider }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

async function persistImage(
  projectId: string,
  type: 'character' | 'location',
  entityId: string,
  field: string,
  blobUrl: string,
): Promise<string | null> {
  try {
    const r = await fetch(blobUrl)
    const blob = await r.blob()
    const form = new FormData()
    form.append('projectId', projectId)
    form.append('type', type)
    form.append('entityId', entityId)
    form.append('field', field)
    form.append('file', blob, `${entityId}_${field}.png`)
    const res = await fetch('/api/assets/upload-image', { method: 'POST', body: form })
    if (!res.ok) {
      console.error(`[artist-store] persistImage HTTP ${res.status} for ${entityId}/${field}`)
      return null
    }
    const { publicUrl } = await res.json()
    return publicUrl ?? null
  } catch (err) {
    console.error(`[artist-store] persistImage failed for ${entityId}/${field}:`, err)
    return null
  }
}

/**
 * 월드 샷 1장 생성 + 영속화 → 최종 URL.
 *   fal + projectId → webhook job 경로 (서버사이드 storage+DB, 탭 닫혀도 보존).
 *   그 외(gemini/tailscale 또는 projectId 없음) → 기존 동기 blob + 클라 persist.
 */
async function generateAndPersistWorldShot(
  projectId: string | null,
  locationId: string,
  column: 'wide_shot' | 'establishing_shot',
  prompt: string,
  provider: ImageProvider,
  actor: GenerationActor = 'ui',
): Promise<string | null> {
  if (provider === 'fal' && projectId) {
    const res = await fetch('/api/artist/generate-world', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, locationId, column, prompt, aspectRatio: '16:9', actor, sourceHash: computeWorldImageSourceHash(prompt) }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
    const body = (await res.json()) as { jobId?: string; skipped?: boolean }
    // 서버 give-up 게이트(반복 실패 슬롯의 자율 재생성 차단) → jobId 없음. 에러 아님: null 로 조용히 종료.
    if (body.skipped || !body.jobId) return null
    return await pollGenerationJob(body.jobId)
  }
  // 비-fal provider 또는 projectId 없음 → 동기 경로
  const blobUrl = await generateImage(prompt, '16:9', provider)
  if (projectId) {
    const persisted = await persistImage(projectId, 'location', locationId, column, blobUrl)
    return persisted ?? blobUrl
  }
  return blobUrl
}

// autogen 상세 로그 토글. 기본 off — 실패(✗)·시작/요약만 콘솔에 남기고, 단계별 진행 로그는 숨긴다.
//   디버깅 필요 시 true 로.
const AUTOGEN_DEBUG = false
const alog = (...args: unknown[]) => {
  if (AUTOGEN_DEBUG) console.log(...args)
}

// 단계별 소요시간 측정 (timing pipeline) — AUTOGEN_DEBUG 와 무관하게 항상 출력.
//   서버(writer)의 `[writer timing]` 과 짝을 이뤄 생성 전 구간을 단계별로 추적한다.
const atime = (step: string, ms: number, extra?: Record<string, unknown>) =>
  console.log(`[artist timing] ${step} ${(ms / 1000).toFixed(1)}s`, extra ?? '')

/**
 * 서버 핸드오프(assetImages step)가 미리 submit 한 로케이션 wide_shot 이 webhook 으로 DB 에 채워지길
 * 잠깐 기다린다 (중복 client 생성 방지). 채워지면 URL 반환, timeout 이면 null → 호출자가 client fallback.
 *   진입 시점엔 보통 이미 채워져 있어(server 와 캐릭터 main 이 같은 step8 에서 병렬 submit) 첫 조회에 바로 반환.
 */
async function waitForWorldWideShot(
  projectId: string,
  locationId: string,
  { timeoutMs = 30_000, intervalMs = 3_000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string | null> {
  const supabase = createClient()
  const started = Date.now()
  for (;;) {
    const { data } = await supabase
      .from('locations')
      .select('wide_shot')
      .eq('project_id', projectId)
      .eq('location_id', locationId)
      .maybeSingle()
    if (data?.wide_shot) return data.wide_shot as string
    if (Date.now() - started > timeoutMs) return null
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

/** 새 캐릭터의 character_id 생성 — 이름 슬러그 + 짧은 난수 (프로젝트 내 충돌 회피) */
function makeCharacterId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
  const rand = Math.random().toString(36).slice(2, 7)
  return `char_${slug || 'new'}_${rand}`
}

// generatingStartedAt 맵 헬퍼 — 생성 시작 시각을 store 에 들고 있어 GeneratingOverlay 가 mount 가
//   아니라 이 시각 기준으로 경과를 센다(탭 전환=remount 에도 타이머 안 리셋). 시작시각은 호출자가 넘긴다.
function withStartedAt(
  map: Record<string, number>,
  key: string,
  now: number,
): Record<string, number> {
  return map[key] != null ? map : { ...map, [key]: now } // 이미 있으면 유지(최초 시작 시각)
}
function withoutStartedAt(
  map: Record<string, number>,
  key: string,
): Record<string, number> {
  if (map[key] == null) return map
  const next = { ...map }
  delete next[key]
  return next
}

/** 작업 배열을 동시 N개 제한으로 실행 (캐릭터/월드 병렬 생성용). */
async function runPool(
  tasks: Array<() => Promise<void>>,
  concurrency: number,
): Promise<void> {
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    async () => {
      while (cursor < tasks.length) {
        const task = tasks[cursor++]
        await task()
      }
    },
  )
  await Promise.all(workers)
}

interface ArtistState {
  sceneManifest: SceneManifest | null
  characterAssets: CharacterAsset[]
  worldAssets: WorldAsset[]
  selectedCharacterId: string | null
  selectedLocationId: string | null
  /** 생성 중인 캐릭터 뷰 키들 — `${characterId}:${view}` (병렬 생성 추적) */
  generatingViews: string[]
  /** 생성 중인 로케이션 id 들 (병렬 생성 추적) */
  generatingLocations: string[]
  /** 생성 시작 시각 (key=`${characterId}:${view}` 또는 locationId → epoch ms).
   *  GeneratingOverlay 가 이 시각 기준으로 경과를 세 탭 전환(remount)에도 타이머가 안 리셋된다. */
  generatingStartedAt: Record<string, number>
  selectedBoostPreset: string | null
  imageProvider: ImageProvider
  error: string | null
  /** 진입 게이트 영속 — 한 번 ready(진입 허용)에 도달한 projectId 는 탭 전환(route remount)에도
   *  다시 progress 게이트에 걸리지 않는다. page-local useState/타이머가 remount 로 리셋돼
   *  생성 도중 탭 전환 시 프로그레스 바가 재등장하던 버그 방지. reset()(프로젝트 전환)에만 비워진다. */
  enteredProjects: Record<string, boolean>

  loadData: () => void
  /** 새 캐릭터 카드를 추가 (낙관적 로컬 + projectId 있으면 DB persist). 새 characterId 반환. */
  addCharacter: (input: NewCharacterInput) => Promise<string>
  selectCharacter: (id: string) => void
  selectLocation: (id: string) => void
  /** 단일 뷰 생성 (main=T2I, 방향=main 기반 i2i). 서버가 view 컬럼만 갱신. */
  generateCharacterView: (
    characterId: string,
    view: CharacterViewKey,
    actor?: GenerationActor,
    instruction?: string,
  ) => Promise<void>
  /** main → 4방향(i2i)을 순서대로 생성. 카드 "Generate All Views"용. */
  generateCharacterAllViews: (
    characterId: string,
    actor?: GenerationActor,
    instruction?: string,
  ) => Promise<void>
  generateWorldAsset: (
    locationId: string,
    actor?: GenerationActor,
  ) => Promise<void>
  generateWorldShot: (
    locationId: string,
    shot: WorldShotKey,
    promptOverride?: string,
    actor?: GenerationActor,
  ) => Promise<void>
  autoGenerateBaseImages: () => Promise<void>
  applyUpdates: (updates: ArtistUpdate[]) => Promise<void>
  selectBoostPreset: (preset: string) => void
  setImageProvider: (provider: ImageProvider) => void
  /** 진입 허용된 projectId 기록 (멱등). 페이지가 ready 도달 시 1회 호출. */
  markEntered: (projectId: string) => void
  /** 후보 이미지를 선택본으로 교체. 서버에 persist 후 로컬 상태 즉시 반영. */
  selectCandidate: (characterId: string, viewKey: CharacterViewKey, candidateId: string) => Promise<void>
  /** world 후보 선택본 교체(C4 AC18, 캐릭터 selectCandidate 대칭). 서버 persist 후 로컬 즉시 반영. */
  selectWorldCandidate: (
    locationId: string,
    viewKey: 'wideShot' | 'establishingShot',
    candidateId: string,
  ) => Promise<void>
  /** 승인된 원천 외형 변경을 로컬 반영(C3 F6) — fixedPrompt 갱신 → 기존 파생 이미지가 stale 로 표시(자동 재생성 없음). */
  applyAppearancePatch: (characterId: string, appearance: string) => void
  reset: () => void
}

export const useArtistStore = create<ArtistState>((set, get) => ({
  sceneManifest: null,
  characterAssets: [],
  worldAssets: [],
  selectedCharacterId: null,
  selectedLocationId: null,
  generatingViews: [],
  generatingLocations: [],
  generatingStartedAt: {},
  selectedBoostPreset: null,
  imageProvider: 'fal' as ImageProvider,
  error: null,
  enteredProjects: {},

  loadData: async () => {
    const projectId = useProjectStore.getState().projectId

    // Try loading from DB first
    if (projectId) {
      try {
        const supabase = createClient()
        const [
          { data: scenes },
          { data: dbChars },
          { data: dbLocs },
          { data: dbCandidates },
          { data: project },
          { data: dbLocCandidates },
          { data: dbMainJobs },
        ] = await Promise.all([
          supabase
            .from('scenes')
            .select('*')
            .eq('project_id', projectId)
            .order('sort_order'),
          supabase
            .from('characters')
            .select('*')
            .eq('project_id', projectId),
          supabase
            .from('locations')
            .select('*')
            .eq('project_id', projectId),
          supabase
            .from('character_image_candidates')
            .select('id, character_id, view, url, source_hash, appearance_hash, is_selected, generated_at')
            .eq('project_id', projectId),
          supabase
            .from('projects')
            .select('design_tokens')
            .eq('id', projectId)
            .maybeSingle(),
          supabase
            .from('location_image_candidates')
            .select('id, location_id, view, url, source_hash, is_selected, generated_at')
            .eq('project_id', projectId),
          supabase
            .from('generation_jobs')
            .select('id, target')
            .eq('project_id', projectId)
            .eq('kind', 'character_view')
            .eq('status', 'queued'),
        ])

        // 후보 히스토리: character_id + viewKey 로 그룹핑, generated_at desc 정렬
        const candidatesByCharView: Record<string, Record<string, CandidateImage[]>> = {}
        for (const row of dbCandidates ?? []) {
          const viewKey = candidateViewToViewKey(row.view)
          const charMap = candidatesByCharView[row.character_id] ?? {}
          const list = charMap[viewKey] ?? []
          list.push({
            id: row.id,
            url: row.url,
            sourceHash: row.source_hash ?? null,
            appearanceHash: row.appearance_hash ?? null,
            isSelected: row.is_selected ?? false,
            generatedAt: row.generated_at,
          })
          charMap[viewKey] = list
          candidatesByCharView[row.character_id] = charMap
        }
        // generated_at desc 정렬
        for (const charMap of Object.values(candidatesByCharView)) {
          for (const key of Object.keys(charMap)) {
            charMap[key].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
          }
        }
        // world 후보 히스토리(C4 AC18): location_id + viewKey 그룹핑(024 테이블, 미적용이면 빈 맵).
        const LOC_VIEW_KEY: Record<string, 'wideShot' | 'establishingShot'> = {
          wide_shot: 'wideShot',
          establishing_shot: 'establishingShot',
        }
        const candidatesByLocView: Record<
          string,
          Partial<Record<'wideShot' | 'establishingShot', CandidateImage[]>>
        > = {}
        for (const row of dbLocCandidates ?? []) {
          const viewKey = LOC_VIEW_KEY[row.view as string]
          if (!viewKey) continue
          const locMap = candidatesByLocView[row.location_id] ?? {}
          const list = locMap[viewKey] ?? []
          list.push({
            id: row.id,
            url: row.url,
            sourceHash: row.source_hash ?? null,
            isSelected: row.is_selected ?? false,
            generatedAt: row.generated_at,
          })
          locMap[viewKey] = list
          candidatesByLocView[row.location_id] = locMap
        }
        for (const locMap of Object.values(candidatesByLocView)) {
          for (const k of Object.keys(locMap) as Array<'wideShot' | 'establishingShot'>) {
            locMap[k]?.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
          }
        }

        const dbScenes = (scenes ?? []).map((s) => ({
          sceneId: s.scene_id,
          narrativeSummary: s.narrative_summary ?? '',
          originalTextQuote: s.original_text_quote ?? '',
          location: s.location ?? '',
          timeOfDay: s.time_of_day ?? '',
          mood: s.mood ?? '',
          charactersPresent: s.characters_present ?? [],
          estimatedDurationSeconds: s.estimated_duration_seconds ?? 30,
        }))
        const dbLocations = (dbLocs ?? []).map((l) => ({
          locationId: l.location_id,
          name: l.name ?? l.location_id,
          visualDescription: l.visual_description ?? l.style_description ?? '',
          visualDescriptionNative: l.visual_description_native ?? l.visual_description ?? l.style_description ?? '',
          timeOfDay: l.time_of_day ?? '',
          lightingDirection: l.lighting_direction ?? '',
          purpose: l.purpose ?? '',
          origin: l.origin === 'producer' ? ('producer' as const) : ('writer' as const),
          userEdited: l.user_edited === true,
          styleDescription: l.style_description ?? '',
          lightingSources: Array.isArray(l.lighting_sources) ? l.lighting_sources : [],
          props: Array.isArray(l.props) ? l.props : [],
        }))
        const sceneByLocation = new Map(dbScenes.map((scene) => [scene.location, scene]))
        // C2: 룩(전역 디자인 토큰 + 캐릭터 의상) 지문 — stale 비교 입력. 룩 미반영이면 null.
        const designTokens = (project?.design_tokens ?? null) as LookTokens | null

        if ((dbChars?.length ?? 0) || dbLocations.length) {
          const manifest: SceneManifest = {
            scenes: dbScenes,
            characters: (dbChars ?? []).map((c) => ({
              characterId: c.character_id,
              name: c.name,
              role: c.role as 'protagonist' | 'antagonist' | 'supporting',
              description: c.description ?? '',
              fixedPrompt: c.appearance ?? '',
              referenceImages: [],
            })),
            locations: dbLocations,
          }
          const characterAssets: CharacterAsset[] = (dbChars ?? []).map((c) => ({
            characterId: c.character_id,
            name: c.name,
            views: {
              main: c.view_main ?? null,
              back: c.view_back ?? null,
              sideLeft: c.view_side_left ?? null,
              sideRight: c.view_side_right ?? null,
            },
            entityType: c.entity_type === 'object' ? 'object' : 'person',
            description: c.description ?? '',
            fixedPrompt: c.appearance ?? '',
            // 생성·stale 은 fixedPrompt(영어 base), 표시는 appearance_native(유저 언어). 없으면 EN 폴백. (S2)
            appearanceNative: c.appearance_native ?? c.appearance ?? '',
            viewCandidates: candidatesByCharView[c.character_id] ?? {},
            lookFingerprint: computeLookFingerprint(designTokens, c.costume),
            origin: c.origin === 'writer' ? 'writer' : 'producer',
          }))
          const worldAssets: WorldAsset[] = dbLocations.map((location) => {
            const scene = sceneByLocation.get(location.locationId)
            return {
              locationId: location.locationId,
              name: location.name,
              sceneId: scene?.sceneId ?? '',
              wideShot: (dbLocs ?? []).find((l) => l.location_id === location.locationId)?.wide_shot ?? null,
              establishingShot: (dbLocs ?? []).find((l) => l.location_id === location.locationId)?.establishing_shot ?? null,
              visualDescription: location.visualDescription,
              visualDescriptionNative: location.visualDescriptionNative,
              timeOfDay: location.timeOfDay || scene?.timeOfDay || '',
              mood: scene?.mood ?? '',
              purpose: location.purpose,
              origin: location.origin,
              userEdited: location.userEdited,
              styleDescription: location.styleDescription,
              lightingSources: location.lightingSources,
              props: location.props,
              viewCandidates: candidatesByLocView[location.locationId] ?? {},
            }
          })

          set({
            sceneManifest: manifest,
            characterAssets,
            worldAssets,
            selectedCharacterId: characterAssets[0]?.characterId ?? null,
            selectedLocationId: worldAssets[0]?.locationId ?? null,
          })

          // webhook 누락 백스톱(2026-06-28): 핸드오프 draft 의 main 잡은 webhook 으로만 완료되는데,
          //   로컬 터널이 빗나가면 영구 queued 로 남아 view_main 이 안 채워진다. autogen 은 main 을
          //   폴링하지 않으므로(서버 초안 단일 생산), 여기서 queued main 잡을 poll-reconcile 로 채운다.
          //   fire-and-forget — 로드 차단 없이 완료되는 대로 해당 캐릭터 main 을 갱신.
          const queuedMainByChar = new Map<string, string>()
          for (const j of dbMainJobs ?? []) {
            const t = (j.target ?? {}) as { characterId?: string; view?: string }
            if (t.view === 'main' && t.characterId) {
              queuedMainByChar.set(t.characterId, j.id as string)
            }
          }
          for (const c of characterAssets) {
            if (c.views.main != null) continue
            const jobId = queuedMainByChar.get(c.characterId)
            if (!jobId) continue
            const charId = c.characterId
            void pollGenerationJob(jobId)
              .then((url) => {
                set((state) => ({
                  characterAssets: state.characterAssets.map((ca) =>
                    ca.characterId === charId
                      ? { ...ca, views: { ...ca.views, main: url } }
                      : ca,
                  ),
                }))
              })
              .catch((e) =>
                console.warn(
                  `[artist] main draft reconcile failed ${charId}:`,
                  e instanceof Error ? e.message : e,
                ),
              )
          }
          return
        }
      } catch (err) {
        console.error('[artist-store] DB load failed, falling back:', err)
      }
    }

    // Fallback: load from writer store or mock data
    const writerManifest = useWriterStore.getState().sceneManifest
    if (writerManifest) {
      const characterAssets: CharacterAsset[] = writerManifest.characters.map(
        (c) => ({
          characterId: c.characterId,
          name: c.name,
          views: {
            main: null,
            back: null,
            sideLeft: null,
            sideRight: null,
          },
          entityType: 'person' as const,
          description: c.description ?? '',
          fixedPrompt: c.fixedPrompt ?? '',
          viewCandidates: {},
          origin: 'writer',
        }),
      )
      const worldAssets: WorldAsset[] = writerManifest.locations.map((loc) => {
        const scene = writerManifest.scenes.find(
          (s) => s.location === loc.locationId,
        )
        return {
          locationId: loc.locationId,
          name: loc.name,
          sceneId: scene?.sceneId ?? '',
          wideShot: null,
          establishingShot: null,
          visualDescription: loc.visualDescription ?? '',
        }
      })

      set({
        sceneManifest: writerManifest,
        characterAssets,
        worldAssets,
        selectedCharacterId: characterAssets[0]?.characterId ?? null,
        selectedLocationId: worldAssets[0]?.locationId ?? null,
      })
      return
    }

    // No data available — keep empty state (don't show fake mock data)
  },

  // 새 캐릭터 카드 추가. UI(+버튼)·채팅(createCharacter) 공용 단일 경로.
  //   1) 낙관적으로 store(characterAssets + sceneManifest.characters)에 즉시 반영 → 카드 "뿅" 등장
  //   2) projectId 있으면 /api/artist/character 로 DB 영속 (실패해도 로컬 카드는 유지, error 표기)
  // 이미지(views)는 비워둠 — 사용자가 "Generate All Views" 로 생성하거나 autoGenerate가 보강.
  addCharacter: async (input) => {
    const name = input.name.trim()
    if (!name) return ''
    const role: CharacterRole = input.role ?? 'supporting'
    const entityType: 'person' | 'object' = input.entityType === 'object' ? 'object' : 'person'
    const description = input.description?.trim() ?? ''
    const appearance = input.appearance?.trim() ?? ''
    const characterId = makeCharacterId(name)

    const asset: CharacterAsset = {
      characterId,
      name,
      views: { main: null, back: null, sideLeft: null, sideRight: null },
      entityType,
      description,
      fixedPrompt: appearance,
      viewCandidates: {},
      origin: 'producer',
    }

    set((state) => ({
      characterAssets: [...state.characterAssets, asset],
      sceneManifest: state.sceneManifest
        ? {
            ...state.sceneManifest,
            characters: [
              ...state.sceneManifest.characters,
              {
                characterId,
                name,
                role,
                description,
                fixedPrompt: appearance,
                referenceImages: [],
              },
            ],
          }
        : state.sceneManifest,
      selectedCharacterId: characterId,
      error: null,
    }))

    const projectId = useProjectStore.getState().projectId
    if (projectId) {
      try {
        const res = await fetch('/api/artist/character', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            characterId,
            name,
            role,
            entity_type: entityType,
            description,
            appearance,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
      } catch (err) {
        set({
          error:
            err instanceof Error
              ? `캐릭터 저장 실패 (카드는 유지됨): ${err.message}`
              : 'Character save failed',
        })
      }
    }

    return characterId
  },

  selectCharacter: (id) => set({ selectedCharacterId: id }),

  selectLocation: (id) => set({ selectedLocationId: id }),

  // 단일 뷰 생성 (crop 폐기, 2026-06-05). main=T2I, 방향=main 기반 i2i. 서버가 해당 뷰 컬럼만 갱신.
  generateCharacterView: async (characterId, view, actor = 'ui', instruction) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    const key = `${characterId}:${view}`
    if (get().generatingViews.includes(key)) return

    set((state) => ({
      generatingViews: [...state.generatingViews, key],
      generatingStartedAt: withStartedAt(state.generatingStartedAt, key, Date.now()),
      error: null,
    }))
    const t0 = Date.now()
    alog(`[autogen] char ${key} → submitting…`)
    try {
      const res = await fetch('/api/artist/generate-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, characterId, view, actor, instruction }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      // 비동기: 라우트는 jobId만 반환 — 완료까지 polling (webhook이 서버사이드로 storage+DB 갱신).
      const body = (await res.json()) as { jobId?: string; skipped?: boolean }
      // 서버 give-up 게이트(반복 실패 슬롯의 자율 재생성 차단) → jobId 없음. 에러 아님: 조용히 종료.
      if (body.skipped || !body.jobId) {
        alog(`[autogen] char ${key} — give-up 게이트로 자동 생성 skip`)
        return
      }
      const jobId = body.jobId
      alog(`[autogen] char ${key} job ${jobId} queued, polling…`)
      const url = await pollGenerationJob(jobId)
      alog(`[autogen] char ${key} ✓ done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
      atime(`char ${key}`, Date.now() - t0)
      set((state) => ({
        characterAssets: state.characterAssets.map((a) =>
          a.characterId === characterId
            ? { ...a, views: { ...a.views, [view]: url } }
            : a,
        ),
      }))
      const asset = get().characterAssets.find((a) => a.characterId === characterId)
      if (asset) registerCharacterCard(asset, projectId)
      notifyGenerationComplete('artist', '캐릭터 이미지') // 다른 stage에 있을 때만 알림(store가 판단)
    } catch (err) {
      console.warn(
        `[autogen] char ${key} ✗ failed in ${((Date.now() - t0) / 1000).toFixed(1)}s:`,
        err instanceof Error ? err.message : err,
      )
      set({
        error:
          err instanceof Error ? err.message : 'Character view generation failed',
      })
    } finally {
      set((state) => ({
        generatingViews: state.generatingViews.filter((k) => k !== key),
        generatingStartedAt: withoutStartedAt(state.generatingStartedAt, key),
      }))
    }
  },

  // main → 4방향 순서 생성. 방향 i2i 는 main 이 DB 에 있어야 하므로 main 을 먼저 await 한 뒤
  // 4방향을 제한된 풀로 병렬 생성. 카드 "Generate All Views" / 시트 재생성용.
  // object 캐릭터는 main 만 생성 — 방향뷰 불필요.
  generateCharacterAllViews: async (characterId, actor = 'ui', instruction) => {
    await get().generateCharacterView(characterId, 'main', actor, instruction)
    const char = get().characterAssets.find((c) => c.characterId === characterId)
    if (char?.entityType === 'object') return
    await runPool(
      CHARACTER_DIRECTIONAL_VIEWS.map(
        (v) => () => get().generateCharacterView(characterId, v, actor, instruction),
      ),
      ARTIST_GENERATION_CONCURRENCY,
    )
  },

  generateWorldAsset: async (locationId, actor = 'ui') => {
    const { sceneManifest, selectedBoostPreset, imageProvider } = get()
    const location = sceneManifest?.locations.find(
      (l) => l.locationId === locationId,
    )
    const scene = sceneManifest?.scenes.find((s) => s.location === locationId) ?? null
    if (!location) return
    if (get().generatingLocations.includes(locationId)) return

    set((state) => ({
      generatingLocations: [...state.generatingLocations, locationId],
      generatingStartedAt: withStartedAt(state.generatingStartedAt, locationId, Date.now()),
      error: null,
    }))

    try {
      const pid = useProjectStore.getState().projectId
      if (pid && shouldMarkWorldGenerationUserEdited(actor)) {
        await markLocationUserEdited(pid, locationId)
        set((state) => ({
          worldAssets: state.worldAssets.map((w) =>
            w.locationId === locationId ? { ...w, userEdited: true } : w,
          ),
          sceneManifest: state.sceneManifest
            ? {
                ...state.sceneManifest,
                locations: state.sceneManifest.locations.map((l) =>
                  l.locationId === locationId ? { ...l, userEdited: true } : l,
                ),
              }
            : state.sceneManifest,
        }))
      }

      // Generate sequentially to avoid timeout. fal이면 webhook job 경로, 아니면 동기.
      // suffix는 WORLD_SHOT_SUFFIX 단일 출처 사용 (generateWorldShot과 동일 문구).
      // 1) Wide shot (null = 서버 give-up skip — 성공 시에만 반영)
      const wideShot = await generateAndPersistWorldShot(
        pid,
        locationId,
        'wide_shot',
        buildWorldShotPromptForLocation(location, scene, selectedBoostPreset, 'wideShot'),
        imageProvider,
        actor,
      )
      if (wideShot) {
        set((state) => ({
          worldAssets: state.worldAssets.map((w) =>
            w.locationId === locationId ? { ...w, wideShot } : w,
          ),
        }))
      }

      // 2) Establishing shot
      const establishingShot = await generateAndPersistWorldShot(
        pid,
        locationId,
        'establishing_shot',
        buildWorldShotPromptForLocation(location, scene, selectedBoostPreset, 'establishingShot'),
        imageProvider,
        actor,
      )
      if (establishingShot) {
        set((state) => ({
          worldAssets: state.worldAssets.map((w) =>
            w.locationId === locationId ? { ...w, establishingShot } : w,
          ),
        }))
      }
      notifyGenerationComplete('artist', '배경 이미지') // 다른 stage에 있을 때만 알림(store가 판단)
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'World generation failed',
      })
    } finally {
      set((state) => ({
        generatingLocations: state.generatingLocations.filter(
          (id) => id !== locationId,
        ),
        generatingStartedAt: withoutStartedAt(state.generatingStartedAt, locationId),
      }))
    }
  },

  generateWorldShot: async (locationId, shot, promptOverride, actor = 'ui') => {
    const { sceneManifest, selectedBoostPreset, imageProvider } = get()
    const location = sceneManifest?.locations.find(
      (l) => l.locationId === locationId,
    )
    const scene = sceneManifest?.scenes.find((s) => s.location === locationId) ?? null
    if (!location) {
      console.warn(`[autogen] world ${locationId}:${shot} SKIPPED — no matching location in sceneManifest`)
      return
    }

    // location 단위 가드를 두지 않음 — 같은 로케이션의 wide/establishing 을 병렬 생성할 수 있어야 함.
    set((state) => ({
      generatingLocations: [...state.generatingLocations, locationId],
      generatingStartedAt: withStartedAt(state.generatingStartedAt, locationId, Date.now()),
      error: null,
    }))

    const t0 = Date.now()
    alog(`[autogen] world ${locationId}:${shot} → submitting…`)
    try {
      // 사용자 편집 프롬프트 우선, 없으면 Producer-only 또는 Writer scene context 를 포함한 기본 프롬프트.
      const prompt =
        promptOverride ??
        buildWorldShotPromptForLocation(location, scene, selectedBoostPreset, shot)
      const pid = useProjectStore.getState().projectId
      if (pid && shouldMarkWorldGenerationUserEdited(actor)) {
        await markLocationUserEdited(pid, locationId)
        set((state) => ({
          worldAssets: state.worldAssets.map((w) =>
            w.locationId === locationId ? { ...w, userEdited: true } : w,
          ),
          sceneManifest: state.sceneManifest
            ? {
                ...state.sceneManifest,
                locations: state.sceneManifest.locations.map((l) =>
                  l.locationId === locationId ? { ...l, userEdited: true } : l,
                ),
              }
            : state.sceneManifest,
        }))
      }
      const url = await generateAndPersistWorldShot(
        pid,
        locationId,
        WORLD_SHOT_COLUMN[shot] as 'wide_shot' | 'establishing_shot',
        prompt,
        imageProvider,
        actor,
      )
      if (!url) {
        // 서버 give-up 게이트로 자동 생성 skip — 에러 아님(finally 가 generatingLocations 정리).
        alog(`[autogen] world ${locationId}:${shot} — give-up 게이트로 자동 생성 skip`)
        return
      }
      alog(`[autogen] world ${locationId}:${shot} ✓ done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
      atime(`world ${locationId}:${shot}`, Date.now() - t0)
      set((state) => ({
        worldAssets: state.worldAssets.map((w) =>
          w.locationId === locationId ? { ...w, [shot]: url } : w,
        ),
      }))
      notifyGenerationComplete('artist', '배경 이미지') // 다른 stage에 있을 때만 알림(store가 판단)
    } catch (err) {
      console.warn(
        `[autogen] world ${locationId}:${shot} ✗ failed in ${((Date.now() - t0) / 1000).toFixed(1)}s:`,
        err instanceof Error ? err.message : err,
      )
      set({
        error:
          err instanceof Error ? err.message : 'World generation failed',
      })
    } finally {
      // 같은 locationId 가 중복될 수 있으므로 한 건만 제거. startedAt 은 마지막 작업이 끝날 때만 정리.
      set((state) => {
        const idx = state.generatingLocations.indexOf(locationId)
        if (idx === -1) return {}
        const next = state.generatingLocations.slice()
        next.splice(idx, 1)
        const generatingStartedAt = next.includes(locationId)
          ? state.generatingStartedAt
          : withoutStartedAt(state.generatingStartedAt, locationId)
        return { generatingLocations: next, generatingStartedAt }
      })
    }
  },

  // Writer→Artist 진입 시 비어있는 이미지 자동생성 (crop 폐기 후 재설계, 2026-06-05 / main 우선 2단계 2026-06-07).
  //   대표 이미지(캐릭터 view_main, 로케이션 wide_shot)는 핸드오프 'assetImages' step 이 미리 채울 수 있으나,
  //   실패/미도착이면 여기서 보강한다.
  //   대표 main(view_main)은 핸드오프 서버 초안 트리거(draft-trigger.ts)가 단일 생산자다(C1) — 여기서
  //   client 가 main 을 다시 자동 제출하지 않는다(이중 생성/과금 방지; 서버 실패는 카드 배지로 표시).
  //   여기선 main 이 들어온 캐릭터의 빈 방향뷰(main reference i2i)와 월드 빈칸만 보강한다(자연 캐시 skip).
  autoGenerateBaseImages: async () => {
    const { characterAssets, worldAssets } = get()
    const projectId = useProjectStore.getState().projectId
    // 동시 in-flight 상한 (fal 한도가 아니라 클라 폴링/부하 상한 — fal 은 초과분을 큐 대기시킴).
    const CONCURRENCY = ARTIST_GENERATION_CONCURRENCY

    // 방향뷰(main reference i2i) + 월드 빈칸 보강. main 은 서버 초안이 채우므로 client 는 main 제출 안 함.
    const restTasks: Array<() => Promise<void>> = []
    const queuedRest: string[] = []
    const skipped: string[] = []
    for (const c of characterAssets) {
      // object 캐릭터는 방향뷰 불필요
      if (c.entityType === 'object') {
        skipped.push(`char ${c.characterId}:directional (object — skip)`)
        continue
      }
      // main 미도착(서버 초안 진행/실패)이면 방향뷰를 미룬다 — dir 은 main reference 가 필요(i2i).
      if (c.views.main == null) {
        skipped.push(`char ${c.characterId}:directional (main 대기 — server 초안)`)
        continue
      }
      for (const v of CHARACTER_DIRECTIONAL_VIEWS) {
        if (c.views[v] == null) {
          queuedRest.push(`char ${c.characterId}:${v}`)
          restTasks.push(() => get().generateCharacterView(c.characterId, v, 'auto'))
        } else {
          skipped.push(`char ${c.characterId}:${v}`)
        }
      }
    }
    for (const w of worldAssets) {
      if (w.wideShot == null) {
        // (b) 중복 제거: 서버 assetImages step 이 이미 wide 를 submit 했으면 webhook 으로 채워진다 →
        //   잠깐 기다렸다 채워지면 client skip, timeout 이면 client fallback 생성.
        const locId = w.locationId
        queuedRest.push(`world ${locId}:wideShot (await server pre-gen → fallback)`)
        restTasks.push(async () => {
          if (!projectId) {
            await get().generateWorldShot(locId, 'wideShot', undefined, 'auto')
            return
          }
          set((s) => ({
            generatingLocations: [...s.generatingLocations, locId],
            generatingStartedAt: withStartedAt(s.generatingStartedAt, locId, Date.now()),
          }))
          const url = await waitForWorldWideShot(projectId, locId).catch(() => null)
          set((s) => {
            const idx = s.generatingLocations.indexOf(locId)
            if (idx === -1) return {}
            const next = s.generatingLocations.slice()
            next.splice(idx, 1)
            const generatingStartedAt = next.includes(locId)
              ? s.generatingStartedAt
              : withoutStartedAt(s.generatingStartedAt, locId)
            return { generatingLocations: next, generatingStartedAt }
          })
          if (url) {
            alog(`[autogen] world ${locId}:wideShot ✓ server pre-gen 채움 (client skip)`)
            set((s) => ({
              worldAssets: s.worldAssets.map((x) =>
                x.locationId === locId ? { ...x, wideShot: url } : x,
              ),
            }))
            return
          }
          alog(`[autogen] world ${locId}:wideShot — server pre-gen 미도착, client fallback`)
          await get().generateWorldShot(locId, 'wideShot', undefined, 'auto')
        })
      } else {
        skipped.push(`world ${w.locationId}:wideShot`)
      }
      if (w.establishingShot == null) {
        queuedRest.push(`world ${w.locationId}:establishingShot`)
        restTasks.push(() => get().generateWorldShot(w.locationId, 'establishingShot', undefined, 'auto'))
      } else {
        skipped.push(`world ${w.locationId}:establishingShot`)
      }
    }

    console.log(
      `[autogen] start — rest:${restTasks.length} @ concurrency ${CONCURRENCY} (main=서버 초안 단일 생산)`,
      { then: queuedRest, skipped },
    )
    const t0 = Date.now()
    await runPool(restTasks, CONCURRENCY)
    atime('autogen total', Date.now() - t0, { rest: restTasks.length })
  },

  applyUpdates: async (updates) => {
    for (const u of updates) {
      if (u.type === 'createCharacter') {
        await get().addCharacter({
          name: u.name,
          role: u.role,
          description: u.description,
          appearance: u.appearance,
        })
      } else if (u.type === 'regenerateCharacter') {
        // 채팅발 재생성 — generation_jobs.actor='chat' 귀속 (chat-aware-regeneration).
        if (u.views?.length) {
          await runPool(
            u.views.map((v) => () => get().generateCharacterView(u.characterId, v, 'chat', u.instruction)),
            ARTIST_GENERATION_CONCURRENCY,
          )
        } else {
          await get().generateCharacterAllViews(u.characterId, 'chat', u.instruction)
        }
      } else if (u.type === 'regenerateWorldAsset') {
        await get().generateWorldAsset(u.locationId, 'chat')
      }
    }
  },

  selectCandidate: async (characterId, viewKey, candidateId) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    const res = await fetch('/api/artist/select-candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, characterId, view: viewKey, candidateId }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      set({ error: body.error ?? `선택 교체 실패 HTTP ${res.status}` })
      return
    }
    const { url } = (await res.json()) as { url: string }
    set((state) => ({
      characterAssets: state.characterAssets.map((a) => {
        if (a.characterId !== characterId) return a
        const prevCandidates = a.viewCandidates[viewKey] ?? []
        const nextCandidates = prevCandidates.map((c) => ({
          ...c,
          isSelected: c.id === candidateId,
        }))
        return {
          ...a,
          views: { ...a.views, [viewKey]: url },
          viewCandidates: { ...a.viewCandidates, [viewKey]: nextCandidates },
        }
      }),
    }))
    const asset = get().characterAssets.find((a) => a.characterId === characterId)
    if (asset) registerCharacterCard(asset, projectId)
  },

  selectWorldCandidate: async (locationId, viewKey, candidateId) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    const res = await fetch('/api/artist/select-world-candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, locationId, view: viewKey, candidateId }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      set({ error: body.error ?? `선택 교체 실패 HTTP ${res.status}` })
      return
    }
    const { url } = (await res.json()) as { url: string }
    set((state) => ({
      worldAssets: state.worldAssets.map((w) => {
        if (w.locationId !== locationId) return w
        const prev = w.viewCandidates?.[viewKey] ?? []
        const next = prev.map((c) => ({ ...c, isSelected: c.id === candidateId }))
        return {
          ...w,
          [viewKey]: url,
          viewCandidates: { ...w.viewCandidates, [viewKey]: next },
        }
      }),
    }))
  },

  selectBoostPreset: (preset) =>
    set((state) => ({
      selectedBoostPreset: state.selectedBoostPreset === preset ? null : preset,
    })),

  setImageProvider: (provider) => set({ imageProvider: provider }),

  markEntered: (projectId) =>
    set((state) =>
      state.enteredProjects[projectId]
        ? state
        : { enteredProjects: { ...state.enteredProjects, [projectId]: true } },
    ),

  applyAppearancePatch: (characterId, appearance) =>
    set((state) => ({
      characterAssets: state.characterAssets.map((a) =>
        // appearance = 유저 언어 패치 → 카드 표시(appearanceNative) 즉시 갱신. fixedPrompt(EN)는 reload 시 동기화.
        a.characterId === characterId ? { ...a, fixedPrompt: appearance, appearanceNative: appearance } : a,
      ),
    })),

  reset: () =>
    set({
      sceneManifest: null,
      characterAssets: [],
      worldAssets: [],
      selectedCharacterId: null,
      selectedLocationId: null,
      generatingViews: [],
      generatingLocations: [],
      generatingStartedAt: {},
      selectedBoostPreset: null,
      imageProvider: 'fal' as ImageProvider,
      error: null,
      enteredProjects: {},
    }),
}))

/** World 샷의 기본 생성 프롬프트 (dialog 표시·편집 초기값용) */
export function worldShotDefaultPrompt(
  locationId: string,
  shot: WorldShotKey,
): string {
  const { sceneManifest, selectedBoostPreset } = useArtistStore.getState()
  const location = sceneManifest?.locations.find(
    (l) => l.locationId === locationId,
  )
  const scene = sceneManifest?.scenes.find((s) => s.location === locationId) ?? null
  if (!location) return ''
  return buildWorldShotPromptForLocation(
    location,
    scene,
    selectedBoostPreset,
    shot,
  )
}
