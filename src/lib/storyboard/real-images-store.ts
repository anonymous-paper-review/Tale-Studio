'use client'

// Storyboard 실사 그림 읽기(오너 2026-11-26 m1126 S2) — Writer 샷 모양(types/shot)에는 실사 칸이 없어, 같은 shots 사물함(lib/shots-cache, select *)의
//   storyboard_image 를 샷 id 로 들고 있는다. writer-store 는 건드리지 않는다(콘티 · Storyboard 가 같이 쓰는 샷 진실).
//   다시 읽는 때: 화면을 열 때 · 실사 작업이 큐에서 빠질 때(보드가 부른다) · 지난 판 [채택] 뒤(m-history) — 끝난 순간의 사물함은 옛 행이라 fresh 로 부른다.
//   약속: tests/writer/real-images.test.ts
import { create } from 'zustand'
import { invalidateShots, loadShots } from '@/lib/shots-cache'

interface RealImagesState {
  /** 지금 들고 있는 그림의 프로젝트. */
  projectId: string | null
  /** 샷 id → shots.storyboard_image(모양 그대로 — 카드 판정은 lib/storyboard/real-board). */
  images: Readonly<Record<string, unknown>>
  /** 이 프로젝트를 한 번이라도 다 읽었는가. */
  loaded: boolean
  /** 마지막 읽기가 실패했다 — 실사가 없는 것과 가른다(넘기기 창이 "최대 N개"로 보인다). 다음에 읽으면 다시 판단한다. */
  failed: boolean
  /** 읽는다. fresh = 사물함을 낡음으로 표시하고 다시 받는다(작업이 막 끝났을 때). 프로젝트가 바뀌면 앞 그림을 먼저 비운다. */
  load: (projectId: string, opts?: { fresh?: boolean }) => Promise<void>
}

/** 읽기 차례 — 겹친 읽기는 마지막 것만 칠한다(앞 프로젝트의 늦은 답 · 옛 답이 새 답을 덮지 않게). */
let loadTurn = 0

export const useStoryboardRealImages = create<RealImagesState>((set, get) => ({
  projectId: null,
  images: {},
  loaded: false,
  failed: false,
  load: async (projectId, opts) => {
    if (get().projectId !== projectId) set({ projectId, images: {}, loaded: false, failed: false })
    const turn = ++loadTurn
    try {
      if (opts?.fresh) await invalidateShots(projectId)
      const rows = await loadShots(projectId)
      if (turn !== loadTurn || get().projectId !== projectId) return
      set({ images: Object.fromEntries(rows.map((row) => [row.shot_id, row.storyboard_image ?? null])), loaded: true, failed: false })
    } catch (error) {
      // 읽기 실패는 던지지 않는다(화면 효과가 부르고 기다리지 않는다) — 표시만 하고 다음 읽기에 맡긴다.
      console.warn('[storyboard] real images read failed:', error instanceof Error ? error.message : error)
      if (turn === loadTurn && get().projectId === projectId) set({ failed: true })
    }
  },
}))
