'use client'

// Director 노드 보기의 씬별 보기(오너 D8 2026-11-22) — 씬 단추 · 지금 보는 씬 · 그 씬의 캔버스를 한 곳에서 짓는다.
//   툴바(PaletteBar)와 캔버스(CanvasInner)가 같은 입력으로 같은 씬을 본다. 규칙은 scene-view.ts(약속: tests/director/scene-view.test.ts),
//   지금 보는 씬 기억은 stores/current-scene-store.ts(Camera 와 같이 쓴다).
import { useEffect, useMemo } from 'react'

import { orderedScenes, preferredSceneKey, sceneButtonItems, sceneCanvas } from '@/features/director/scene-view'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { useT } from '@/lib/i18n'
import { replaceSlugs, type SlugEntry } from '@/lib/script-lines'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { useCurrentScene, useCurrentSceneStore } from '@/stores/current-scene-store'
import { useDirectorCanvasStore } from '@/stores/director-store'

/**
 * 씬을 바꾼다 — 지금 보는 씬 기억(Director · Camera 같이 씀)에 쓰고, 고른 샷은 푼다(숨은 고름으로 단추가 말없이 그 샷을 세지 않게, 혼자 정한 것 h11).
 * 상태 고르기는 남긴다(씬을 넘어 같은 상태를 이어 본다).
 */
export function switchDirectorScene(projectId: string, sceneKey: string): void {
  useCurrentSceneStore.getState().setCurrentScene(projectId, sceneKey)
  useDirectorCanvasStore.getState().clearPickedShots()
}

export function useDirectorSceneView() {
  const t = useT()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const edges = useDirectorCanvasStore((s) => s.edges)
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const showUnusedAssets = useDirectorCanvasStore((s) => s.showUnusedAssets)
  const hint = useDirectorCanvasStore((s) => s.firstEntrySceneHint)
  const names = useBoardNodeNames()
  const characters = useAssetStorageStore((s) => s.characters)
  const worlds = useAssetStorageStore((s) => s.worlds)

  const scenes = useMemo(() => orderedScenes(nodes, names), [nodes, names])
  const keys = useMemo(() => scenes.map((entry) => entry.key), [scenes])
  const preferred = useMemo(() => preferredSceneKey(nodes, names, hint.shotIds), [nodes, names, hint.shotIds])
  const { sceneKey, remembered } = useCurrentScene(projectId, keys, preferred)
  const sceneNodeId = scenes.find((entry) => entry.key === sceneKey)?.nodeId ?? null

  // 처음 여는 프로젝트의 확인(만드는 중인 샷)을 마치면 보인 씬을 기억에 쓴다 — 그 뒤로는 새로 시작한 작업이 보던 씬을 바꾸지 않고(#c4), 다시 들어와도 그 씬이다(h3).
  const shouldRemember = hint.settled && !!sceneKey && !remembered
  useEffect(() => {
    if (shouldRemember && sceneKey) useCurrentSceneStore.getState().setCurrentScene(projectId, sceneKey)
  }, [shouldRemember, sceneKey, projectId])

  const view = useMemo(() => sceneCanvas(nodes, edges, sceneNodeId, { showUnusedAssets }), [nodes, edges, sceneNodeId, showUnusedAssets])

  // 씬 단추의 장소 이름(location_2 같은 슬러그 → 등록된 배경 이름, 스토리보드 격자와 같은 길 #e6).
  const roster = useMemo<SlugEntry[]>(
    () => [
      ...Object.values(characters).filter((c) => c.projectId === projectId).map((c) => ({ slug: c.id, name: c.name })),
      ...Object.values(worlds).filter((w) => w.projectId === projectId).map((w) => ({ slug: w.id, name: w.name })),
    ],
    [characters, worlds, projectId],
  )
  const items = useMemo(
    () => sceneButtonItems(scenes, nodes, names, { t, locationName: (slug) => replaceSlugs(slug, roster, '') }),
    [scenes, nodes, names, t, roster],
  )

  return { scenes, items, sceneKey, sceneNodeId, view, projectId }
}
