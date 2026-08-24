'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  FileImage,
  FileText,
  LayoutGrid,
  Loader2,
  MoveRight,
  Palette,
  Plus,
  Square,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AgentFace } from '@/components/agent-face'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useArtistStore } from '@/stores/artist-store'
import { useWriterStore } from '@/stores/writer-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { handoffToStage } from '@/lib/stage-nav'
import { cn } from '@/lib/utils'
import { HoverBeam } from '@/components/hover-beam'
import { ThumbImage } from '@/components/thumb-image'
import { MarkdownText } from '@/components/layout/markdown-text'
import { MentionTextarea, type MentionItem } from '@/components/layout/mention-textarea'
import { ChatProgressPin } from '@/components/layout/chat-progress-pin'
import {
  castMentions,
  backgroundMentions,
  activeMentionRefs,
  sceneShotMentions,
  toggleMentionToken,
  FOUNDATION_MENTIONS,
  type SceneShotMentionTarget,
} from '@/lib/card-mention'
import { StyleAnchorPicker } from '@/features/producer/style-anchor-picker'
import { SceneGateControls, sendSceneGate } from '@/features/writer/scene-gate-panel'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import {
  buildScriptLines,
  scriptLineMentions,
  writerSceneShotMentions,
} from '@/lib/script-lines'
import { handoffFrom } from '@/lib/handoff-intent'
import {
  IMAGE_MAX_COUNT,
  UPLOAD_ACCEPT,
  kindOf,
  rejectReason,
} from '@/lib/upload/limits'
import {
  STAGES,
  STAGE_LABEL,
  STAGE_BADGE_CLASS,
  STAGE_FACE_COLOR,
  STAGE_PLACEHOLDER,
  STAGE_PROMPT_PRESETS,
  STAGE_THINKING_PHRASES,
  CHAT_SUPPORTED_STAGES,
  SHELL_INSET,
} from '@/lib/constants'
import { buildChatSections } from '@/lib/chat-sections'
import { buildChatBlocks, parseAttachmentMarker, parseHandoffMarker } from '@/lib/chat-blocks'
import {
  CASCADE_STEP_MS,
  EPHEMERAL_SETTLE_MS,
  navigateWithStageSlide,
} from '@/lib/stage-transition'
import { useT } from '@/lib/i18n'
import type { StageId } from '@/types'
import { isSceneData, isShotData } from '@/types/director'
import { prettyNodeLabel } from '@/features/director/node-label'

/** 입력창에 얹혀 있는 첨부 하나. 전송되면 비워진다(이번 턴 한정). */
interface Attachment {
  id: string
  name: string
  kind: 'text' | 'image'
  status: 'uploading' | 'ready' | 'error'
  error?: string
  /** kind: 'text' — 추출된 본문. 전송 시 storyText 가 된다. */
  text?: string
  /** kind: 'image' — 판독용 슬라이스 URL(위→아래 순서). */
  sliceUrls?: string[]
  /** kind: 'image' — 칩 썸네일용 원본 URL. */
  thumbUrl?: string
  /** 상한에 걸려 잘렸는지 — 조용히 자르면 사용자는 이유를 영영 모른다. */
  truncated?: boolean
}

/**
 * 사용자가 아무 말 없이 첨부만 보냈을 때 대신 실어 보내는 문장.
 * 빈 메시지를 보내면 스레드에 "왜 이걸 했는지"가 남지 않는다 — 기록으로도 남을 문장을 만든다.
 * 유저가 작성한 것처럼 전송되므로 UI locale 을 따른다(#i18n-s5-batch6-chat) — 호출부의 t 를 받는다.
 */
function defaultUtterance(texts: Attachment[], images: Attachment[], t: ReturnType<typeof useT>): string {
  const parts: string[] = []
  if (texts.length > 0) {
    const names = texts.map((file) => file.name).join(', ')
    parts.push(t('Uploaded {names} as the story.', { names }))
  }
  if (images.length > 0) {
    const names = images.map((file) => file.name).join(', ')
    parts.push(t('Uploaded {names}. Please read them and put together a story.', { names }))
  }
  return parts.join(' ') || t('Please check the attached files.')
}

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
  const t = useT()
  return (
    <div
      role="separator"
      aria-label={t('{stage} section', { stage: STAGE_LABEL[stage] })}
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
        {current && <span className="opacity-70">· {t('Now')}</span>}
      </span>
      <span className="h-px flex-1 bg-border-subtle" />
    </div>
  )
}

/**
 * 화자 name plate (#oiioii-chat 2026-08-06) — 에이전트 턴의 첫 일반 메시지에만 1회 렌더
 * (배치는 chat-blocks.ts buildChatBlocks 가 판정). 메시지마다 아바타+이름을 반복하는 대신
 * stage 색이 좌→우로 사라지는 그라디언트 플레이트가 "여기서부터 이 에이전트의 턴"을 표시하고,
 * 상단 여백(mt-5)이 턴 구분자 역할을 한다 (ref: oiioii-chat-ui-spec.md §4).
 */
function RolePlate({ stage }: { stage: StageId }) {
  return (
    <div
      className="mb-1.5 mt-5 flex h-7 items-center gap-2 rounded-2xl pl-0.5 pr-9"
      style={{
        background: `linear-gradient(90deg, color-mix(in oklab, ${STAGE_FACE_COLOR[stage]} 28%, transparent) 0%, transparent 100%)`,
      }}
    >
      <AgentFace color={STAGE_FACE_COLOR[stage]} size={24} animate={false} />
      <span className="text-[13px] font-extrabold text-foreground">
        {STAGE_LABEL[stage]}
      </span>
    </div>
  )
}

/**
 * 응답 대기 연출 (#oiioii-chat v2) — 멎어 있는 "생각 중…" 한 줄 대신, 그 stage 채팅이 실제로
 * 거치는 작업 단계(STAGE_THINKING_PHRASES)를 1.5초 간격으로 순환시켜 "지금 뭔가 굴리고 있다"를
 * 보여준다. 존재하지 않는 작업명(가짜 툴콜)은 constants 쪽 규칙으로 금지.
 */
function ThinkingIndicator({ stage }: { stage: StageId }) {
  const t = useT()
  const phrases = STAGE_THINKING_PHRASES[stage]
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (phrases.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % phrases.length), 1500)
    return () => clearInterval(t)
  }, [phrases])
  return (
    <div className="mr-6 flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
      <AgentFace color={STAGE_FACE_COLOR[stage]} size={20} expression="thinking" />
      {/* key=idx: 문구가 바뀔 때마다 아래에서 스르륵 올라오는 재등장 */}
      <span
        key={idx}
        className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none"
      >
        {t(phrases[idx % phrases.length] ?? 'Thinking')}
      </span>
      <span className="chat-thinking-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    </div>
  )
}

