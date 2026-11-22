'use client'

// Camera 씬 단추 · 지금 보는 씬(오너 2026-11-22 D2~D5 · D8) — Director 노드 보기와 같은 기억(stores/current-scene-store)을 같이 쓴다(리드 11/22 답 b · g).
//   열 씬: 기억한 씬 > 처음 여는 프로젝트에서 만드는 중인 샷의 씬 > 첫 씬. 확인을 마치면 보인 씬을 기억에 쓴다(Director 와 같은 규칙).
//   씬 단추 항목(이름 · 마우스 올림 한 줄 · @이름)은 Director 와 같은 sceneButtonItems. 약속: tests/camera/scene.test.ts
import { useEffect, useMemo } from 'react'
import { useT } from '@/lib/i18n'
import { replaceSlugs, type SlugEntry } from '@/lib/script-lines'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { useCurrentScene, useCurrentSceneStore } from '@/stores/current-scene-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { orderedScenes, preferredSceneKey, sceneButtonItems } from '@/features/director/scene-view'
import { cameraScene } from './scene'

export function useCameraScene() {
  const t = useT()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const hint = useDirectorCanvasStore((s) => s.firstEntrySceneHint)
  const names = useBoardNodeNames()
  const characters = useAssetStorageStore((s) => s.characters)
  const worlds = useAssetStorageStore((s) => s.worlds)

  const scenes = useMemo(() => orderedScenes(nodes, names), [nodes, names])
  const keys = useMemo(() => scenes.map((entry) => entry.key), [scenes])
  const preferred = useMemo(() => preferredSceneKey(nodes, names, hint.shotIds), [nodes, names, hint.shotIds])
  const { sceneKey, remembered } = useCurrentScene(projectId, keys, preferred)

  // 처음 여는 프로젝트의 확인(만드는 중인 샷)을 마치면 보인 씬을 기억에 쓴다 — 그 뒤로는 새로 시작한 작업이 보던 씬을 바꾸지 않는다.
  const shouldRemember = hint.settled && !!sceneKey && !remembered
  useEffect(() => {
    if (shouldRemember && sceneKey && projectId) useCurrentSceneStore.getState().setCurrentScene(projectId, sceneKey)
  }, [shouldRemember, sceneKey, projectId])

  // 장소 이름(location_2 같은 슬러그 → 등록된 배경 이름) — Director 씬 단추와 같은 길.
  const roster = useMemo<SlugEntry[]>(
    () => [
      ...Object.values(characters).filter((c) => c.projectId === projectId).map((c) => ({ slug: c.id, name: c.name })),
      ...Object.values(worlds).filter((w) => w.projectId === projectId).map((w) => ({ slug: w.id, name: w.name })),
    ],
    [characters, worlds, projectId],
  )
  const locationName = useMemo(() => (slug: string) => replaceSlugs(slug, roster, ''), [roster])
  const items = useMemo(() => sceneButtonItems(scenes, nodes, names, { t, locationName }), [scenes, nodes, names, t, locationName])
  const scene = useMemo(() => cameraScene(nodes, names, sceneKey), [nodes, names, sceneKey])
  const place = scene?.location ? locationName(scene.location).trim() : ''

  return { items, sceneKey, scene, place, projectId }
}
