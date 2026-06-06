import { create } from 'zustand'
import type { SceneManifest, CharacterAsset, WorldAsset } from '@/types'
import { type CharacterViewKey } from '@/types/asset'
import { CHARACTER_DIRECTIONAL_VIEWS } from '@/lib/artist/turnaround'
import { buildWorldPrompt } from '@/lib/prompts'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { createClient } from '@/lib/supabase/client'
import { pollGenerationJob } from '@/lib/generation-jobs-client'

export type ImageProvider = 'fal' | 'gemini' | 'tailscale'

export type CharacterRole = 'protagonist' | 'antagonist' | 'supporting'

/** 새 캐릭터 생성 입력 (+버튼 Dialog / 채팅 createCharacter 공용) */
export interface NewCharacterInput {
  name: string
  role?: CharacterRole
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
    }
  | { type: 'regenerateWorldAsset'; locationId: string }
  | ({ type: 'createCharacter' } & NewCharacterInput)

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
): Promise<string> {
  if (provider === 'fal' && projectId) {
    const res = await fetch('/api/artist/generate-world', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, locationId, column, prompt, aspectRatio: '16:9' }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
    const { jobId } = (await res.json()) as { jobId: string }
    return await pollGenerationJob(jobId)
  }
  // 비-fal provider 또는 projectId 없음 → 동기 경로
  const blobUrl = await generateImage(prompt, '16:9', provider)
  if (projectId) {
    const persisted = await persistImage(projectId, 'location', locationId, column, blobUrl)
    return persisted ?? blobUrl
  }
  return blobUrl
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

/** 작업 배열을 동시 N개 제한으로 실행 (캐릭터/월드 병렬 생성용, decision: concurrency 4) */
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
  selectedBoostPreset: string | null
  imageProvider: ImageProvider
  error: string | null

  loadData: () => void
  /** 새 캐릭터 카드를 추가 (낙관적 로컬 + projectId 있으면 DB persist). 새 characterId 반환. */
  addCharacter: (input: NewCharacterInput) => Promise<string>
  selectCharacter: (id: string) => void
  selectLocation: (id: string) => void
  lockCharacter: (id: string) => void
  unlockCharacter: (id: string) => void
  /** 단일 뷰 생성 (main=T2I, 방향=main 기반 i2i). 서버가 view 컬럼만 갱신. */
  generateCharacterView: (
    characterId: string,
    view: CharacterViewKey,
  ) => Promise<void>
  /** main → 4방향(i2i)을 순서대로 생성 (방향은 concurrency 4 풀). 카드 "Generate All Views"용. */
  generateCharacterAllViews: (characterId: string) => Promise<void>
  generateWorldAsset: (locationId: string) => Promise<void>
  generateWorldShot: (
    locationId: string,
    shot: WorldShotKey,
    promptOverride?: string,
  ) => Promise<void>
  autoGenerateBaseImages: () => Promise<void>
  applyUpdates: (updates: ArtistUpdate[]) => Promise<void>
  selectBoostPreset: (preset: string) => void
  setImageProvider: (provider: ImageProvider) => void
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
  selectedBoostPreset: null,
  imageProvider: 'fal' as ImageProvider,
  error: null,

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
        ])

        if (dbChars?.length) {
          const manifest: SceneManifest = {
            scenes: (scenes ?? []).map((s) => ({
              sceneId: s.scene_id,
              narrativeSummary: s.narrative_summary ?? '',
              originalTextQuote: s.original_text_quote ?? '',
              location: s.location ?? '',
              timeOfDay: s.time_of_day ?? '',
              mood: s.mood ?? '',
              charactersPresent: s.characters_present ?? [],
              estimatedDurationSeconds: s.estimated_duration_seconds ?? 30,
            })),
            characters: dbChars.map((c) => ({
              characterId: c.character_id,
              name: c.name,
              role: c.role as 'protagonist' | 'antagonist' | 'supporting',
              description: c.description ?? '',
              fixedPrompt: c.appearance ?? '',
              referenceImages: [],
            })),
            locations: (dbLocs ?? []).map((l) => ({
              locationId: l.location_id,
              name: l.name,
              visualDescription: l.visual_description ?? '',
              timeOfDay: l.time_of_day ?? '',
              lightingDirection: l.lighting_direction ?? '',
            })),
          }
          const characterAssets: CharacterAsset[] = dbChars.map((c) => ({
            characterId: c.character_id,
            name: c.name,
            views: {
              main: c.view_main ?? null,
              back: c.view_back ?? null,
              sideLeft: c.view_side_left ?? null,
              sideRight: c.view_side_right ?? null,
            },
            locked: c.locked ?? false,
            description: c.description ?? '',
            fixedPrompt: c.appearance ?? '',
          }))
          const worldAssets: WorldAsset[] = (dbLocs ?? []).map((l) => ({
            locationId: l.location_id,
            name: l.name,
            sceneId: l.scene_id ?? '',
            wideShot: l.wide_shot ?? null,
            establishingShot: l.establishing_shot ?? null,
            visualDescription: l.visual_description ?? '',
          }))

          set({
            sceneManifest: manifest,
            characterAssets,
            worldAssets,
            selectedCharacterId: characterAssets[0]?.characterId ?? null,
            selectedLocationId: worldAssets[0]?.locationId ?? null,
          })
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
          locked: false,
          description: c.description ?? '',
          fixedPrompt: c.fixedPrompt ?? '',
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
    const description = input.description?.trim() ?? ''
    const appearance = input.appearance?.trim() ?? ''
    const characterId = makeCharacterId(name)

    const asset: CharacterAsset = {
      characterId,
      name,
      views: { main: null, back: null, sideLeft: null, sideRight: null },
      locked: false,
      description,
      fixedPrompt: appearance,
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

  lockCharacter: (id) =>
    set((state) => ({
      characterAssets: state.characterAssets.map((a) =>
        a.characterId === id ? { ...a, locked: true } : a,
      ),
    })),

  unlockCharacter: (id) =>
    set((state) => ({
      characterAssets: state.characterAssets.map((a) =>
        a.characterId === id ? { ...a, locked: false } : a,
      ),
    })),

  // 단일 뷰 생성 (crop 폐기, 2026-06-05). main=T2I, 방향=main 기반 i2i. 서버가 해당 뷰 컬럼만 갱신.
  generateCharacterView: async (characterId, view) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    const key = `${characterId}:${view}`
    if (get().generatingViews.includes(key)) return

    set((state) => ({ generatingViews: [...state.generatingViews, key], error: null }))
    try {
      const res = await fetch('/api/artist/generate-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, characterId, view }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      // 비동기: 라우트는 jobId만 반환 — 완료까지 polling (webhook이 서버사이드로 storage+DB 갱신).
      const { jobId } = (await res.json()) as { jobId: string }
      const url = await pollGenerationJob(jobId)
      set((state) => ({
        characterAssets: state.characterAssets.map((a) =>
          a.characterId === characterId
            ? { ...a, views: { ...a.views, [view]: url } }
            : a,
        ),
      }))
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Character view generation failed',
      })
    } finally {
      set((state) => ({
        generatingViews: state.generatingViews.filter((k) => k !== key),
      }))
    }
  },

  // main → 4방향 순서 생성. 방향 i2i 는 main 이 DB 에 있어야 하므로 main 을 먼저 await 한 뒤
  // 4방향을 concurrency 4 풀로 병렬 생성. 카드 "Generate All Views" / 시트 재생성용.
  generateCharacterAllViews: async (characterId) => {
    await get().generateCharacterView(characterId, 'main')
    await runPool(
      CHARACTER_DIRECTIONAL_VIEWS.map(
        (v) => () => get().generateCharacterView(characterId, v),
      ),
      4,
    )
  },

  generateWorldAsset: async (locationId) => {
    const { sceneManifest, selectedBoostPreset, imageProvider } = get()
    const location = sceneManifest?.locations.find(
      (l) => l.locationId === locationId,
    )
    const scene = sceneManifest?.scenes.find((s) => s.location === locationId)
    if (!location || !scene) return
    if (get().generatingLocations.includes(locationId)) return

    set((state) => ({
      generatingLocations: [...state.generatingLocations, locationId],
      error: null,
    }))

    try {
      const basePrompt = buildWorldPrompt(
        location.visualDescription,
        location.timeOfDay,
        scene.mood,
        selectedBoostPreset,
      )

      const pid = useProjectStore.getState().projectId

      // Generate sequentially to avoid timeout. fal이면 webhook job 경로, 아니면 동기.
      // suffix는 WORLD_SHOT_SUFFIX 단일 출처 사용 (generateWorldShot과 동일 문구).
      // 1) Wide shot
      const wideShot = await generateAndPersistWorldShot(
        pid, locationId, 'wide_shot', `${basePrompt}, ${WORLD_SHOT_SUFFIX.wideShot}`, imageProvider,
      )
      set((state) => ({
        worldAssets: state.worldAssets.map((w) =>
          w.locationId === locationId ? { ...w, wideShot } : w,
        ),
      }))

      // 2) Establishing shot
      const establishingShot = await generateAndPersistWorldShot(
        pid, locationId, 'establishing_shot', `${basePrompt}, ${WORLD_SHOT_SUFFIX.establishingShot}`, imageProvider,
      )
      set((state) => ({
        worldAssets: state.worldAssets.map((w) =>
          w.locationId === locationId ? { ...w, establishingShot } : w,
        ),
      }))
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
      }))
    }
  },

  generateWorldShot: async (locationId, shot, promptOverride) => {
    const { sceneManifest, selectedBoostPreset, imageProvider } = get()
    const location = sceneManifest?.locations.find(
      (l) => l.locationId === locationId,
    )
    const scene = sceneManifest?.scenes.find((s) => s.location === locationId)
    if (!location || !scene) return

    // location 단위 가드를 두지 않음 — 같은 로케이션의 wide/establishing 을 병렬 생성할 수 있어야 함.
    set((state) => ({
      generatingLocations: [...state.generatingLocations, locationId],
      error: null,
    }))

    try {
      // 사용자 편집 프롬프트 우선, 없으면 기본 빌드 프롬프트.
      const prompt =
        promptOverride ??
        worldShotPrompt(
          location.visualDescription,
          location.timeOfDay,
          scene.mood,
          selectedBoostPreset,
          shot,
        )
      const pid = useProjectStore.getState().projectId
      const url = await generateAndPersistWorldShot(
        pid,
        locationId,
        WORLD_SHOT_COLUMN[shot] as 'wide_shot' | 'establishing_shot',
        prompt,
        imageProvider,
      )
      set((state) => ({
        worldAssets: state.worldAssets.map((w) =>
          w.locationId === locationId ? { ...w, [shot]: url } : w,
        ),
      }))
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'World generation failed',
      })
    } finally {
      // 같은 locationId 가 중복될 수 있으므로 한 건만 제거.
      set((state) => {
        const idx = state.generatingLocations.indexOf(locationId)
        if (idx === -1) return {}
        const next = state.generatingLocations.slice()
        next.splice(idx, 1)
        return { generatingLocations: next }
      })
    }
  },

  // Writer→Artist 진입 시 비어있는 이미지 자동생성 (crop 폐기 후 재설계, 2026-06-05).
  //   main(정면 대표) 은 핸드오프 파이프라인(runAssetsGenerate→view_main)이 progress bar 뒤에서 미리 채움 →
  //   여기선 비어있는 방향 뷰(back/left/right) i2i 와 월드 샷만 보강한다.
  //   캐릭터 뷰·월드 샷을 한 풀에서 동시 4개 제한으로 병렬 처리 (캐릭터별·월드별 병렬).
  //   생성물은 DB 영속 → 재진입 시 not-null 이라 자동 skip(자연 캐시).
  autoGenerateBaseImages: async () => {
    const { characterAssets, worldAssets } = get()
    const tasks: Array<() => Promise<void>> = []

    for (const c of characterAssets) {
      if (c.views.main == null) {
        // main 미준비(파이프라인 생성 실패 등) → main 부터 만들고 4방향까지 한 체인으로.
        tasks.push(() => get().generateCharacterAllViews(c.characterId))
      } else {
        // main 준비됨 → 비어있는 방향 뷰만 i2i 로 생성.
        for (const v of CHARACTER_DIRECTIONAL_VIEWS) {
          if (c.views[v] == null) {
            tasks.push(() => get().generateCharacterView(c.characterId, v))
          }
        }
      }
    }

    for (const w of worldAssets) {
      if (w.wideShot == null) {
        tasks.push(() => get().generateWorldShot(w.locationId, 'wideShot'))
      }
      if (w.establishingShot == null) {
        tasks.push(() => get().generateWorldShot(w.locationId, 'establishingShot'))
      }
    }

    await runPool(tasks, 4)
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
        if (u.views?.length) {
          await runPool(
            u.views.map((v) => () => get().generateCharacterView(u.characterId, v)),
            4,
          )
        } else {
          await get().generateCharacterAllViews(u.characterId)
        }
      } else if (u.type === 'regenerateWorldAsset') {
        await get().generateWorldAsset(u.locationId)
      }
    }
  },

  selectBoostPreset: (preset) =>
    set((state) => ({
      selectedBoostPreset: state.selectedBoostPreset === preset ? null : preset,
    })),

  setImageProvider: (provider) => set({ imageProvider: provider }),

  reset: () =>
    set({
      sceneManifest: null,
      characterAssets: [],
      worldAssets: [],
      selectedCharacterId: null,
      selectedLocationId: null,
      generatingViews: [],
      generatingLocations: [],
      selectedBoostPreset: null,
      imageProvider: 'fal' as ImageProvider,
      error: null,
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
  const scene = sceneManifest?.scenes.find((s) => s.location === locationId)
  if (!location || !scene) return ''
  return worldShotPrompt(
    location.visualDescription,
    location.timeOfDay,
    scene.mood,
    selectedBoostPreset,
    shot,
  )
}
