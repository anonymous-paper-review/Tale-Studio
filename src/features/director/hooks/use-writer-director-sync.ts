'use client'

import { useEffect, useRef } from 'react'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import {
  useDirectorCanvasStore,
  nextScenePosition,
  nextShotPosition,
} from '@/stores/director-store'
import { isShotData } from '@/types/director'

/**
 * Writer → Director 초기 셋업 (스펙 director.md §8).
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
  // Step 2: DB hydrate 가드 (projectId별 1회 호출) — promise를 보관해 매 실행이 완료를 기다린다.
  // Pass 3의 storyboardImage null 판정이 DB 복원 전 상태를 읽으면 완료된 샷을 전부
  // 재생성하므로 (재생성 폭주 버그), 호출 여부가 아니라 완료 여부가 동기화 기준이어야 한다.
  const hydratePromiseRef = useRef<{ projectId: string; promise: Promise<void> } | null>(null)
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
      const cur = useDirectorCanvasStore.getState()
      const existing = cur.nodes.find(
        (n) => isShotData(n.data) && n.data.writerShotId === shot.shotId,
      )
      if (existing) {
        // 이미 있는 shot은 사용자 편집(prompt/카메라 등)을 보존하되, 파생 필드인
        // 에셋 바인딩만 재계산해 갱신한다. persist 캐시에 빈 바인딩으로 굳은 노드가
        // asset-storage hydrate 후에도 안 채워지던 문제 수정 — 값이 바뀔 때만 set(stale 최소).
        if (isShotData(existing.data)) {
          const { characterAssetIds, worldAssetIds } = resolveAssetIds(shot)
          const d = existing.data
          const changed =
            characterAssetIds.join(',') !== d.characterAssetIds.join(',') ||
            worldAssetIds.join(',') !== d.worldAssetIds.join(',')
          if (changed) {
            dir.updateNodeData<'shot'>(existing.id, { characterAssetIds, worldAssetIds })
          }
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
    // 반드시 완료까지 await — Pass 3이 hydrate 전 상태(storyboardImage=null)를 보고
    // 완료된 샷 전체를 재생성하던 레이스의 본질 수정. effect가 재실행돼도 같은
    // promise를 기다리므로 "호출 1회 + 진행 중 통과" 구멍이 없다.
    const projectId = useDirectorCanvasStore.getState().projectId
    if (projectId) {
      if (hydratePromiseRef.current?.projectId !== projectId) {
        hydratePromiseRef.current = {
          projectId,
          promise: useDirectorCanvasStore.getState().hydrateFromDb(projectId),
        }
      }
      await hydratePromiseRef.current.promise
      if (cancelled) return
    }

    // ── Pass 2.6: Artist 에셋 노드 재생성 (파생, 멱등) ──────────────────
    // hydrate로 shot 위치가 확정된 뒤 실행 — Scene 우측에 character/world 에셋을
    // 세로 컬럼으로 표시하고 참조 shot에 references 엣지를 잇는다. asset-storage가
    // 진실(Pass 0에서 hydrate 완료)이므로 매번 재생성해도 멱등. DB 미영속(persist 제외).
    useDirectorCanvasStore.getState().rebuildAssetNodes()
    if (cancelled) return

    // ── Pass 3: 스토리보드 이미지 자동생성 (병렬2 + 1회 + null만 = 캐시) ──
    // 마운트당 1회. storyboardImage가 null인 shot만 생성 — Pass 2.5에서 DB hydrate를
    // 기다린 후이므로 DB에 완료본이 있는 샷은 여기서 null이 아니다 (재진입 skip).
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
      const CONCURRENCY = 2
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
