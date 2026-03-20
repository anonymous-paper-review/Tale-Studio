import { create } from 'zustand'
import type {
  Shot,
  VideoClip,
  CameraConfig,
  LightingConfig,
  SceneManifest,
  CharacterAsset,
  WorldAsset,
} from '@/types'
import { useWriterStore } from '@/stores/writer-store'
import { useArtistStore, type ImageProvider } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { createClient } from '@/lib/supabase/client'

/* ── Fire-and-forget: upload shot reference image to Storage + DB ── */
async function persistShotImage(
  projectId: string,
  shotId: string,
  blobUrl: string,
): Promise<void> {
  try {
    const r = await fetch(blobUrl)
    const blob = await r.blob()
    const form = new FormData()
    form.append('projectId', projectId)
    form.append('type', 'shot')
    form.append('entityId', shotId)
    form.append('field', 'reference_image')
    form.append('file', blob, `${shotId}_reference.png`)
    const res = await fetch('/api/assets/upload-image', { method: 'POST', body: form })
    if (!res.ok) {
      console.error(`[director-store] persistShotImage HTTP ${res.status} for ${shotId}`)
    }
  } catch (err) {
    console.error(`[director-store] persistShotImage failed for ${shotId}:`, err)
  }
}

/* ── Debounced shot persistence (camera/lighting → Supabase) ── */
const pendingShotUpdates = new Map<string, NodeJS.Timeout>()

function debouncedShotSave(
  shotId: string,
  getShot: () => Shot | undefined,
) {
  const existing = pendingShotUpdates.get(shotId)
  if (existing) clearTimeout(existing)

  pendingShotUpdates.set(
    shotId,
    setTimeout(async () => {
      pendingShotUpdates.delete(shotId)
      const projectId = useProjectStore.getState().projectId
      const shot = getShot()
      if (!projectId || !shot) return

      try {
        const supabase = createClient()
        await supabase
          .from('shots')
          .update({
            camera_config: shot.camera,
            lighting_config: shot.lighting,
          })
          .eq('project_id', projectId)
          .eq('shot_id', shotId)
      } catch (err) {
        console.error('[director-store] shot save failed:', err)
      }
    }, 500),
  )
}

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

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

interface DirectorState {
  sceneManifest: SceneManifest | null
  characterAssets: CharacterAsset[]
  worldAssets: WorldAsset[]
  shots: Shot[]
  videoClips: VideoClip[]
  selectedSceneId: string | null
  selectedShotId: string | null

  // Chat
  chatMessages: ChatMessage[]
  chatLoading: boolean

  // Generation
  generatingVideoShotId: string | null
  generatingImageShotIds: Set<string>
  imageProvider: ImageProvider
  error: string | null

  loadData: () => void
  loadMockData: () => void
  selectScene: (id: string) => void
  selectShot: (id: string) => void
  updateCamera: (shotId: string, config: Partial<CameraConfig>) => void
  updateLighting: (shotId: string, config: Partial<LightingConfig>) => void
  sendChatMessage: (message: string) => Promise<void>
  applySuggestedCamera: (config: Partial<CameraConfig>) => void
  applySuggestedLighting: (config: Partial<LightingConfig>) => void
  generateVideo: (shotId: string) => Promise<void>
  generateShotImage: (shotId: string) => Promise<void>
  generateAllShotImages: () => Promise<void>
  setImageProvider: (provider: ImageProvider) => void
  reset: () => void
}

const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_MS = 300_000

