'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Check,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Loader2,
  Send,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentFace } from '@/components/agent-face'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useArtistStore } from '@/stores/artist-store'
import { useWriterStore } from '@/stores/writer-store'
import { useDirectorCanvasWarmStarting } from '@/features/director/hooks/use-director-warm-starting'
import { handoffToStage } from '@/lib/stage-nav'
import { cn } from '@/lib/utils'
import { HoverBeam } from '@/components/hover-beam'
import { MarkdownText } from '@/components/layout/markdown-text'
import { MentionTextarea, type MentionItem } from '@/components/layout/mention-textarea'
import { castMentions, backgroundMentions, activeMentionRefs, toggleMentionToken, FOUNDATION_MENTIONS } from '@/lib/card-mention'
import { buildScriptLines, scriptLineMentions } from '@/lib/script-lines'
import {
  STAGES,
  STAGE_LABEL,
  STAGE_BADGE_CLASS,
  STAGE_FACE_COLOR,
  STAGE_PLACEHOLDER,
  CHAT_SUPPORTED_STAGES,
  SHELL_INSET,
} from '@/lib/constants'
import { buildChatSections } from '@/lib/chat-sections'
import {
  CASCADE_STEP_MS,
  EPHEMERAL_SETTLE_MS,
  navigateWithStageSlide,
} from '@/lib/stage-transition'
import type { StageId } from '@/types'

// 이 세션에서 이미 타이핑 연출을 재생한 suggestion id — 재렌더/스테이지 왕복 시 재생 방지(#b1).
const typedSuggestionIds = new Set<string>()

/** 에이전트 제안 말풍선의 타이핑(캐스케이드) 연출 — 전체 출력 5초 미만 보장(#b1). */
function TypewriterMarkdown({ id, text }: { id: string; text: string }) {
  const [shown, setShown] = useState(() =>
    typedSuggestionIds.has(id) ? text.length : 0,
  )
  useEffect(() => {
    if (typedSuggestionIds.has(id)) return
    typedSuggestionIds.add(id)
    // 글자당 ~14ms, 최소 600ms·최대 4.5초(5초 미만). rAF로 진행률 기반 부드럽게.
    const total = text.length
    const duration = Math.min(4500, Math.max(600, total * 14))
    const start = performance.now()
    let raf = 0
    let done = false
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      setShown(Math.ceil(p * total))
      if (p < 1) raf = requestAnimationFrame(tick)
      else done = true
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      // 완주 전에 정리되면(StrictMode 이중 실행·중도 unmount) 가드를 되돌려 재생 가능하게.
      //   없으면 dev StrictMode에서 2번째 effect가 가드에 걸려 0자에서 멈춘다.
      if (!done) typedSuggestionIds.delete(id)
    }
  }, [id, text])
  return (
    <MarkdownText className="whitespace-pre-wrap" text={text.slice(0, shown)} />
  )
}

/**
 * stage 구간 구분선 (#chat-continuity 2026-07-31) — 채팅방은 프로젝트당 하나인데 구분이 없으면
 * 탭마다 새 방이 열린 것처럼 보인다. "같은 방의 새 챕터"임을 보이는 표식.
 */
function StageDivider({ stage, current }: { stage: StageId; current: boolean }) {
  return (
    <div
      role="separator"
      aria-label={`${STAGE_LABEL[stage]} 구간`}
      className="flex items-center gap-2 py-1"
    >
      <span className="h-px flex-1 bg-border-subtle" />
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
          STAGE_BADGE_CLASS[stage],
        )}
      >
        {STAGE_LABEL[stage]}
        {current && <span className="opacity-70">· 지금</span>}
      </span>
      <span className="h-px flex-1 bg-border-subtle" />
    </div>
  )
}

