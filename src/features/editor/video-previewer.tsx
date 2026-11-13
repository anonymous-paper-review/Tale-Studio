'use client'

import { AlertCircle, Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { dissolveOpacityAt } from '@/lib/editor/transition'
import { useEntityNames } from '@/lib/writer/use-entity-names'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { useRef, useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { TitleCardStage } from '@/features/editor/title-card-stage'
import { SubtitleLayer } from '@/features/editor/subtitle-layer'
import { resolveSubtitle } from '@/lib/editor/subtitle'
import { useEditorStore, selectTimelineLayout, isTitleCardShotId, timelineEnd } from '@/stores/editor-store'
import { cachedVideoUrl } from '@/features/editor/video-prefetch'
import { previewPane } from '@/features/editor/editor-labels'
import { useT } from '@/lib/i18n'

function formatTime(sec: number) {
  const t = Math.max(0, Number.isFinite(sec) ? sec : 0)
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Editor 프리뷰. 두 모드:
 *   1) 타임라인 모드(default): currentTime 아래 클립을 trim/speed 반영해 일렬 재생.
 *      영상이 없는 구간(영상 끝 이후 등)에선 클립을 잡지 않고 검은 화면 (요청 1).
 *   2) 소스 미리보기 모드(previewSourceShotId): 단일 클립을 원본 그대로 loop 재생.
 *   영상을 불러오지 못하면(404 · 막힘 · 끊김) 검은 화면 대신 그 컷 자리에 안내를 보이고 그 클립을 "불러오지 못함"으로 남긴다
 *   (QA 2026-11-03 밤 — 검은 채 아무 말이 없어 아직 불러오는 것처럼 보였다). 판단은 editor-labels.previewPane.
 */
export function VideoPreviewer() {
  const entityNames = useEntityNames()
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const dissolveRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef<string | null>(null)

  const [activeShotId, setActiveShotId] = useState<string | null>(null)
  const [actualDuration, setActualDuration] = useState<number | null>(null)
  // 타이틀 카드 인라인 편집(#owner-title-card) — 프리뷰 더블클릭으로 열림. 저장은 blur/닫기 시.
  const [editingTitleCard, setEditingTitleCard] = useState(false)

  const shots = useEditorStore((s) => s.shots)
  const videoClips = useEditorStore((s) => s.videoClips)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const previewSourceShotId = useEditorStore((s) => s.previewSourceShotId)
  const masterVolume = useEditorStore((s) => s.masterVolume)
  const hasClips = useEditorStore((s) => Object.values(s.clipOrder).some((ids) => ids.length > 0))
  const togglePlay = useEditorStore((s) => s.togglePlay)
  const seek = useEditorStore((s) => s.seek)
  const setMasterVolume = useEditorStore((s) => s.setMasterVolume)
  const updateTitleCard = useEditorStore((s) => s.updateTitleCard)
  const setSubtitle = useEditorStore((s) => s.setSubtitle)
  const pushHistory = useEditorStore((s) => s.pushHistory)
  const unplayable = useEditorStore((s) => s.unplayableVideoUrls)
  const markVideoUnplayable = useEditorStore((s) => s.markVideoUnplayable)

  // ── 동기화 루프 ──
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const st = useEditorStore.getState()
      const v = videoRef.current
      const preview = st.previewSourceShotId

      if (preview) {
        if (dissolveRef.current) dissolveRef.current.style.opacity = '0'
        if (preview !== activeIdRef.current) {
          activeIdRef.current = preview
          setActiveShotId(preview)
          setActualDuration(null)
        }
        if (v) {
          const clip = st.videoClips.find((c) => c.shotId === preview)
          if (clip?.url) {
            v.loop = true
            if (v.playbackRate !== 1) v.playbackRate = 1
            if (st.isPlaying) {
              if (v.paused) void v.play().catch(() => {})
            } else if (!v.paused) {
              v.pause()
            }
          }
          const dur = v.duration || 0
          if (fillRef.current) fillRef.current.style.width = dur > 0 ? `${Math.min(100, (v.currentTime / dur) * 100)}%` : '0%'
          if (timeRef.current) timeRef.current.textContent = `${formatTime(v.currentTime)} / ${formatTime(dur)}`
        }
        raf = requestAnimationFrame(tick)
        return
      }

      // 타임라인 모드 — 전체 길이는 빈 곳까지 센 영상 줄 끝이다(자유 배치, 검토 c 보통 1).
      const layout = selectTimelineLayout(st)
      const total = timelineEnd(layout)
      const t = st.currentTime
      // 디졸브(2026-09-08): 검은 막의 투명도만 시간에 따라 — 영상 픽셀은 손대지 않는다.
      if (dissolveRef.current) dissolveRef.current.style.opacity = String(dissolveOpacityAt(layout, st.videoClips, t))

      // 영상이 없는 구간에선 클립을 강제로 잡지 않음 → 검은 화면 (요청 1)
      const item = layout.find((l) => t >= l.startSec && t < l.startSec + l.durationSec)
      const id = item?.shotId ?? null
      if (id !== activeIdRef.current) {
        activeIdRef.current = id
        setActiveShotId(id)
        setActualDuration(null)
        setEditingTitleCard(false)
      }

      if (fillRef.current) fillRef.current.style.width = total > 0 ? `${Math.min(100, (t / total) * 100)}%` : '0%'
      if (timeRef.current) timeRef.current.textContent = `${formatTime(t)} / ${formatTime(total)}`

      if (v && item) {
        const clip = st.videoClips.find((c) => c.shotId === item.shotId)
        if (clip?.url) {
          v.loop = false
          const trimStart = clip.trimStart ?? 0
          const speed = clip.speed ?? 1.0
          const local = trimStart + (t - item.startSec) * speed
          if (v.playbackRate !== speed) v.playbackRate = speed
          if (st.isPlaying) {
            if (v.paused) void v.play().catch(() => {})
            if (Math.abs(v.currentTime - local) > 0.3) v.currentTime = local
          } else {
            if (!v.paused) v.pause()
            if (Math.abs(v.currentTime - local) > 0.02) v.currentTime = local
          }
        }
      } else if (v && !v.paused) {
        v.pause()
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const onProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const st = useEditorStore.getState()
      if (st.previewSourceShotId) {
        const v = videoRef.current
        if (v && v.duration) v.currentTime = ratio * v.duration
        return
      }
      const layout = selectTimelineLayout(st)
      const total = timelineEnd(layout)
      seek(ratio * total)
    },
    [seek],
  )

  const activeShot = shots.find((s) => s.shotId === activeShotId)
  const activeClip = videoClips.find((c) => c.shotId === activeShotId)
  // 타이틀 카드(#owner-title-card) 구간 — 영상 없이 검은 배경 + 중앙 텍스트(+선택 이미지)만 렌더.
  const isTitleCard = !!activeShotId && isTitleCardShotId(activeShotId)
  const pane = previewPane({ isTitleCard, hasShot: !!activeShot, clip: activeClip, unplayable })

  return (
    <div className="relative flex h-full flex-col items-center justify-center bg-black">
      {pane === 'title' && activeShotId ? (
        // 약속 J(2026-09-04): 글자·이미지 자유 배치 무대 — 내보내기와 같은 배치·줄바꿈(src/lib/editor/title-card.ts).
        <TitleCardStage
          key={activeShotId}
          card={activeShot?.titleCard ?? { text: '', imageUrl: null }}
          editing={editingTitleCard}
          onStartEdit={() => {
            if (!editingTitleCard) pushHistory()
            setEditingTitleCard(true)
          }}
          onStopEdit={() => setEditingTitleCard(false)}
          onChange={(patch) => updateTitleCard(activeShotId, patch)}
          onBeforeChange={pushHistory}
          overlay={
            activeShot ? (
              <SubtitleLayer
                key={`sub-${activeShotId}`}
                subtitle={resolveSubtitle(activeShot)}
                onChange={(patch) => setSubtitle(activeShotId, patch)}
                onBeforeChange={pushHistory}
              />
            ) : null
          }
        />
      ) : pane === 'video' && activeClip?.url ? (
        // 약속 K: 자막은 영상 그림 위에 얹힌다 — 상자가 영상 크기를 따라가므로 자리 비율이 내보내기와 같다.
        <div className="relative max-h-full max-w-full">
          <video
            key={activeShotId ?? 'none'}
            ref={videoRef}
            // "전체 보기" 프리패치가 받아둔 blob 이 있으면 그걸로 — 클립 경계 전환이 즉시가 된다(#watch-all).
            src={cachedVideoUrl(activeClip.url) ?? activeClip.url}
            muted
            playsInline
            preload="auto"
            className="block max-h-full max-w-full rounded"
            onLoadedMetadata={() => {
              if (videoRef.current) setActualDuration(videoRef.current.duration)
            }}
            onError={() => markVideoUnplayable(activeClip.url)}
          />
          {activeShot && activeShotId && (
            <SubtitleLayer
              key={`sub-${activeShotId}`}
              subtitle={resolveSubtitle(activeShot)}
              onChange={(patch) => setSubtitle(activeShotId, patch)}
              onBeforeChange={pushHistory}
            />
          )}
        </div>
      ) : pane === 'unplayable' && activeShot ? (
        // 영상을 불러오지 못한 컷 — 아직 영상이 없는 컷과 같은 작은 판에 그 까닭(다른 컷은 그대로 재생된다).
        <div className="flex w-[380px] max-w-[calc(100%-2rem)] flex-col items-center rounded-2xl bg-panel px-7 py-5 text-center" data-testid="preview-unplayable">
          <p className="font-num text-[20px] font-semibold text-foreground">{activeShot.shotType}</p>
          <p className="mt-2 line-clamp-3 text-[12.5px] leading-[1.5] text-muted-foreground">{resolveEntityNames(activeShot.actionDescription, entityNames)}</p>
          <p className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-destructive">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden />
            {t("Couldn't load this cut's video.")}
          </p>
        </div>
      ) : activeShot ? (
        // v3 ED1(2026-11-03): 아직 영상이 없는 컷 — 큰 판 안 작은 판(샷 크기 · 설명 · 상태).
        <div className="flex w-[380px] max-w-[calc(100%-2rem)] flex-col items-center rounded-2xl bg-panel px-7 py-5 text-center">
          <p className="font-num text-[20px] font-semibold text-foreground">{activeShot.shotType}</p>
          <p className="mt-2 line-clamp-3 text-[12.5px] leading-[1.5] text-muted-foreground">{resolveEntityNames(activeShot.actionDescription, entityNames)}</p>
          <p className="mt-4 text-[11px] font-medium text-subtle-foreground">
            {activeClip?.status === 'generating' ? t('Generating') : t('No video made yet')}
          </p>
        </div>
      ) : (
        // 영상 없는 구간 = 검은 화면. 타임라인이 비었을 때만 안내 문구.
        !hasClips && <p className="text-label text-subtle-foreground">{t('No clips in the timeline')}</p>
      )}

      {/* 디졸브 막(2026-09-08): 검은 화면의 투명도만 바뀐다 — 클릭은 통과 */}
      <div ref={dissolveRef} data-testid="dissolve-overlay" className="pointer-events-none absolute inset-0 z-20 bg-black" style={{ opacity: 0 }} />

      {/* 재생 컨트롤 (항상 표시 — 검은 구간에서도 스크럽 가능) */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-5 pb-4 pt-8">
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 rounded-full text-foreground hover:bg-white/15 hover:text-foreground"
          onClick={togglePlay}
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>

        <div className="group relative flex h-5 flex-1 cursor-pointer items-center" onClick={onProgressClick}>
          <div className="h-1 w-full rounded-full bg-white/15 transition-all group-hover:h-1.5">
            <div ref={fillRef} className="h-full rounded-full bg-foreground" style={{ width: '0%' }} />
          </div>
        </div>

        <span ref={timeRef} className="shrink-0 font-num text-meta font-medium tabular-nums text-muted-foreground">
          0:00 / 0:00
        </span>

        {/* 전역 재생 볼륨 (재생 전용) */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMasterVolume(masterVolume > 0 ? 0 : 1)}
            className="text-muted-foreground hover:text-foreground"
            title={masterVolume > 0 ? t('Mute') : t('Unmute')}
          >
            {masterVolume > 0 ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => setMasterVolume(Number(e.target.value))}
            className="h-1 w-20 cursor-pointer accent-primary"
            title={t('Overall volume {percent}%', { percent: Math.round(masterVolume * 100) })}
          />
        </div>
      </div>

      {/* 모드 뱃지 + 길이 뱃지 (활성 클립 있을 때만) */}
      <div className="absolute right-4 top-3.5 flex items-center gap-1.5">
        {previewSourceShotId && (
          <span className="rounded-full bg-stage px-2.5 py-0.5 text-[11.5px] font-semibold text-on-stage">{t('Source preview')}</span>
        )}
        {activeShot && (
          <span className="rounded-full bg-black/45 px-2 py-0.5 font-num text-meta font-medium text-muted-foreground">
            {t('{seconds}s', { seconds: (actualDuration ?? activeShot.durationSeconds).toFixed(1) })}
          </span>
        )}
      </div>
    </div>
  )
}
