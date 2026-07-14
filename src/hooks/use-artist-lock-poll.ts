'use client'

import { useEffect } from 'react'
import { STAGES } from '@/lib/constants'
import { useProjectStore, type WriterStatusAssets } from '@/stores/project-store'
import type { StageId } from '@/types'

export const ARTIST_LOCK_POLL_MS = 5_000

const ARTIST_STAGE_INDEX = STAGES.findIndex((stage) => stage.id === 'artist')

function hasReachedArtist(stage: StageId): boolean {
  return STAGES.findIndex((item) => item.id === stage) >= ARTIST_STAGE_INDEX
}

export interface LockPollDecision {
  /** 스토어에 반영할 게이트 상태(디바운스 적용된 stalled 포함). */
  gate: WriterStatusAssets
  /** 폴링을 멈춰야 하는가(준비완료 / 실패 / 디바운스된 stalled). */
  stop: boolean
  /** 다음 tick 으로 넘길 연속 stalled 카운트. */
  stalledStreak: number
}

/**
 * assets 폴 1회 결과로부터 (게이트 반영값, 정지 여부, 다음 streak)을 결정하는 순수 함수.
 * - images_ready / failed_count>0 은 즉시 반영·정지(실패는 레이스가 아니므로 디바운스 없음).
 * - stalled 는 persist→first-submit 레이스(steps.ts v2Design)에서 오검될 수 있어
 *   2회 연속(streak>=2) 관측해야 latch — 그 전엔 아직 생성 중으로 취급해 폴링을 계속한다.
 */
export function decideLockPoll(assets: WriterStatusAssets, prevStreak: number): LockPollDecision {
  // 실패는 큐에 재시도 작업이 없을 때만 latch — retry 제출(queued>0) 중엔 in-flight 로 취급해 progress 를 계속 보인다.
  const failed = (assets.failed_count ?? 0) > 0 && (assets.queued_count ?? 0) === 0
  const stalledSignal = !!assets.stalled && !assets.images_ready && !failed
  const stalledStreak = stalledSignal ? prevStreak + 1 : 0
  const latchStalled = stalledSignal && stalledStreak >= 2
  return {
    gate: { ...assets, stalled: latchStalled },
    stop: assets.images_ready || latchStalled || failed,
    stalledStreak,
  }
}

/**
 * Artist 이미지-락 구간 폴러. reachedStage≥artist 이고 아직 준비/실패/stalled 아닐 때만
 * 5s 간격으로 /api/writer/status?assets=1 을 폴해 project-store 게이트를 갱신한다.
 * images_ready(언락) / 디바운스된 stalled / failed 에서 정지하고, 언마운트·프로젝트 전환 시 정리한다.
 * 재시도(retryArtistDrafts)로 stalled/failed 가 해제되면 imageLocked 가 다시 true 가 되어 폴링이 재개된다.
 */
export function useArtistLockPoll() {
  const projectId = useProjectStore((s) => s.projectId)
  const reachedStage = useProjectStore((s) => s.reachedStage)
  const artistImagesReady = useProjectStore((s) => s.artistImagesReady)
  const artistImagesFailed = useProjectStore((s) => s.artistImagesFailed)
  const artistImagesStalled = useProjectStore((s) => s.artistImagesStalled)
  const setArtistAssetGate = useProjectStore((s) => s.setArtistAssetGate)

  const imageLocked =
    !!projectId &&
    hasReachedArtist(reachedStage) &&
    !artistImagesReady &&
    !artistImagesFailed &&
    !artistImagesStalled

  useEffect(() => {
    if (!projectId || !imageLocked) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let stalledStreak = 0

    const schedule = () => {
      timer = setTimeout(tick, ARTIST_LOCK_POLL_MS)
    }

    const tick = async () => {
      if (cancelled) return

      try {
        const res = await fetch(`/api/writer/status/${projectId}?assets=1`)
        if (res.ok) {
          const status = (await res.json()) as { assets?: WriterStatusAssets }
          const assets = status.assets
          if (assets) {
            if (cancelled) return
            const decision = decideLockPoll(assets, stalledStreak)
            stalledStreak = decision.stalledStreak
            setArtistAssetGate(decision.gate)
            if (decision.stop) return
          }
        }
      } catch {
        // Transient status failures should not unlock or surface a false CTA; reset the streak and retry next tick.
        stalledStreak = 0
      }

      if (!cancelled) schedule()
    }

    schedule()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [imageLocked, projectId, setArtistAssetGate])
}
