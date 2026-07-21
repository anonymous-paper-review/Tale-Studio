'use client'

import { useEffect, useRef, useState } from 'react'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import {
  useDirectorCanvasStore,
  nextScenePosition,
  nextShotPosition,
} from '@/stores/director-store'
import { isShotData, type ShotNodeData } from '@/types/director'
import {
  isDefaultCamera,
  isDefaultLighting,
} from '@/lib/writer/shot-config-from-design'
import type { CameraConfig, LightingConfig } from '@/types/shot'

type WriterPromptSource = {
  prompt?: string | null
  actionDescription?: string | null
}

export function writerDirectorPromptSource(shot: WriterPromptSource): string {
  return shot.prompt || shot.actionDescription || ''
}

function normalizePromptForMigration(value: string | null | undefined): string {
  return (value ?? '').trim()
}

export function buildWriterDirectorPromptPatch(
  data: Pick<ShotNodeData, 'prompt' | 'promptOverride' | 'promptMigratedV2'>,
  sourcePrompt: string,
): Partial<ShotNodeData> {
  const patch: Partial<ShotNodeData> = { derivedPrompt: sourcePrompt }

  if (data.promptMigratedV2) return patch

  if (
    data.promptOverride === undefined &&
    normalizePromptForMigration(data.prompt) !== normalizePromptForMigration(sourcePrompt)
  ) {
    patch.promptOverride = data.prompt ?? ''
  }
  patch.promptMigratedV2 = true

  return patch
}
let historySuppressionRuns = 0

function suppressDirectorHistory() {
  historySuppressionRuns += 1
  useDirectorCanvasStore.setState({ _historySuppressed: true })
  let released = false
  return () => {
    if (released) return
    released = true
    historySuppressionRuns = Math.max(0, historySuppressionRuns - 1)
    if (historySuppressionRuns === 0) {
      useDirectorCanvasStore.setState({ _historySuppressed: false })
    }
  }
}

async function retrySyncOperation(operation: () => Promise<void>, label: string) {
  let error: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await operation()
      return
    } catch (caught) {
      error = caught
      console.error(`[director] ${label} failed (attempt ${attempt + 1}/2)`, caught)
    }
  }
  throw error
}
// Concurrent Director mounts share only pending work. Successful hydration belongs to
// each hook instance so a later unmount/remount reads the current canonical state.
const videoTakeHydrationPromises = new Map<string, Promise<void>>()

function hydrateVideoTakes(projectId: string): Promise<void> {
  const inFlight = videoTakeHydrationPromises.get(projectId)
  if (inFlight) return inFlight

  const promise = retrySyncOperation(
    () => useDirectorCanvasStore.getState().hydrateFromDb(projectId),
    `failed to hydrate video takes for ${projectId}`,
  )
  videoTakeHydrationPromises.set(projectId, promise)
  void promise.then(
    () => undefined,
    () => undefined,
  ).finally(() => {
    if (videoTakeHydrationPromises.get(projectId) === promise) {
      videoTakeHydrationPromises.delete(projectId)
    }
  })
  return promise
}

/**
 * Writer → Director 초기 셋업.
 *
 * Director 진입 시 Writer가 정의한 Scene/Shot 구조를 노드로 자동 생성하고,
 * 각 Shot의 프롬프트(actionDescription)와 등장 캐릭터/월드 에셋을 seed한다.
 * → 이렇게 채워진 characterAssetIds/worldAssetIds가 스토리보드 생성(I2I)의
 *   레퍼런스 이미지로 들어간다 (resolveShotAssetImages).
 *
 * MVP: 단방향 sync. writerSceneId/writerShotId 중복 생성은 막고, 기존 Shot의
 * derivedPrompt/에셋 바인딩은 refresh하되 사용자 promptOverride는 보존한다.
 * 양방향 sync / cascade 삭제는 후속(§8 전체).
 */