export const useDirectorStore = create<DirectorState>((set, get) => ({
  sceneManifest: null,
  characterAssets: [],
  worldAssets: [],
  shots: [],
  videoClips: [],
  selectedSceneId: null,
  selectedShotId: null,
  chatMessages: [],
  chatLoading: false,
  generatingVideoShotId: null,
  generatingImageShotIds: new Set<string>(),
  imageProvider: 'gemini' as ImageProvider,
  error: null,

  loadData: async () => {
    const projectId = useProjectStore.getState().projectId

    // 1) Try Supabase
    if (projectId) {
      try {
        const supabase = createClient()
        const [
          { data: scenes },
          { data: dbChars },
          { data: dbLocs },
          { data: dbShots },
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
            .from('shots')
            .select('*')
            .eq('project_id', projectId)
            .order('sort_order'),
        ])

        if (dbShots?.length) {
          const manifest: SceneManifest = {
            scenes: (scenes ?? []).map((s) => ({
              sceneId: s.scene_id,
              act: s.act as 'intro' | 'dev' | 'turn' | 'conclusion',
              narrativeSummary: s.narrative_summary ?? '',
              originalTextQuote: s.original_text_quote ?? '',
              location: s.location ?? '',
              timeOfDay: s.time_of_day ?? '',
              mood: s.mood ?? '',
              charactersPresent: s.characters_present ?? [],
              estimatedDurationSeconds: s.estimated_duration_seconds ?? 30,
            })),
            characters: (dbChars ?? []).map((c) => ({
              characterId: c.character_id,
              name: c.name,
              role: c.role as 'protagonist' | 'antagonist' | 'supporting',
              description: c.description ?? '',
              fixedPrompt: c.fixed_prompt ?? '',
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

          const characterAssets: CharacterAsset[] = (dbChars ?? []).map(
            (c) => ({
              characterId: c.character_id,
              name: c.name,
              views: {
                front: c.view_front ?? null,
                side: c.view_side ?? null,
                back: c.view_back ?? null,
              },
              locked: c.locked ?? false,
            }),
          )

          const worldAssets: WorldAsset[] = (dbLocs ?? []).map((l) => ({
            locationId: l.location_id,
            name: l.name,
            sceneId: l.scene_id ?? '',
            wideShot: l.wide_shot ?? null,
            establishingShot: l.establishing_shot ?? null,
          }))

          const shots: Shot[] = dbShots.map((s) => ({
            shotId: s.shot_id,
            sceneId: s.scene_id,
            shotType: s.shot_type,
            actionDescription: s.action_description ?? '',
            characters: s.characters ?? [],
            durationSeconds: s.duration_seconds ?? 5,
            generationMethod: s.generation_method ?? 'T2V',
            dialogueLines: s.dialogue_lines ?? [],
            camera: { ...DEFAULT_CAMERA, ...(s.camera_config ?? {}) },
            lighting: { ...DEFAULT_LIGHTING, ...(s.lighting_config ?? {}) },
            referenceImageUrl: s.reference_image ?? null,
          }))

          const videoClips: VideoClip[] = shots.map((s) => ({
            shotId: s.shotId,
            url: null,
            status: 'pending',
            thumbnailUrl: null,
          }))

          const firstSceneId = manifest.scenes[0]?.sceneId ?? null
          const firstShot = shots.find((s) => s.sceneId === firstSceneId)

          set({
            sceneManifest: manifest,
            characterAssets,
            worldAssets,
            shots,
            videoClips,
            selectedSceneId: firstSceneId,
            selectedShotId: firstShot?.shotId ?? null,
          })
          return
        }
      } catch (err) {
        console.error('[director-store] DB load failed, falling back:', err)
      }
    }

    // 2) Try upstream stores (Writer → shots, Artist → assets)
    const writerState = useWriterStore.getState()
    const artistState = useArtistStore.getState()

    if (writerState.shots.length > 0) {
      const manifest =
        writerState.sceneManifest ?? artistState.sceneManifest ?? null
      const characterAssets = artistState.characterAssets
      const worldAssets = artistState.worldAssets

      const videoClips: VideoClip[] = writerState.shots.map((s) => ({
        shotId: s.shotId,
        url: null,
        status: 'pending',
        thumbnailUrl: null,
      }))

      const firstSceneId = manifest?.scenes[0]?.sceneId ?? null
      const firstShot = writerState.shots.find(
        (s) => s.sceneId === firstSceneId,
      )

      set({
        sceneManifest: manifest,
        characterAssets,
        worldAssets,
        shots: writerState.shots,
        videoClips,
        selectedSceneId: firstSceneId,
        selectedShotId: firstShot?.shotId ?? null,
      })
      return
    }

    // No data available — keep empty state (don't show fake mock data)
  },

  loadMockData: async () => {
    const [
      { mockShots },
      { mockVideoClips },
      { mockSceneManifest },
      { mockCharacterAssets },
      { mockWorldAssets },
    ] = await Promise.all([
      import('@/mocks/shot-sequences'),
      import('@/mocks/video-clips'),
      import('@/mocks/scene-manifest'),
      import('@/mocks/character-assets'),
      import('@/mocks/world-assets'),
    ])

    set({
      sceneManifest: mockSceneManifest,
      characterAssets: mockCharacterAssets,
      worldAssets: mockWorldAssets,
      shots: mockShots,
      videoClips: mockVideoClips,
      selectedSceneId: mockShots[0]?.sceneId ?? null,
      selectedShotId: mockShots[0]?.shotId ?? null,
    })
  },

  selectScene: (id) =>
    set((state) => {
      const firstShot = state.shots.find((s) => s.sceneId === id)
      return {
        selectedSceneId: id,
        selectedShotId: firstShot?.shotId ?? null,
      }
    }),

  selectShot: (id) => set({ selectedShotId: id }),

  updateCamera: (shotId, config) => {
    set((state) => ({
      shots: state.shots.map((s) =>
        s.shotId === shotId ? { ...s, camera: { ...s.camera, ...config } } : s,
      ),
    }))
    debouncedShotSave(shotId, () =>
      get().shots.find((s) => s.shotId === shotId),
    )
  },

  updateLighting: (shotId, config) => {
    set((state) => ({
      shots: state.shots.map((s) =>
        s.shotId === shotId
          ? { ...s, lighting: { ...s.lighting, ...config } }
          : s,
      ),
    }))
    debouncedShotSave(shotId, () =>
      get().shots.find((s) => s.shotId === shotId),
    )
  },

  sendChatMessage: async (message: string) => {
    const { chatMessages, selectedShotId, shots } = get()
    const selectedShot = shots.find((s) => s.shotId === selectedShotId)

    set({
      chatMessages: [...chatMessages, { role: 'user', content: message }],
      chatLoading: true,
      error: null,
    })

    try {
      const history = chatMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const shotContext = selectedShot
        ? {
            shotType: selectedShot.shotType,
            actionDescription: selectedShot.actionDescription,
            camera: selectedShot.camera,
            lighting: selectedShot.lighting,
            generationMethod: selectedShot.generationMethod,
          }
        : undefined

      const res = await fetch('/api/director/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, shotContext }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Chat failed')
      }

      const data = await res.json()

      set((state) => ({
        chatMessages: [
          ...state.chatMessages,
          { role: 'model', content: data.reply },
        ],
        chatLoading: false,
      }))
    } catch (err) {
      set({
        chatLoading: false,
        error: err instanceof Error ? err.message : 'Chat failed',
      })
    }
  },

  applySuggestedCamera: (config) => {
    const { selectedShotId } = get()
    if (!selectedShotId) return
    get().updateCamera(selectedShotId, config)
  },

  applySuggestedLighting: (config) => {
    const { selectedShotId } = get()
    if (!selectedShotId) return
    get().updateLighting(selectedShotId, config)
  },

  setImageProvider: (provider) => set({ imageProvider: provider }),

  reset: () =>
    set({
      sceneManifest: null,
      characterAssets: [],
      worldAssets: [],
      shots: [],
      videoClips: [],
      selectedSceneId: null,
      selectedShotId: null,
      chatMessages: [],
      chatLoading: false,
      generatingVideoShotId: null,
      generatingImageShotIds: new Set<string>(),
      imageProvider: 'gemini' as ImageProvider,
      error: null,
    }),

  generateShotImage: async (shotId: string) => {
    const { shots, sceneManifest, worldAssets, characterAssets, imageProvider } = get()
    const shot = shots.find((s) => s.shotId === shotId)
    if (!shot) return

    // Build a rich prompt from shot context
    const scene = sceneManifest?.scenes.find((s) => s.sceneId === shot.sceneId)
    const world = worldAssets.find(
      (w) => w.locationId === scene?.location || w.sceneId === shot.sceneId,
    )
    const charNames = shot.characters
      .map((id) => characterAssets.find((c) => c.characterId === id)?.name)
      .filter(Boolean)

    const parts = [
      shot.actionDescription,
      scene?.mood && `mood: ${scene.mood}`,
      scene?.timeOfDay && `${scene.timeOfDay}`,
      world?.name && `location: ${world.name}`,
      charNames.length > 0 && `characters: ${charNames.join(', ')}`,
      `${shot.shotType} shot`,
      'cinematic, film still, high quality',
    ].filter(Boolean)

    const prompt = parts.join(', ')

    set((state) => ({
      generatingImageShotIds: new Set(state.generatingImageShotIds).add(shotId),
      error: null,
    }))

    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio: '16:9', provider: imageProvider }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)

      set((state) => {
        const next = new Set(state.generatingImageShotIds)
        next.delete(shotId)
        return {
          generatingImageShotIds: next,
          shots: state.shots.map((s) =>
            s.shotId === shotId ? { ...s, referenceImageUrl: blobUrl } : s,
          ),
        }
      })

      // Fire-and-forget: persist to Storage + DB
      const projectId = useProjectStore.getState().projectId
      if (projectId) {
        persistShotImage(projectId, shotId, blobUrl)
      }
    } catch (err) {
      set((state) => {
        const next = new Set(state.generatingImageShotIds)
        next.delete(shotId)
        return {
          generatingImageShotIds: next,
          error: err instanceof Error ? err.message : 'Image generation failed',
        }
      })
    }
  },

  generateAllShotImages: async () => {
    const { shots, selectedSceneId } = get()
    const sceneShots = shots.filter(
      (s) => s.sceneId === selectedSceneId && !s.referenceImageUrl,
    )
    // Generate sequentially to avoid rate limits
    for (const shot of sceneShots) {
      await get().generateShotImage(shot.shotId)
    }
  },

  generateVideo: async (shotId: string) => {
    const shot = get().shots.find((s) => s.shotId === shotId)
    if (!shot) return

    set({ generatingVideoShotId: shotId, error: null })

    set((state) => ({
      videoClips: state.videoClips.map((c) =>
        c.shotId === shotId ? { ...c, status: 'generating' as const } : c,
      ),
    }))

    try {
      const res = await fetch('/api/director/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shotId,
          prompt: shot.actionDescription,
          camera: shot.camera,
          durationSeconds: shot.durationSeconds,
          aspectRatio: '16:9',
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Video generation failed')
      }

      const { taskId } = await res.json()

      const startTime = Date.now()
      const poll = async (): Promise<void> => {
        if (Date.now() - startTime > POLL_TIMEOUT_MS) {
          throw new Error('Video generation timed out (5 min)')
        }

        const pollRes = await fetch(
          `/api/director/generate-video/${taskId}`,
        )
        if (!pollRes.ok) {
          const errData = await pollRes.json()
          throw new Error(errData.error || 'Polling failed')
        }

        const pollData = await pollRes.json()

        if (pollData.status === 'completed') {
          set((state) => ({
            videoClips: state.videoClips.map((c) =>
              c.shotId === shotId
                ? { ...c, status: 'completed', url: pollData.url }
                : c,
            ),
            generatingVideoShotId: null,
          }))
          return
        }

        if (pollData.status === 'failed') {
          throw new Error(pollData.error || 'Video generation failed')
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        return poll()
      }

      await poll()
    } catch (err) {
      set((state) => ({
        videoClips: state.videoClips.map((c) =>
          c.shotId === shotId ? { ...c, status: 'failed' } : c,
        ),
        generatingVideoShotId: null,
        error: err instanceof Error ? err.message : 'Video generation failed',
      }))
    }
  },
}))
