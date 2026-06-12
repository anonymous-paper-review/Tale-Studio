'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProjectDashboard } from '@/features/producer/project-dashboard'
import { CastPanel } from '@/features/producer/cast-panel'
import { GateStatus } from '@/features/producer/gate-status'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { evaluateProducerGate } from '@/lib/producer-gate'

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
  const cast = useProducerStore((s) => s.cast)
  // 핸드오프 가부는 결정적 게이트가 판정 (architecture §3 — 채팅은 제안일 뿐).
  const gate = evaluateProducerGate({ settings: projectSettings, storyReady, cast })
  const canHandoff = gate.canHandoff

  // writer 산출물 게이트백 — 씬/샷이 없어 producer 로 되돌려진 프로젝트면 재실행 배너 노출.
  const writerNeedsRerun = useProjectStore((s) => s.writerNeedsRerun)

  // Redirect via useEffect to avoid router.push failing inside async handlers
  const [redirectTo, setRedirectTo] = useState<string | null>(null)
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo)
  }, [redirectTo, router])

  const handleHandoff = async () => {
    // writer는 백그라운드 전용 스테이지 → artist로 직행 (decisions #37).
    // 씬/샷/연출 생성은 saveAndHandoff가 백그라운드로 발사한다.
    const ok = await saveAndHandoff()
    if (ok) setRedirectTo('/studio/artist')
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
        <CastPanel />
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

      {/* Handoff — 게이트 사유 + 버튼 (하드 게이트만 차단, soft는 경고) */}
      <div className="space-y-3 border-t border-border p-4">
        <GateStatus gate={gate} />
        <Button
          onClick={handleHandoff}
          disabled={!canHandoff || syncing}
          className={`w-full ${canHandoff && !syncing ? 'animate-pulse bg-success hover:bg-success/90' : ''}`}
          size="lg"
        >
          {syncing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              저장 중…
            </>
          ) : canHandoff ? (
            <>
              Artist로 핸드오프
              <ArrowRight className="ml-2 size-4" />
            </>
          ) : (
            <>
              게이트를 충족해 주세요
              <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
      </div>
    </>
  )
}
