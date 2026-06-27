import { create } from 'zustand'
import type {
  Scene,
  SceneManifest,
  Character,
  Location,
  Shot,
  DialogueLine,
  RoughStoryboardImage,
} from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useProjectStore } from '@/stores/project-store'


const DEFAULT_CAMERA = {
  horizontal: 0,
  vertical: 0,
  pan: 0,
  tilt: 0,
  roll: 0,
  zoom: 0,
}

const DEFAULT_LIGHTING = {
  position: 'front' as const,
  brightness: 50,
  colorTemp: 5000,
}

const sceneSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const shotSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

function nextShotId(sceneId: string, existingShotIds: string[]): string {
  const match = sceneId.match(/sc_(\d+)/)
  const sceneNum = match ? match[1] : '01'
  const prefix = `sh_${sceneNum}_`
  const max = existingShotIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0)
  const next = String(max + 1).padStart(2, '0')
  return `${prefix}${next}`
}

function nextSceneId(existingSceneIds: string[]): string {
  const max = existingSceneIds
    .map((id) => parseInt(id.replace('sc_', ''), 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0)
  const next = String(max + 1).padStart(2, '0')
  return `sc_${next}`
}

// writer 채팅(/api/writer/chat)이 내는 검증된 액션 — applyChatUpdates 가 기존 CRUD 로 실행한다.
export type WriterChatUpdate =
  | ({ type: 'addScene'; tempId?: string } & Partial<Scene>)
  | ({ type: 'addShot'; sceneId: string; tempId?: string } & Partial<Shot>)
  | { type: 'updateScene'; id: string; patch: Partial<Scene> }
  | { type: 'updateShot'; id: string; patch: Partial<Shot> }
  | { type: 'deleteShot'; id: string }
  | { type: 'deleteScene'; id: string }

// applyChatUpdates 보조 — update 에서 Scene/Shot 칸만 추린다(route 가 1차 검증, 여기선 타입 좁힘 + 잉여 키 제거).
function pickSceneFields(u: WriterChatUpdate): Partial<Scene> {
  const o = u as Record<string, unknown>
  const out: Partial<Scene> = {}
  if (typeof o.location === 'string') out.location = o.location
  if (typeof o.timeOfDay === 'string') out.timeOfDay = o.timeOfDay
  if (typeof o.mood === 'string') out.mood = o.mood
  if (typeof o.narrativeSummary === 'string') out.narrativeSummary = o.narrativeSummary
  if (typeof o.originalTextQuote === 'string') out.originalTextQuote = o.originalTextQuote
  if (Array.isArray(o.charactersPresent)) out.charactersPresent = o.charactersPresent as string[]
  if (typeof o.estimatedDurationSeconds === 'number')
    out.estimatedDurationSeconds = o.estimatedDurationSeconds
  return out
}
function pickShotFields(u: WriterChatUpdate): Partial<Shot> {
  const o = u as Record<string, unknown>
  const out: Partial<Shot> = {}
  if (typeof o.shotType === 'string') out.shotType = o.shotType as Shot['shotType']
  if (typeof o.actionDescription === 'string') out.actionDescription = o.actionDescription
  if (Array.isArray(o.characters)) out.characters = o.characters as string[]
  if (typeof o.durationSeconds === 'number') out.durationSeconds = o.durationSeconds
  return out
}

interface WriterState {
  storyText: string
  expandedStory: string | null
  sceneManifest: SceneManifest | null
  selectedSceneId: string | null
  shots: Shot[]
  selectedShotId: string | null
  generatingShots: boolean
  generating: boolean
  regeneratingSceneId: string | null
  error: string | null

  setStoryText: (text: string) => void
  loadProject: () => Promise<void>
  selectScene: (id: string) => void
  updateScene: (id: string, changes: Partial<Scene>) => void
  selectShot: (id: string) => void
  updateShot: (id: string, changes: Partial<Shot>) => void
  addShot: (sceneId: string) => Promise<string | null>
  deleteShot: (shotId: string) => Promise<void>
  recomputeSceneDuration: (sceneId: string) => void
  addScene: () => Promise<string | null>
  deleteScene: (sceneId: string) => Promise<void>
  reorderScenes: (orderedIds: string[]) => Promise<void>
  regenerateScene: (sceneId: string) => Promise<void>
  addDialogueLine: (shotId: string, line: DialogueLine) => void
  removeDialogueLine: (shotId: string, index: number) => void
  updateDialogueLine: (
    shotId: string,
    index: number,
    changes: Partial<DialogueLine>,
  ) => void
  applyChatUpdates: (updates: WriterChatUpdate[]) => Promise<void>
  clearError: () => void
  reset: () => void
}

export const useWriterStore = create<WriterState>((set, get) => ({
  storyText: '',
  expandedStory: null,
  sceneManifest: null,
  selectedSceneId: null,
  shots: [],
  selectedShotId: null,
  generatingShots: false,
  generating: false,
  regeneratingSceneId: null,
  error: null,

  setStoryText: (text) => set({ storyText: text }),

  selectScene: (id) => {
    const { shots } = get()
    const firstShot = shots.find((s) => s.sceneId === id)
    set({
      selectedSceneId: id,
      selectedShotId: firstShot?.shotId ?? null,
    })
  },

  updateScene: (id, changes) => {
    set((state) => {
      if (!state.sceneManifest) return state
      return {
        sceneManifest: {
          ...state.sceneManifest,
          scenes: state.sceneManifest.scenes.map((s) =>
            s.sceneId === id ? { ...s, ...changes } : s,
          ),
        },
      }
    })

    const existing = sceneSaveTimers.get(id)
    if (existing) clearTimeout(existing)
    sceneSaveTimers.set(
      id,
      setTimeout(async () => {
        const projectId = useProjectStore.getState().projectId
        if (!projectId) return
        const scene = get().sceneManifest?.scenes.find(
          (s) => s.sceneId === id,
        )
        if (!scene) return
        const supabase = createClient()
        await supabase
          .from('scenes')
          .update({
            narrative_summary: scene.narrativeSummary,
            original_text_quote: scene.originalTextQuote,
            location: scene.location,
            time_of_day: scene.timeOfDay,
            mood: scene.mood,
            characters_present: scene.charactersPresent,
            estimated_duration_seconds: scene.estimatedDurationSeconds,
          })
          .eq('project_id', projectId)
          .eq('scene_id', id)
        sceneSaveTimers.delete(id)
      }, 500),
    )
  },

  selectShot: (id) => set({ selectedShotId: id }),

  updateShot: (id, changes) => {
    set((state) => ({
      shots: state.shots.map((s) =>
        s.shotId === id ? { ...s, ...changes } : s,
      ),
    }))

    // duration 변경 시 해당 scene 길이를 재계산 (CRUD 동기화)
    if ('durationSeconds' in changes) {
      const shot = get().shots.find((s) => s.shotId === id)
      if (shot) get().recomputeSceneDuration(shot.sceneId)
    }

    const existing = shotSaveTimers.get(id)
    if (existing) clearTimeout(existing)
    shotSaveTimers.set(
      id,
      setTimeout(async () => {
        const projectId = useProjectStore.getState().projectId
        if (!projectId) return
        const shot = get().shots.find((s) => s.shotId === id)
        if (!shot) return
        const supabase = createClient()
        await supabase
          .from('shots')
          .update({
            shot_type: shot.shotType,
            action_description: shot.actionDescription,
            characters: shot.characters,
            duration_seconds: shot.durationSeconds,
            dialogue_lines: shot.dialogueLines,
            generation_method: shot.generationMethod,
          })
          .eq('project_id', projectId)
          .eq('shot_id', id)
        shotSaveTimers.delete(id)
      }, 500),
    )
  },

  addShot: async (sceneId) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return null
    const { shots } = get()
    const sceneShots = shots.filter((s) => s.sceneId === sceneId)
    const shotId = nextShotId(
      sceneId,
      shots.map((s) => s.shotId),
    )
    const sortOrder = shots.length

    // 새 샷 기본 등장인물 = 씬 등장인물 상속. 빈 배열이면 rough-storyboard db_fallback 이
    //   "인물 없는 빈 풍경(empty landscape)"으로 그려 사용자가 의도한 인물 샷이 안 나온다(2026-06-24).
    const scene = get().sceneManifest?.scenes.find((s) => s.sceneId === sceneId)
    const newShot: Shot = {
      shotId,
      sceneId,
      shotType: 'MS',
      actionDescription: '',
      characters: scene?.charactersPresent ?? [],
      durationSeconds: 5,
      generationMethod: 'T2V',
      dialogueLines: [],
      camera: { ...DEFAULT_CAMERA },
      lighting: { ...DEFAULT_LIGHTING },
    }

    set((state) => ({
      shots: [...state.shots, newShot],
      selectedShotId: shotId,
    }))

    const supabase = createClient()
    const { error } = await supabase.from('shots').insert({
      project_id: projectId,
      scene_id: sceneId,
      shot_id: shotId,
      shot_type: newShot.shotType,
      action_description: newShot.actionDescription,
      characters: newShot.characters,
      duration_seconds: newShot.durationSeconds,
      generation_method: newShot.generationMethod,
      dialogue_lines: newShot.dialogueLines,
      camera_config: newShot.camera,
      lighting_config: newShot.lighting,
      sort_order: sortOrder,
    })

    if (error) {
      // Roll back on failure
      set((state) => ({
        shots: state.shots.filter((s) => s.shotId !== shotId),
        error: error.message,
      }))
      return null
    }
    void sceneShots
    get().recomputeSceneDuration(sceneId)
    return shotId
  },

  deleteShot: async (shotId) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    const prev = get().shots
    const target = prev.find((s) => s.shotId === shotId)
    if (!target) return

    set((state) => ({
      shots: state.shots.filter((s) => s.shotId !== shotId),
      selectedShotId:
        state.selectedShotId === shotId
          ? state.shots.find(
              (s) => s.sceneId === target.sceneId && s.shotId !== shotId,
            )?.shotId ?? null
          : state.selectedShotId,
    }))

    const supabase = createClient()
    const { error } = await supabase
      .from('shots')
      .delete()
      .eq('project_id', projectId)
      .eq('shot_id', shotId)

    if (error) {
      set({ shots: prev, error: error.message })
      return
    }
    get().recomputeSceneDuration(target.sceneId)
  },

  // shot 변경 후 해당 scene 길이를 shot duration 합으로 재계산 (persistShotsToDb 와 동일 규칙 — CRUD 동기화).
  //   updateScene 경유라 state 즉시 갱신 + 500ms 디바운스로 scenes.estimated_duration_seconds 저장.
  recomputeSceneDuration: (sceneId) => {
    const sum = get()
      .shots.filter((s) => s.sceneId === sceneId)
      .reduce((acc, s) => acc + (s.durationSeconds ?? 5), 0)
    get().updateScene(sceneId, { estimatedDurationSeconds: sum })
  },

  addScene: async () => {
    const projectId = useProjectStore.getState().projectId
    const manifest = get().sceneManifest
    if (!projectId || !manifest) return null

    const sceneId = nextSceneId(manifest.scenes.map((s) => s.sceneId))
    const newScene: Scene = {
      sceneId,
      narrativeSummary: '',
      originalTextQuote: '',
      location: manifest.locations[0]?.locationId ?? '',
      timeOfDay: 'day',
      mood: '',
      charactersPresent: [],
      estimatedDurationSeconds: 30,
    }
    const sortOrder = manifest.scenes.length

    set((state) => ({
      sceneManifest: state.sceneManifest
        ? {
            ...state.sceneManifest,
            scenes: [...state.sceneManifest.scenes, newScene],
          }
        : state.sceneManifest,
    }))

    const supabase = createClient()
    const { error } = await supabase.from('scenes').insert({
      project_id: projectId,
      scene_id: sceneId,
      narrative_summary: newScene.narrativeSummary,
      original_text_quote: newScene.originalTextQuote,
      location: newScene.location,
      time_of_day: newScene.timeOfDay,
      mood: newScene.mood,
      characters_present: newScene.charactersPresent,
      estimated_duration_seconds: newScene.estimatedDurationSeconds,
      sort_order: sortOrder,
    })

    if (error) {
      set((state) => ({
        sceneManifest: state.sceneManifest
          ? {
              ...state.sceneManifest,
              scenes: state.sceneManifest.scenes.filter(
                (s) => s.sceneId !== sceneId,
              ),
            }
          : state.sceneManifest,
        error: error.message,
      }))
      return null
    }
    return sceneId
  },

  deleteScene: async (sceneId) => {
    const projectId = useProjectStore.getState().projectId
    const prevManifest = get().sceneManifest
    const prevShots = get().shots
    if (!projectId || !prevManifest) return

    set((state) => ({
      sceneManifest: state.sceneManifest
        ? {
            ...state.sceneManifest,
            scenes: state.sceneManifest.scenes.filter(
              (s) => s.sceneId !== sceneId,
            ),
          }
        : state.sceneManifest,
      shots: state.shots.filter((s) => s.sceneId !== sceneId),
      selectedSceneId:
        state.selectedSceneId === sceneId ? null : state.selectedSceneId,
    }))

    const supabase = createClient()
    const [{ error: shotErr }, { error: sceneErr }] = await Promise.all([
      supabase
        .from('shots')
        .delete()
        .eq('project_id', projectId)
        .eq('scene_id', sceneId),
      supabase
        .from('scenes')
        .delete()
        .eq('project_id', projectId)
        .eq('scene_id', sceneId),
    ])

    if (shotErr || sceneErr) {
      set({
        sceneManifest: prevManifest,
        shots: prevShots,
        error: (shotErr ?? sceneErr)?.message ?? 'Delete failed',
      })
    }
  },

  // 채팅(/api/writer/chat)이 낸 검증된 updates 를 기존 CRUD 로 실행한다.
  //   LLM 은 add(scene→shot) → update → delete 순으로 배치하고, 같은 배치의 새 노드는 tempId 로 참조한다.
  //   각 update 는 best-effort — 하나 실패해도 나머지는 진행(에러는 store.error 로 표면화).
  applyChatUpdates: async (updates) => {
    const tempMap = new Map<string, string>() // tempId → 실제 id
    for (const u of updates) {
      try {
        if (u.type === 'addScene') {
          const newId = await get().addScene()
          if (!newId) continue
          if (u.tempId) tempMap.set(u.tempId, newId)
          const fields = pickSceneFields(u)
          if (Object.keys(fields).length > 0) get().updateScene(newId, fields)
        } else if (u.type === 'addShot') {
          const realSceneId = tempMap.get(u.sceneId) ?? u.sceneId
          const newId = await get().addShot(realSceneId)
          if (!newId) continue
          if (u.tempId) tempMap.set(u.tempId, newId)
          const fields = pickShotFields(u)
          if (Object.keys(fields).length > 0) get().updateShot(newId, fields)
        } else if (u.type === 'updateScene') {
          get().updateScene(tempMap.get(u.id) ?? u.id, u.patch)
        } else if (u.type === 'updateShot') {
          get().updateShot(tempMap.get(u.id) ?? u.id, u.patch)
        } else if (u.type === 'deleteShot') {
          await get().deleteShot(tempMap.get(u.id) ?? u.id)
        } else if (u.type === 'deleteScene') {
          await get().deleteScene(tempMap.get(u.id) ?? u.id)
        }
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'chat update failed' })
      }
    }
  },

  reorderScenes: async (orderedIds) => {
    const projectId = useProjectStore.getState().projectId
    const manifest = get().sceneManifest
    if (!projectId || !manifest) return

    const byId = new Map(manifest.scenes.map((s) => [s.sceneId, s]))
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((s): s is Scene => Boolean(s))

    set((state) => ({
      sceneManifest: state.sceneManifest
        ? { ...state.sceneManifest, scenes: reordered }
        : state.sceneManifest,
    }))

    const supabase = createClient()
    await Promise.all(
      orderedIds.map((sceneId, idx) =>
        supabase
          .from('scenes')
          .update({ sort_order: idx })
          .eq('project_id', projectId)
          .eq('scene_id', sceneId),
      ),
    )
  },

  regenerateScene: async (sceneId) => {
    const projectId = useProjectStore.getState().projectId
    const manifest = get().sceneManifest
    const scene = manifest?.scenes.find((s) => s.sceneId === sceneId)
    if (!projectId || !scene || !manifest) return

    set({ regeneratingSceneId: sceneId, error: null })

    try {
      const characterMap = Object.fromEntries(
        manifest.characters.map((c) => [c.characterId, c.name]),
      )
      const res = await fetch('/api/director/generate-shots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene: {
            sceneId: scene.sceneId,
            narrativeSummary: scene.narrativeSummary,
            location: scene.location,
            timeOfDay: scene.timeOfDay,
            mood: scene.mood,
            characters: scene.charactersPresent.map(
              (id) => characterMap[id] ?? id,
            ),
          },
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const { shots: newShots } = (await res.json()) as { shots: Shot[] }

      const supabase = createClient()
      await supabase
        .from('shots')
        .delete()
        .eq('project_id', projectId)
        .eq('scene_id', sceneId)

      if (newShots?.length) {
        await supabase.from('shots').insert(
          newShots.map((s, i) => ({
            project_id: projectId,
            scene_id: sceneId,
            shot_id: s.shotId,
            shot_type: s.shotType,
            action_description: s.actionDescription,
            characters: s.characters,
            duration_seconds: s.durationSeconds,
            generation_method: s.generationMethod,
            dialogue_lines: s.dialogueLines,
            camera_config: s.camera ?? DEFAULT_CAMERA,
            lighting_config: s.lighting ?? DEFAULT_LIGHTING,
            sort_order: i,
          })),
        )
      }

      set((state) => ({
        regeneratingSceneId: null,
        shots: [
          ...state.shots.filter((s) => s.sceneId !== sceneId),
          ...(newShots ?? []).map((s) => ({
            ...s,
            camera: s.camera ?? { ...DEFAULT_CAMERA },
            lighting: s.lighting ?? { ...DEFAULT_LIGHTING },
          })),
        ],
      }))
    } catch (err) {
      set({
        regeneratingSceneId: null,
        error:
          err instanceof Error ? err.message : 'Scene regeneration failed',
      })
    }
  },

  addDialogueLine: (shotId, line) => {
    const shot = get().shots.find((s) => s.shotId === shotId)
    if (!shot) return
    get().updateShot(shotId, {
      dialogueLines: [...shot.dialogueLines, line],
    })
  },

  removeDialogueLine: (shotId, index) => {
    const shot = get().shots.find((s) => s.shotId === shotId)
    if (!shot) return
    get().updateShot(shotId, {
      dialogueLines: shot.dialogueLines.filter((_, i) => i !== index),
    })
  },

  updateDialogueLine: (shotId, index, changes) => {
    const shot = get().shots.find((s) => s.shotId === shotId)
    if (!shot) return
    get().updateShot(shotId, {
      dialogueLines: shot.dialogueLines.map((dl, i) =>
        i === index ? { ...dl, ...changes } : dl,
      ),
    })
  },

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      storyText: '',
      expandedStory: null,
      sceneManifest: null,
      selectedSceneId: null,
      shots: [],
      selectedShotId: null,
      generatingShots: false,
      generating: false,
      regeneratingSceneId: null,
      error: null,
    }),

  loadProject: async () => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return

    try {
      const supabase = createClient()
      const [
        { data: project },
        { data: scenes },
        { data: characters },
        { data: locations },
        { data: shotsData },
      ] = await Promise.all([
        supabase
          .from('projects')
          .select('story_text, expanded_story')
          .eq('id', projectId)
          .single(),
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
          .from('shots')
          .select('*')
          .eq('project_id', projectId)
          .order('sort_order'),
      ])

      // Always load story_text even if no scenes yet (P1 → P2 handoff)
      if (!scenes?.length) {
        set({
          storyText: project?.story_text ?? '',
          expandedStory: project?.expanded_story ?? null,
        })
        return
      }

      const manifest: SceneManifest = {
        scenes: scenes.map((s) => ({
          sceneId: s.scene_id,
          narrativeSummary: s.narrative_summary ?? '',
          originalTextQuote: s.original_text_quote ?? '',
          location: s.location ?? '',
          timeOfDay: s.time_of_day ?? '',
          mood: s.mood ?? '',
          charactersPresent: s.characters_present ?? [],
          estimatedDurationSeconds: s.estimated_duration_seconds ?? 30,
        })),
        characters: (characters ?? []).map((c) => ({
          characterId: c.character_id,
          name: c.name,
          role: c.role as Character['role'],
          description: c.description ?? '',
          fixedPrompt: c.appearance ?? '',
          referenceImages: [],
        })),
        locations: (locations ?? []).map((l) => ({
          locationId: l.location_id,
          name: l.name,
          visualDescription: l.visual_description_native ?? l.visual_description ?? '',
          timeOfDay: l.time_of_day ?? '',
          lightingDirection: l.lighting_direction ?? '',
        })),
      }

      const shots: Shot[] = (shotsData ?? []).map((s) => ({
        shotId: s.shot_id,
        sceneId: s.scene_id,
        shotType: s.shot_type as Shot['shotType'],
        actionDescription: s.action_description ?? '',
        characters: s.characters ?? [],
        durationSeconds: s.duration_seconds ?? 5,
        generationMethod: (s.generation_method ?? 'T2V') as Shot['generationMethod'],
        dialogueLines: (s.dialogue_lines as DialogueLine[]) ?? [],
        camera: {
          ...DEFAULT_CAMERA,
          ...(s.camera_config as Partial<Shot['camera']> ?? {}),
        },
        lighting: {
          ...DEFAULT_LIGHTING,
          ...(s.lighting_config as Partial<Shot['lighting']> ?? {}),
        },
        // 러프 스토리보드 패널 (writer 탭). 마이그레이션 016 이전 DB 에선 undefined → null.
        roughStoryboard: (s.rough_storyboard as RoughStoryboardImage | null) ?? null,
      }))

      const firstSceneId = manifest.scenes[0]?.sceneId ?? null
      const firstShot =
        shots.find((s) => s.sceneId === firstSceneId) ?? null

      set({
        storyText: project?.story_text ?? '',
        expandedStory: project?.expanded_story ?? null,
        sceneManifest: manifest,
        selectedSceneId: firstSceneId,
        shots,
        selectedShotId: firstShot?.shotId ?? null,
      })
    } catch (err) {
      console.error('[writer-store] loadProject failed:', err)
    }
  },
}))

// Suppress unused type warning
export type { Location }
