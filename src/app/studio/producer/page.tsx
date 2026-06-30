'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProducerReadinessBoard } from '@/features/producer/readiness-board'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { evaluateProducerGate } from '@/lib/producer-gate'
import { createPendingProposal } from '@/lib/pending-proposal'

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
  const backgrounds = useProducerStore((s) => s.backgrounds)
  // 핸드오프 가부는 결정적 게이트가 판정 (architecture §3 — 채팅은 제안일 뿐).
  const gate = evaluateProducerGate({ settings: projectSettings, storyReady, cast, backgrounds })
  const canHandoff = gate.canHandoff

  // writer 산출물 게이트백 — 씬/샷이 없어 producer 로 되돌려진 프로젝트면 재실행 배너 노출.
  const writerNeedsRerun = useProjectStore((s) => s.writerNeedsRerun)
  const reachedStage = useProjectStore((s) => s.reachedStage)
  const offerPendingProposal = useGlobalChatStore((s) => s.offerPendingProposal)
  const afterHandoff = reachedStage !== 'producer'

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

  const handleWriterRerunProposal = () => {
    const accepted = offerPendingProposal(
      createPendingProposal({
        stage: 'producer',
        kind: 'producerWriterRerunRequest',
        target: 'Writer rerun',
        action: '현재 Producer source로 Writer를 다시 실행',
        impact: [
          'Writer 구현은 외부 계약을 호출합니다.',
          'Writer 쪽 same-shot 보존이 보장되지 않았다면 downstream 산출물이 orphan/stale 될 수 있어요.',
          '승인 전에는 아무 실행도 시작하지 않습니다.',
        ],
        payload: {},
      }),
    )
    if (!accepted) {
      clearError()
    }
  }

  return (
    <>
      {afterHandoff && (
        <div className="border-b border-warning/30 bg-warning/10 px-6 py-2 text-xs text-warning">
          Producer source를 수정하면 기존 Writer/Artist 산출물이 낡을 수 있어요. 수동 수정은 보존되며, 재실행/재생성은 제안 승인 후에만 진행합니다.
        </div>
      )}
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
            onClick={handleWriterRerunProposal}
            disabled={syncing}
            className="shrink-0 gap-1.5"
          >
            {syncing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Writer 다시 실행 제안
          </Button>
        </div>
      )}

      <ProducerReadinessBoard gate={gate} />

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

      {/* Handoff — 하드 게이트만 차단, 상세 사유는 readiness board inline 표시 */}
      <div className="space-y-3 border-t border-border p-4">
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
              Writer로 핸드오프 · Artist도 열기
              <ArrowRight className="ml-2 size-4" />
            </>
          ) : (
            <>
              필수 항목을 채워 주세요
              <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
      </div>
    </>
  )
}