export function useWriterDirectorSync() {
  const manifest = useWriterStore((s) => s.sceneManifest)
  const shots = useWriterStore((s) => s.shots)
  // projectId 구독 — director 직행/새로고침/북마크 진입에서 init이 늦게 projectId를
  // 채우는 경우에도 이 effect가 재실행되어 writer 데이터를 로드하도록 deps에 포함한다.
  const projectId = useProjectStore((s) => s.projectId)

  // Pass 2.5 hydration is shared across consumers and marked complete only after
  // success, preventing duplicate calls and stale "hydrated" state after failures.
  const [retryEpoch, setRetryEpoch] = useState(0)
  // Video-take hydration is cached only for this mounted Director entry. The
  // module-level map above still deduplicates concurrent mounts.
  const videoTakeHydratedProjectIdRef = useRef<string | null>(null)
  const retryTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const retryAttemptsRef = useRef(new Map<string, number>())
  // asset-storage DB hydrate is committed only after success so a transient failure retries.
  const assetHydratedProjectIdRef = useRef<string | null>(null)
  const assetHydratePromiseRef = useRef<{ projectId: string; promise: Promise<void> } | null>(null)
  // writer-store DB load is committed only after success so a transient failure retries.
  const writerLoadedProjectIdRef = useRef<string | null>(null)
  const writerLoadPromiseRef = useRef<{ projectId: string; promise: Promise<void> } | null>(null)
  // shotDesign 파생 camera/lighting 1회 가드 (projectId별). Option B: Director 진입 시 자동 채움.
  const shotConfigsRef = useRef<{
    projectId: string
    configs: Record<string, { camera_config: CameraConfig; lighting_config: LightingConfig }>
  } | null>(null)
  const shotConfigPromiseRef = useRef<{ projectId: string; promise: Promise<void> } | null>(null)
  const scheduleRetry = (retryProjectId: string, label: string) => {
    if (useProjectStore.getState().projectId !== retryProjectId) return
    if (retryTimersRef.current.has(retryProjectId)) return
    const attempts = retryAttemptsRef.current.get(retryProjectId) ?? 0
    if (attempts >= 3) {
      console.error(`[director] ${label} retry budget exhausted for ${retryProjectId}`)
      return
    }
    retryAttemptsRef.current.set(retryProjectId, attempts + 1)
    const timer = setTimeout(() => {
      retryTimersRef.current.delete(retryProjectId)
      if (useProjectStore.getState().projectId === retryProjectId) {
        setRetryEpoch((epoch) => epoch + 1)
      }
    }, 1000 * (attempts + 1))
    retryTimersRef.current.set(retryProjectId, timer)
  }

  useEffect(() => () => {
    for (const timer of retryTimersRef.current.values()) clearTimeout(timer)
    retryTimersRef.current.clear()
  }, [projectId])

  useEffect(() => {
    // Writer 데이터(sceneManifest/shots)는 writer-store.loadProject()로만 채워지는데,
    // 이 메서드는 director 직행/새로고침 경로에서 호출되지 않는다. manifest가 비어있고
    // projectId가 있으면 여기서 1회 로드한다 — sceneManifest가 채워지면 selector 변경으로
    // 이 effect가 재실행되어 아래 Pass들이 진행된다.
    if (!manifest) {
      const pid = useProjectStore.getState().projectId
      if (pid && writerLoadedProjectIdRef.current !== pid && writerLoadPromiseRef.current?.projectId !== pid) {
        const promise = retrySyncOperation(
          () => useWriterStore.getState().loadProject(),
          `failed to load Writer data for ${pid}`,
        )
        writerLoadPromiseRef.current = { projectId: pid, promise }
        void promise.then(
          () => {
            if (writerLoadPromiseRef.current?.promise === promise) {
              writerLoadedProjectIdRef.current = pid
              writerLoadPromiseRef.current = null
              retryAttemptsRef.current.delete(pid)
            }
          },
          (error) => {
            if (writerLoadPromiseRef.current?.promise === promise) {
              writerLoadPromiseRef.current = null
            }
            console.error(`[director] Writer data remains unavailable for ${pid}; sync will retry`, error)
            scheduleRetry(pid, 'Writer data load')
          },
        )
      }
      return
    }
    let cancelled = false

    // sync 셋업(addSceneNode/addShotNode 등)은 undo 히스토리에서 제외 (시스템 변경).
    const releaseHistorySuppression = suppressDirectorHistory()
    void (async () => {
    // ── Pass 0: asset-storage DB hydrate (projectId별 1회) ─────────────
    // Director 직행/타브라우저/localStorage 비움에서도 캐릭터·월드 이미지가 채워지도록
    // DB(characters/locations)에서 직접 등록. Pass 2의 characterAssetIds/worldAssetIds
    // 바인딩이 이 등록 결과(assets.getCharacter/getWorld)에 의존하므로 먼저 await.
    const assetProjectId = useDirectorCanvasStore.getState().projectId
    if (assetProjectId && assetHydratedProjectIdRef.current !== assetProjectId) {
      if (assetHydratePromiseRef.current?.projectId !== assetProjectId) {
        const promise = retrySyncOperation(
          () => useAssetStorageStore.getState().hydrateFromDb(assetProjectId),
          `failed to hydrate Director assets for ${assetProjectId}`,
        )
        assetHydratePromiseRef.current = { projectId: assetProjectId, promise }
      }
      const pending = assetHydratePromiseRef.current!
      try {
        await pending.promise
        if (assetHydratePromiseRef.current?.promise === pending.promise) {
          assetHydratedProjectIdRef.current = assetProjectId
          assetHydratePromiseRef.current = null
          retryAttemptsRef.current.delete(assetProjectId)
        }
      } catch (error) {
        if (assetHydratePromiseRef.current?.promise === pending.promise) {
          assetHydratePromiseRef.current = null
        }
        console.error(`[director] assets remain unavailable for ${assetProjectId}; sync will retry`, error)
        scheduleRetry(assetProjectId, 'Director asset hydration')
        return
      }
    }
    if (cancelled) return

    // ── Pass 0.5: shotDesign 파생 camera/lighting (projectId별 1회, Option B) ──
    // persist 가 camera/lighting 을 DEFAULT 로 평탄화하므로, Director 진입 시 writer_runs.state
    // ->shotDesign 에서 6축 config 를 복원해 둔다. 적용은 Pass 2에서 "DB가 DEFAULT일 때만".
    const cfgProjectId = useDirectorCanvasStore.getState().projectId
    if (cfgProjectId && shotConfigsRef.current?.projectId !== cfgProjectId) {
      if (shotConfigPromiseRef.current?.projectId !== cfgProjectId) {
        let configs: Record<string, { camera_config: CameraConfig; lighting_config: LightingConfig }> = {}
        const promise = retrySyncOperation(async () => {
          const res = await fetch('/api/writer/shot-configs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: cfgProjectId }),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const json = await res.json()
          if (!json?.configs || typeof json.configs !== 'object' || Array.isArray(json.configs)) {
            throw new Error('Invalid shot config response')
          }
          configs = json.configs
        }, `failed to load shot configs for ${cfgProjectId}`).then(() => {
          if (shotConfigPromiseRef.current?.promise === promise) {
            shotConfigsRef.current = { projectId: cfgProjectId, configs }
            shotConfigPromiseRef.current = null
            retryAttemptsRef.current.delete(cfgProjectId)
          }
        })
        shotConfigPromiseRef.current = { projectId: cfgProjectId, promise }
      }
      const pending = shotConfigPromiseRef.current!
      try {
        await pending.promise
      } catch (error) {
        if (shotConfigPromiseRef.current?.promise === pending.promise) {
          shotConfigPromiseRef.current = null
        }
        console.error(`[director] shot configs remain unavailable for ${cfgProjectId}; sync will retry`, error)
        scheduleRetry(cfgProjectId, 'shot config load')
        return
      }
    }
    if (cancelled) return
    const shotConfigs = shotConfigsRef.current?.configs ?? {}

    const dir = useDirectorCanvasStore.getState()
    const assets = useAssetStorageStore.getState()

    // ── Pass 1: Scene 노드 ─────────────────────────────────────────────
    for (const scene of manifest.scenes) {
      const already = useDirectorCanvasStore
        .getState()
        .nodes.some(
          (n) => n.data.kind === 'scene' && n.data.writerSceneId === scene.sceneId,
        )
      if (already) continue

      const pos = nextScenePosition(useDirectorCanvasStore.getState())
      const id = dir.addSceneNode(pos, scene.sceneId)
      dir.updateNodeData<'scene'>(id, {
        writerSceneId: scene.sceneId,
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        mood: scene.mood,
        description: scene.narrativeSummary,
      })
    }

    // ── Pass 2: Shot 노드 (프롬프트 + 에셋 바인딩) ──────────────────────
    // 등장 캐릭터: Shot.characters 우선, 없으면 Scene.charactersPresent.
    // 등록(asset-storage, Pass 0 hydrate)된 것만 바인딩 — 어댑터가 id === characterId/locationId로 등록.
    const resolveAssetIds = (shot: (typeof shots)[number]) => {
      const scene = manifest.scenes.find((s) => s.sceneId === shot.sceneId)
      const sourceCharIds =
        shot.characters?.length ? shot.characters : scene?.charactersPresent ?? []
      return {
        characterAssetIds: sourceCharIds.filter((cid) => assets.getCharacter(cid)),
        worldAssetIds:
          scene?.location && assets.getWorld(scene.location) ? [scene.location] : [],
      }
    }

    for (const shot of shots) {
      const sourcePrompt = writerDirectorPromptSource(shot)
      const cur = useDirectorCanvasStore.getState()
      const existing = cur.nodes.find(
        (n) => isShotData(n.data) && n.data.writerShotId === shot.shotId,
      )
      if (existing) {
        // 이미 있는 shot은 사용자 promptOverride를 보존하되 sync 파생 필드는 refresh한다.
        // derivedPrompt는 writer prompt/actionDescription에서 매번 갱신하고, legacy prompt는
        // promptMigratedV2가 없을 때 1회만 derivedPrompt 또는 promptOverride로 이관한다.
        if (isShotData(existing.data)) {
          const { characterAssetIds, worldAssetIds } = resolveAssetIds(shot)
          const d = existing.data
          const patch: Partial<ShotNodeData> = {}
          Object.assign(patch, buildWriterDirectorPromptPatch(d, sourcePrompt))
          if (
            characterAssetIds.join(',') !== d.characterAssetIds.join(',') ||
            worldAssetIds.join(',') !== d.worldAssetIds.join(',')
          ) {
            patch.characterAssetIds = characterAssetIds
            patch.worldAssetIds = worldAssetIds
          }
          // camera/lighting 빈칸(DEFAULT) 자동 채움 — shotDesign 파생값. 사용자 편집(non-default) 보존.
          const derived = shotConfigs[shot.shotId]
          if (derived) {
            if (isDefaultCamera(d.camera) && !isDefaultCamera(derived.camera_config))
              patch.camera = derived.camera_config
            if (isDefaultLighting(d.lighting) && !isDefaultLighting(derived.lighting_config))
              patch.lighting = derived.lighting_config
          }
          if (Object.keys(patch).length) dir.updateNodeData<'shot'>(existing.id, patch)
        }
        continue
      }

      const parent = cur.nodes.find(
        (n) => n.data.kind === 'scene' && n.data.writerSceneId === shot.sceneId,
      )
      if (!parent) continue // 부모 Scene이 아직 없으면 skip (다음 진입에 재시도)

      const { characterAssetIds, worldAssetIds } = resolveAssetIds(shot)

      const pos = nextShotPosition(cur, parent.id)
      const id = dir.addShotNode(parent.id, pos, shot.shotId)

      const patch: Partial<ShotNodeData> = {
        writerShotId: shot.shotId,
        // rich 생성 프롬프트 우선(구도·의상·인물 명시) → 없으면 actionDescription 폴백.
        derivedPrompt: sourcePrompt,
        promptMigratedV2: true,
        characterAssetIds,
        worldAssetIds,
        camera:
          shotConfigs[shot.shotId] && isDefaultCamera(shot.camera)
            ? shotConfigs[shot.shotId]!.camera_config
            : shot.camera,
        lighting:
          shotConfigs[shot.shotId] && isDefaultLighting(shot.lighting)
            ? shotConfigs[shot.shotId]!.lighting_config
            : shot.lighting,
        // #4: Writer가 설계한 샷 길이를 노드로 전달 (영상 duration + Veo 트림의 근원)
        durationSeconds: shot.durationSeconds ?? 5,
      }
      if (shot.cameraPreset) patch.cameraPreset = shot.cameraPreset
      dir.updateNodeData<'shot'>(id, patch)
    }

    // ── Pass 2.5: DB → 캔버스 hydrate (DB가 진실, projectId별 1회) ──────
    // Scene/Shot seed 후 실행 — 부모 노드가 존재해야 Video 노드를 매달 수 있음.
    // canvas_position을 기존 노드에 적용 + 누락된 video_clips 행을 Video 노드로 생성.
    // 반드시 완료까지 await — Pass 3이 hydrate 전 상태(storyboardImage=null)를 보고
    // 완료된 샷 전체를 재생성하던 레이스의 본질 수정. effect가 재실행돼도 같은
    // promise를 기다리므로 "호출 1회 + 진행 중 통과" 구멍이 없다.
    const projectId = useDirectorCanvasStore.getState().projectId
    if (projectId && videoTakeHydratedProjectIdRef.current !== projectId) {
      try {
        await hydrateVideoTakes(projectId)
        if (!cancelled) {
          videoTakeHydratedProjectIdRef.current = projectId
          retryAttemptsRef.current.delete(projectId)
        }
      } catch (error) {
        console.error(`[director] video takes remain unavailable for ${projectId}; sync will retry`, error)
        scheduleRetry(projectId, 'video take hydration')
        return
      }
      if (cancelled) return
    }

    // ── Pass 2.6: Artist 에셋 노드 재생성 (파생, 멱등) ──────────────────
    // hydrate로 shot 위치가 확정된 뒤 실행 — Scene 우측에 character/world 에셋을
    // 세로 컬럼으로 표시하고 참조 shot에 references 엣지를 잇는다. asset-storage가
    // 진실(Pass 0에서 hydrate 완료)이므로 매번 재생성해도 멱등. DB 미영속(persist 제외).
    useDirectorCanvasStore.getState().rebuildAssetNodes()
    if (cancelled) return

    // ── Pass 3: 스토리보드 자동생성 — 비활성화 (Higgsfield 노드 뷰 전환) ──
    // 목각(roughStoryboard)이 노드 뷰의 초기 상태로 남아야 하므로, 진입 시
    // storyboardImage(실사)를 자동 생성하지 않는다. 실사화는 사용자가 진행 버튼
    // (advanceShot → generateStoryboardImage)으로만 트리거한다. 재진입 시
    // 완료된 storyboardImage는 Pass 2.5 hydrate로 그대로 복원된다(멱등 보존).
    })().finally(() => {
      releaseHistorySuppression()
    })

    return () => {
      cancelled = true
    }
  }, [manifest, shots, projectId, retryEpoch])
}
