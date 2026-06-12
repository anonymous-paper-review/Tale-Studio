'use client'

// Writer 탭 — 러프 스토리보드 보드 (2026-06-12 탭 부활).
//
// writer 파이프라인(스토리·연출 설계) 완료 후, 컨셉 아트 이전 단계에서
// 샷별 연출을 목각 인형/스틱 피겨 패널(흑백 연필 스케치)로 확인하고
// 패널 아래 스토리를 읽는 검토 화면. 카드 클릭 → 상세 팝업(수정·재생성).
//
// 생성 흐름: 진입 시 누락 패널만 자동 1회 생성 (서버가 완료본·진행중 잡을 멱등 skip —
// director 재생성 폭주 버그의 교훈: 판단은 DB 진실 fetch 후 + 서버 이중 가드).
// 완료는 webhook → shots.rough_storyboard. 클라는 jobId 폴링으로 카드만 갱신.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ImageIcon, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HandoffButton } from '@/components/layout/handoff-button'
import { ShotDetailDialog } from '@/features/writer/shot-detail-dialog'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import type { RoughStoryboardImage, Shot } from '@/types'

type PanelJob = { status: 'generating' | 'failed'; error?: string }

export function RoughStoryboardView() {
  const projectId = useProjectStore((s) => s.projectId)
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  const shots = useWriterStore((s) => s.shots)
  const loadProject = useWriterStore((s) => s.loadProject)
  const { status } = useWriterStatus(projectId)

  // 패널 단위 생성 상태(jobId 폴링) + 완료 즉시 반영용 로컬 오버라이드.
  // DB 진실은 shots.rough_storyboard — 오버라이드는 다음 loadProject 전까지의 캐시.
  const [panelJobs, setPanelJobs] = useState<Record<string, PanelJob>>({})
  const [overrides, setOverrides] = useState<Record<string, RoughStoryboardImage>>({})
  const [detailShotId, setDetailShotId] = useState<string | null>(null)
  const autoTriggeredRef = useRef(false)
  const reloadedAfterCompleteRef = useRef(false)
  // drag-to-scroll 직후의 click 이 카드 팝업을 여는 오발 방지
  const draggedRef = useRef(false)

  useEffect(() => {
    if (projectId) void loadProject()
  }, [projectId, loadProject])

  // 파이프라인이 이 화면을 보는 중에 완료되면 씬/샷을 1회 재로드.
  useEffect(() => {
    if (status?.pipeline_completed && !reloadedAfterCompleteRef.current) {
      reloadedAfterCompleteRef.current = true
      void loadProject()
    }
  }, [status?.pipeline_completed, loadProject])

  const generate = useCallback(
    async (shotIds?: string[], force?: boolean) => {
      if (!projectId) return
      if (shotIds?.length) {
        // 클릭 즉시 피드백 — 서버가 in_flight skip 으로 응답하면 아래에서 정리됨
        setPanelJobs((prev) => ({
          ...prev,
          ...Object.fromEntries(shotIds.map((id) => [id, { status: 'generating' } as PanelJob])),
        }))
      }
      try {
        const res = await fetch('/api/writer/rough-storyboard', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId, shotIds, force }),
        })
        const j = await res.json().catch(() => null)
        if (!res.ok || !j?.ok) {
          throw new Error(j?.error?.message ?? `HTTP ${res.status}`)
        }
        const submitted = (j.data?.submitted ?? []) as Array<{
          shotId: string
          jobId: string
        }>
        setPanelJobs((prev) => ({
          ...prev,
          ...Object.fromEntries(
            submitted.map((s) => [s.shotId, { status: 'generating' } as PanelJob]),
          ),
        }))
        for (const { shotId, jobId } of submitted) {
          void pollGenerationJob(jobId)
            .then((url) => {
              setOverrides((prev) => ({
                ...prev,
                [shotId]: {
                  url,
                  status: 'completed',
                  errorMessage: null,
                  generatedAt: Date.now(),
                },
              }))
              setPanelJobs((prev) => {
                const next = { ...prev }
                delete next[shotId]
                return next
              })
            })
            .catch((e: unknown) => {
              setPanelJobs((prev) => ({
                ...prev,
                [shotId]: {
                  status: 'failed',
                  error: e instanceof Error ? e.message : String(e),
                },
              }))
            })
        }
      } catch (e) {
        if (shotIds?.length) {
          setPanelJobs((prev) => {
            const next = { ...prev }
            for (const id of shotIds) delete next[id]
            return next
          })
        }
        toast.error(e instanceof Error ? e.message : '러프 스토리보드 생성 요청 실패')
      }
    },
    [projectId],
  )

  const running = !!(
    status?.started &&
    !status.pipeline_completed &&
    !status.pipeline_failed
  )
  const hasShots = shots.length > 0
  const panelOf = (shot: Shot): RoughStoryboardImage | null =>
    overrides[shot.shotId] ?? shot.roughStoryboard ?? null
  const missingIds = shots
    .filter((s) => !panelOf(s) && !panelJobs[s.shotId])
    .map((s) => s.shotId)
  const generatingCount = Object.values(panelJobs).filter(
    (j) => j.status === 'generating',
  ).length

  // 진입 자동 생성: 샷이 로드됐고 파이프라인이 돌고 있지 않을 때, 누락 패널만 1회.
  useEffect(() => {
    if (autoTriggeredRef.current) return
    if (!hasShots || running) return
    if (missingIds.length === 0) return
    autoTriggeredRef.current = true
    void generate()
  }, [hasShots, running, missingIds.length, generate])

  // 보드 drag-to-scroll (빈 영역을 잡고 끌면 패닝). 버튼/입력 위에서 시작한 드래그는 무시.
  const handleBoardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return
    const viewport = (e.currentTarget as HTMLElement).closest(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null
    if (!viewport) return
    const startX = e.clientX
    const startY = e.clientY
    const startLeft = viewport.scrollLeft
    const startTop = viewport.scrollTop
    draggedRef.current = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!draggedRef.current && Math.hypot(dx, dy) > 5) {
        draggedRef.current = true
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
      }
      if (draggedRef.current) {
        viewport.scrollTop = startTop - dy
        viewport.scrollLeft = startLeft - dx
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const openDetail = (shotId: string) => {
    if (draggedRef.current) return
    setDetailShotId(shotId)
  }

  // ── 파이프라인 진행 중 (샷이 아직 없음) ─────────────────────────────────
  if (!hasShots && running) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-busy="true" />
        <p className="text-base font-medium">Writer가 스토리와 연출을 설계하는 중…</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono tabular-nums">{status?.progress_percent ?? 0}%</span>
          {status?.current_stage ? ` · ${status.current_stage}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          완료되면 샷별 러프 스토리보드가 자동으로 생성됩니다.
        </p>
      </div>
    )
  }

  // ── 빈 상태 (파이프라인 미실행 + 산출물 없음) ───────────────────────────
  if (!hasShots) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <ImageIcon className="size-12 text-muted-foreground" />
        <p className="text-base font-medium">아직 생성된 씬·샷이 없어요</p>
        <p className="text-sm text-muted-foreground">
          {status?.pipeline_failed
            ? 'Writer 실행이 실패했어요. Producer에서 다시 실행해주세요.'
            : 'Producer에서 스토리를 핸드오프하면 씬·샷이 생성됩니다.'}
        </p>
      </div>
    )
  }

  // ── 보드 ────────────────────────────────────────────────────────────────
  const detailShot = detailShotId ? shots.find((s) => s.shotId === detailShotId) : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
        <h1 className="text-xl font-semibold">러프 스토리보드</h1>
        <p className="text-xs text-muted-foreground">
          연출 확인용 previz — 카드를 클릭하면 수정·재생성할 수 있어요
        </p>
        <div className="ml-auto flex items-center gap-2">
          {generatingCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              패널 {generatingCount}개 생성 중
            </span>
          )}
          {missingIds.length > 0 && generatingCount === 0 && (
            <Button size="sm" variant="secondary" onClick={() => void generate()}>
              <RefreshCw className="size-3.5" />
              누락 패널 {missingIds.length}개 생성
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="cursor-grab space-y-8 p-6" onPointerDown={handleBoardPointerDown}>
          {(sceneManifest?.scenes ?? []).map((scene) => {
            const sceneShots = shots.filter((s) => s.sceneId === scene.sceneId)
            if (sceneShots.length === 0) return null
            return (
              <section key={scene.sceneId} className="space-y-3">
                {/* 씬 구분선 — 내용(요약/장소) 없이 id만 (사용자 결정 2026-06-12) */}
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    {scene.sceneId}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sceneShots.map((shot) => {
                    const panel = panelOf(shot)
                    const job = panelJobs[shot.shotId]
                    return (
                      <article
                        key={shot.shotId}
                        role="button"
                        tabIndex={0}
                        onClick={() => openDetail(shot.shotId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openDetail(shot.shotId)
                          }
                        }}
                        className="group cursor-pointer overflow-hidden rounded-xl border bg-card transition-colors duration-100 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
                      >
                        <div className="relative aspect-video bg-muted">
                          {panel?.url && job?.status !== 'generating' ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={panel.url}
                                alt={`${shot.shotId} rough storyboard`}
                                className="size-full object-cover"
                                loading="lazy"
                                draggable={false}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="absolute right-2 top-2 size-7 bg-background/80 opacity-0 transition-opacity duration-100 group-hover:opacity-100"
                                aria-label="패널 재생성"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void generate([shot.shotId], true)
                                }}
                              >
                                <RefreshCw className="size-3.5" />
                              </Button>
                            </>
                          ) : job?.status === 'generating' ? (
                            <div className="absolute inset-0" aria-busy="true">
                              <div className="size-full animate-pulse bg-muted-foreground/10" />
                              <Loader2 className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                            </div>
                          ) : job?.status === 'failed' ? (
                            <div className="flex size-full flex-col items-center justify-center gap-2 p-4">
                              <AlertCircle className="size-5 text-destructive" />
                              <p className="line-clamp-2 text-center text-xs text-destructive">
                                {job.error ?? '생성 실패'}
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void generate([shot.shotId], true)
                                }}
                              >
                                다시 시도
                              </Button>
                            </div>
                          ) : (
                            <div className="flex size-full flex-col items-center justify-center gap-2">
                              <ImageIcon className="size-8 text-muted-foreground" />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void generate([shot.shotId])
                                }}
                              >
                                패널 생성
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {shot.shotId}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {shot.shotType}
                            </Badge>
                            <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                              {shot.durationSeconds}s
                            </span>
                          </div>
                          <p className="line-clamp-3 text-sm leading-relaxed">
                            {shot.actionDescription}
                          </p>
                          {shot.dialogueLines.length > 0 && (
                            <div className="space-y-1 border-l-2 border-border pl-3">
                              {shot.dialogueLines.map((dl, i) => (
                                <p key={i} className="line-clamp-1 text-xs text-muted-foreground">
                                  <span className="font-mono">
                                    {sceneManifest?.characters.find(
                                      (c) => c.characterId === dl.characterId,
                                    )?.name ?? dl.characterId}
                                  </span>{' '}
                                  {dl.text}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </ScrollArea>

      <HandoffButton label="Hand over to Concept Artist" targetStage="artist" />

      <ShotDetailDialog
        shotId={detailShotId}
        panelUrl={detailShot ? panelOf(detailShot)?.url ?? null : null}
        generating={!!(detailShotId && panelJobs[detailShotId]?.status === 'generating')}
        onOpenChange={(open) => {
          if (!open) setDetailShotId(null)
        }}
        onRegenerate={(id) => void generate([id], true)}
      />
    </div>
  )
}
