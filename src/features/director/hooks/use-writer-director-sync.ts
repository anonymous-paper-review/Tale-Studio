'use client'

import { useEffect, useRef } from 'react'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import {
  useDirectorCanvasStore,
  nextScenePosition,
  nextShotPosition,
} from '@/stores/director-canvas-store'
import { isShotData } from '@/types/director-canvas'

/**
 * Writer → Director 초기 셋업 (스펙 director_canvas.md §8).
 *
 * Director 진입 시 Writer가 정의한 Scene/Shot 구조를 노드로 자동 생성하고,
 * 각 Shot의 프롬프트(actionDescription)와 등장 캐릭터/월드 에셋을 seed한다.
 * → 이렇게 채워진 characterAssetIds/worldAssetIds가 스토리보드 생성(I2I)의
 *   레퍼런스 이미지로 들어간다 (resolveShotAssetImages).
 *
 * MVP: 단방향 create-only 동기화. writerSceneId/writerShotId로 이미 존재하는
 * 노드는 건너뛰므로 진입할 때마다 안전하게 재실행 가능(중복 생성 X, 사용자 편집 보존).
 * 양방향 sync / 수정 전파 / cascade 삭제는 후속(§8 전체).
 */
export function useWriterDirectorSync() {
  const manifest = useWriterStore((s) => s.sceneManifest)
  const shots = useWriterStore((s) => s.shots)

  // 스토리보드 자동생성 마운트당 1회 가드 (재진입 중복 방지).
  const autoStoryboardTriggeredRef = useRef(false)
  // Step 2: DB hydrate 1회 가드 (projectId별). DB가 진실 — Scene/Shot seed 후 1회 적용.
  const hydratedProjectIdRef = useRef<string | null>(null)
  // asset-storage DB hydrate 1회 가드 (projectId별). Pass 2 에셋 바인딩이 이 결과에 의존.
  const assetHydratedProjectIdRef = useRef<string | null>(null)
  // writer-store DB 로드 1회 가드 (projectId별). director 직행/새로고침 대응.
  const writerLoadedProjectIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Writer 데이터(sceneManifest/shots)는 writer-store.loadProject()로만 채워지는데,
    // 이 메서드는 director 직행/새로고침 경로에서 호출되지 않는다. manifest가 비어있고
    // projectId가 있으면 여기서 1회 로드한다 — sceneManifest가 채워지면 selector 변경으로
    // 이 effect가 재실행되어 아래 Pass들이 진행된다.
    if (!manifest) {
      const pid = useProjectStore.getState().projectId
      if (pid && writerLoadedProjectIdRef.current !== pid) {
        writerLoadedProjectIdRef.current = pid
        void useWriterStore.getState().loadProject()
      }
      return
    }
    let cancelled = false

    void (async () => {
    // ── Pass 0: asset-storage DB hydrate (projectId별 1회) ─────────────
    // Director 직행/타브라우저/localStorage 비움에서도 캐릭터·월드 이미지가 채워지도록
    // DB(characters/locations)에서 직접 등록. Pass 2의 characterAssetIds/worldAssetIds
    // 바인딩이 이 등록 결과(assets.getCharacter/getWorld)에 의존하므로 먼저 await.
    const assetProjectId = useDirectorCanvasStore.getState().projectId
    if (assetProjectId && assetHydratedProjectIdRef.current !== assetProjectId) {
      assetHydratedProjectIdRef.current = assetProjectId
      await useAssetStorageStore.getState().hydrateFromDb(assetProjectId)
    }
    if (cancelled) return

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
    for (const shot of shots) {
      const cur = useDirectorCanvasStore.getState()
      const already = cur.nodes.some(
        (n) => n.data.kind === 'shot' && n.data.writerShotId === shot.shotId,
      )
      if (already) continue

      const parent = cur.nodes.find(
        (n) => n.data.kind === 'scene' && n.data.writerSceneId === shot.sceneId,
      )
      if (!parent) continue // 부모 Scene이 아직 없으면 skip (다음 진입에 재시도)

      const scene = manifest.scenes.find((s) => s.sceneId === shot.sceneId)

      // 등장 캐릭터: Shot.characters 우선, 없으면 Scene.charactersPresent.
      // 등록(asset-storage)된 것만 바인딩 — 어댑터가 id === characterId/locationId로 등록함.
      const sourceCharIds =
        shot.characters?.length ? shot.characters : scene?.charactersPresent ?? []
      const characterAssetIds = sourceCharIds.filter((cid) => assets.getCharacter(cid))
      const worldAssetIds =
        scene?.location && assets.getWorld(scene.location) ? [scene.location] : []

      const pos = nextShotPosition(cur, parent.id)
      const id = dir.addShotNode(parent.id, pos, shot.shotId)

      const patch: Record<string, unknown> = {
        writerShotId: shot.shotId,
        prompt: shot.actionDescription ?? '',
        characterAssetIds,
        worldAssetIds,
        camera: shot.camera,
        lighting: shot.lighting,
        // #4: Writer가 설계한 샷 길이를 노드로 전달 (영상 duration + Veo 트림의 근원)
        durationSeconds: shot.durationSeconds ?? 5,
      }
      if (shot.cameraPreset) patch.cameraPreset = shot.cameraPreset
      dir.updateNodeData<'shot'>(id, patch)
    }

    // ── Pass 2.5: DB → 캔버스 hydrate (DB가 진실, projectId별 1회) ──────
    // Scene/Shot seed 후 실행 — 부모 노드가 존재해야 Video 노드를 매달 수 있음.
    // canvas_position을 기존 노드에 적용 + 누락된 video_clips 행을 Video 노드로 생성.
    const projectId = useDirectorCanvasStore.getState().projectId
    if (projectId && hydratedProjectIdRef.current !== projectId) {
      hydratedProjectIdRef.current = projectId
      void useDirectorCanvasStore.getState().hydrateFromDb(projectId)
    }

    // ── Pass 3: 스토리보드 이미지 자동생성 (병렬3 + 1회 + null만 = 캐시) ──
    // 마운트당 1회. storyboardImage가 null인 shot만 생성(영속되므로 재진입 skip).
    // 각 generateStoryboardImage는 90s 타임아웃 + 1회 재시도 + 실패로그 보유.
    if (autoStoryboardTriggeredRef.current) return
    const after = useDirectorCanvasStore.getState()
    const shotNodes = after.nodes.filter((n) => isShotData(n.data))
    const anyGenerating = shotNodes.some(
      (n) =>
        isShotData(n.data) && n.data.storyboardImage?.status === 'generating',
    )
    const pendingShotIds = shotNodes
      .filter((n) => isShotData(n.data) && n.data.storyboardImage == null)
      .map((n) => n.id)
    if (anyGenerating || pendingShotIds.length === 0) return

    autoStoryboardTriggeredRef.current = true
    void (async () => {
      const CONCURRENCY = 3
      let cursor = 0
      const worker = async () => {
        while (cursor < pendingShotIds.length) {
          const i = cursor++
          await useDirectorCanvasStore
            .getState()
            .generateStoryboardImage(pendingShotIds[i]!)
        }
      }
      await Promise.all(
        Array.from(
          { length: Math.min(CONCURRENCY, pendingShotIds.length) },
          worker,
        ),
      )
    })()
    })()

    return () => {
      cancelled = true
    }
  }, [manifest, shots])
}
