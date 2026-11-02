'use client'

// Storyboard 보드의 "더한 샷 바로 그리기" 연결(2026-11-02 오너 "더할 때마다 자동") — 규칙과 장부는 lib/writer/added-shot-draws.
//   장부는 페이지에 하나다: 보드를 떠났다 같은 프로젝트로 돌아오면 아직 보내지 않은 샷을 이어 그리고, 그리는 중인 더한 샷도 잠그지 않는다.
//   writer-store 가 알리는 "샷을 더했다"(보드 [+ 샷 추가] · 채팅)를 장부에 넘기고, 보드가 열려 있는 동안 보드의 그리기를 맡긴다.
//   이 프로젝트의 도는 작업이 하나 끝나면 자리가 났을 수 있어 기다리던 샷을 다시 보고, 스토리가 생긴 더한 샷은 그때 그린다.
import { useEffect, useSyncExternalStore } from 'react'
import { createAddedShotDraws, type AddedDrawView, type DrawAddedShot } from '@/lib/writer/added-shot-draws'
import { onShotAdded } from '@/stores/writer-store'

const draws = createAddedShotDraws()
let listening = false
const NO_VIEWS: ReadonlyMap<string, AddedDrawView> = new Map()
const getServerViews = () => NO_VIEWS

export function useAddedShotDraws(input: {
  projectId: string | null
  /** 보드의 그리기 — 카드의 그리기와 같은 요청 길(바뀌면 다시 붙는다, useCallback 으로 고정할 것). */
  draw: DrawAddedShot
  /** 이 프로젝트의 도는 작업 id 를 정렬해 쉼표로 이은 글. */
  activeJobsKey: string
  shots: ReadonlyArray<{ shotId: string; actionDescription?: string | null }>
}): ReadonlyMap<string, AddedDrawView> {
  const { projectId, draw, activeJobsKey, shots } = input
  useEffect(() => {
    if (!listening) {
      listening = true
      onShotAdded((event) => draws.add(event))
    }
    if (!projectId) return
    return draws.attach(projectId, draw)
  }, [projectId, draw])
  useEffect(() => {
    if (projectId) draws.jobsChanged(projectId, activeJobsKey ? activeJobsKey.split(',') : [])
  }, [projectId, activeJobsKey])
  const views = useSyncExternalStore(draws.subscribe, () => draws.view(projectId), getServerViews)
  // 스토리가 없어 멈춘 더한 샷에 스토리가 생기면 그린다 — 원시 글로 묶어 바뀔 때만 본다.
  const storyKey = shots
    .filter((shot) => views.get(shot.shotId)?.phase === 'no_story' && !!shot.actionDescription?.trim())
    .map((shot) => `${shot.shotId}\u0000${shot.actionDescription}`)
    .join('\u0001')
  useEffect(() => {
    if (!projectId || !storyKey) return
    for (const pair of storyKey.split('\u0001')) {
      const [shotId, story] = pair.split('\u0000')
      draws.storyChanged(projectId, shotId, story)
    }
  }, [projectId, storyKey])
  return views
}
