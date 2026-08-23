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
import { shouldOfferHandoffNudge } from '@/lib/handoff-nudge'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { translate, useLocale, useT } from '@/lib/i18n'
import { useContentLocale } from '@/lib/i18n/content'


// 첫 프로젝트 진입 시 프로듀서가 먼저 거는 인사·시작 넛지 — 유저가 바로 한 줄로 시작할 수 있게.
//   2026-08-07: 프로듀서 소개·예시·업로드/스타일 진입점 안내의 친근한 장문으로 재작성
//   (#feedback — 8/6 의 2문장 축약판 대체).
// #style-entry(#feedback 2026-08-07): 스타일 진입점 안내 — 버튼엔 첫 클릭 전까지 레이더 핑.
const PRODUCER_WELCOME_KEY =
  "Hi! I'm your AI producer. Just tell me in one relaxed sentence the story you want to make. \n"
  + 'Genre, protagonist, one scene that just came to mind — anything works! \n\n'
  + 'For example, if you say "a rainy city, one night with a detective who\'s lost his memory," I\'ll help sort out the characters, setting, and structure together. \n\n'
  + 'If you already have a story file written, share it with me using the upload button below. \n'
  + 'You can pick the visual style anytime from the palette button below.'

export default function MeetingPage() {
  const t = useT()
  const locale = useLocale()
  // 챗 스트림에 실리는 발화(웰컴·핸드오프 넛지·제안 카드)는 프로젝트 콘텐츠 언어를 따른다
  //   (#i18n-content-voice) — 챗 응답(서버가 프로젝트 locale 강제)과 같은 언어로 보이게.
  //   보드·배너 등 크롬은 계속 t()(UI 언어).
  const contentLoc = useContentLocale()
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
  const styleAnchorKey = useProducerStore((s) => s.styleAnchorKey)
  const gate = evaluateProducerGate({
    settings: projectSettings,
    storyReady,
    cast,
    backgrounds,
    styleAnchorKey,
    locale,
  })
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
  // #handoff-suggestion-drop(2026-08-07): 원샷 ref 는 버그였다 — offerSuggestion 은 다른 제안
  //   (특히 [CHOICES] 선택지)이 떠 있으면 조용히 무시하는데, canHandoff 가 뒤집히는 순간은
  //   거의 항상 응답 직후 = 선택지가 떠 있는 순간이라 버튼이 영영 안 떴다. ref 대신 제안
  //   슬롯(suggestion)이 빌 때마다 재시도한다. 스팸 방지는 offerSuggestion 의 dismissed-id
  //   가드 몫 — 명시적 "나중에" 후에는 다시 뜨지 않고, 자동 내림(implicit) 후에는 다시 뜬다.
  // #handoff-starved(2026-08-11): 슬롯이 비기를 기다리는 것으로는 부족했다 — producer 채팅은
  //   되물을 거리가 있으면 거의 매 응답마다 [CHOICES] 를 내고 선택지도 같은 제안 슬롯을 쓴다.
  //   그래서 게이트가 충족돼도 슬롯이 늘 차 있어 "Writer 호출하기"가 나타나지 못했다. 이제 이
  //   제안만 선점(preempt)한다 — 게이트가 다 찼다면 남은 질문보다 이게 먼저다.
  const activeSuggestion = useGlobalChatStore((s) => s.suggestion)
  // 이미 수락된 핸드오프는 다시 권하지 않는다(#handoff-once) — 진실은 DB 의 reachedStage.
  const reachedStage = useProjectStore((s) => s.reachedStage)
  // 아래 두 useEffect 의 offerSuggestion content/label 은 미리 완역해 상수로 뽑는다 —
  //   문자열 값이라 deps 에 넣어도 로케일이 안 바뀌면 재실행되지 않는다(#i18n-s5-batch4,
  //   writer 배치의 scene-gate 패턴과 동일). 발화라서 t() 가 아니라 콘텐츠 언어(#i18n-content-voice).
  const handoffReadyContent = translate(
    contentLoc,
    'Everything needed is filled in. Calling Writer will start scene/shot design right away.',
  )
  const inviteWriterLabel = translate(contentLoc, 'Invite Writer')
  useEffect(() => {
    if (!projectId || !canHandoff) return
    if (!shouldOfferHandoffNudge('producer', reachedStage)) return
    const spec = handoffFrom('producer')
    if (!spec) return
    offerSuggestion(
      {
        id: `handoff:producer:${projectId}`,
        stage: 'producer',
        content: handoffReadyContent,
        // 라벨은 초대 프레임(#oiioii-handoff) — 실행하면 채팅에 ⇄ 초대 블록이 그려지고 넘어간다.
        action: {
          kind: 'handoff',
          utterance: translate(contentLoc, spec.utterance),
          label: inviteWriterLabel,
        },
      },
      { preempt: true },
    )
    // activeSuggestion: 슬롯이 바뀔 때마다 재시도(선점이 막힌 경우 — 예: 내릴 수 없는 웰컴).
  }, [
    projectId,
    canHandoff,
    activeSuggestion,
    offerSuggestion,
    reachedStage,
    handoffReadyContent,
    inviteWriterLabel,
    contentLoc,
  ])

  const producerWelcome = translate(contentLoc, PRODUCER_WELCOME_KEY)
  // 첫 진입(스토리·프로듀서 채팅 모두 비어있음)에만 프로듀서가 먼저 인사 + 입력창 포커스(빔).
  //   offerSuggestion 은 dismiss/중복 가드 내장 → 한 번만, 세션 재진입 시 재노출 안 함.
  // #welcome-race(2026-08-23, "영어에서 웰컴이 안 나온다" 실체): loadMessages 의 hydrate 는
  //   suggestion 슬롯을 통째로 덮어쓴다. 웰컴이 그보다 먼저 떴다가(producer 로드가 이기는 경합)
  //   조용히 지워졌다 — 로케일 문제가 아니라 타이밍 복불복. 챗 이력 로드 완료 마커를 기다린다.
  const messagesLoadedProjectId = useGlobalChatStore((s) => s.messagesLoadedProjectId)
  const chatReady = messagesLoadedProjectId === projectId
  useEffect(() => {
    if (!projectId || welcomeFiredRef.current || !producerLoaded || !chatReady) return
    if (storyReady || storyText.trim()) return
    if (messages.some((m) => m.stage === 'producer')) return
    welcomeFiredRef.current = true
    offerSuggestion({
      id: `producer-welcome:${projectId}`,
      stage: 'producer',
      content: producerWelcome,
      action: null,
      dismissible: false,
    })
    requestChatFocus()
  }, [
    projectId,
    producerLoaded,
    chatReady,
    storyReady,
    storyText,
    messages,
    offerSuggestion,
    requestChatFocus,
    producerWelcome,
  ])

  // 배너 닫기 상태 — writer 재실행: 실제 문제 상태 기반 → 세션 한정, 문제 재발 시 재노출.
  //   (stale 경고 상주 배너는 2026-07-13 제거 — 문구 박스 정리.)
  const [rerunDismissed, setRerunDismissed] = useState(false)

  // writer 재실행 배너: 문제가 해소(플래그 off)되면 닫힘 상태 리셋 → 재발 시 다시 뜬다.
  //   (렌더 중 조정 — set-state-in-effect 회피, React 권장 reset-on-change 패턴)
  if (!writerNeedsRerun && rerunDismissed) {
    setRerunDismissed(false)
  }

  const handleWriterRerunProposal = () => {
    // 제안 카드는 챗 스트림에 실린다 → 콘텐츠 언어(#i18n-content-voice).
    const accepted = offerPendingProposal(
      createPendingProposal({
        stage: 'producer',
        kind: 'producerWriterRerunRequest',
        target: 'Writer rerun',
        action: translate(contentLoc, 'Re-run Writer with the current Producer source'),
        impact: [
          translate(contentLoc, 'The Writer implementation calls an external contract.'),
          translate(
            contentLoc,
            "If same-shot preservation on the Writer side isn't guaranteed, downstream output may become orphaned or stale.",
          ),
          translate(contentLoc, 'Nothing runs until you approve.'),
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
              {t("The previous Writer run didn't finish (no scenes/shots)")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                'Check the story and settings, then re-run to generate scenes/shots and fill in Director/Editor.',
              )}
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
            {t('Suggest re-running Writer')}
          </Button>
          <button
            type="button"
            onClick={() => setRerunDismissed(true)}
            aria-label={t('Close banner')}
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
