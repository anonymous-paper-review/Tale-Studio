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
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import { classifyDialoguePatch } from '@/lib/writer-chat-updates'
import { useProjectStore } from '@/stores/project-store'
import { isDemoSession } from '@/lib/demo/context'


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

export interface WriterDialogueShrinkProposal {
  shotId: string
  currentDialogueLines: DialogueLine[]
  dialogueLines: DialogueLine[]
}

export interface WriterApplyChatUpdatesResult {
  pendingDialogueShrinks: WriterDialogueShrinkProposal[]
}

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
  if (Array.isArray(o.dialogueLines)) out.dialogueLines = o.dialogueLines as DialogueLine[]
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
  /** 목각 previz 영상 생성(#previz-video) — 러프 START+END refs. 완료 시 shots 리로드. */
  generatePrevizVideo: (shotId: string) => Promise<void>
  selectScene: (id: string) => void
  updateScene: (id: string, changes: Partial<Scene>) => void
  selectShot: (id: string) => void
  updateShot: (id: string, changes: Partial<Shot>) => void
  // opts.afterShotId: undefined=씬 끝에 append(기존 동작), null=씬 맨 앞, shotId=그 샷 뒤에 삽입.
  addShot: (
    sceneId: string,
    opts?: { afterShotId?: string | null; fields?: Partial<Shot> },
  ) => Promise<string | null>
  deleteShot: (shotId: string) => Promise<void>
  recomputeSceneDuration: (sceneId: string) => void
  // opts.afterSceneId: undefined=맨 끝 append(기존 동작), null=맨 앞, sceneId=그 씬 뒤에 삽입.
  addScene: (
    opts?: { afterSceneId?: string | null; fields?: Partial<Scene> },
  ) => Promise<string | null>
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
  applyChatUpdates: (updates: WriterChatUpdate[]) => Promise<WriterApplyChatUpdatesResult>
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
    if (isDemoSession()) return
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
            // 편집은 유저 언어 → primary·_native 둘 다 native 기록(생성측은 러프 라우트가 EN skip-or-derive). (S3b)
            narrative_summary: scene.narrativeSummary,
            narrative_summary_native: scene.narrativeSummary,
            original_text_quote: scene.originalTextQuote,
            location: scene.location,
            time_of_day: scene.timeOfDay,
            mood: scene.mood,
            mood_native: scene.mood,
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
    if (isDemoSession()) return
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
            // 편집은 유저 언어 → primary·_native 둘 다 native. 러프 라우트가 EN skip-or-derive. (S3b)
            action_description: shot.actionDescription,
            action_description_native: shot.actionDescription,
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

  addShot: async (sceneId, opts) => {
    if (isDemoSession()) return null
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return null
    const prevShots = get().shots
    const shotId = nextShotId(
      sceneId,
      prevShots.map((s) => s.shotId),
    )

    // 삽입 sort_order — 이웃의 실제 sort_order 기준(배열 index 아님: 기존 데이터에 gap 이 있어도 안전).
    //   append=맨 뒤(시프트 불요), 그 외(맨 앞/특정 샷 뒤)=신규 order 이상을 전부 +1 밀어 자리 확보.
    const after = opts?.afterShotId
    const orders = prevShots.map((s) => s.sortOrder ?? 0)
    const maxOrder = orders.length ? Math.max(...orders) : -1
    let newOrder: number
    let shift = false
    if (after === undefined) {
      newOrder = maxOrder + 1
    } else if (after === null) {
      const first = prevShots.find((s) => s.sceneId === sceneId)
      if (first) {
        newOrder = first.sortOrder ?? 0
        shift = true
      } else {
        newOrder = maxOrder + 1
      }
    } else {
      const x = prevShots.find((s) => s.shotId === after)
      newOrder = (x?.sortOrder ?? maxOrder) + 1
      shift = true
    }

    // 새 샷 기본 등장인물 = 씬 등장인물 상속. 빈 배열이면 rough-storyboard db_fallback 이
    //   "인물 없는 빈 풍경(empty landscape)"으로 그려 사용자가 의도한 인물 샷이 안 나온다(2026-06-24).
    const scene = get().sceneManifest?.scenes.find((s) => s.sceneId === sceneId)
    const f = opts?.fields
    const newShot: Shot = {
      shotId,
      sceneId,
      shotType: f?.shotType ?? 'MS',
      actionDescription: f?.actionDescription ?? '',
      characters: f?.characters ?? scene?.charactersPresent ?? [],
      durationSeconds: f?.durationSeconds ?? 5,
      generationMethod: f?.generationMethod ?? 'T2V',
      dialogueLines: f?.dialogueLines ?? [],
      camera: f?.camera ?? { ...DEFAULT_CAMERA },
      lighting: f?.lighting ?? { ...DEFAULT_LIGHTING },
      sortOrder: newOrder,
    }

    // optimistic: tail 시프트 + 신규 삽입, sort_order 기준 재정렬
    const shifted = shift
      ? prevShots.map((s) =>
          (s.sortOrder ?? 0) >= newOrder ? { ...s, sortOrder: (s.sortOrder ?? 0) + 1 } : s,
        )
      : prevShots
    const nextShots = [...shifted, newShot].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    )
    set({ shots: nextShots, selectedShotId: shotId })

    const supabase = createClient()
    // 편집(추가 폼)은 유저 언어 → primary·_native 둘 다 native 로 기록(러프 라우트가 EN skip-or-derive). (S3b)
    const { error } = await supabase.from('shots').insert({
      project_id: projectId,
      scene_id: sceneId,
      shot_id: shotId,
      shot_type: newShot.shotType,
      action_description: newShot.actionDescription,
      action_description_native: newShot.actionDescription,
      characters: newShot.characters,
      duration_seconds: newShot.durationSeconds,
      generation_method: newShot.generationMethod,
      dialogue_lines: newShot.dialogueLines,
      camera_config: newShot.camera,
      lighting_config: newShot.lighting,
      sort_order: newOrder,
    })

    if (error) {
      set({ shots: prevShots, error: error.message })
      return null
    }
    // 자리 확보: 신규 order 이상이던 기존 샷들을 +1 로 밀어 DB 반영(순서 무결성). insert 성공 후 실행 —
    //   중간 실패해도 sort_order 중복은 grouping-by-scene 표시에 무해(다음 재정렬에서 수렴).
    if (shift) {
      await Promise.all(
        prevShots
          .filter((s) => (s.sortOrder ?? 0) >= newOrder)
          .map((s) =>
            supabase
              .from('shots')
              .update({ sort_order: (s.sortOrder ?? 0) + 1 })
              .eq('project_id', projectId)
              .eq('shot_id', s.shotId),
          ),
      )
    }
    get().recomputeSceneDuration(sceneId)
    return shotId
  },

  deleteShot: async (shotId) => {
    if (isDemoSession()) return
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

  addScene: async (opts) => {
    if (isDemoSession()) return null
    const projectId = useProjectStore.getState().projectId
    const manifest = get().sceneManifest
    if (!projectId || !manifest) return null

    const prevScenes = manifest.scenes
    const sceneId = nextSceneId(prevScenes.map((s) => s.sceneId))

    // 삽입 sort_order — 이웃의 실제 sort_order 기준(샷과 동일 규칙). append=맨 뒤, 그 외=신규 order 이상 +1.
    const after = opts?.afterSceneId
    const orders = prevScenes.map((s) => s.sortOrder ?? 0)
    const maxOrder = orders.length ? Math.max(...orders) : -1
    let newOrder: number
    let shift = false
    if (after === undefined) {
      newOrder = maxOrder + 1
    } else if (after === null) {
      newOrder = orders.length ? Math.min(...orders) : 0
      shift = orders.length > 0
    } else {
      const x = prevScenes.find((s) => s.sceneId === after)
      newOrder = (x?.sortOrder ?? maxOrder) + 1
      shift = true
    }

    const f = opts?.fields
    const newScene: Scene = {
      sceneId,
      narrativeSummary: f?.narrativeSummary ?? '',
      originalTextQuote: f?.originalTextQuote ?? '',
      location: f?.location ?? manifest.locations[0]?.locationId ?? '',
      timeOfDay: f?.timeOfDay ?? 'day',
      mood: f?.mood ?? '',
      charactersPresent: f?.charactersPresent ?? [],
      estimatedDurationSeconds: f?.estimatedDurationSeconds ?? 30,
      sortOrder: newOrder,
    }

    const shifted = shift
      ? prevScenes.map((s) =>
          (s.sortOrder ?? 0) >= newOrder ? { ...s, sortOrder: (s.sortOrder ?? 0) + 1 } : s,
        )
      : prevScenes
    const nextScenes = [...shifted, newScene].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    )
    set((state) => ({
      sceneManifest: state.sceneManifest
        ? { ...state.sceneManifest, scenes: nextScenes }
        : state.sceneManifest,
    }))

    const supabase = createClient()
    // 편집(추가 폼)은 유저 언어 → primary·_native 둘 다 native 로 기록. (S3b)
    const { error } = await supabase.from('scenes').insert({
      project_id: projectId,
      scene_id: sceneId,
      narrative_summary: newScene.narrativeSummary,
      narrative_summary_native: newScene.narrativeSummary,
      original_text_quote: newScene.originalTextQuote,
      location: newScene.location,
      time_of_day: newScene.timeOfDay,
      mood: newScene.mood,
      mood_native: newScene.mood,
      characters_present: newScene.charactersPresent,
      estimated_duration_seconds: newScene.estimatedDurationSeconds,
      sort_order: newOrder,
    })

    if (error) {
      set((state) => ({
        sceneManifest: state.sceneManifest
          ? { ...state.sceneManifest, scenes: prevScenes }
          : state.sceneManifest,
        error: error.message,
      }))
      return null
    }
    if (shift) {
      await Promise.all(
        prevScenes
          .filter((s) => (s.sortOrder ?? 0) >= newOrder)
          .map((s) =>
            supabase
              .from('scenes')
              .update({ sort_order: (s.sortOrder ?? 0) + 1 })
              .eq('project_id', projectId)
              .eq('scene_id', s.sceneId),
          ),
      )
    }
    return sceneId
  },

  deleteScene: async (sceneId) => {
    if (isDemoSession()) return
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
    const pendingDialogueShrinks: WriterDialogueShrinkProposal[] = []
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
          const shotId = tempMap.get(u.id) ?? u.id
          const nextDialogueLines = u.patch.dialogueLines
          if (Array.isArray(nextDialogueLines)) {
            const currentShot = get().shots.find((shot) => shot.shotId === shotId)
            if (
              currentShot &&
              classifyDialoguePatch(currentShot.dialogueLines, nextDialogueLines) === 'confirm'
            ) {
              const restPatch = { ...u.patch }
              delete restPatch.dialogueLines
              if (Object.keys(restPatch).length > 0) get().updateShot(shotId, restPatch)
              pendingDialogueShrinks.push({
                shotId,
                currentDialogueLines: currentShot.dialogueLines,
                dialogueLines: nextDialogueLines,
              })
            } else {
              get().updateShot(shotId, u.patch)
            }
          } else {
            get().updateShot(shotId, u.patch)
          }
        } else if (u.type === 'deleteShot') {
          await get().deleteShot(tempMap.get(u.id) ?? u.id)
        } else if (u.type === 'deleteScene') {
          await get().deleteScene(tempMap.get(u.id) ?? u.id)
        }
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'chat update failed' })
      }
    }
    return { pendingDialogueShrinks }
  },

  reorderScenes: async (orderedIds) => {
    if (isDemoSession()) return
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
    if (isDemoSession()) return
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

  generatePrevizVideo: async (shotId) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    // 낙관 상태 — 카드가 즉시 '생성 중' 표시
    set((state) => ({
      shots: state.shots.map((sh) =>
        sh.shotId === shotId
          ? {
              ...sh,
              previzVideo: {
                url: sh.previzVideo?.url ?? '',
                status: 'generating',
                errorMessage: null,
                generatedAt: sh.previzVideo?.generatedAt ?? 0,
              },
            }
          : sh,
      ),
    }))
    try {
      const res = await fetch('/api/director/generate-previz-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, writerShotId: shotId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const { jobId } = (await res.json()) as { jobId: string }
      // 잡 폴링은 best-effort — 폴링이 일시 오류로 던져도(webhook 이 이미 완료한 경쟁 등)
      //   아래 진실 폴링이 shots.previz_video 를 회수한다(새로고침 불필요, 2026-07-22).
      await pollGenerationJob(jobId).catch(() => {})
      // 진실 폴링: previz_video 가 terminal(completed/failed)로 보일 때까지 리로드.
      for (let i = 0; i < 30; i++) {
        await get().loadProject()
        const st = get().shots.find((sh) => sh.shotId === shotId)?.previzVideo?.status
        if (st === 'completed' || st === 'failed') return
        await new Promise((r) => setTimeout(r, 10_000))
      }
      throw new Error('previz 영상이 제한 시간 안에 완료되지 않았습니다')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'previz 영상 생성 실패'
      set((state) => ({
        shots: state.shots.map((sh) =>
          sh.shotId === shotId
            ? {
                ...sh,
                previzVideo: {
                  url: sh.previzVideo?.url ?? '',
                  status: 'failed',
                  errorMessage: message,
                  generatedAt: 0,
                },
              }
            : sh,
        ),
      }))
      throw err
    }
  },

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
        scenes: scenes.map((s, i) => ({
          sceneId: s.scene_id,
          // 표시는 유저 언어(_native), 생성은 주 컬럼(EN). (language boundary S3b)
          narrativeSummary: s.narrative_summary_native ?? s.narrative_summary ?? '',
          originalTextQuote: s.original_text_quote ?? '',
          location: s.location ?? '',
          timeOfDay: s.time_of_day ?? '',
          mood: s.mood_native ?? s.mood ?? '',
          charactersPresent: s.characters_present ?? [],
          estimatedDurationSeconds: s.estimated_duration_seconds ?? 30,
          sortOrder: s.sort_order ?? i, // 정렬은 .order('sort_order') → i 는 값 없을 때 안전 폴백
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

      const shots: Shot[] = (shotsData ?? []).map((s, i) => ({
        shotId: s.shot_id,
        sceneId: s.scene_id,
        sortOrder: s.sort_order ?? i, // 정렬은 .order('sort_order') → i 는 값 없을 때 안전 폴백
        shotType: s.shot_type as Shot['shotType'],
        actionDescription: s.action_description_native ?? s.action_description ?? '',
        prompt: (s.prompt as string | null) ?? undefined,
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
        // 목각 previz 영상 (director storyboard 뷰, #previz-video)
        previzVideo: (s.previz_video as RoughStoryboardImage | null) ?? null,
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
