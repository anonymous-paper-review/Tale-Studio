'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProjectDashboard } from '@/features/producer/project-dashboard'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

export default function MeetingPage() {
  const router = useRouter()
  const projectId = useProjectStore((s) => s.projectId)
  const loadProject = useProducerStore((s) => s.loadProject)
  const { saveAndHandoff, syncing, projectSettings, error, clearError } =
    useProducerStore()

  useEffect(() => {
    if (projectId) loadProject()
  }, [projectId, loadProject])

  const storyReady = useProducerStore((s) => s.storyReady)
  const hasMinSettings =
    storyReady && (projectSettings.genre || projectSettings.toneStyle)

  // writer 산출물 게이트백 — 씬/샷이 없어 producer 로 되돌려진 프로젝트면 재실행 배너 노출.
  const writerNeedsRerun = useProjectStore((s) => s.writerNeedsRerun)

  // Redirect via useEffect to avoid router.push failing inside async handlers
  const [redirectTo, setRedirectTo] = useState<string | null>(null)
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo)
  }, [redirectTo, router])

  const handleHandoff = async () => {
    // 씬/샷/연출 생성(writer 파이프라인)은 saveAndHandoff가 백그라운드로 발사하고,
    // 사용자는 writer 탭에서 진행 상황과 러프 스토리보드를 본다 (2026-06-12 탭 부활).
    const ok = await saveAndHandoff()
    if (ok) setRedirectTo('/studio/writer')
  }

  return (
    <>
      {/* writer 미완료 게이트백 배너 — 씬/샷이 없어 Director/Editor 가 빈 화면이던 프로젝트.
          스토리/설정은 그대로 두고 'Writer 다시 실행'으로 재생성한다(persist 는 멱등 — 중복 안 생김). */}
      {writerNeedsRerun && (
        <div className="flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-6 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              이전 Writer 실행이 완료되지 않았어요 (씬/샷 없음)
            </p>
            <p className="text-xs text-muted-foreground">
              스토리·설정을 확인하고 다시 실행하면 씬·샷이 생성돼 Director/Editor 가 채워집니다.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleHandoff}
            disabled={syncing}
            className="shrink-0 gap-1.5"
          >
            {syncing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Writer 다시 실행
          </Button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <ProjectDashboard />
      </div>

      {/* Error bar */}
      {error && (
        <button
          type="button"
          className="w-full border-t border-destructive/30 bg-destructive/10 px-6 py-2 text-left text-sm text-destructive"
          onClick={clearError}
        >
          {error}
        </button>
      )}

      {/* Handoff */}
      <div className="border-t border-border p-4">
        <Button
          onClick={handleHandoff}
          disabled={!hasMinSettings || syncing}
          className={`w-full ${hasMinSettings && !syncing ? 'animate-pulse bg-success hover:bg-success/90' : ''}`}
          size="lg"
        >
          {syncing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : hasMinSettings ? (
            <>
              Ready! Hand over to Writer
              <ArrowRight className="ml-2 size-4" />
            </>
          ) : (
            <>
              Complete your story to continue
              <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
      </div>
    </>
  )
}