/** 말풍선 우상단 호버 복사 버튼. 클립보드 복사 후 1.5초간 체크 표시. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('복사에 실패했어요.')
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="메시지 복사"
      aria-label="메시지 복사"
      className="absolute right-1 top-1 rounded-md border border-border bg-card/80 p-1 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
    >
      {copied ? (
        <Check className="size-3 text-success" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  )
}

export function GlobalChat() {
  const messages = useGlobalChatStore((s) => s.messages)
  const loading = useGlobalChatStore((s) => s.loading)
  const error = useGlobalChatStore((s) => s.error)
  const sendMessage = useGlobalChatStore((s) => s.sendMessage)
  const clearError = useGlobalChatStore((s) => s.clearError)
  const loadMessages = useGlobalChatStore((s) => s.loadMessages)
  const suggestion = useGlobalChatStore((s) => s.suggestion)
  const pendingNavigatePath = useGlobalChatStore((s) => s.pendingNavigatePath)
  const dismissSuggestion = useGlobalChatStore((s) => s.dismissSuggestion)
  const pendingProposal = useGlobalChatStore((s) => s.pendingProposal)
  const approvePendingProposal = useGlobalChatStore((s) => s.approvePendingProposal)
  const dismissPendingProposal = useGlobalChatStore((s) => s.dismissPendingProposal)

  const router = useRouter()
  // stage 는 URL 에서 직접 읽는다 (#chat-continuity 2026-07-31). store.currentStage 는
  //   layout 의 effect 가 pathname 변화를 본 *다음* 틱에 갱신되므로, 그 사이 한 프레임 동안
  //   채팅 패널이 이전 stage 로 렌더된다 — placeholder·제안·팁이 깜빡여 "방이 다시 로딩된다"로 읽힌다.
  //   URL 이 곧 stage 라 파생값을 기다릴 이유가 없다. (store 는 /studio 밖 fallback)
  const pathname = usePathname()
  const storeStage = useProjectStore((s) => s.currentStage)
  const currentStage =
    (STAGES.find((s) => pathname.startsWith(s.path))?.id as StageId | undefined) ??
    storeStage
  const projectId = useProjectStore((s) => s.projectId)

  // 탭 전환 직후엔 임시 요소(제안·승인 카드·워밍 팁)를 숨겼다가 1초 뒤 계단식으로 등장
  //   (#chat-settle 2026-08-03). 진입 즉시 이들이 그려지면 스레드가 밀리며 "채팅방이 다시
  //   조립된다"로 읽힌다 — 잠깐의 정적 후 순서대로 나타나면 방은 그대로 있고 에이전트가
  //   말을 거는 것으로 읽힌다. (stage 전환 감지는 set-state-in-render 패턴)
  const [stageSettled, setStageSettled] = useState(false)
  const [settledStage, setSettledStage] = useState(currentStage)
  if (currentStage !== settledStage) {
    setSettledStage(currentStage)
    setStageSettled(false)
  }
  useEffect(() => {
    if (stageSettled) return
    const t = setTimeout(() => setStageSettled(true), EPHEMERAL_SETTLE_MS)
    return () => clearTimeout(t)
  }, [stageSettled, settledStage])
  // Artist는 카드 UI로 롤백되어 노드 전용 warm tip 훅 제거. 정적 안내로 대체.
  const directorWarmTip = useDirectorCanvasWarmStarting()
  const warmStartingTip =
    currentStage === 'artist'
      ? '캐릭터/장소 시트를 생성한 뒤 Register로 Director에 넘기세요.'
      : currentStage === 'director'
        ? directorWarmTip
        : null

  // 폭 리사이즈 + 접기 (chat-ui-store, persist)
  const chatWidth = useChatUiStore((s) => s.chatWidth)
  const collapsed = useChatUiStore((s) => s.collapsed)
  const setChatWidth = useChatUiStore((s) => s.setChatWidth)
  const toggleCollapsed = useChatUiStore((s) => s.toggleCollapsed)
  const setMentionedRefs = useChatUiStore((s) => s.setMentionedRefs)
  const mentionInsert = useChatUiStore((s) => s.mentionInsert)
  const consumeMentionInsert = useChatUiStore((s) => s.consumeMentionInsert)
  const focusRequest = useChatUiStore((s) => s.focusRequest)
  const consumeChatFocus = useChatUiStore((s) => s.consumeChatFocus)
  const [dragging, setDragging] = useState(false)

  // @멘션 후보 — 현재 stage에서 UI에 표기되는 카드/오브젝트
  const producerCast = useProducerStore((s) => s.cast)
  const producerBackgrounds = useProducerStore((s) => s.backgrounds)
  const artistCharacters = useArtistStore((s) => s.characterAssets)
  const artistWorlds = useArtistStore((s) => s.worldAssets)
  const writerManifest = useWriterStore((s) => s.sceneManifest)
  const writerShots = useWriterStore((s) => s.shots)
  const mentionItems = useMemo<MentionItem[]>(() => {
    if (currentStage === 'producer') {
      return [
        ...FOUNDATION_MENTIONS.map((m) => ({ id: m.ref, label: m.label, hint: m.hint })),
        ...castMentions(producerCast).map((m) => ({ id: m.ref, label: m.label, hint: m.hint })),
        ...backgroundMentions(producerBackgrounds).map((m) => ({ id: m.ref, label: m.label, hint: m.hint })),
      ]
    }
    if (currentStage === 'artist') {
      return [
        ...artistCharacters
          .filter((c) => c.name?.trim())
          .map((c) => ({ id: c.characterId, label: c.name, hint: '캐릭터' })),
        ...artistWorlds
          .filter((w) => w.name?.trim())
          .map((w) => ({ id: w.locationId, label: w.name, hint: '장소' })),
      ]
    }
    if (currentStage === 'writer') {
      return scriptLineMentions(buildScriptLines(writerManifest, writerShots)).map((m) => ({
        id: m.ref,
        label: m.label,
        hint: m.hint,
      }))
    }
    return []
  }, [
    currentStage,
    producerCast,
    producerBackgrounds,
    artistCharacters,
    artistWorlds,
    writerManifest,
    writerShots,
  ])
  const [input, setInput] = useState('')
  // 하나의 스레드를 stage 구간으로 쪼갠다 — 필터가 아니라 구분선용(전 메시지가 그대로 보인다).
  const sections = useMemo(
    () => buildChatSections(messages, currentStage),
    [messages, currentStage],
  )
  // 위/아래 화살표로 호출할 전송 메시지 히스토리(유저 발화만, 오래된→최신).
  const userHistory = useMemo(
    () => messages.filter((m) => m.role === 'user').map((m) => m.content),
    [messages],
  )
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (projectId) loadMessages(projectId)
  }, [projectId, loadMessages])

  // 핸드오프 성공 후 이동(#handoff-to-chat) — 라우팅은 컴포넌트 책임이라 store 가 남긴 경로를
  //   여기서 소비하고 즉시 비운다(같은 경로로 두 번 밀지 않게). 세로 스트립 전환(#tab-slide-v2).
  useEffect(() => {
    if (!pendingNavigatePath) return
    useGlobalChatStore.setState({ pendingNavigatePath: null })
    navigateWithStageSlide(pathname, pendingNavigatePath, () => router.push(pendingNavigatePath))
  }, [pendingNavigatePath, router, pathname])

  // 새 메시지·stage 이동 시 스레드 끝으로. stage 를 넣는 이유는 이동하면 끝에 "지금" 구간
  //   구분선이 새로 붙기 때문 — 같은 방이 이어졌다는 표식이 화면 안에 들어와야 의미가 있다.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    // stageSettled: 1초 뒤 계단식으로 등장하는 제안/승인 카드(#chat-settle)가 스레드 끝에
    //   붙으므로, 나타나는 순간 끝까지 따라가야 화면 밖에서 조용히 뜨지 않는다.
  }, [messages.length, loading, currentStage, stageSettled])

  // 입력창의 @멘션 ↔ 카드 하이라이트 동기화 (입력에서 지우면 자동 해제)
  useEffect(() => {
    setMentionedRefs(activeMentionRefs(input, mentionItems.map((m) => ({ ref: m.id, label: m.label }))))
  }, [input, mentionItems, setMentionedRefs])

  // Cmd/Ctrl+클릭(카드) 또는 스크립트 라인 클릭 → 입력창에 @멘션 삽입/토글
  useEffect(() => {
    if (!mentionInsert) return
    const token = `@${mentionInsert.label}`
    setInput((prev) =>
      mentionInsert.mode === 'toggle'
        ? toggleMentionToken(prev, mentionInsert.label)
        : prev.includes(token)
          ? prev
          : `${prev.replace(/\s*$/, prev.trim() ? ' ' : '')}${token} `,
    )
    consumeMentionInsert(mentionInsert.id)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [mentionInsert, consumeMentionInsert])

  // 첫 진입 웰컴 등 → 채팅 입력창 포커스. HoverBeam 래퍼의 focus-within 이 빨간 빔을 켜 주의를 끈다.
  useEffect(() => {
    if (focusRequest == null) return
    requestAnimationFrame(() => textareaRef.current?.focus())
    consumeChatFocus()
  }, [focusRequest, consumeChatFocus])

  const stageSupported = CHAT_SUPPORTED_STAGES.has(currentStage)
  const inputDisabled = !stageSupported || loading

  // 전송 후에도 연이어 입력할 수 있게 포커스 유지(#b3). 응답 대기 중 textarea가 disabled로
  //   바뀌며 포커스를 잃으므로, loading이 풀리는 시점(disabled 해제 직후)에 다시 포커스.
  const wasLoadingRef = useRef(false)
  useEffect(() => {
    if (wasLoadingRef.current && !loading && stageSupported && !collapsed) {
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
    wasLoadingRef.current = loading
  }, [loading, stageSupported, collapsed])

  // 입력이 길어져 textarea가 높아지면(4줄+) 업로드/전송 버튼을 세로로 쌓는다(#b2 2026-07-15).
  //   가로 배치는 긴 입력에서 두 버튼이 겹쳐 보이는 문제가 있었음. 높이는 ResizeObserver로 추적.
  const [inputTall, setInputTall] = useState(false)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      // 버튼 2개 세로(40×2+gap 8=88px)가 입력창 높이 안에 들어올 때만 전환.
      setInputTall(el.offsetHeight >= 88)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 첫 진입(프로듀서 발화 전) 동안 placeholder "스토리에 대해 말해주세요…"를 초록으로 점멸(#b2).
  const producerUntouched =
    currentStage === 'producer' &&
    !messages.some((m) => m.stage === 'producer' && m.role === 'user')

  const handleSend = async () => {
    if (!input.trim() || inputDisabled) return
    const msg = input
    setInput('')
    await sendMessage(msg)
  }

  // 프로액티브 제안 승인 — 'navigate'(stage 이동) / 'artist-refresh-look'(초안 일괄 재생성, 유저 클릭).
  const handleSuggestionAction = async () => {
    const action = suggestion?.action
    if (!action) {
      dismissSuggestion()
      return
    }
    if (action.kind === 'artist-refresh-look') {
      dismissSuggestion()
      await useArtistStore.getState().refreshLookPendingDrafts()
      return
    }
    // 핸드오프(#handoff-to-chat) — 버튼이 직접 이동시키지 않는다. 문장을 채팅에 입력해 보내고,
    //   게이트 판정·전이·이동은 타이핑했을 때와 똑같이 sendMessage 안에서 일어난다.
    if (action.kind === 'handoff') {
      dismissSuggestion()
      await sendMessage(action.utterance)
      return
    }
    const path = await handoffToStage(action.targetStage)
    dismissSuggestion()
    if (path) navigateWithStageSlide(pathname, path, () => router.push(path))
  }

  const handlePendingProposalApprove = async () => {
    if (!pendingProposal) return
    await approvePendingProposal(pendingProposal.id)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      useProducerStore.getState().setStoryText(text)
      await sendMessage(
        `스크립트 파일을 업로드했어요. 내용은 다음과 같아요:\n\n${text}`,
      )
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 좌측 경계 드래그 → 폭 조절 (aside는 우측 고정이라 viewport 우측에서 역산)
  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }
  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    // 패널이 우측에서 INSET 만큼 떠 있으므로 그만큼 빼야 커서와 좌측 경계가 붙어 움직인다.
    setChatWidth(window.innerWidth - e.clientX - SHELL_INSET) // clamp은 store에서
  }
  const handleResizePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDragging(false)
  }

  // 계단식 등장(#chat-settle) — settle 후 보이는 임시 블록이 위에서부터 CASCADE_STEP_MS 간격으로
  //   나타난다. fill-mode backwards: 자기 차례 전까지 첫 키프레임(투명)에 머문다.
  const showSuggestion = stageSettled && !!suggestion && suggestion.stage === currentStage
  const showProposal = stageSettled && !!pendingProposal && pendingProposal.stage === currentStage
  const showWarmTip =
    stageSettled &&
    (currentStage === 'artist' || currentStage === 'director') &&
    !!warmStartingTip
  let cascadeSlots = 0
  const suggestionSlot = showSuggestion ? cascadeSlots++ : 0
  const proposalSlot = showProposal ? cascadeSlots++ : 0
  const tipSlot = showWarmTip ? cascadeSlots++ : 0
  const cascadeStyle = (slot: number): React.CSSProperties => ({
    animationDelay: `${slot * CASCADE_STEP_MS}ms`,
    animationFillMode: 'backwards',
  })
  const CASCADE_IN =
    'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none'

  return (
    <>
      {/* 좌측 레일과 짝을 이루는 둥근 부유 패널 (#shell-lift 2026-07-31).
          접힘 이동거리는 100% + INSET — inset 만큼 띄워 놨으므로 100% 만으론 가장자리가 남는다. */}
      <aside
        className={cn(
          'fixed z-sidebar flex flex-col rounded-2xl border border-border bg-card shadow-lg transition-transform duration-350 ease-out',
          collapsed && 'translate-x-[calc(100%_+_var(--shell-inset))]',
        )}
        style={
          {
            width: chatWidth,
            right: SHELL_INSET,
            top: SHELL_INSET,
            bottom: SHELL_INSET,
            '--shell-inset': `${SHELL_INSET}px`,
          } as React.CSSProperties
        }
      >
        {/* 좌측 리사이즈 핸들 */}
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
          className={cn(
            'absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize touch-none transition-colors hover:bg-border-strong',
            dragging && 'bg-border-strong',
          )}
        />

        {/* Header — 지금 어느 stage 챕터인지 표시하되, 부제로 "방은 하나"임을 명시(#chat-continuity) */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">에이전트 채팅</span>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-1.5 text-[10px] font-medium leading-4',
                  STAGE_BADGE_CLASS[currentStage],
                )}
              >
                {STAGE_LABEL[currentStage]}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              모든 단계가 이어지는 하나의 대화
            </span>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={toggleCollapsed}
            title="채팅 접기"
            aria-label="채팅 접기"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="min-h-0 flex-1 px-4 py-3">
          <div className="space-y-2">

            {sections.map((section, si) => (
              <section
                key={`${section.stage}-${si}`}
                className={cn('space-y-2', si > 0 && 'pt-2')}
              >
                <StageDivider stage={section.stage} current={section.current} />
                {section.messages.map((msg) => {
                  // 유저 메시지(#a1 2026-07-15) — 오른쪽 정렬 + "You" 이름 + 에이전트(bg-muted)
                  //   보다 밝은 말풍선(bg-input, dark L 0.278 > muted 0.243)으로 구분.
                  if (msg.role === 'user') {
                    return (
                      <div key={msg.id} className="ml-8 flex flex-col items-end">
                        <span className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                          You
                        </span>
                        <div className="group relative w-fit max-w-full select-text whitespace-pre-wrap rounded-lg bg-input px-3 py-2 pr-8 text-xs text-foreground">
                          <MarkdownText text={msg.content} />
                          <CopyButton text={msg.content} />
                        </div>
                      </div>
                    )
                  }
                  // AI 메시지 — 카톡 수신형: 아바타(말풍선 밖 왼쪽 상단) + 이름 + 말풍선.
                  return (
                    <div key={msg.id} className="mr-4 flex items-start gap-2">
                      <div
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border',
                          STAGE_BADGE_CLASS[msg.stage],
                        )}
                      >
                        <AgentFace
                          color={STAGE_FACE_COLOR[msg.stage]}
                          size={20}
                          animate={false}
                        />
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                          {STAGE_LABEL[msg.stage]}
                        </span>
                        <div className="group relative select-text whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 pr-8 text-xs text-foreground">
                          <MarkdownText text={msg.content} />
                          <CopyButton text={msg.content} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </section>
            ))}

            {loading && (
              <div className="mr-4 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                생각 중…
              </div>
            )}

            {/* 프로액티브 제안 (chat-proactive-copilot Phase 1) — 시스템이 먼저 거는 actionable 넛지.
                탭 전환 후 1초 정적을 두고 계단식 등장(#chat-settle). */}
            {showSuggestion && suggestion && (
              <div
                className={cn(
                  'mr-4 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-foreground',
                  CASCADE_IN,
                )}
                style={cascadeStyle(suggestionSlot)}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <AgentFace color={STAGE_FACE_COLOR[suggestion.stage]} size={18} animate={false} />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {STAGE_LABEL[suggestion.stage]}
                  </span>
                </div>
                <TypewriterMarkdown
                  key={suggestion.id}
                  id={suggestion.id}
                  text={suggestion.content}
                />
                {(suggestion.action || suggestion.dismissible !== false) && (
                  <div className="mt-2 flex items-center gap-2">
                    {suggestion.action && (
                      <Button size="sm" onClick={handleSuggestionAction}>
                        {suggestion.action.label}
                      </Button>
                    )}
                    {suggestion.dismissible !== false && (
                      <Button size="sm" variant="ghost" onClick={dismissSuggestion}>
                        나중에
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {showProposal && pendingProposal && (
              <div
                className={cn(
                  'mr-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground',
                  CASCADE_IN,
                )}
                style={cascadeStyle(proposalSlot)}
              >
                <div className="flex items-start gap-1.5">
                  <span
                    className={cn(
                      'mt-px inline-flex items-center rounded-full border px-1.5 py-0 align-middle text-[9px] font-medium',
                      STAGE_BADGE_CLASS[pendingProposal.stage],
                    )}
                  >
                    제안
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium"><MarkdownText text={pendingProposal.target} /></p>
                    <p className="mt-0.5 text-muted-foreground"><MarkdownText text={pendingProposal.action} /></p>
                    {pendingProposal.impact.length > 0 && (
                      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-muted-foreground">
                        {pendingProposal.impact.map((item) => (
                          <li key={item}><MarkdownText text={item} /></li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={handlePendingProposalApprove}>
                    승인
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => dismissPendingProposal(pendingProposal.id)}
                  >
                    나중에
                  </Button>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </ScrollArea>

        {error && (
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 border-t border-destructive/30 bg-destructive/10 px-4 py-1.5 text-left text-[11px] text-destructive"
          >
            {error}
          </button>
        )}

        {showWarmTip && (
          <div
            className={cn(
              'shrink-0 border-t border-warning/30 bg-warning/10 px-4 py-1.5 text-[11px] text-warning',
              CASCADE_IN,
            )}
            style={cascadeStyle(tipSlot)}
          >
            {warmStartingTip}
          </div>
        )}

        {/* Input footer — Textarea가 입력 길이에 따라 자동 확장 (한 줄 min-h-9 → 최대 10줄).
            max-h = 10줄(leading-5 20px×10) + py-2(16px) + border(2px) = 218px. 그 이상은 내부
            스크롤 — 네이티브 스크롤바는 숨기고 MentionTextarea의 ^/v 버튼으로 안내(#a3).
            Enter 전송 / Shift+Enter 개행. 버튼은 items-end로 입력창 하단에 정렬. */}
        <div className="shrink-0 border-t border-border p-4">
          <div className="flex items-end gap-2">
            <HoverBeam className="flex-1">
              <MentionTextarea
                ref={textareaRef}
                value={input}
                onChange={setInput}
                onSubmit={handleSend}
                items={mentionItems}
                history={userHistory}
                disabled={inputDisabled}
                placeholder={STAGE_PLACEHOLDER[currentStage]}
                className={cn(
                  'max-h-[13.625rem] min-h-9 w-full resize-none py-2 leading-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                  producerUntouched &&
                    'placeholder:text-success placeholder:animate-pulse',
                )}
              />
            </HoverBeam>
            {/* 버튼 그룹 — 입력창이 낮으면 가로(업로드|전송), 높아지면 세로(업로드 위/전송 아래).
                긴 입력에서 버튼끼리 겹치던 문제의 우회(#b2 2026-07-15). */}
            <div className={cn('flex shrink-0 gap-2', inputTall ? 'flex-col' : 'items-end')}>
              {currentStage === 'producer' && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    size="icon-lg"
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    title="스크립트 파일 업로드 (.txt)"
                  >
                    <Upload className="size-4" />
                  </Button>
                </>
              )}
              <Button
                size="icon-lg"
                onClick={handleSend}
                disabled={inputDisabled || !input.trim()}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* 접힌 상태 — 우측 슬림 레일 + 상단 열기 버튼.
          닫기 버튼(패널 헤더 상단)과 수직 위치를 맞추고, 레일이 우측 44px를 전용 점유해
          (layout.tsx 가 접힘 시 marginRight 44 확보) 페이지 우상단 버튼들과의 겹침을 원천 차단한다. */}
      {collapsed && (
        <aside
          className="z-sidebar fixed flex w-11 flex-col items-center rounded-2xl border border-border bg-card pt-3 shadow-lg"
          style={{ right: SHELL_INSET, top: SHELL_INSET, bottom: SHELL_INSET }}
        >
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={toggleCollapsed}
            title="채팅 열기"
            aria-label="채팅 열기"
          >
            <ChevronsLeft className="size-4" />
          </Button>
        </aside>
      )}
    </>
  )
}
