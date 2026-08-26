'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { STAGES } from '@/lib/constants'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
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

  // 프로젝트당 1회만 알린다 - 폴러가 재개돼도 같은 상태로 반복해서 떠들지 않게.
  const notifiedRef = useRef(false)
  useEffect(() => {
    notifiedRef.current = false
  }, [projectId])

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
            // 실패·지연은 사이드바 뱃지로만 알리면 조용하다 (#stale-gate 2026-08-26, 오너 지적:
            //   "실패는 실패라고 떠야 하는 거 아님?"). 판정이 서는 순간 한 번만 토스트로 말한다.
            //   같은 id 로 중복 억제 - 폴러가 여러 번 서도 화면이 덮이지 않는다.
            if (decision.stop && !notifiedRef.current) {
              const locale = useLocaleStore.getState().locale
              if (decision.gate.failed_count && decision.gate.failed_count > 0) {
                notifiedRef.current = true
                toast.error(
                  translate(locale, 'Some image generations failed. Click the Artist tab to retry.'),
                  { id: 'artist-gate-state' },
                )
              } else if (decision.gate.stalled) {
                notifiedRef.current = true
                toast.warning(
                  translate(locale, 'Image generation is taking longer than usual. Click the Artist tab to retry.'),
                  { id: 'artist-gate-state' },
                )
              }
            }
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

    // Refresh must not be the only cure (#stale-gate 2026-08-26).
    // Background tabs get their timers throttled to minutes, so the tick that would have
    // seen "ready" may never land while the user is away - the gate then looks frozen and
    // only F5 fixes it. Re-poll the moment the tab is visible/focused again.
    // Owner-reported symptom: Writer stuck at 93% + Artist showing "failed" while the
    // server had already completed (14/14, failed_count 0).
    const onWake = () => {
      if (cancelled) return
      if (document.visibilityState !== 'visible') return
      if (timer) clearTimeout(timer)
      void tick()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [imageLocked, projectId, setArtistAssetGate])
}
