'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, AlertTriangle, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ProducerReadinessBoard } from '@/features/producer/readiness-board'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { evaluateProducerGate } from '@/lib/producer-gate'
import { createPendingProposal } from '@/lib/pending-proposal'
import { handoffFrom } from '@/lib/handoff-intent'
import { useChatUiStore } from '@/stores/chat-ui-store'

// 첫 프로젝트 진입 시 프로듀서가 먼저 거는 인사·시작 넛지 — 유저가 바로 한 줄로 시작할 수 있게.
//   2026-08-06: 4문장 → 2문장 축약(너무 길다는 피드백). 업로드 안내는 버튼 툴팁이 담당.
const PRODUCER_WELCOME =
  '만들고 싶은 이야기를 한 줄로 들려주세요 — 장르, 주인공, 떠오르는 한 장면 무엇이든 좋아요.\n'
  + '예: "비 오는 도시, 기억을 잃은 형사의 하룻밤". 나머지는 제가 함께 정리해 드릴게요.'


export default function MeetingPage() {
  const projectId = useProjectStore((s) => s.projectId)
  const loadProject = useProducerStore((s) => s.loadProject)
  // saveAndHandoff 는 더 이상 이 페이지가 부르지 않는다 — 핸드오프는 채팅이 맡는다(#handoff-to-chat).
  const { syncing, projectSettings, error, clearError } = useProducerStore()

  // loadProject 완료 후에만 웰컴을 판단(초기 storyReady=false 윈도우에서 기존 프로젝트가 오탐되지 않게).
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null)
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void loadProject().then(() => {
      if (!cancelled) setLoadedProjectId(projectId)
    })
    return () => {
      cancelled = true
    }
  }, [projectId, loadProject])
  // loadProject 가 현재 projectId 로 완료된 뒤에만 true (파생 — set-state-in-effect 회피).
  const producerLoaded = loadedProjectId === projectId

  const storyReady = useProducerStore((s) => s.storyReady)
  const cast = useProducerStore((s) => s.cast)
  const backgrounds = useProducerStore((s) => s.backgrounds)
  // 핸드오프 가부는 결정적 게이트가 판정 (architecture §3 — 채팅은 제안일 뿐).
  const gate = evaluateProducerGate({ settings: projectSettings, storyReady, cast, backgrounds })
  const canHandoff = gate.canHandoff

  // writer 산출물 게이트백 — 씬/샷이 없어 producer 로 되돌려진 프로젝트면 재실행 배너 노출.
  const writerNeedsRerun = useProjectStore((s) => s.writerNeedsRerun)
  const offerPendingProposal = useGlobalChatStore((s) => s.offerPendingProposal)
  const storyText = useProducerStore((s) => s.storyText)
  const messages = useGlobalChatStore((s) => s.messages)
  const offerSuggestion = useGlobalChatStore((s) => s.offerSuggestion)
  const requestChatFocus = useChatUiStore((s) => s.requestChatFocus)
  const welcomeFiredRef = useRef(false)

  // 핸드오프는 탭 하단 버튼이 아니라 채팅이 맡는다(#handoff-to-chat 2026-07-31) — 게이트가
  //   충족되면 채팅에 제안 버튼이 뜨고, 누르면 그 문장이 채팅에 입력돼 전송된다. 채팅에 직접
  //   "Writer로 넘겨줘"라고 써도 같은 경로(global-chat-store)를 탄다.
  const handoffOfferedRef = useRef(false)
  useEffect(() => {
    if (!projectId || !canHandoff || handoffOfferedRef.current) return
    const spec = handoffFrom('producer')
    if (!spec) return
    handoffOfferedRef.current = true
    offerSuggestion({
      id: `handoff:producer:${projectId}`,
      stage: 'producer',
      content:
        '필요한 항목이 모두 채워졌어요. Writer에게 넘기면 씬·샷 생성이 시작돼요.',
      action: { kind: 'handoff', utterance: spec.utterance, label: spec.label },
    })
  }, [projectId, canHandoff, offerSuggestion])

  // 첫 진입(스토리·프로듀서 채팅 모두 비어있음)에만 프로듀서가 먼저 인사 + 입력창 포커스(빔).
  //   offerSuggestion 은 dismiss/중복 가드 내장 → 한 번만, 세션 재진입 시 재노출 안 함.
  useEffect(() => {
    if (!projectId || welcomeFiredRef.current || !producerLoaded) return
    if (storyReady || storyText.trim()) return
    if (messages.some((m) => m.stage === 'producer')) return
    welcomeFiredRef.current = true
    offerSuggestion({
      id: `producer-welcome:${projectId}`,
      stage: 'producer',
      content: PRODUCER_WELCOME,
      action: null,
      dismissible: false,
    })
    requestChatFocus()
  }, [projectId, producerLoaded, storyReady, storyText, messages, offerSuggestion, requestChatFocus])

  // 배너 닫기 상태 — writer 재실행: 실제 문제 상태 기반 → 세션 한정, 문제 재발 시 재노출.
  //   (stale 경고 상주 배너는 2026-07-13 제거 — 문구 박스 정리.)
  const [rerunDismissed, setRerunDismissed] = useState(false)

  // writer 재실행 배너: 문제가 해소(플래그 off)되면 닫힘 상태 리셋 → 재발 시 다시 뜬다.
  //   (렌더 중 조정 — set-state-in-effect 회피, React 권장 reset-on-change 패턴)
  if (!writerNeedsRerun && rerunDismissed) {
    setRerunDismissed(false)
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
      <ProducerReadinessBoard gate={gate} />

      {/* writer 미완료 게이트백 배너 — 씬/샷이 없어 Director/Editor 가 빈 화면이던 프로젝트.
          스토리/설정은 그대로 두고 'Writer 다시 실행'으로 재생성한다(persist 는 멱등 — 중복 안 생김). */}
      {writerNeedsRerun && !rerunDismissed && (
        <div className="flex items-center gap-3 border-t border-warning/30 bg-warning/10 px-6 py-3 text-sm">
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
          <button
            type="button"
            onClick={() => setRerunDismissed(true)}
            aria-label="배너 닫기"
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-warning/20 hover:text-warning"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
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

    </>
  )
}
