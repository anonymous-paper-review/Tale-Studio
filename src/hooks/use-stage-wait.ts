'use client'

// 단계 화면이 "아직 다 읽지 못했다"를 아는 훅(m1126 G1) — 화면마다 훅 한 줄과 기다리는 카드 한 줄만 더하게 사실을 여기서 모은다.
//   판정 규칙은 lib/stage-wait, 카드는 components/feedback/stage-wait. 처음 읽기는 화면이 이미 하는 읽기와 같은 store 함수를 부른다:
//   Artist 는 같은 프로젝트 읽기를 합치고(artist-store dedupe), 샷 목록은 30초 캐시라(lib/shots-cache) 한 번 더 부르면 씬 · 인물 · 배경 질의만 더 간다.
import { useEffect, useState } from 'react'
import { useFirstRead } from '@/hooks/use-first-read'
import { DIRECTOR_WAIT_MAX_MS, artistRead, directorRead, proseRead, stageWaiting, storyboardRead } from '@/lib/stage-wait'
import { useWriterGateChecked } from '@/lib/writer/gate-check'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { useArtistStore } from '@/stores/artist-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { isShotData } from '@/types/director'

const loadArtist = () => useArtistStore.getState().loadData()
const loadWriter = () => useWriterStore.getState().loadProject()

/** 프로젝트를 여는 중이거나 그 화면이 다 읽지 못했으면(read 거짓) 기다린다 — Writer 처럼 화면이 이미 "읽는 중"을 아는 곳. */
export function useStageWait(read: boolean): boolean {
  const projectId = useProjectStore((s) => s.projectId)
  const initLoading = useProjectStore((s) => s.initLoading)
  return stageWaiting({ projectId, initLoading, read })
}

/** Writer 산문 화면 — 산문 본문을 읽었고, "넘기기 전"으로 보이면 Writer 실행 확인까지 끝났을 때 다 읽은 것(lib/stage-wait proseRead). */
export function useProseWait(viewKind: string): boolean {
  const projectId = useProjectStore((s) => s.projectId)
  const gateChecked = useWriterGateChecked(projectId)
  return useStageWait(proseRead({ viewKind, gateChecked }))
}

/** Writer 진행 상태를 한 번이라도 읽었나 — 읽다 실패한 것도 읽은 것(계속 기다려 갇히지 않게, use-prose 와 같은 규칙). */
function useStatusRead(projectId: string | null): boolean {
  const { status, error } = useWriterStatus(projectId)
  return status !== null || error !== null
}

export function useArtistWait(): boolean {
  const projectId = useProjectStore((s) => s.projectId)
  const hasAssets = useArtistStore((s) => s.characterAssets.length > 0 || s.worldAssets.length > 0)
  const firstRead = useFirstRead(projectId, loadArtist, hasAssets)
  const statusRead = useStatusRead(projectId)
  return useStageWait(artistRead({ hasAssets, firstRead, statusRead }))
}

export function useStoryboardWait(): boolean {
  const projectId = useProjectStore((s) => s.projectId)
  const hasShots = useWriterStore((s) => s.shots.length > 0)
  const firstRead = useFirstRead(projectId, loadWriter, hasShots)
  const statusRead = useStatusRead(projectId)
  return useStageWait(storyboardRead({ hasShots, firstRead, statusRead }))
}

export function useDirectorWait(): boolean {
  const projectId = useProjectStore((s) => s.projectId)
  const manifestLoaded = useWriterStore((s) => s.sceneManifest !== null)
  const writerShots = useWriterStore((s) => s.shots.length)
  const canvasShots = useDirectorCanvasStore((s) => (s.projectId === projectId ? s.nodes.filter((n) => isShotData(n.data)).length : 0))
  const writerRead = useFirstRead(projectId, loadWriter, manifestLoaded)
  const timedOut = useWaitCap(projectId, DIRECTOR_WAIT_MAX_MS)
  return useStageWait(directorRead({ writerRead, writerShots, canvasShots, timedOut }))
}

/** 이 프로젝트로 화면을 연 뒤 ms 가 지났나 — 기다림의 상한. */
function useWaitCap(projectId: string | null, ms: number): boolean {
  const [doneFor, setDoneFor] = useState<string | null>(null)
  useEffect(() => {
    if (!projectId) return
    const timer = setTimeout(() => setDoneFor(projectId), ms)
    return () => clearTimeout(timer)
  }, [projectId, ms])
  return !!projectId && doneFor === projectId
}
