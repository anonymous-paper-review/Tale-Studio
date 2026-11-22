import { useCallback } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { resolveCurrentScene } from '@/lib/current-scene'

// 지금 보는 씬(오너 D8 2026-11-22) — 씬 단추를 쓰는 화면(Director 노드 보기 · Camera)이 같이 읽고 쓰는 값 하나(리드 11/22 답 b).
//   프로젝트마다 하나, 이 브라우저에만 남는다(서버 · DB 에는 쓰지 않는다). 열쇠는 Writer 씬 id(sc_…) 같은 기기와 상관없는 값 —
//   캔버스 노드 id 는 기기마다 달라 쓰지 않는다. 약속: tests/director/current-scene.test.ts
export const CURRENT_SCENE_STORAGE_KEY = 'tale-current-scene'

interface CurrentSceneState {
  /** 프로젝트 id → 지금 보는 씬 열쇠. */
  sceneByProject: Record<string, string>
  setCurrentScene: (projectId: string, sceneKey: string) => void
}

/** 프로젝트를 열기 전(빈 id · 'default')에는 기억하지 않는다. */
function usableProject(projectId: string | null | undefined): projectId is string {
  return !!projectId && projectId !== 'default'
}

/** 브라우저에 남은 값 중 프로젝트 id → 씬 열쇠(글자)만 남긴다. 망가진 값이면 빈 기억. */
function cleanSceneMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [projectId, sceneKey] of Object.entries(value as Record<string, unknown>)) {
    if (usableProject(projectId) && typeof sceneKey === 'string' && sceneKey) out[projectId] = sceneKey
  }
  return out
}

export const useCurrentSceneStore = create<CurrentSceneState>()(
  persist(
    (set) => ({
      sceneByProject: {},
      setCurrentScene: (projectId, sceneKey) => {
        if (!usableProject(projectId) || !sceneKey) return
        set((s) => (s.sceneByProject[projectId] === sceneKey ? s : { sceneByProject: { ...s.sceneByProject, [projectId]: sceneKey } }))
      },
    }),
    {
      name: CURRENT_SCENE_STORAGE_KEY,
      // director-store 와 같은 저장소 지정 — 기본값(window.localStorage)은 서버 · 시험 환경에서 저장을 통째로 끈다.
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ sceneByProject: s.sceneByProject }),
      merge: (persisted, current) => ({
        ...current,
        sceneByProject: cleanSceneMap((persisted as { sceneByProject?: unknown } | null | undefined)?.sceneByProject),
      }),
    },
  ),
)

/**
 * 이 화면이 지금 보는 씬. keys = 씬 열쇠(씬 순서). preferred = 처음 여는 프로젝트에서 먼저 보여 줄 씬(없으면 첫 씬).
 * setSceneKey 는 기억에 쓴다 — 같은 프로젝트를 여는 다른 화면(Director · Camera)도 그 씬으로 연다.
 */
export function useCurrentScene(
  projectId: string | null | undefined,
  keys: readonly string[],
  preferred?: string | null,
): { sceneKey: string | null; setSceneKey: (sceneKey: string) => void } {
  const remembered = useCurrentSceneStore((s) => (usableProject(projectId) ? s.sceneByProject[projectId] : undefined))
  const setCurrentScene = useCurrentSceneStore((s) => s.setCurrentScene)
  const setSceneKey = useCallback(
    (sceneKey: string) => {
      if (usableProject(projectId)) setCurrentScene(projectId, sceneKey)
    },
    [projectId, setCurrentScene],
  )
  return { sceneKey: resolveCurrentScene(keys, remembered, preferred), setSceneKey }
}
