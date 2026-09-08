'use client'

// 화면 공용 이름 로스터(#names-in-prose 2026-09-08) — writer 스토어의 sceneManifest(인물·장소)에서 id → 이름.
//   Director·Editor 처럼 writer 스토어를 아직 안 채운 화면에서는 한 번 loadProject 를 부른다(사물함 덕에 값싸다).
//   비어 있으면 치환이 no-op 이라 화면이 깨지지 않는다.
import { useEffect, useMemo } from 'react'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { manifestEntities } from '@/lib/writer/resolve-entity-names'

export function useEntityNames(): Array<{ id: string; name: string }> {
  const manifest = useWriterStore((s) => s.sceneManifest)
  const loadProject = useWriterStore((s) => s.loadProject)
  const projectId = useProjectStore((s) => s.projectId)
  useEffect(() => {
    if (!manifest && projectId) void loadProject()
  }, [manifest, projectId, loadProject])
  return useMemo(() => manifestEntities(manifest), [manifest])
}