/** 말풍선 우상단 호버 복사 버튼. 클립보드 복사 후 1.5초간 체크 표시. */
function CopyButton({ text }: { text: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t('Copy failed.'))
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={t('Copy message')}
      aria-label={t('Copy message')}
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
  const stopGeneration = useGlobalChatStore((s) => s.stopGeneration)
  const clearError = useGlobalChatStore((s) => s.clearError)
  const loadMessages = useGlobalChatStore((s) => s.loadMessages)
  const suggestion = useGlobalChatStore((s) => s.suggestion)
  const pendingNavigatePath = useGlobalChatStore((s) => s.pendingNavigatePath)
  const dismissSuggestion = useGlobalChatStore((s) => s.dismissSuggestion)
  const pendingProposal = useGlobalChatStore((s) => s.pendingProposal)
  const approvePendingProposal = useGlobalChatStore((s) => s.approvePendingProposal)
  const dismissPendingProposal = useGlobalChatStore((s) => s.dismissPendingProposal)
  const t = useT()

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
  // t() 는 매 렌더 새 함수 참조라 memo deps에 그대로 넣으면 메모이제이션이 무력화된다 —
  //   번역 결과(문자열, 값 비교 가능)만 미리 뽑아 deps에 넣는다.
  const characterHint = t('Character')
  const locationHint = t('Location')
  const directorNodes = useDirectorCanvasStore((s) => s.nodes)
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
          .map((c) => ({ id: c.characterId, label: c.name, hint: characterHint })),
        ...artistWorlds
          .filter((w) => w.name?.trim())
          .map((w) => ({ id: w.locationId, label: w.name, hint: locationHint })),
      ]
    }
    if (currentStage === 'writer') {
      return [
        ...writerSceneShotMentions(writerManifest, writerShots),
        ...scriptLineMentions(buildScriptLines(writerManifest, writerShots)),
      ].map((m) => ({ id: m.ref, label: m.label, hint: m.hint }))
    }
    if (currentStage === 'director') {
      const targets = directorNodes.flatMap(
        (node): SceneShotMentionTarget[] => {
          if (isSceneData(node.data)) {
            return [{ kind: 'scene', id: node.id, label: prettyNodeLabel(node.data.label) }]
          }
          if (isShotData(node.data)) {
            return [{ kind: 'shot', id: node.id, label: prettyNodeLabel(node.data.label) }]
          }
          return []
        },
      )
      return [...sceneShotMentions(targets, 'previz'), ...sceneShotMentions(targets, 'real')].map(
        (m) => ({ id: m.ref, label: m.label, hint: m.hint }),
      )
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
    characterHint,
    locationHint,
    directorNodes,
  ])
  const [input, setInput] = useState('')
  // 하나의 스레드를 stage 구간으로 쪼갠다 — 필터가 아니라 구분선용(전 메시지가 그대로 보인다).
  const sections = useMemo(
    () => buildChatSections(messages, currentStage),
    [messages, currentStage],
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
    // 에이전트가 말을 걸었으면 사용자가 위로 올려 읽던 중이어도 끝으로 다시 붙인다(아래 stick 참조).
    stickRef.current = true
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    // stageSettled: 1초 뒤 계단식으로 등장하는 제안/승인 카드(#chat-settle)가 스레드 끝에
    //   붙으므로, 나타나는 순간 끝까지 따라가야 화면 밖에서 조용히 뜨지 않는다.
    // suggestion/proposal id(2026-08-06): 핸드오프 등 제안은 messages 에 안 실려 이 effect 가
    //   안 돌았다 — 위로 스크롤해 둔 상태에서 제안이 화면 밖(아래)에 조용히 떠 놓치는 문제.
  }, [messages.length, loading, currentStage, stageSettled, suggestion?.id, pendingProposal?.id])

  // 끝에 붙어 따라가기 (#chat-autoscroll 2026-08-11).
  //   위 effect 는 "블록이 추가된 순간" 한 번만 스크롤한다. 그런데 핸드오프·제안 말풍선은
  //   TypewriterMarkdown 이 최대 4.5초에 걸쳐 글자를 늘리므로, 그 뒤에 자라난 부분이 화면
  //   아래로 밀려 "넘기기 문구가 떴는지 모르겠다"가 된다. 크기 변화를 따라가야 끝이 보인다.
  //   단 사용자가 위로 올려 과거를 읽는 중이면 끌어내리지 않는다 — stick 은 스크롤로 갱신된다.
  const stickRef = useRef(true)
  useEffect(() => {
    const end = chatEndRef.current
    const content = end?.parentElement
    if (!content) return
    const viewport = content.closest(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null
    if (!viewport) return
    const nearBottom = () =>
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120
    const onScroll = () => {
      stickRef.current = nearBottom()
    }
    const ro = new ResizeObserver(() => {
      if (stickRef.current) viewport.scrollTop = viewport.scrollHeight
    })
    ro.observe(content)
    viewport.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      ro.disconnect()
      viewport.removeEventListener('scroll', onScroll)
    }
  }, [])

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

  // 탭을 옮기면 입력창에 포커스 (#keyboard-only 2026-08-11) — 도착하자마자 바로 말을 걸 수 있게.
  //   마우스 없이 Alt+QWERT 로 돌아다니는 흐름의 나머지 절반이다. 접혀 있거나 채팅을 지원하지
  //   않는 단계(editor)에서는 건드리지 않는다 — 갈 곳 없는 포커스는 스크린리더에 소음이다.
  useEffect(() => {
    if (collapsed || !CHAT_SUPPORTED_STAGES.has(currentStage)) return
    const raf = requestAnimationFrame(() => textareaRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [currentStage, collapsed])

  // 어디서든 타이핑 = 채팅 (#type-to-focus 2026-08-11) — 포커스가 본문에 있어도 글자를 치면
  //   입력창으로 끌어온다(브라우저 검색창들의 관례). 판정은 보수적으로: 수식키 없음 + 글자 키 +
  //   다른 입력 요소/모달이 아닐 때만. preventDefault 는 안 한다 — 포커스만 옮기면 그 글자는
  //   브라우저가 입력창에 꽂아 준다(IME 조합 시작도 새 포커스에서 열린다).
  useEffect(() => {
    if (collapsed || !CHAT_SUPPORTED_STAGES.has(currentStage)) return
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // 글자 키만 — 화살표/펑션/Enter/Space(버튼 활성화 키) 제외. IME 첫 타(key='Process')는
      //   물리 코드로 판정한다.
      const printable =
        e.key.length === 1 && e.key !== ' '
          ? true
          : (e.key === 'Process' || e.key === 'Unidentified') &&
            /^(Key|Digit)/.test(e.code)
      if (!printable) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      // 모달·선택지가 떠 있으면 그쪽 몫(숫자키 선택 등).
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      if (useGlobalChatStore.getState().suggestion?.action?.kind === 'choices') return
      textareaRef.current?.focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [collapsed, currentStage])

  // #p4-choices v3 (#choices-freeform 2026-08-07): 활성 선택지는 입력창 바로 위에 앵커하고,
  //   떠 있는 동안 채팅 입력은 잠근다 — 답하는 곳이 두 군데면 눈이 갈리기 때문이다.
  //   새로고침으로 복원된 선택지는 display-only라 입력을 막지 않는다.
  //   자유 입력("기타" 답변)은 선택지 안의 "직접 입력" 행이 담당한다(Claude AskUserQuestion 의 Type my own answer 대응).
  const choices =
    suggestion &&
    suggestion.stage === currentStage &&
    (suggestion.action?.kind === 'choices' || suggestion.restoredChoices)
      ? {
          stage: suggestion.stage,
          question: suggestion.content,
          options:
            suggestion.action?.kind === 'choices'
              ? suggestion.action.options
              : suggestion.restoredChoices?.options.map((label) => ({
                  label,
                  utterance: '',
                })) ?? [],
          displayOnly: !!suggestion.restoredChoices,
        }
      : null

  const stageSupported = CHAT_SUPPORTED_STAGES.has(currentStage)
  // 타이핑 잠금과 전송 잠금을 가른다 (#type-while-thinking 2026-08-11).
  //   응답을 기다리는 동안 입력창까지 잠그면 "다음에 할 말"을 미리 적어둘 수 없다 — 생각은
  //   기다리는 동안 하는 것이라 그게 제일 자연스러운 타이밍이다. 그래서 loading 은 **제출만**
  //   막는다. 활성 선택지가 떠 있을 때는 타이핑도 잠근다 — 답하는 곳이 두 군데면 눈이
  //   갈리기 때문이다(#choices-freeform). 복원된 display-only 선택지는 입력을 허용한다.
  const inputLocked = !stageSupported || (!!choices && !choices.displayOnly)
  const sendDisabled = inputLocked || loading
  // (loading 중 disabled 해제 시 재포커스하던 #b3 effect 제거 — 이제 입력창이 잠기지 않아
  //  포커스를 잃을 일이 없다. 남겨두면 다른 곳으로 옮긴 포커스를 도로 뺏는다.)

  // 입력창 하단 툴바 popover (#oiioii-chat) — 에이전트 필(빠른 요청) / four-dot(@멘션 팔레트).
  const [presetOpen, setPresetOpen] = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  // #style-entry(#feedback 2026-08-07): producer 에선 four-dot 자리가 스타일 픽커 버튼.
  //   스타일 미선택 + 아직 안 눌러봤으면 레이더 핑(producer 보라 확산 링)으로 온보딩 유도 —
  //   첫 클릭에 소등(세션 로컬. 미선택이면 다음 세션에 다시 유도가 온보딩상 맞다). 호버의
  //   빨간 빔(회전)과 모션·색을 갈라 "안내"와 "호버 반응"이 섞이지 않게 한다(#feedback v2).
  const styleAnchors = useProducerStore((s) => s.styleAnchors)
  const styleAnchorKey = useProducerStore((s) => s.styleAnchorKey)
  const setStyleAnchor = useProducerStore((s) => s.setStyleAnchor)
  const loadStyleAnchors = useProducerStore((s) => s.loadStyleAnchors)
  const [stylePressed, setStylePressed] = useState(false)
  useEffect(() => {
    if (currentStage !== 'producer' || !projectId) return
    if (useProducerStore.getState().styleAnchors.length > 0) return
    void loadStyleAnchors()
  }, [currentStage, projectId, loadStyleAnchors])
  const stylePingOn = !stylePressed && !styleAnchorKey

  // 스타일을 정할 타이밍에 팝업을 연다 (#style-timing 2026-08-11).
  //   스토리가 확정되면(storyReady) 다음 결정은 "어떤 그림으로 만들 것인가"다. 그런데 스타일은
  //   문장으로 답하는 질문이 아니라 **고르는 폼**이라, 채팅이 물어도 답할 곳이 없었다 — 그 순간
  //   이미 만들어져 있는 픽커를 한 번 자동으로 연다. 세션당 1회(닫으면 팔레트 버튼의 레이더 핑이
  //   이어받는다). 응답 대기 중에는 열지 않는다 — 읽고 있던 답을 모달이 덮는다.
  const storyReady = useProducerStore((s) => s.storyReady)
  const [stylePickerOpen, setStylePickerOpen] = useState(false)
  const styleAutoOpenedRef = useRef(false)
  useEffect(() => {
    if (currentStage !== 'producer' || styleAutoOpenedRef.current) return
    if (loading || !storyReady || styleAnchorKey || styleAnchors.length === 0) return
    styleAutoOpenedRef.current = true
    setStylePickerOpen(true)
    setStylePressed(true) // 자동으로 보여줬으니 온보딩 핑은 소등
  }, [currentStage, loading, storyReady, styleAnchorKey, styleAnchors.length])
  // 프리셋 클릭 = 입력창에 삽입(자동 전송 금지 — 과금/전이 발화를 원클릭으로 쏘지 않는다).
  const insertPreset = (text: string) => {
    setPresetOpen(false)
    setInput((prev) => (prev.trim() ? `${prev.replace(/\s*$/, ' ')}${text}` : text))
    requestAnimationFrame(() => textareaRef.current?.focus())
  }
  // 에셋 팔레트 클릭 = @멘션 토글(카드 Cmd+클릭과 같은 경로). 다중 선택하도록 popover 는 열어 둔다.
  const toggleAssetMention = (label: string) => {
    setInput((prev) => toggleMentionToken(prev, label))
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  // 첫 진입(프로듀서 발화 전) 동안 placeholder "스토리에 대해 말해주세요…"를 초록으로 점멸(#b2).
  const producerUntouched =
    currentStage === 'producer' &&
    !messages.some((m) => m.stage === 'producer' && m.role === 'user')

  // #p1-attach(2026-08-13): 첨부는 "무엇으로 쓸지"를 폼으로 묻지 않는다 — 파일을 얹어 두고
  //   의도는 채팅으로 말하게 한다. 아무 말 없이 보내면 기본 동작(각색 소재로 판독)이 돈다.
  //   전처리(docx 파싱·이미지 슬라이싱·스토리지 업로드)는 서버(api/produce/ingest)가 하고
  //   여기는 진행 상태만 들고 있는다.
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [fileDragActive, setFileDragActive] = useState(false)
  const fileDragDepthRef = useRef(0)
  const uploading = attachments.some((a) => a.status === 'uploading')
  const readyAttachments = attachments.filter((a) => a.status === 'ready')
  const canSendAttachments = readyAttachments.length > 0 && !uploading
  // 씬 게이트 활성 여부(#gate-main-input 2026-08-12) — 피드백은 별도 텍스트박스가 아니라
  //   이 입력창으로 받는다. 비어 있는 Enter = 확정(전역 Enter 핸들러가 처리).
  const sceneGateActive =
    suggestion?.action?.kind === 'confirmScenes' && suggestion.stage === currentStage

  // writer 파이프라인이 도는 동안(게이트 대기 제외)의 채팅 (#run-chat-gate 2026-08-12) —
  //   씬·샷이 아직 없어서 수정 요청을 실행할 수 없고, 실측 사고로 "초안 만들어줘" 발화가
  //   빈 컨텍스트 위에서 헛돌았다. LLM 을 태우지 않고 즉답으로 안내한다.
  const { status: writerRunStatus } = useWriterStatus(
    currentStage === 'writer' ? projectId : null,
  )
  const writerRunning = !!(
    currentStage === 'writer' &&
    writerRunStatus?.started &&
    !writerRunStatus.pipeline_completed &&
    !writerRunStatus.pipeline_failed &&
    writerRunStatus.current_status !== 'awaiting_confirmation'
  )

  const handleSend = async () => {
    if (sendDisabled || uploading) return
    if (!input.trim() && !canSendAttachments) return

    const typed = input.trim()
    const texts = readyAttachments.filter((a) => a.kind === 'text')
    const images = readyAttachments.filter((a) => a.kind === 'image')

    // 텍스트 원고는 모델을 거치지 않고 그대로 storyText 가 된다. 모델을 태우면 시스템
    //   프롬프트상 "short cohesive paragraph"로 압축되어 업로드한 원고가 사라진다.
    //   업로드는 사람의 명시적 행동이라 덮어쓰기가 허용된다(architecture §5-2).
    if (texts.length > 0) {
      const merged = texts
        .map((t) => (texts.length > 1 ? `# ${t.name}\n\n${t.text ?? ''}` : (t.text ?? '')))
        .join('\n\n')
        .trim()
      if (merged) useProducerStore.getState().setStoryText(merged)
    }

    // 판독용 슬라이스는 이번 턴에만, 원본 썸네일은 스레드에 남는다.
    const imageUrls = images.flatMap((a) => a.sliceUrls ?? [])
    const thumbUrls = images.map((a) => a.thumbUrl).filter((u): u is string => !!u)

    const msg = typed || defaultUtterance(texts, images, t)

    setInput('')
    // 씬 게이트 중의 입력 = 수정 피드백 (#gate-main-input) — 일반 채팅이 아니라 revise 로 간다.
    if (sceneGateActive) {
      dismissSuggestion()
      await sendSceneGate('revise', msg)
      return
    }
    // 실행 중 가드(#run-chat-gate) — 유저 발화는 남기고, 로컬 즉답으로 상황을 알린다.
    if (writerRunning) {
      useGlobalChatStore.getState().appendLocalExchange(
        'writer',
        msg,
        t(
          "I'm still building scenes and shots right now, so I can't take revision requests. Once the draft is ready, let me know — I'll apply it right away.",
        ),
      )
      return
    }
    // 첨부 정리는 실제 전송 경로에서만 — 게이트/가드에 걸렸을 때 올린 파일이 사라지면 안 된다.
    const msgCountBefore = useGlobalChatStore.getState().messages.length
    setAttachments([])
    await sendMessage(msg, {
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      thumbUrls,
    })
    // #attach-loud-fail(2026-08-24): 이미지 턴이 응답 없이 실패하면(모델 말풍선 미증가 + error)
    //   첨부를 복원한다 — 슬라이스는 이미 스토리지에 있으니 파일부터 다시 올리게 하지 않는다.
    const after = useGlobalChatStore.getState()
    if (images.length > 0 && after.error && after.messages.length <= msgCountBefore + 1) {
      setAttachments((prev) => (prev.length ? prev : images))
    }
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
    // #p4-choices 는 렌더에서 버튼별 인라인 처리 — 이 핸들러엔 도달하지 않는다(타입 내로잉용).
    if (action.kind === 'choices') return
    // 씬 게이트 확정(#s3-gate P3b) — 게이트 패널의 [이대로 확정]과 같은 API. 성공 전환은
    //   writer 화면의 상태 폴링이 집어간다.
    if (action.kind === 'confirmScenes') {
      dismissSuggestion()
      const pid = useProjectStore.getState().projectId
      if (!pid) return
      try {
        const res = await fetch('/api/writer/scene-gate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: pid, action: 'confirm' }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        toast.success(t('Scenes confirmed — starting character, visual, and shot design'))
      } catch {
        toast.error(t('Confirmation failed — try again from the gate panel in the writer screen'))
      }
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

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const handleFiles = async (picked: File[]) => {
    // 같은 파일을 다시 고를 수 있게 즉시 비운다.
    if (picked.length === 0) return

    const projectId = useProjectStore.getState().projectId
    if (!projectId) {
      toast.error(t('Open a project first.'))
      return
    }

    // 1) 클라이언트 1차 검사 — 즉각 피드백용이다. 진짜 방어선은 서버다(우회 가능).
    const accepted: File[] = []
    let imageBudget = IMAGE_MAX_COUNT - attachments.filter((a) => a.kind === 'image').length
    for (const file of picked) {
      const denied = rejectReason(file.name, file.size)
      if (denied) {
        toast.error(denied)
        continue
      }
      if (kindOf(file.name) === 'image') {
        if (imageBudget <= 0) {
          toast.error(t('You can upload up to {count} images at once.', { count: IMAGE_MAX_COUNT }))
          continue
        }
        imageBudget--
      }
      accepted.push(file)
    }
    if (accepted.length === 0) return

    // 2) 칩을 먼저 세우고 한 장씩 올린다 — 진행이 눈에 보여야 하고, 요청 하나당 파일 하나여야
    //    본문 크기 한도에 안 걸린다(기존 assets/upload-image 와 같은 패턴).
    const entries = accepted.map((file) => ({
      file,
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }))
    setAttachments((prev) => [
      ...prev,
      ...entries.map(({ file, id }) => ({
        id,
        name: file.name,
        kind: (kindOf(file.name) === 'image' ? 'image' : 'text') as 'image' | 'text',
        status: 'uploading' as const,
      })),
    ])

    for (const { file, id } of entries) {
      try {
        const form = new FormData()
        form.append('projectId', projectId)
        form.append('file', file)
        const res = await fetch('/api/produce/ingest', { method: 'POST', body: form })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

        setAttachments((prev) =>
          prev.map((a) => {
            if (a.id !== id) return a
            if (data.kind === 'image') {
              return {
                ...a,
                kind: 'image' as const,
                status: 'ready' as const,
                thumbUrl: data.originalUrl as string,
                sliceUrls: (data.slices ?? []).map((s: { url: string }) => s.url),
                truncated: !!data.truncated,
              }
            }
            return {
              ...a,
              kind: 'text' as const,
              status: 'ready' as const,
              text: data.text as string,
              truncated: !!data.truncated,
            }
          }),
        )
        if (data.truncated) {
          toast.warning(t('{name} exceeded the limit — the rest was cut off.', { name: file.name }))
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : t('Upload failed.')
        setAttachments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: 'error' as const, error: message } : a)),
        )
        toast.error(`${file.name}: ${message}`)
      }
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    await handleFiles(picked)
  }

  const handleFileDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    fileDragDepthRef.current += 1
    setFileDragActive(true)
  }

  const handleFileDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleFileDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1)
    if (fileDragDepthRef.current === 0) setFileDragActive(false)
  }

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    fileDragDepthRef.current = 0
    setFileDragActive(false)
    await handleFiles(Array.from(e.dataTransfer.files))
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

  // #oiioii-chat v2: 선택→계속하기 2단계 — 클릭 즉시 전송 대신 oiioii form 처럼 고른 항목을
  //   하이라이트하고 [계속하기]로 확정한다. 선택지 세트가 바뀌면 선택 초기화(렌더 중 조정 패턴).
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [choiceSetId, setChoiceSetId] = useState<string | null>(null)
  // #choices-freeform: '직접 입력' 행 — 선택지 마지막 행. 클릭 즉시(키보드는 Enter 확정) 인라인
  //   인풋으로 펼쳐진다. 채팅 입력이 잠기는 동안 여기가 '기타' 답변의 유일한 통로.
  const FREEFORM = '__freeform__'
  const [freeformOpen, setFreeformOpen] = useState(false)
  const [freeformText, setFreeformText] = useState('')
  const freeformInputRef = useRef<HTMLInputElement>(null)
  const activeChoiceSetId = choices ? suggestion!.id : null
  if (activeChoiceSetId !== choiceSetId) {
    setChoiceSetId(activeChoiceSetId)
    setSelectedChoice(null)
    setFreeformOpen(false)
    setFreeformText('')
  }
  const openFreeform = () => {
    setSelectedChoice(null)
    setFreeformOpen(true)
    requestAnimationFrame(() => freeformInputRef.current?.focus())
  }
  const handleChoiceContinue = () => {
    if (!choices || choices.displayOnly || !selectedChoice) return
    if (selectedChoice === FREEFORM) {
      openFreeform()
      return
    }
    const opt = choices.options.find((o) => o.label === selectedChoice)
    if (!opt) return
    dismissSuggestion()
    void sendMessage(opt.utterance)
  }
  const handleFreeformSend = () => {
    const text = freeformText.trim()
    if (!text || loading) return
    dismissSuggestion()
    void sendMessage(text)
  }

  // 선택지 키보드 조작 (#choices-keys 2026-08-07) — Claude Code CLI 의 AskUserQuestion 문법 차용:
  //   ↑/↓ 이동, 숫자키 바로 선택, Enter 확정('직접 입력' 행이면 인풋 열기), Esc 닫기.
  //   #choices-freeform: 채팅 입력이 잠기므로 타이핑 우선 규칙은 폐기 — 대신 캡처 단계에서 듣되,
  //   다른 입력 요소(인라인 '직접 입력' 인풋·뱃지 popover 인풋 등)에 포커스가 있으면 양보한다.
  useEffect(() => {
    if (!choices || choices.displayOnly || freeformOpen) return
    const labels = [...choices.options.map((o) => o.label), FREEFORM]
    const handler = (e: KeyboardEvent) => {
      if (loading || e.isComposing) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const dir = e.key === 'ArrowDown' ? 1 : -1
        setSelectedChoice((prev) => {
          const idx = prev ? labels.indexOf(prev) : -1
          const next =
            idx === -1
              ? dir === 1
                ? 0
                : labels.length - 1
              : (idx + dir + labels.length) % labels.length
          return labels[next]
        })
        return
      }
      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1
        if (idx < labels.length) {
          e.preventDefault()
          e.stopPropagation()
          // 같은 번호 2회 = 확정 (#choices-double-tap 2026-08-12) — 숫자로 골랐다면 Enter 로
          //   손을 옮기지 않고 같은 키를 한 번 더 눌러 끝낸다.
          if (selectedChoice === labels[idx]) {
            handleChoiceContinue()
            return
          }
          setSelectedChoice(labels[idx])
        }
        return
      }
      if (e.key === 'Enter' && !e.shiftKey && selectedChoice) {
        e.preventDefault()
        e.stopPropagation()
        handleChoiceContinue()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        dismissSuggestion()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  })

  // 계단식 등장(#chat-settle) — settle 후 보이는 임시 블록이 위에서부터 CASCADE_STEP_MS 간격으로
  //   나타난다. fill-mode backwards: 자기 차례 전까지 첫 키프레임(투명)에 머문다.
  const showSuggestion =
    stageSettled && !!suggestion && suggestion.stage === currentStage && !choices
  const showProposal = stageSettled && !!pendingProposal && pendingProposal.stage === currentStage
  let cascadeSlots = 0
  const suggestionSlot = showSuggestion ? cascadeSlots++ : 0
  const proposalSlot = showProposal ? cascadeSlots++ : 0
  const cascadeStyle = (slot: number): React.CSSProperties => ({
    animationDelay: `${slot * CASCADE_STEP_MS}ms`,
    animationFillMode: 'backwards',
  })
  const CASCADE_IN =
    'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none'

  // 수락/승인 버튼을 키보드로 (#keyboard-only 2026-08-11).
  //   탭 전환마다 입력창이 포커스를 가져가므로, 버튼까지 Tab 으로 걸어가게 두면 "다음 에이전트로
  //   넘기기"가 사실상 마우스 전용이 된다. 그래서 Enter 를 빌려준다 — 단 입력창에 쓰던 글이
  //   있으면 그건 전송이 먼저다(양보). 선택지(kind:'choices')는 자체 핸들러가 있고 showSuggestion
  //   이 이미 배제한다. 캡처 단계에서 듣고 stopPropagation 하므로 textarea 의 Enter 와 겹치지 않는다.
  const proposalOpen = showProposal && !!pendingProposal
  const suggestionOpen =
    showSuggestion && !!suggestion?.action && suggestion.action.kind !== 'choices'
  useEffect(() => {
    if (!proposalOpen && !suggestionOpen) return
    const handler = (e: KeyboardEvent) => {
      if (loading || e.isComposing) return
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key !== 'Enter' && e.key !== 'Escape') return
      // 모달이 열려 있으면 전부 양보(#style-timing 실측 사고: 스타일 픽커가 떠 있는데 Enter 가
      //   뒤의 핸드오프 수락을 먹어 스타일 없이 writer 로 넘어갔다). 포커스가 어디 있든
      //   열린 다이얼로그의 존재 자체로 판정한다 — 모달 뒤의 조작은 없다.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      const target = e.target as HTMLElement | null
      const inChatInput = !!target && target === textareaRef.current
      // 다른 입력 요소(인라인 '직접 입력', 이름 변경 등)에 있으면 그쪽 몫.
      if (
        !inChatInput &&
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      // 첨부만 얹고 아무 말 없이 Enter 를 쳐도 전송이어야 한다 — 제안 수락으로 새면 안 된다.
      if (inChatInput && e.key === 'Enter' && (input.trim() || canSendAttachments)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        if (proposalOpen && pendingProposal) dismissPendingProposal(pendingProposal.id)
        else if (suggestion?.dismissible !== false) dismissSuggestion()
        return
      }
      if (proposalOpen) void handlePendingProposalApprove()
      else void handleSuggestionAction()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  })

  /** 캡슐 버튼 옆 키 안내 — 있는 키만 적는다(없는 단축키를 광고하지 않는다). */
  const KeyHint = ({ dismissible }: { dismissible: boolean }) => (
    <span className="text-[10px] text-muted-foreground">
      <kbd className="rounded border border-border bg-muted px-1">Enter</kbd> {t('Accept')}
      {dismissible && (
        <>
          {' · '}
          <kbd className="rounded border border-border bg-muted px-1">Esc</kbd> {t('Later')}
        </>
      )}
    </span>
  )

  return (
    <>
      {/* 좌측 레일과 짝을 이루는 둥근 부유 패널 (#shell-lift 2026-07-31).
          접힘 이동거리는 100% + INSET — inset 만큼 띄워 놨으므로 100% 만으론 가장자리가 남는다. */}
      <aside
        // data-chat-panel: 멘션 비행 연출(mention-flight)이 입력창 위치를 찾는 앵커
        data-chat-panel
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
              <span className="text-sm font-semibold text-foreground">{t('Agent chat')}</span>
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
              {t('One conversation that continues across every stage')}
            </span>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={toggleCollapsed}
            title={t('Collapse chat')}
            aria-label={t('Collapse chat')}
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>

        {/* 진행도 핀 (#chat-progress-pin) — 백그라운드 파이프라인이 도는 동안 헤더 아래 고정.
            도는 게 없으면 스스로 사라진다. */}
        <ChatProgressPin stage={currentStage} />

        {/* Messages */}
        <ScrollArea className="min-h-0 flex-1 px-4 py-3">
          <div className="space-y-2">

            {sections.map((section, si) => (
              <section
                key={`${section.stage}-${si}`}
                className={cn('space-y-2', si > 0 && 'pt-2')}
              >
                <StageDivider stage={section.stage} current={section.current} />
                {/* 렌더 분류 (#oiioii-chat) — 유저만 채운 말풍선, 에이전트는 flat 출력 +
                    턴당 1회 role plate, ✓/⚠ 알림은 tool-row 스타일 (기준: chat-blocks.ts). */}
                {buildChatBlocks(section.messages).map(({ msg, kind, showRolePlate }) => {
                  if (kind === 'user') {
                    // 첨부 마커 분리 — 본문은 말풍선에, 원본 URL 은 썸네일로.
                    const { text, urls } = parseAttachmentMarker(msg.content)
                    return (
                      <div key={msg.id} className="flex justify-end pl-7">
                        <div className="group relative w-fit max-w-full select-text whitespace-pre-wrap rounded-3xl rounded-br-sm bg-chat-user-bubble px-4 py-2.5 pr-8 text-xs text-chat-user-bubble-foreground">
                          {urls.length > 0 && (
                            <div className="mb-1.5 flex flex-wrap justify-end gap-1">
                              {urls.map((url) => (
                                <ThumbImage
                                  key={url}
                                  src={url}
                                  alt={t('Attached image')}
                                  // 세로로 긴 웹툰이 말풍선을 밀어내지 않도록 정사각 크롭.
                                  className="size-10 rounded-md border border-chat-user-bubble-foreground/15 object-cover"
                                />
                              ))}
                            </div>
                          )}
                          <MarkdownText text={text} />
                          <CopyButton text={text} />
                        </div>
                      </div>
                    )
                  }
                  if (kind === 'status') {
                    const failed = msg.content.trimStart().startsWith('⚠')
                    return (
                      <div
                        key={msg.id}
                        className="flex items-center gap-2.5 rounded-2xl border border-border bg-muted/40 px-3.5 py-2.5 text-xs text-foreground"
                      >
                        {failed ? (
                          <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                        ) : (
                          <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                        )}
                        <span className="min-w-0">
                          <MarkdownText text={msg.content.trimStart().replace(/^[✓⚠]\s*/, '')} />
                        </span>
                      </div>
                    )
                  }
                  if (kind === 'handoff') {
                    const invite = parseHandoffMarker(msg.content)
                    if (invite) {
                      // 핸드오프 초대 (#oiioii-handoff, ref spec §8) — 두 에이전트가 만나는 연출.
                      //   이름마다 색이 달라 t() params 치환(플레인 텍스트만) 대신, 원문 템플릿을
                      //   {from}/{to} 자리에서 직접 split 해 그 사이에 색상 span 을 끼워 넣는다.
                      const [invitePre, inviteRest] = t('{from} invited {to} to the chat').split(
                        '{from}',
                      )
                      const [inviteMid, invitePost] = inviteRest.split('{to}')
                      return (
                        <div
                          key={msg.id}
                          className="relative flex flex-col items-center gap-2 rounded-2xl py-3 animate-in fade-in-0 zoom-in-95 duration-500 ease-out motion-reduce:animate-none"
                        >
                          {/* 등장 신호 (#handoff-beam) — 테두리를 빛이 한 바퀴 돈다. 마운트 시 1회. */}
                          <span
                            aria-hidden
                            className="tale-beam-once pointer-events-none absolute inset-0 rounded-2xl"
                          />
                          <div className="flex items-center gap-3">
                            <AgentFace color={STAGE_FACE_COLOR[invite.from]} size={26} animate={false} />
                            <MoveRight className="size-4 text-muted-foreground" />
                            <AgentFace color={STAGE_FACE_COLOR[invite.to]} size={34} />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {invitePre}
                            <span className="font-semibold" style={{ color: STAGE_FACE_COLOR[invite.from] }}>
                              @{STAGE_LABEL[invite.from]}
                            </span>
                            {inviteMid}
                            <span className="font-semibold" style={{ color: STAGE_FACE_COLOR[invite.to] }}>
                              @{STAGE_LABEL[invite.to]}
                            </span>
                            {invitePost}
                          </p>
                        </div>
                      )
                    }
                    // 마커 파싱 실패 — 원문 그대로 flat 출력 (데이터를 숨기지 않는다).
                  }
                  // 일반 에이전트 발화 — 배경 없는 flat 출력. 화자는 턴 첫 메시지의 plate 가 말한다.
                  return (
                    <div key={msg.id}>
                      {showRolePlate && <RolePlate stage={msg.stage} />}
                      <div className="group relative select-text whitespace-pre-wrap px-1 pr-8 text-xs leading-relaxed text-foreground">
                        <MarkdownText text={msg.content} />
                        <CopyButton text={msg.content} />
                      </div>
                    </div>
                  )
                })}
              </section>
            ))}

            {loading && <ThinkingIndicator stage={currentStage} />}

            {/* 프로액티브 제안 (chat-proactive-copilot Phase 1) — 시스템이 먼저 거는 actionable 넛지.
                탭 전환 후 1초 정적을 두고 계단식 등장(#chat-settle).
                #oiioii-chat v2: 카드(붉은 테두리 박스)를 걷어내고 에이전트 턴과 같은 flat 출력 —
                role plate + 타이핑 본문 + 캡슐 버튼. 온보딩 인사도 이 경로라 "말 걸어옴"으로 읽힌다. */}
            {showSuggestion && suggestion && (
              <div
                className={cn('relative rounded-2xl', 'mr-6', CASCADE_IN)}
                style={cascadeStyle(suggestionSlot)}
              >
                {/* 등장 신호 (#handoff-beam) — 다음 단계로 넘기는 제안은 놓치면 흐름이 멈춘다.
                    key=suggestion.id: 새 제안마다 애니메이션이 다시 한 바퀴 돈다. */}
                {suggestion.action && (
                  <span
                    key={suggestion.id}
                    aria-hidden
                    className="tale-beam-once pointer-events-none absolute inset-0 rounded-2xl"
                  />
                )}
                <RolePlate stage={suggestion.stage} />
                <div className="px-1 text-xs leading-relaxed text-foreground">
                  <TypewriterMarkdown
                    key={suggestion.id}
                    id={suggestion.id}
                    text={suggestion.content}
                  />
                </div>
                {/* 씬 게이트(#gate-to-chat) — 확정 한 번으로 안 끝나는 결정이라 캡슐 버튼 대신
                    피드백 입력 + 확정/수정 두 갈래를 여기서 렌더한다(생성 화면 하단 바에서 이사). */}
                {suggestion.action?.kind === 'confirmScenes' ? (
                  <SceneGateControls />
                ) : (suggestion.action || suggestion.dismissible !== false) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
                    {/* kind: 'choices' 는 여기 오지 않는다 — 입력창 앵커 선택지(#p4-choices v2) */}
                    {suggestion.action && suggestion.action.kind !== 'choices' ? (
                      <Button
                        size="sm"
                        className={cn(
                          'rounded-full',
                          // 핸드오프 강조(#ux-batch-0806) — flat 재설계에선 카드가 없어 CTA 캡슐에
                          //   링 3회 펄스를 얹는다(원격의 카드 링 의도 이식).
                          suggestion.action.kind === 'handoff' &&
                            'animate-handoff-ring motion-reduce:animate-none',
                        )}
                        onClick={handleSuggestionAction}
                      >
                        {suggestion.action.label}
                      </Button>
                    ) : null}
                    {suggestion.dismissible !== false && (
                      <Button size="sm" variant="ghost" className="rounded-full" onClick={() => dismissSuggestion()}>
                        {t('Later')}
                      </Button>
                    )}
                    {suggestionOpen && (
                      <KeyHint dismissible={suggestion.dismissible !== false} />
                    )}
                  </div>
                )}
              </div>
            )}

            {showProposal && pendingProposal && (
              <div
                className={cn(
                  'mr-6 rounded-2xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-xs text-foreground',
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
                    {t('Suggestion')}
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
                {/* CTA — oiioii form 카드의 캡슐 버튼 매핑(Confirm & Continue). 승인은 전폭 캡슐. */}
                <div className="mt-3 flex flex-col gap-1.5">
                  <Button size="sm" className="w-full rounded-full" onClick={handlePendingProposalApprove}>
                    {t('Approve')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full rounded-full"
                    onClick={() => dismissPendingProposal(pendingProposal.id)}
                  >
                    {t('Later')}
                  </Button>
                  <div className="flex justify-center">
                    <KeyHint dismissible />
                  </div>
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

        {/* Input footer (#oiioii-chat) — 둥근(r24) 입력 컨테이너 안에 편집기 + 하단 툴바.
            Textarea 는 입력 길이 따라 자동 확장 (max-h = 10줄 + padding). 내부 스크롤은
            MentionTextarea 의 ^/v 버튼으로 안내(#a3). Enter 전송 / Shift+Enter 개행.
            툴바: + 업로드 · 에이전트 필(빠른 요청) · four-dot(@멘션) · 우측 원형 send→Stop. */}
        <div className="shrink-0 p-3 pt-1">
          {/* 선택지 (#p4-choices v3 + #oiioii-chat) — 입력창 위 앵커는 유지(고르는 곳 = 답하는
              곳), 모양은 oiioii choice 행 리스트. 떠 있는 동안 채팅 입력은 잠기고(#choices-freeform),
              자유 입력은 마지막 '직접 입력' 행이 담당한다. */}
          {choices && (
            <div
              className={cn(
                'mb-2 flex flex-col gap-1.5 px-1',
                'animate-in fade-in-0 slide-in-from-bottom-1 duration-150 ease-out motion-reduce:animate-none',
              )}
            >
              {choices.question && (
                <div className="flex items-start gap-1.5">
                  <AgentFace
                    color={STAGE_FACE_COLOR[choices.stage]}
                    size={16}
                    animate={false}
                  />
                  <p className="min-w-0 text-xs text-foreground">{choices.question}</p>
                </div>
              )}
              {choices.options.map((opt, oi) => {
                if (choices.displayOnly) {
                  return (
                    <div
                      key={opt.label}
                      role="note"
                      className="w-full rounded-xl border border-border-subtle bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground"
                    >
                      {opt.label}
                    </div>
                  )
                }
                const selected = selectedChoice === opt.label
                return (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={loading}
                    aria-pressed={selected}
                    onClick={() => {
                      setFreeformOpen(false)
                      setSelectedChoice(selected ? null : opt.label)
                    }}
                    className={cn(
                      'relative w-full rounded-xl border-2 px-9 py-2 text-center text-xs text-foreground transition-colors duration-100 ease-out disabled:pointer-events-none disabled:opacity-50',
                      selected
                        ? 'border-border-strong bg-accent'
                        : 'border-transparent bg-muted/60 hover:border-border-strong hover:bg-accent',
                    )}
                  >
                    {/* 숫자키 바로 선택(#choices-keys) 안내 겸 단축키 라벨 */}
                    <span
                      className={cn(
                        'absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[10px]',
                        selected ? 'text-foreground/70' : 'text-muted-foreground/50',
                      )}
                    >
                      {oi + 1}
                    </span>
                    {opt.label}
                  </button>
                )
              })}
              {!choices.displayOnly && (
                <>
              {/* 직접 입력 (#choices-freeform) — 마지막 행. 클릭 즉시(키보드는 선택 후 Enter)
                  인라인 인풋으로 펼쳐진다. 잠긴 채팅 입력 대신 여기가 '기타' 답변 통로. */}
              {freeformOpen ? (
                <div className="relative w-full rounded-xl border-2 border-border-strong bg-accent px-9 py-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-foreground/70">
                    {choices.options.length + 1}
                  </span>
                  <input
                    ref={freeformInputRef}
                    value={freeformText}
                    onChange={(e) => setFreeformText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        handleFreeformSend()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setFreeformOpen(false)
                      }
                    }}
                    placeholder={t('Type what you want to say, then press Enter…')}
                    aria-label={t('Type my own answer')}
                    className="w-full border-0 bg-transparent text-xs leading-4 text-foreground outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  aria-pressed={selectedChoice === FREEFORM}
                  onClick={openFreeform}
                  className={cn(
                    'relative w-full rounded-xl border-2 px-9 py-2 text-center text-xs transition-colors duration-100 ease-out disabled:pointer-events-none disabled:opacity-50',
                    selectedChoice === FREEFORM
                      ? 'border-border-strong bg-accent text-foreground'
                      : 'border-transparent bg-muted/60 text-muted-foreground hover:border-border-strong hover:bg-accent hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[10px]',
                      selectedChoice === FREEFORM
                        ? 'text-foreground/70'
                        : 'text-muted-foreground/50',
                    )}
                  >
                    {choices.options.length + 1}
                  </span>
                  {t('Type my own answer…')}
                </button>
              )}
              {/* 확정 CTA (#oiioii-chat v2) — 고르고 [계속하기]. '직접 입력' 행을 골랐으면 전송
                  대신 인풋을 연다. */}
              <Button
                size="sm"
                className="w-full rounded-full"
                disabled={!selectedChoice || loading}
                onClick={handleChoiceContinue}
              >
                {t('Continue')}
              </Button>
              <div className="flex items-center justify-center gap-1.5">
                {/* 키 힌트(#choices-keys) — kbd 문법. 자유 입력은 '직접 입력' 행이 담당 */}
                <p className="text-[10px] text-muted-foreground">
                  <kbd className="rounded border border-border bg-muted px-1">↑↓</kbd>·
                  <kbd className="rounded border border-border bg-muted px-1">1-{Math.min(choices.options.length + 1, 9)}</kbd> {t('Select (2× = confirm)')} ·{' '}
                  <kbd className="rounded border border-border bg-muted px-1">Enter</kbd> {t('Confirm')} ·{' '}
                  <kbd className="rounded border border-border bg-muted px-1">Esc</kbd> {t('Close')}
                </p>
                <button
                  type="button"
                  onClick={() => dismissSuggestion()}
                  title={t('Close choices')}
                  aria-label={t('Close choices')}
                  className="rounded-full bg-muted p-1 text-muted-foreground transition-colors duration-100 ease-out hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
                </>
              )}
            </div>
          )}
          <div
            className={cn(
              'relative rounded-3xl transition-colors',
              fileDragActive && 'rounded-3xl ring-2 ring-primary/60',
            )}
            onDragEnter={handleFileDragEnter}
            onDragOver={handleFileDragOver}
            onDragLeave={handleFileDragLeave}
            onDrop={handleFileDrop}
            data-file-drop-zone
          >
            <HoverBeam className="rounded-3xl">
              <div className="rounded-3xl border border-border bg-background px-2 pb-1.5 pt-1">
              {/* 첨부 칩 — 파일은 얹혀만 있고, 무엇으로 쓸지는 아래 입력창에 말로 적는다. */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-1 pb-1.5 pt-1">
                  {attachments.map((a) => (
                    <span
                      key={a.id}
                      title={a.error ?? a.name}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border py-1 pl-1.5 pr-1 text-xs',
                        a.status === 'error'
                          ? 'border-destructive/40 bg-destructive/10 text-destructive'
                          : 'border-border bg-muted text-muted-foreground',
                      )}
                    >
                      {a.status === 'uploading' ? (
                        <Loader2 className="size-3.5 shrink-0 animate-spin" />
                      ) : a.kind === 'image' && a.thumbUrl ? (
                        <img
                          src={a.thumbUrl}
                          alt=""
                          className="size-5 shrink-0 rounded object-cover"
                        />
                      ) : a.kind === 'image' ? (
                        <FileImage className="size-3.5 shrink-0" />
                      ) : (
                        <FileText className="size-3.5 shrink-0" />
                      )}
                      <span className="max-w-40 truncate">{a.name}</span>
                      {a.status === 'ready' &&
                        a.kind === 'image' &&
                        (a.sliceUrls?.length ?? 0) > 1 && (
                          <span className="shrink-0 tabular-nums opacity-70">
                            {t('{count} slices', { count: a.sliceUrls?.length ?? 0 })}
                          </span>
                        )}
                      {a.truncated && <span className="shrink-0 text-warning">{t('Truncated')}</span>}
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        title={t('Remove attachment')}
                        aria-label={t('Remove {name}', { name: a.name })}
                        className="shrink-0 rounded p-0.5 transition-colors duration-100 ease-out hover:bg-accent hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <MentionTextarea
                ref={textareaRef}
                value={input}
                onChange={setInput}
                onSubmit={handleSend}
                items={mentionItems}
                disabled={inputLocked}
                placeholder={
                  choices && !choices.displayOnly
                    ? t('Answer using the choices above')
                    : sceneGateActive
                      ? t('Type your changes — or press Enter as-is to confirm the scenes')
                      : canSendAttachments
                        ? t("Tell us how to use it — leave blank and we'll fold it into the story")
                        : t(STAGE_PLACEHOLDER[currentStage])
                }
                className={cn(
                  'max-h-[13.625rem] min-h-9 w-full resize-none border-0 bg-transparent px-2 py-2 leading-5 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                  producerUntouched &&
                    'placeholder:text-success placeholder:animate-pulse',
                )}
              />
              {/* 하단 툴바 (#oiioii-chat spec §10 매핑) */}
              <div className="flex items-center gap-1">
                {currentStage === 'producer' && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={UPLOAD_ACCEPT}
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="rounded-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading || uploading}
                      title={t('Attach a file — manuscript (txt·md·docx) or image (jpg·png·webp)')}
                      aria-label={t('Attach file')}
                    >
                      <Plus className="size-4" />
                    </Button>
                    <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
                  </>
                )}
                {/* 에이전트 필 — oiioii 의 스킬 필 자리. 클릭 = 이 에이전트의 빠른 요청 목록. */}
                <Popover open={presetOpen} onOpenChange={setPresetOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title={t('Quick requests')}
                      className={cn(
                        'flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors',
                        STAGE_BADGE_CLASS[currentStage],
                      )}
                    >
                      <AgentFace
                        color={STAGE_FACE_COLOR[currentStage]}
                        size={16}
                        animate={false}
                      />
                      {STAGE_LABEL[currentStage]}
                      <ChevronDown className="size-3 opacity-60" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" sideOffset={8} className="w-64 p-1.5">
                    <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('Quick requests')}
                    </div>
                    {STAGE_PROMPT_PRESETS[currentStage].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => insertPreset(t(preset))}
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent"
                      >
                        {t(preset)}
                      </button>
                    ))}
                    {STAGE_PROMPT_PRESETS[currentStage].length === 0 && (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">
                        {t("Chat isn't supported at this stage.")}
                      </p>
                    )}
                    {(() => {
                      const handoff = handoffFrom(currentStage)
                      if (!handoff) return null
                      return (
                        <>
                          <div className="mx-1 my-1 h-px bg-border" aria-hidden />
                          <button
                            type="button"
                            onClick={() => insertPreset(t(handoff.utterance))}
                            className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent"
                          >
                            {t(handoff.label)} →
                          </button>
                        </>
                      )
                    })()}
                  </PopoverContent>
                </Popover>
                {/* 스타일 픽커 (#style-entry #feedback 2026-08-07) — producer 에선 four-dot 자리를
                    스타일 버튼이 차지한다(에셋 멘션은 @ 타이핑·Ctrl+카드 클릭이 대체). 첫 클릭 전
                    + 스타일 미선택이면 빔 상시 점등. 다른 스테이지는 기존 에셋 팔레트 유지. */}
                {currentStage === 'producer' ? (
                  <StyleAnchorPicker
                    anchors={styleAnchors}
                    value={styleAnchorKey}
                    onSelect={(k) => void setStyleAnchor(k)}
                    open={stylePickerOpen}
                    onOpenChange={setStylePickerOpen}
                  >
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="hover-red-beam rounded-full"
                      title={t('Select style')}
                      aria-label={t('Select style')}
                      onClick={() => setStylePressed(true)}
                    >
                      {/* 레이더 핑 — agent-face 의 ping 과 같은 문법, producer 색. 2s 주기로
                          느긋하게(기본 1s 는 다급해 보인다). reduced-motion 은 정적 보라 링. */}
                      {stylePingOn && (
                        <span
                          aria-hidden
                          className="absolute inset-0 animate-ping rounded-full bg-stage-producer opacity-30 [animation-duration:2s] motion-reduce:animate-none"
                        />
                      )}
                      <Palette className="size-4" />
                    </Button>
                  </StyleAnchorPicker>
                ) : (
                <Popover open={assetsOpen} onOpenChange={setAssetsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="rounded-full"
                      title={t('Asset mentions')}
                      aria-label={t('Asset mentions')}
                    >
                      <LayoutGrid className="size-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" sideOffset={8} className="max-h-64 w-64 overflow-y-auto p-1.5">
                    <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('Asset mentions')}
                    </div>
                    {mentionItems.map((item) => {
                      const active = input.includes(`@${item.label}`)
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleAssetMention(item.label)}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                            active ? 'font-medium text-foreground' : 'text-foreground/80',
                          )}
                        >
                          <span className="truncate">@{item.label}</span>
                          <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                            {item.hint}
                            {active && <Check className="size-3 text-success" />}
                          </span>
                        </button>
                      )
                    })}
                    {mentionItems.length === 0 && (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">
                        {t("There's nothing to mention at this stage.")}
                      </p>
                    )}
                  </PopoverContent>
                </Popover>
                )}
                <div className="flex-1" />
                {/* send ↑ → 응답 중이면 Stop ■ (abort, #oiioii-chat) */}
                {loading ? (
                  <Button
                    size="icon-sm"
                    className="rounded-full"
                    onClick={stopGeneration}
                    title={t('Stop generating response')}
                    aria-label={t('Stop generating response')}
                  >
                    <Square className="size-3 fill-current" />
                  </Button>
                ) : (
                  <Button
                    size="icon-sm"
                    className="rounded-full"
                    onClick={handleSend}
                    disabled={sendDisabled || uploading || (!input.trim() && !canSendAttachments)}
                    title={t('Send')}
                    aria-label={t('Send')}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </HoverBeam>
            {fileDragActive && (
              <div
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary bg-primary/10 text-xs font-medium text-primary"
                aria-hidden
              >
                파일을 놓으면 첨부돼요
              </div>
            )}
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
            title={t('Open chat')}
            aria-label={t('Open chat')}
          >
            <ChevronsLeft className="size-4" />
          </Button>
        </aside>
      )}
    </>
  )
}
