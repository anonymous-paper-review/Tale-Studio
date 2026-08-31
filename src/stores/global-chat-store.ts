import { create } from 'zustand'
import { toast } from 'sonner'
import type { DialogueLine, StageId } from '@/types'
import type { PendingProposal } from '@/lib/pending-proposal'
import { createPendingProposal, isApprovalUtterance } from '@/lib/pending-proposal'
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore, type ExtractedSettings } from '@/stores/producer-store'
import { evaluateProducerGate } from '@/lib/producer-gate'
import { useArtistStore, type ArtistUpdate } from '@/stores/artist-store'
import {
  useDirectorCanvasStore,
  serializeDirectorCanvasContext,
  type DirectorCanvasUpdate,
} from '@/stores/director-store'
import { isShotData, isVideoData } from '@/types/director'
import { useWriterStore, type WriterChatUpdate } from '@/stores/writer-store'
import {
  buildScriptLines,
  resolveLineRefs,
  serializeWriterScriptContext,
} from '@/lib/script-lines'
import { matchHandoffIntent, type HandoffSpec } from '@/lib/handoff-intent'
import { handoffToStage } from '@/lib/stage-nav'
import {
  loadLatestChatTrace,
  saveChatMessage,
  saveChatTrace,
  saveChatTracePatch,
} from '@/lib/chat-persistence'
import {
  choiceSuggestionMarker,
  isPersistedChatMarker,
  parseAttachmentMarker,
  parseChoiceSuggestionMarker,
  withAttachmentMarker,
} from '@/lib/chat-blocks'
import { isDemoSession, getDemoSnapshot } from '@/lib/demo/context'
import { cannedFor } from '@/lib/demo/canned'
import { handoffMarker } from '@/lib/chat-blocks'
import {
  buildChatTrace,
  createChatTraceId,
  type ChatGenerationJobTrace,
  type ChatTrace,
} from '@/lib/chat-trace'
import {
  type GenerationJobReceipt,
  type GenerationJobObserver,
} from '@/lib/generation-jobs-client'
import { stripLegacyStageMarkers } from '@/lib/display-names'
// store 액션·순수 함수는 훅을 못 쓴다 — translate() + locale 직접 조회로 번역.
//   이 파일의 산출물은 전부 챗 스트림(발화·제안·알림)이라 UI 언어가 아니라 **프로젝트 콘텐츠
//   언어**를 따른다(#i18n-content-voice 2026-08-23) — 챗 응답(서버가 프로젝트 locale 강제)과
//   같은 대화창에서 언어가 섞이지 않게. 미조회 시 UI 언어 폴백은 contentLocale() 안에 있다.
import { translate } from '@/lib/i18n'
import { contentLocale } from '@/lib/i18n/content'
import {
  STAGE_LABEL,
  CHAT_HISTORY_WINDOW,
  CHAT_HISTORY_CHAR_BUDGET,
  HANDOFF_INVITE_NAVIGATE_MS,
} from '@/lib/constants'

export interface GlobalChatMessage {
  id: string
  stage: StageId
  role: 'user' | 'model'
  content: string
}

/**
 * 프로액티브 코파일럿 — 시스템이 먼저 거는 제안 (chat-proactive-copilot Phase 1).
 *   유저 입력 없이 채팅 패널에 actionable 버블로 표시된다. 한 번에 하나만 떠 있고,
 *   채팅 history 에는 영속화하지 않는다(ephemeral). `action`이 있으면 승인 버튼,
 *   항상 "나중에"(dismiss) 가능. 비용 지출은 일으키지 않는 '다음 단계' 넛지(자동생성은 별도 진행).
 *   dismiss/승인한 제안 id 는 `dismissedSuggestionIds` 에 기록 → 같은 세션 내 재진입(탭 이동 후
 *   복귀)에선 다시 묻지 않는다. store 는 persist 미적용이라 전체 새로고침 시엔 초기화되어 다시 뜰 수 있다.
 */
export interface ChatSuggestion {
  id: string
  stage: StageId
  content: string
  /** false면 dismiss(나중에) 버튼을 숨긴다 — 온보딩 인사처럼 넘길 필요 없는 제안. */
  dismissible?: boolean
  action:
    | { kind: 'navigate'; targetStage: StageId; label: string }
    | { kind: 'artist-refresh-look'; label: string }
    // 핸드오프(#handoff-to-chat) — 누르면 utterance 를 채팅에 그대로 입력해 보낸다.
    //   버튼이 직접 이동시키지 않는 이유: 타이핑 경로와 갈리면 두 벌을 유지해야 한다.
    | { kind: 'handoff'; utterance: string; label: string }
    // #s3-gate P3b: 씬 게이트 확정 버튼 — 클릭 시 /api/writer/scene-gate confirm (수정 요청은 게이트 패널이 주 경로)
    | { kind: 'confirmScenes'; label: string }
    // #p4-choices: 다중 선택지 — 클릭 = 그 문구를 채팅 입력(핸드오프 패턴, 직접 입력과 동일 경로)
    | { kind: 'choices'; options: Array<{ label: string; utterance: string }> }
    | null
  /** 새로고침으로 복원한 선택지는 표시 전용이며 action을 복원하지 않는다. */
  restoredChoices?: { options: string[] }
}

interface GlobalChatState {
  messages: GlobalChatMessage[]
  loading: boolean
  error: string | null
  /** 마지막 채팅 요청의 입력·출력·적용 경계 계측. 화면 하단에 표시한다. */
  lastTrace: ChatTrace | null
  suggestion: ChatSuggestion | null
  dismissedSuggestionIds: string[]
  pendingProposal: PendingProposal | null
  /** 크로스스테이지 완료 알림 배지 카운트 (chat-proactive-copilot Phase 2). 사이드바가 읽는다. */
  stageBadges: Partial<Record<StageId, number>>
  /** 핸드오프 성공 후 이동할 경로 — 라우팅은 컴포넌트 몫이라 GlobalChat 이 소비하고 비운다. */
  pendingNavigatePath: string | null
  /** loadMessages 가 이 프로젝트로 완료됨(성공·실패 불문) — hydrate 는 suggestion 슬롯을
   *  통째로 덮어쓰므로, 로드 전에 띄운 프로액티브 제안(프로듀서 웰컴 등)은 소리 없이 지워진다.
   *  제안을 띄우는 쪽은 이 마커를 기다려야 한다(#welcome-race 2026-08-23). */
  messagesLoadedProjectId: string | null

  loadMessages: (projectId: string) => Promise<void>
  /**
   * attachments.imageUrls: 판독용 슬라이스 URL — 이번 턴 LLM 호출에만 실린다.
   *   히스토리는 DB 에서 텍스트로 재조립되므로 다음 턴에 자연히 빠진다.
   * attachments.thumbUrls: 스레드에 남길 원본 URL — 본문 마커로 영속화되어 새로고침 후에도
   *   "이 턴에 뭘 올렸는지"가 보인다. LLM 히스토리에서는 제거된다(URL 은 모델에 무의미).
   */
  sendMessage: (
    content: string,
    attachments?: { imageUrls?: string[]; thumbUrls?: string[] },
  ) => Promise<void>
  /** 진행 중인 LLM 응답 중단 (#oiioii-chat) — Stop 버튼. 대기 중이 아니면 no-op. */
  stopGeneration: () => void
  /** LLM 을 태우지 않는 로컬 문답 한 쌍 — 실행 중 가드 등 결정론 즉답(#run-chat-gate). DB 에도 남긴다. */
  appendLocalExchange: (stage: StageId, userText: string, modelText: string) => void
  /** preempt: 떠 있는 제안(선택지 등)을 밀어내고 이 제안을 세운다 — 핸드오프처럼 "지금이 그 순간"인 것만. */
  offerSuggestion: (suggestion: ChatSuggestion, opts?: { preempt?: boolean }) => void
  /** implicit: 유저가 다른 말을 해서 내려간 것 — id 를 기록하지 않아 나중에 다시 뜰 수 있다. */
  dismissSuggestion: (opts?: { implicit?: boolean }) => void
  offerPendingProposal: (proposal: PendingProposal) => boolean
  dismissPendingProposal: (id?: string) => void
  approvePendingProposal: (id?: string) => Promise<boolean>
  /** 백그라운드 생성 완료 통지 — 다른 stage에 있을 때만 배지 bump + 스로틀된 채팅 메시지. */
  notifyCompletion: (stage: StageId, label: string) => void
  /** 생성 트리거 실패 통지 — 사유를 채팅에 남긴다 (#double-fire). 완료와 달리 즉시. */
  notifyActionError: (stage: StageId, label: string, message: string) => void
  /** 완성된 상태 행(⚠/✓ prefix 포함)을 그대로 채팅에 남긴다 — 문구를 호출부가 정할 때. */
  notifyIssue: (stage: StageId, content: string) => void
  clearStageBadge: (stage: StageId) => void
  clearError: () => void
  reset: () => void
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function generationStatusOf(
  status: GenerationJobReceipt['status'],
): ChatTrace['generationStatus'] {
  if (status === 'queued') return 'queued'
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'skipped') return 'skipped'
  if (status === 'deduped') return 'deduped'
  return 'timed_out'
}

function dialogueKey(line: DialogueLine): string {
  return `${line.characterId}\u0000${line.text}`
}

function deletedDialoguePreview(current: DialogueLine[], next: DialogueLine[]): string {
  const remaining = new Map<string, number>()
  for (const line of next) {
    const key = dialogueKey(line)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  }

  const deleted: DialogueLine[] = []
  for (const line of current) {
    const key = dialogueKey(line)
    const count = remaining.get(key) ?? 0
    if (count > 0) {
      remaining.set(key, count - 1)
    } else {
      deleted.push(line)
    }
  }

  const previewLines = (deleted.length > 0 ? deleted : current.slice(next.length))
    .slice(0, 3)
    .map((line) => `${line.characterId}: "${line.text.slice(0, 80)}${line.text.length > 80 ? '…' : ''}"`)
  const locale = contentLocale()
  const suffix =
    deleted.length > 3
      ? ` ${translate(locale, 'and {count} more', { count: deleted.length - 3 })}`
      : ''
  return previewLines.length > 0
    ? `${translate(locale, 'Dialogue to delete: {lines}', { lines: previewLines.join(' / ') })}${suffix}`
    : translate(locale, 'Dialogue to delete: {count} lines', {
        count: Math.max(0, current.length - next.length),
      })
}

// 완료 알림 코얼레싱 — 같은 stage+label 완료를 짧은 윈도우로 모아 한 줄("N개 생성 완료")로 emit.
//   배치 이미지(웹훅 다발) 스팸 방지. 창 안에 이어지면 누적, 조용해지면 1개 메시지로 flush.
const COMPLETION_COALESCE_MS = 2500
type PendingCompletion = { count: number; timer: ReturnType<typeof setTimeout> }
const pendingCompletions: Record<string, PendingCompletion> = {}
const completionKey = (stage: StageId, label: string) => `${stage}::${label}`

// 진행 중인 LLM 응답의 abort 컨트롤러 (#oiioii-chat) — 한 번에 한 요청만 뜨므로(loading 가드) 단일 슬롯.
let activeGeneration: AbortController | null = null

function projectChatStage(): { projectId: string | null; stage: StageId } {
  const project = useProjectStore.getState()
  return { projectId: project.projectId, stage: project.currentStage }
}

function saveChoiceStateMarker(suggestion: ChatSuggestion | null): void {
  if (!suggestion || (!suggestion.restoredChoices && suggestion.action?.kind !== 'choices')) return
  const { projectId } = projectChatStage()
  if (!projectId) return
  const marker = suggestion
    ? suggestion.restoredChoices
      ? choiceSuggestionMarker({
          id: suggestion.id,
          stage: suggestion.stage,
          content: suggestion.content,
          labels: suggestion.restoredChoices.options,
        })
      : choiceSuggestionMarker({
          id: suggestion.id,
          stage: suggestion.stage,
          content: suggestion.content,
          labels: suggestion.action?.kind === 'choices'
            ? suggestion.action.options.map((option) => option.label)
            : [],
        })
    : choiceSuggestionMarker(null)
  saveChatMessage(projectId, suggestion.stage, 'model', marker)
}

function saveChoiceClearMarker(stage: StageId): void {
  const { projectId } = projectChatStage()
  if (projectId) saveChatMessage(projectId, stage, 'model', choiceSuggestionMarker(null))
}

function flushCompletion(stage: StageId, label: string): void {
  const key = completionKey(stage, label)
  const entry = pendingCompletions[key]
  if (!entry) return
  delete pendingCompletions[key]
  const projectId = useProjectStore.getState().projectId
  // ✓ prefix 는 상태 행 판별(chat-blocks.classifyChatMessage)이 읽는 고정 마커다 — 번역 밖에 둔다.
  const locale = contentLocale()
  const content =
    entry.count > 1
      ? `✓ ${translate(locale, '{count} {label} generations finished. Check the {stage} tab.', {
          count: entry.count,
          label,
          stage: STAGE_LABEL[stage],
        })}`
      : `✓ ${translate(locale, '{label} generation finished. Check the {stage} tab.', {
          label,
          stage: STAGE_LABEL[stage],
        })}`
  useGlobalChatStore.setState((state) => ({
    messages: [...state.messages, { id: makeId(), stage, role: 'model', content }],
  }))
  if (projectId) saveChatMessage(projectId, stage, 'model', content)
}

// ── 스테이지 핸드오프 (#handoff-to-chat 2026-07-31) ──────────────────────────
// 탭 하단 버튼을 걷어내고 채팅으로 옮겼다. 제안 버튼은 utterance 를 입력창에 넣어 보낼 뿐이라,
//   버튼과 타이핑이 아래 같은 함수로 수렴한다(경로가 갈리지 않는다).

/** 핸드오프 가부 — 코드 게이트가 판정한다(모델 아님, architecture §3). 막혔으면 사유 목록. */
/**
 * 채팅이 해석한 "이 그림체로 가줘" 의도를 프로젝트 스타일 앵커로 확정한다.
 *
 * 모델은 imageIndex 만 준다 — 이번 턴에 붙인 이미지 목록에서 URL 을 꺼내는 건 우리 몫이다.
 * 실제 저장·검증(우리 스토리지 경로인지, medium 이 카탈로그에 있는지)은 서버가 한다.
 *
 * 반환: 실패 사유(사용자에게 보일 문장) 또는 null(적용했거나 의도가 없었음).
 */
async function applyStyleAnchorIntent(
  intent: unknown,
  attachmentImageUrls: string[],
  projectId: string | null,
): Promise<string | null> {
  if (!intent || typeof intent !== 'object') return null
  if (!projectId) return null

  const { imageIndex, label, medium } = intent as Record<string, unknown>
  if (typeof imageIndex !== 'number' || !Number.isInteger(imageIndex)) return null

  const imageUrl = attachmentImageUrls[imageIndex]
  if (!imageUrl) {
    // 모델이 없는 인덱스를 짚었다. 조용히 넘기면 "화풍 잡았어요"만 남는다.
    return translate(
      contentLocale(),
      "I couldn't tell which image you meant. Please tell me again.",
    )
  }

  try {
    const res = await fetch('/api/produce/style-anchor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, imageUrl, label, medium }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return typeof body.error === 'string' ? body.error : `HTTP ${res.status}`

    useProducerStore.getState().applyCustomStyleAnchor({
      key: body.key,
      url: body.imageUrl,
      label: body.label,
      medium: body.medium ?? null,
    })
    return null
  } catch (error) {
    return error instanceof Error
      ? error.message
      : translate(contentLocale(), 'Unknown error')
  }
}

interface HandoffBlockers {
  /** 비워있으면 핸드오프를 차단한다 (기존 동작 불변). */
  hard: string[]
  /** 비워있어도 진행하되, 품질(퀴얼리티) 경고를 함께 보여준다(오너 확정 2026-08-28). */
  soft: string[]
}

function handoffBlockers(spec: HandoffSpec): HandoffBlockers {
  const locale = contentLocale()
  if (spec.from === 'producer') {
    const p = useProducerStore.getState()
    const gate = evaluateProducerGate({
      settings: p.projectSettings,
      storyReady: p.storyReady,
      cast: p.cast,
      backgrounds: p.backgrounds,
      styleAnchorKey: p.styleAnchorKey,
      // label/detail 은 게이트가 완역해 돌려준다(#i18n-s5-batch4) — 여기서 다시 번역하지 않는다.
      locale,
    })
    return {
      hard: gate.canHandoff
        ? []
        : gate.hardMissing.map((i) => (i.detail ? `${i.label} (${i.detail})` : i.label)),
      soft: gate.softMissing.map((i) => (i.detail ? `${i.label} (${i.detail})` : i.label)),
    }
  }
  if (spec.from === 'writer') {
    // writer → artist: 씨 매니페스트/샷이 비어 있으면(0개) artist 도 그릴 거리가 없다 — 하드는 아니고(오너 확정) 경고로만.
    const w = useWriterStore.getState()
    const soft: string[] = []
    if ((w.sceneManifest?.scenes.length ?? 0) === 0) {
      soft.push(translate(locale, 'No scenes yet'))
    }
    if (w.shots.length === 0) {
      soft.push(translate(locale, 'No shots yet'))
    }
    return { hard: [], soft }
  }
  if (spec.from === 'artist') {
    const gate = useProjectStore.getState().lifecycleStatus.director
    const hard = gate?.ready === false ? gate.blockers.map((b) => b.label) : []
    // artist → director soft: main 사진만 있고 back/side 가 없는 캐릭터 수 — 하드게이트(main 미생성)와 겹치지 않도록 main 있는 캐릭터만 셀다.
    const missingTurnaroundCount = useArtistStore
      .getState()
      .characterAssets.filter(
        (c) =>
          c.entityType === 'person'
          && c.views.main != null
          && (c.views.back == null || c.views.sideLeft == null || c.views.sideRight == null),
      ).length
    const soft =
      missingTurnaroundCount > 0
        ? [
            translate(locale, '{count} characters have only a main view — no back/side views yet', {
              count: missingTurnaroundCount,
            }),
          ]
        : []
    return { hard, soft }
  }
  if (spec.from === 'director') {
    // director → editor 는 하드 게이트가 없다 (걸어낸 버튼도 항상 활성이었다). soft: final 마킹 영상 없는 샷 수.
    const nodes = useDirectorCanvasStore.getState().nodes
    const shotNodeIds = nodes.filter((n) => isShotData(n.data)).map((n) => n.id)
    const missingFinalCount = shotNodeIds.filter(
      (id) => !nodes.some((n) => isVideoData(n.data) && n.data.parentShotNodeId === id && n.data.final),
    ).length
    const soft =
      missingFinalCount > 0
        ? [
            translate(locale, '{count} shots have no video marked final', {
              count: missingFinalCount,
            }),
          ]
        : []
    return { hard: [], soft }
  }
  return { hard: [], soft: [] }
}

/** 게이트 통과 후 실제 전이. producer 는 writer 파이프라인 발사까지 포함한다. */
async function runHandoff(spec: HandoffSpec): Promise<{ ok: boolean; path: string | null }> {
  if (spec.from === 'producer') {
    const ok = await useProducerStore.getState().saveAndHandoff()
    return { ok, path: ok ? await handoffToStage(spec.to) : null }
  }
  return { ok: true, path: await handoffToStage(spec.to) }
}

export const useGlobalChatStore = create<GlobalChatState>((set, get) => ({
  messages: [],
  loading: false,
  error: null,
  lastTrace: null,
  suggestion: null,
  dismissedSuggestionIds: [],
  pendingProposal: null,
  stageBadges: {},
  pendingNavigatePath: null,
  messagesLoadedProjectId: null,

  loadMessages: async (projectId) => {
    // #welcome-race: 아래 hydrate 의 set 은 suggestion 을 (복원 선택지 또는 null 로) 덮어쓴다.
    //   완료 마커를 로드 전 비우고 모든 종료 경로에서 세워, 제안 발사측이 로드 뒤에만 쏘게 한다.
    set({ messagesLoadedProjectId: null, lastTrace: null })
    const hydrate = (
      rows: Array<{
        stage: string
        role: 'user' | 'model'
        content: string
        created_at?: string
      }>,
    ) => {
      let restoredChoice: ReturnType<typeof parseChoiceSuggestionMarker> = null
      const visible: GlobalChatMessage[] = []
      for (const row of rows) {
        if (typeof row.content !== 'string') continue
        const choiceMarker = parseChoiceSuggestionMarker(row.content)
        if (choiceMarker) {
          restoredChoice = choiceMarker
          continue
        }
        // malformed/old 내부 마커는 렌더링하지 않는다.
        if (isPersistedChatMarker(row.content)) continue
        visible.push({
          id: makeId(),
          stage: row.stage as StageId,
          role: row.role,
          content: row.content,
        })
      }
      const suggestion =
        restoredChoice?.active &&
        restoredChoice.stage &&
        restoredChoice.content !== undefined &&
        restoredChoice.labels
          ? {
              id: restoredChoice.id || `restored-choice:${makeId()}`,
              stage: restoredChoice.stage,
              content: restoredChoice.content,
              dismissible: true,
              action: null,
              restoredChoices: { options: restoredChoice.labels },
            }
          : null
      set({
        messages: visible,
        suggestion,
      })
    }

    // 데모(공유) 세션: /api/* 는 fetch-guard 로 중립화(빈 응답)되므로 스냅샷에서 직접 채팅 이력을 읽는다.
    if (isDemoSession()) {
      const rows = (getDemoSnapshot()?.tables?.messages ?? []) as Array<{
        stage: string
        role: 'user' | 'model'
        content: string
        created_at?: string
      }>
      const ordered = [...rows].sort((a, b) =>
        (a.created_at ?? '').localeCompare(b.created_at ?? ''),
      )
      hydrate(ordered)
      set({ messagesLoadedProjectId: projectId, lastTrace: null })
      return
    }
    try {
      const res = await fetch(`/api/project/${projectId}/messages`)
      if (!res.ok) {
        set({ messages: [], suggestion: null, lastTrace: null, messagesLoadedProjectId: projectId })
        return
      }
      const [{ messages }, persistedTrace] = await Promise.all([
        res.json() as Promise<{ messages?: unknown }>,
        loadLatestChatTrace(projectId),
      ])
      hydrate((messages ?? []) as Array<{
        stage: string
        role: 'user' | 'model'
        content: string
      }>)
      set({ messagesLoadedProjectId: projectId, lastTrace: persistedTrace })
    } catch (err) {
      console.error('[global-chat-store] loadMessages failed:', err)
      // 실패도 "로드 종료"다 — 마커를 세워야 웰컴 등 제안 발사측이 영영 굶지 않는다(빈 이력으로 진행).
      set({ messages: [], suggestion: null, lastTrace: null, messagesLoadedProjectId: projectId })
    }
  },

  sendMessage: async (content, attachments) => {
    const trimmed = content.trim()
    if (!trimmed || get().loading) return
    const attachmentImageUrls = attachments?.imageUrls
    const thumbUrls = attachments?.thumbUrls ?? []

    const stage = useProjectStore.getState().currentStage
    const projectId = useProjectStore.getState().projectId
    const history = get().messages

    // 유저가 말을 걸면 화면에 떠 있는 제안은 종류 불문 내린다(#suggestion-linger 2026-08-06) —
    //   무시하고 딴 얘기를 시작한 넛지가 "나중에"를 누를 때까지 떠 있으면 대화가 아니라 팝업이다.
    //   선택지 칩도 동일(자유 입력 = '기타' 답변). 다른 stage 의 제안은 화면에 없으므로 남기고,
    //   승인 게이트(pendingProposal)는 비용 방어라 별개 — 명시 응답으로만 처리한다.
    //   implicit(#handoff-suggestion-drop 2026-08-07): 자동 내림은 id 를 기록하지 않는다 —
    //   기록하면 핸드오프 준비 완료 버튼이 "나중에"를 누른 적 없이도 세션 내내 사라진다.
    const activeSuggestion = get().suggestion
    if (
      activeSuggestion &&
      (activeSuggestion.stage === stage || activeSuggestion.dismissible === false)
    ) {
      get().dismissSuggestion({ implicit: true })
    }

    const pendingProposal = get().pendingProposal
    if (pendingProposal && pendingProposal.stage === stage && isApprovalUtterance(trimmed)) {
      const userMsg: GlobalChatMessage = {
        id: makeId(),
        stage,
        role: 'user',
        content: trimmed,
      }
      set((state) => ({
        messages: [...state.messages, userMsg],
        loading: true,
        error: null,
      }))
      if (projectId) saveChatMessage(projectId, stage, 'user', trimmed)

      const approved = await get().approvePendingProposal(pendingProposal.id)
      const locale = contentLocale()
      const content = approved
        ? translate(locale, 'Approved: {action}', { action: pendingProposal.action })
        : translate(locale, "Couldn't approve the proposal. Please try again in a moment.")
      set((state) => ({
        loading: false,
        messages: [
          ...state.messages,
          { id: makeId(), stage, role: 'model', content },
        ],
      }))
      if (projectId) saveChatMessage(projectId, stage, 'model', content)
      return
    }

    // 핸드오프 요청(#handoff-to-chat) — LLM 을 거치지 않는다. 되돌리기 어려운 상태 전이라
    //   모델의 해석이 아니라 코드 게이트가 판정해야 한다. 제안 버튼과 직접 타이핑이 모두 여기로 온다.
    const handoffSpec = matchHandoffIntent(trimmed, stage)
    if (handoffSpec) {
      const userMsg: GlobalChatMessage = { id: makeId(), stage, role: 'user', content: trimmed }
      set((state) => ({ messages: [...state.messages, userMsg], loading: true, error: null }))
      if (projectId) saveChatMessage(projectId, stage, 'user', trimmed)

      const { hard, soft } = handoffBlockers(handoffSpec)
      const locale = contentLocale()
      // hard 가 비어야만 진행한다 — soft 가 있어도 차단하지 않는다(오너 확정 2026-08-28). soft 경고 문구는
      //   아래 각 분기점에서 reply 뒤에 붙인다.
      const softWarning = (base: string): string =>
        soft.length > 0
          ? base
              + '\n\n'
              + translate(locale, 'But quality may suffer because these are empty:')
              + '\n'
              + soft.map((s) => `· ${s}`).join('\n')
          : base
      let reply: string
      let path: string | null = null
      if (hard.length > 0) {
        reply =
          translate(locale, "Can't move to {stage} yet. Please fill these in first:", {
            stage: STAGE_LABEL[handoffSpec.to],
          })
          + '\n'
          + hard.map((b) => `· ${b}`).join('\n')
      } else if (handoffSpec.from === 'producer' && handoffSpec.to === 'writer') {
        const accepted = get().offerPendingProposal(
          createPendingProposal({
            stage: 'producer',
            kind: 'producerWriterInitialHandoff',
            target: STAGE_LABEL.writer,
            action: translate(locale, 'Invite Writer'),
            impact: [
              translate(locale, 'Nothing runs until you approve.'),
              ...(soft.length > 0
                ? [
                    translate(locale, 'Quality may suffer because these are empty: {items}', {
                      items: soft.join(', '),
                    }),
                  ]
                : []),
            ],
            payload: {},
          }),
        )
        reply = accepted
          ? softWarning(translate(locale, 'Nothing runs until you approve.'))
          : translate(
              locale,
              'A proposal is already pending, so the new Producer change proposal was held back.',
            )
      } else {
        const result = await runHandoff(handoffSpec)
        path = result.path
        if (result.ok) {
          reply = softWarning(
            handoffSpec.from === 'producer'
              ? translate(
                  locale,
                  'Handed over to {stage}. Starting scene and shot generation — you can follow the progress in the {stage} tab.',
                  { stage: STAGE_LABEL[handoffSpec.to] },
                )
              : translate(locale, 'Moving on to {stage}.', {
                  stage: STAGE_LABEL[handoffSpec.to],
                }),
          )
        } else {
          // 실패 사유 표면화 (#handoff-visibility 2026-08-06) — saveAndHandoff 는 사유를
          //   producer-store.error 에만 남긴다. 채팅으로 요청한 사용자는 채팅에서 이유를
          //   봐야 한다 — 일반 문구만 주면 "그냥 안 되는 기능"으로 읽힌다.
          const detail =
            handoffSpec.from === 'producer' ? useProducerStore.getState().error : null
          reply = detail
            ? translate(locale, 'Handoff failed — {detail}', { detail })
            : translate(locale, 'Handoff failed. Please try again in a moment.')
        }
      }

      // 성공 시 초대 블록(⇄, #oiioii-handoff) — 두 에이전트가 만나는 연출을 스레드에 남기고,
      //   연출이 보일 시간을 준 뒤 스테이지 슬라이드로 이동한다. 마커는 일반 메시지로 영속화
      //   되어 재로드 후에도 스레드에 전이 기록이 남는다 (ref spec §8).
      const inviteMarker = path ? handoffMarker(handoffSpec.from, handoffSpec.to) : null
      set((state) => ({
        loading: false,
        messages: [
          ...state.messages,
          { id: makeId(), stage, role: 'model' as const, content: reply },
          ...(inviteMarker
            ? [{ id: makeId(), stage, role: 'model' as const, content: inviteMarker }]
            : []),
        ],
      }))
      if (projectId) {
        saveChatMessage(projectId, stage, 'model', reply)
        if (inviteMarker) saveChatMessage(projectId, stage, 'model', inviteMarker)
      }
      if (path) {
        const target = path
        setTimeout(() => {
          set({ pendingNavigatePath: target })
        }, HANDOFF_INVITE_NAVIGATE_MS)
      }
      return
    }

    // 전송 윈도잉 (chat-context-management) — 최근 메시지만 LLM에 보낸다. 메시지 개수(WINDOW)와
    //   글자 예산(CHAR_BUDGET) 두 상한을 함께 적용: 긴 단일 메시지가 입력을 부풀리는 것까지 막는다.
    //   전체 히스토리 재전송으로 인한 입력 토큰/비용/벽돌(컨텍스트 한도) 시나리오 방지. prompt
    //   caching이 안정 prefix를 캐싱하므로 윈도우는 안전 캡. 화면 표시는 전체 유지. (compaction은
    //   이보다 훨씬 큰 600K에서만 작동하는 별도 안전망 — claude.ts.) 최소 1개는 항상 포함.
    const recent = history.slice(-CHAT_HISTORY_WINDOW)
    let charBudget = CHAT_HISTORY_CHAR_BUDGET
    const windowed: typeof recent = []
    for (let i = recent.length - 1; i >= 0; i--) {
      const m = recent[i]
      if (charBudget < m.content.length && windowed.length > 0) break
      charBudget -= m.content.length
      windowed.unshift(m)
    }
    const historyPayload = windowed.map((m) => ({
      stage: m.stage,
      role: m.role,
      // 첨부 마커는 렌더링 전용이다 — URL 문자열을 모델에 다시 보내봐야 의미가 없고
      //   턴마다 히스토리 예산만 갉아먹는다.
      content: stripLegacyStageMarkers(
        m.role === 'user' ? parseAttachmentMarker(m.content).text : m.content,
      ),
    }))

    // 데모(공유) 세션: 서버 LLM 호출 없이 canned 응답으로 "척"(typing 후 고정 답변).
    if (isDemoSession()) {
      const uMsg: GlobalChatMessage = {
        id: makeId(),
        stage,
        role: 'user',
        content: trimmed,
      }
      set((s) => ({
        messages: [...s.messages, uMsg],
        loading: true,
        error: null,
      }))
      setTimeout(() => {
        set((s) => ({
          loading: false,
          messages: [
            ...s.messages,
            { id: makeId(), stage, role: 'model', content: cannedFor(stage) },
          ],
        }))
      }, 700)
      return
    }

    let endpoint: string
    let body: Record<string, unknown>

    switch (stage) {
      case 'producer': {
        const p = useProducerStore.getState()
        endpoint = '/api/produce/chat'
        // 게이트 상태를 함께 보낸다 — 핸드오프 가부는 코드 게이트가 판정하므로(architecture §3),
        //   채팅이 자기 기준으로 "준비 완료"를 선언하지 않고 실제 남은 항목을 안내하도록.
        const gate = evaluateProducerGate({
          settings: p.projectSettings,
          storyReady: p.storyReady,
          cast: p.cast,
          backgrounds: p.backgrounds,
          styleAnchorKey: p.styleAnchorKey,
          // 이 목록은 모델 컨텍스트로 들어가고 모델이 답변에서 그대로 되읊는다 — 응답 언어
          //   (= 프로젝트 locale, responseLanguageDirective)와 맞춘다(#i18n-content-voice).
          locale: contentLocale(),
        })
        body = {
          message: trimmed,
          history: historyPayload,
          attachmentImageUrls: attachmentImageUrls ?? [],
          currentSettings: p.projectSettings,
          storyText: p.storyText,
          currentCast: p.cast,
          currentBackgrounds: p.backgrounds,
          gate: {
            canHandoff: gate.canHandoff,
            hardMissing: gate.hardMissing.map((i) => (i.detail ? `${i.label} (${i.detail})` : i.label)),
            softMissing: gate.softMissing.map((i) => (i.detail ? `${i.label} (${i.detail})` : i.label)),
          },
          // 서버가 projects.locale 을 조회해 응답 언어를 강제할 수 있게 전달(#i18n-s5-batch6-chat).
          projectId,
        }
        break
      }
      case 'artist': {
        // Card UI (artist-store) — no canvas graph. Provide a lightweight asset
        // summary in place of the former serializeCanvasContext output.
        const a = useArtistStore.getState()
        // 스냅샷에 이미지 보유 현황 포함 — 채팅이 "어떤 뷰가 비어있는지" 즉답 가능 (chat-aware-regeneration)
        const charLines = a.characterAssets.map((c) => {
          const filled = (['main', 'back', 'sideLeft', 'sideRight'] as const)
            .filter((v) => c.views[v])
            .join(', ')
          return `- ${c.name} (${c.characterId}) — views: ${filled || '(없음)'}`
        })
        const worldLines = a.worldAssets.map((w) => {
          const shots = [w.wideShot ? 'wide' : null]
            .filter(Boolean)
            .join(', ')
          return `- ${w.name} (${w.locationId}) — shots: ${shots || '(없음)'}`
        })
        const canvasContext = [
          '## Artist 에셋',
          `### 캐릭터 (${a.characterAssets.length})`,
          ...(charLines.length ? charLines : ['- (없음)']),
          `### 장소 (${a.worldAssets.length})`,
          ...(worldLines.length ? worldLines : ['- (없음)']),
        ].join('\n')
        endpoint = '/api/artist/chat'
        body = {
          message: trimmed,
          history: historyPayload,
          canvasContext,
          // 서버가 generation_jobs 활동 로그(작업공간 인식)를 주입할 수 있게 전달 (chat-aware-regeneration)
          projectId,
        }
        break
      }
      case 'director': {
        // Director Canvas agentic 모드 — 항상 canvasContext 전달.
        // (unify-director-store-db Step 1: 옛 director-store legacy 분기 제거, canvas가 단일 진실)
        const canvasState = useDirectorCanvasStore.getState()
        const canvasContext = serializeDirectorCanvasContext(canvasState)
        endpoint = '/api/director/chat'
        body = {
          message: trimmed,
          history: historyPayload,
          canvasContext,
          // 서버가 projects.locale 을 조회해 응답 언어를 강제할 수 있게 전달(#i18n-s5-batch6-chat).
          projectId,
        }
        break
      }
      case 'writer': {
        // Writers' Room agentic 모드 — 스크립트 라인 스냅샷을 컨텍스트와 L번호 해석표에 함께 사용.
        const writerState = useWriterStore.getState()
        const scriptLines = buildScriptLines(writerState.sceneManifest, writerState.shots)
        const lineRefs = resolveLineRefs(trimmed, scriptLines)
        endpoint = '/api/writer/chat'
        body = {
          message: trimmed,
          history: historyPayload,
          // 인물 id 화이트리스트(#F-003 R1) — 서버가 DB 로스터로 모델 출력을 거른다.
          projectId,
          writerContext: serializeWriterScriptContext(
            writerState.sceneManifest,
            writerState.shots,
            scriptLines,
          ),
          ...(lineRefs.length > 0 ? { lineRefs } : {}),
        }
        break
      }
      default:
        set({
          error: 'Chat is not available on this stage yet.',
        })
        return
    }

    const traceId = createChatTraceId()
    body.traceId = traceId
    const requestTrace = buildChatTrace({
      traceId,
      stage,
      route: endpoint.replace(/^\/api\//, ''),
      system: '',
      history: historyPayload,
      contextMessage: JSON.stringify(body),
    })

    // 스레드에 남는 본문에는 첨부 마커를 붙이고, LLM 에는 아래에서 trimmed(순수 텍스트)만 보낸다.
    const displayContent = withAttachmentMarker(trimmed, thumbUrls)
    const userMsg: GlobalChatMessage = {
      id: makeId(),
      stage,
      role: 'user',
      content: displayContent,
    }

    set((state) => ({
      messages: [...state.messages, userMsg],
      loading: true,
      error: null,
      lastTrace: requestTrace,
    }))

    if (projectId) saveChatMessage(projectId, stage, 'user', displayContent)

    // 응답 중단 (#oiioii-chat) — Stop 버튼이 이 컨트롤러를 abort 한다. LLM 호출 경로에만
    //   건다(핸드오프·승인 등 로컬 빠른 경로는 순식간이라 중단 대상이 아니다).
    const controller = new AbortController()
    activeGeneration = controller
    let responseStatus: number | null = null
    try {
      const res = await fetch(endpoint, {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      responseStatus = res.status
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      const replyValue = data.reply ?? data.message ?? ''
      const reply = stripLegacyStageMarkers(
        typeof replyValue === 'string' ? replyValue : String(replyValue),
      )
      const trace =
        data.trace && typeof data.trace === 'object'
          ? (data.trace as ChatTrace)
          : null
      const patchTrace = (patch: Partial<ChatTrace>) => {
        if (!trace) return
        set((state) =>
          state.lastTrace?.traceId === trace.traceId
            ? { lastTrace: { ...state.lastTrace, ...patch } }
            : state,
        )
        if (projectId) saveChatTracePatch(projectId, trace.traceId, patch)
      }
      const observeGeneration: GenerationJobObserver = (receipt) => {
        const generationJobs = get().lastTrace?.generationJobs ?? []
        const nextJobs = receipt.jobId
          ? (() => {
              const existing = generationJobs.find((job) => job.jobId === receipt.jobId)
              const next: ChatGenerationJobTrace = {
                jobId: receipt.jobId,
                kind: existing?.kind ?? 'generation',
                status:
                  receipt.status === 'completed' || receipt.status === 'failed'
                    ? receipt.status
                    : 'queued',
                resultReady: receipt.status === 'completed' && !!receipt.resultUrl,
                error: receipt.error ?? null,
              }
              return existing
                ? generationJobs.map((job) => (job.jobId === receipt.jobId ? next : job))
                : [...generationJobs, next]
            })()
          : generationJobs
        patchTrace({
          generationStatus: generationStatusOf(receipt.status),
          generationJobs: nextJobs,
          ...(receipt.jobId ? { jobId: receipt.jobId } : {}),
          ...(receipt.httpStatus != null ? { generationHttpStatus: receipt.httpStatus } : {}),
          ...(receipt.error ? { error: receipt.error } : { error: null }),
        })
      }

      set((state) => ({
        loading: false,
        lastTrace: trace,
        messages: [
          ...state.messages,
          {
            id: makeId(),
            stage,
            role: 'model',
            content: reply,
          },
        ],
      }))

      if (projectId) saveChatMessage(projectId, stage, 'model', reply)

      if (stage === 'producer' && data.extractedSettings) {
        // 영수증은 실제 결과를 기록한다 — 승인 카드로 간 것을 applied로 적으면 거짓 영수증이 된다.
        //   제안에 traceId를 실어 승인/거절이 같은 trace로 이어지게 한다.
        const extractOutcome = useProducerStore
          .getState()
          .applyExtractedSettings(data.extractedSettings, trace?.traceId ?? null)
        patchTrace(
          extractOutcome === 'pending'
            ? { pendingProposal: true }
            : extractOutcome === 'rejected'
              ? { skippedCount: 1 }
              : { appliedCount: extractOutcome === 'applied' ? 1 : 0 },
        )

        // #p1-attach: 채팅이 "이 그림체로" 의도를 읽었으면 앵커로 확정한다.
        //   모델은 인덱스만 주고 URL 은 우리가 이번 턴 첨부에서 꺼낸다 — 모델이 뱉은 URL 은
        //   나중에 이미지 생성 프로바이더가 직접 가져가므로 신뢰하면 안 된다.
        const anchorError = await applyStyleAnchorIntent(
          data.extractedSettings.styleAnchorFromAttachment,
          attachmentImageUrls ?? [],
          projectId,
        )
        if (anchorError) {
          patchTrace({ skippedCount: 1 })
          // 모델은 이미 "이 화풍으로 잡았어요"라고 답했다. 저장이 실패했는데 조용하면 거짓말이 된다.
          const failure = translate(
            contentLocale(),
            "Couldn't save the art style — {reason}",
            { reason: anchorError },
          )
          set((state) => ({
            messages: [...state.messages, { id: makeId(), stage, role: 'model', content: failure }],
          }))
          if (projectId) saveChatMessage(projectId, stage, 'model', failure)
        }
      }
      // #p4-choices: 에이전트가 낸 선택지를 버튼 제안으로 — 클릭 = 채팅 입력.
      if (stage === 'producer' && Array.isArray(data.choices) && data.choices.length >= 2) {
        get().offerSuggestion({
          id: `choices:${makeId()}`,
          stage: 'producer',
          dismissible: true,
          // 질문은 직전 reply 가 이미 물었다 — 칩 위 질문 라벨은 비운다(#p4-choices v2).
          content: '',
          action: {
            kind: 'choices',
            options: (data.choices as string[]).slice(0, 4).map((c) => ({ label: c, utterance: c })),
          },
        })
      }
      if (stage === 'artist' && Array.isArray(data.updates)) {
        const updates = data.updates as ArtistUpdate[]
        const costUpdate = updates.find((u) =>
          u.type === 'regenerateCharacter' || u.type === 'regenerateWorldAsset'
        )
        const immediateUpdates = updates.filter((u) => u.type === 'createCharacter')

        if (costUpdate) {
          // 승인 카드의 target 은 사람이 읽는 제목 — id(char_2 등)가 아니라 이름으로(#d2 2026-08-11).
          //   이름을 모르면 id 그대로(지어내지 않는다).
          const artistState = useArtistStore.getState()
          const characterName =
            costUpdate.type === 'regenerateCharacter'
              ? artistState.characterAssets.find(
                  (c) => c.characterId === costUpdate.characterId,
                )?.name || costUpdate.characterId
              : null
          const locationName =
            costUpdate.type === 'regenerateWorldAsset'
              ? artistState.worldAssets.find((w) => w.locationId === costUpdate.locationId)
                  ?.name || costUpdate.locationId
              : null
          // createPendingProposal 의 렌더 지점은 아직 t() 를 안 태운다 — producer-store 와 같은
          //   방식으로 여기서 미리 완역해 넘긴다(#i18n-s5-batch4, ko 출력은 기존과 동일).
          const locale = contentLocale()
          const proposal = costUpdate.type === 'regenerateCharacter'
            ? createPendingProposal({
                traceId,
                stage: 'artist',
                kind: costUpdate.views?.length === 1
                  ? 'artistRegenerateCharacterView'
                  : costUpdate.views && costUpdate.views.length > 1
                    ? 'artistRegenerateCharacterViews'
                    : 'artistRegenerateCharacterAllViews',
                target: characterName ?? costUpdate.characterId,
                action: costUpdate.views?.length
                  ? translate(locale, 'Regenerate character views: {views}', {
                      views: costUpdate.views.join(', '),
                    })
                  : translate(locale, 'Regenerate all character views'),
                impact: [
                  translate(locale, 'Costs money to generate the image.'),
                  translate(
                    locale,
                    'The currently selected image stays until the new one is done.',
                  ),
                  translate(locale, 'Regeneration does not start until you approve.'),
                ],
                payload: {
                  characterId: costUpdate.characterId,
                  view: costUpdate.views?.[0],
                  views: costUpdate.views,
                },
              })
            : createPendingProposal({
                traceId,
                stage: 'artist',
                kind: 'artistRegenerateWorldAsset',
                target: locationName ?? costUpdate.locationId,
                action: translate(locale, 'Regenerate the world/background image'),
                impact: [
                  translate(locale, 'Costs money to generate the image.'),
                  translate(
                    locale,
                    'World images are not a default hard blocker for the MVP Director gate.',
                  ),
                  translate(locale, 'Regeneration does not start until you approve.'),
                ],
                payload: { locationId: costUpdate.locationId },
              })

          const accepted = get().offerPendingProposal(proposal)
          if (!accepted)
            set({
              error: translate(
                locale,
                'A proposal is already pending, so the new Artist generation proposal was held back.',
              ),
            })
        }

        if (immediateUpdates.length > 0) {
          void useArtistStore
            .getState()
            .applyUpdates(immediateUpdates)
            .then(() => patchTrace({ appliedCount: immediateUpdates.length }))
            .catch(() => patchTrace({ skippedCount: 1 }))
        }

        // 원천(외형) 변경 제안(C3 F6) — 자동 실행 금지, pending-proposal 승인 게이트 전용.
        const appearanceProposals = Array.isArray(data.proposals) ? data.proposals : []
        if (appearanceProposals.length > 0 && !get().pendingProposal) {
          const ap = appearanceProposals[0] as { characterId: string; appearance: string }
          const apName =
            useArtistStore.getState().characterAssets.find((c) => c.characterId === ap.characterId)
              ?.name || ap.characterId
          const apLocale = contentLocale()
          get().offerPendingProposal(
            createPendingProposal({
              traceId,
              stage: 'artist',
              kind: 'artistSourceAppearancePatch',
              target: apName,
              action: translate(apLocale, 'Change the base character appearance (source): {appearance}', {
                appearance: `${ap.appearance.slice(0, 60)}${ap.appearance.length > 60 ? '…' : ''}`,
              }),
              impact: [
                translate(apLocale, "The character's canonical appearance (source) changes."),
                translate(
                  apLocale,
                  'After approval the existing images of that character are marked stale — they are not regenerated automatically.',
                ),
                translate(apLocale, 'The appearance does not change until you approve.'),
              ],
              payload: { characterId: ap.characterId, appearance: ap.appearance },
            }),
          )
        }
        patchTrace({
          appliedCount: immediateUpdates.length,
          skippedCount: 0,
          pendingProposal: get().pendingProposal?.traceId === traceId,
          generationStatus:
            get().pendingProposal?.traceId === traceId ? 'awaiting_approval' : null,
        })
      }
      if (stage === 'director') {
        // Agentic 응답 — DirectorCanvasUpdate[]
        if (Array.isArray(data.updates)) {
          const updates = data.updates as DirectorCanvasUpdate[]
          // 이미지는 과금 생성이므로 채팅 응답에서 바로 실행하지 않는다. 같은 응답의 무과금
          // 수정은 즉시 반영하되, 이미지 생성은 하나의 승인 카드로만 묶는다.
          const imageUpdates = updates.filter((update) => update.type === 'generateImage')
          const immediateUpdates = updates.filter((update) => update.type !== 'generateImage')
          let imageProposalAccepted = false
          if (imageUpdates.length > 0) {
            const locale = contentLocale()
            imageProposalAccepted = get().offerPendingProposal(
              createPendingProposal({
                traceId,
                stage: 'director',
                kind: 'directorGenerateStoryboardImage',
                target: translate(locale, 'Storyboard image'),
                action: translate(locale, 'Generate image'),
                impact: [
                  translate(locale, 'Costs money to generate the image.'),
                  translate(locale, 'Nothing runs until you approve.'),
                ],
                payload: { updates: imageUpdates },
              }),
            )
            if (!imageProposalAccepted) {
              set({
                error: translate(
                  locale,
                  'A proposal is already pending, so the new Director image generation proposal was held back.',
                ),
              })
            }
          }
          const result = useDirectorCanvasStore
            .getState()
            .applyUpdates(immediateUpdates, {
              traceId,
              onJob: observeGeneration,
            })
          patchTrace({
            appliedCount: result.applied,
            skippedCount: result.skipped.length,
            pendingProposal: imageProposalAccepted,
            ...(imageProposalAccepted
              ? { generationStatus: 'awaiting_approval' }
              : immediateUpdates.some((u) => u.type === 'generateVideo') &&
                  result.skipped.length > 0
              ? { generationStatus: 'skipped' }
              : {}),
          })
          if (result.skipped.length > 0) {
            console.warn(
              '[global-chat-store] director updates skipped:',
              result.skipped,
            )
            // #p4-understand B: director 쪽도 침묵 스킵 제거.
            toast.warning(
              translate(contentLocale(), "Couldn't apply {count} changes", {
                count: result.skipped.length,
              }),
            )
          }
          // 방어선(#영상거짓수락) — 프롬프트 규칙이 뚫려 모델이 그래도 generateVideo 를 냈을 때,
          //   "생성할게요" 라고 이미 답한 채팅에 거절 흔적이 안 남는 사고를 막는다. skip 사유로
          //   판별해 정직한 안내를 별도 모델 메시지로 영속화한다(원래 reply 는 건드리지 않는다).
          if (result.skipped.some((s) => s.update.type === 'generateVideo')) {
            const honestNotice = translate(
              contentLocale(),
              "Chat doesn't support video generation yet — please use the video generation button on the canvas.",
            )
            set((state) => ({
              messages: [
                ...state.messages,
                { id: makeId(), stage, role: 'model' as const, content: honestNotice },
              ],
            }))
            if (projectId) saveChatMessage(projectId, stage, 'model', honestNotice)
          }
        }
      }
      if (stage === 'writer' && Array.isArray(data.updates)) {
        // #p4-understand B2: clarify(되묻기)는 CRUD 가 아님 — 후보 버튼 제안으로 분리.
        const rawUpdates = data.updates as WriterChatUpdate[]
        const clarify = rawUpdates.find(
          (u): u is Extract<WriterChatUpdate, { type: 'clarify' }> => u.type === 'clarify',
        )
        if (clarify) {
          get().offerSuggestion({
            id: `clarify:${makeId()}`,
            stage: 'writer',
            dismissible: true,
            content: clarify.question,
            action: {
              kind: 'choices',
              options: clarify.candidates.map((c) => ({ label: c, utterance: c })),
            },
          })
        }
        // 검증된 씬/샷 CRUD 액션 — writer-store 가 기존 CRUD 로 DB 반영.
        const result = await useWriterStore
          .getState()
          .applyChatUpdates(rawUpdates.filter((u) => u.type !== 'clarify'))
        patchTrace({
          appliedCount: result.applied,
          skippedCount: result.skipped.length,
          pendingProposal: result.pendingDialogueShrinks.length > 0,
        })
        // #p4-understand B: 침묵 no-op 제거 — 적용/건너뜀을 즉시 표면화.
        const locale = contentLocale()
        if (result.skipped.length > 0) {
          toast.warning(
            translate(locale, "Couldn't apply {count} changes — {reason}", {
              count: result.skipped.length,
              reason: result.skipped[0].reason,
            }),
          )
        } else if (result.applied > 0) {
          toast.success(translate(locale, '{count} changes applied', { count: result.applied }))
        }
        for (const shrink of result.pendingDialogueShrinks) {
          const proposal = createPendingProposal({
            traceId,
            stage: 'writer',
            kind: 'writerShrinkDialogue',
            target: shrink.shotId,
            action: translate(locale, 'Cut dialogue from {from} lines down to {to}', {
              from: shrink.currentDialogueLines.length,
              to: shrink.dialogueLines.length,
            }),
            impact: [
              deletedDialoguePreview(shrink.currentDialogueLines, shrink.dialogueLines),
              translate(locale, 'Nothing is applied until you approve.'),
            ],
            payload: {
              shotId: shrink.shotId,
              dialogueLines: shrink.dialogueLines,
            },
          })
          const accepted = get().offerPendingProposal(proposal)
          if (!accepted) {
            set({
              error: translate(
                locale,
                'A proposal is already pending, so the new Writer dialogue reduction proposal was held back.',
              ),
            })
            break
          }
        }
        patchTrace({
          pendingProposal:
            result.pendingDialogueShrinks.length > 0 && !!get().pendingProposal,
        })
      }
    } catch (err) {
      // 사용자가 Stop 을 눌렀다 — 에러가 아니라 의도. 조용히 대기 상태만 푼다.
      if (err instanceof DOMException && err.name === 'AbortError') {
        set((state) =>
          state.lastTrace?.traceId === traceId
            ? {
                loading: false,
                lastTrace: {
                  ...state.lastTrace,
                  stopReason: 'aborted',
                  error: null,
                },
              }
            : { loading: false },
        )
        return
      }
      const error = err instanceof Error ? err.message : 'Chat failed'
      set({
        loading: false,
        error,
        lastTrace: {
          ...requestTrace,
          requestStatus: responseStatus,
          error,
          stopReason: null,
        },
      })
      if (projectId) {
        saveChatTrace(projectId, {
          ...requestTrace,
          requestStatus: responseStatus,
          error,
          stopReason: null,
        })
      }
    } finally {
      if (activeGeneration === controller) activeGeneration = null
    }
  },

  // Stop 버튼 (#oiioii-chat) — 진행 중인 LLM 응답을 중단. 응답 없는 경로(핸드오프 등)면 no-op.
  stopGeneration: () => {
    activeGeneration?.abort()
    activeGeneration = null
  },

  appendLocalExchange: (stage, userText, modelText) => {
    const projectId = useProjectStore.getState().projectId
    set((state) => ({
      messages: [
        ...state.messages,
        { id: makeId(), stage, role: 'user', content: userText },
        { id: makeId(), stage, role: 'model', content: modelText },
      ],
    }))
    if (projectId) {
      saveChatMessage(projectId, stage, 'user', userText)
      saveChatMessage(projectId, stage, 'model', modelText)
    }
  },

  // 프로액티브 제안 띄우기 — 한 번에 하나만(이미 떠 있으면 무시), 이미 dismiss/승인한 id 도 무시.
  offerSuggestion: (suggestion, opts) => {
    const { suggestion: current, dismissedSuggestionIds } = get()
    // blocking 게이트(dismissible:false)는 "닫을 수 없는" 제안이라 닫힘 기록에 갇히지 않는다 —
    //   파이프라인이 멈춰 사용자 확정을 반드시 받아야 하므로, 어떤 경로로 사라졌든(implicit
    //   dismiss·확정 실패) 서버 상태가 요구하는 한 항상 다시 세운다
    //   (#fix-scene-gate-suggestion-resurface 2026-08-25).
    if (suggestion.dismissible !== false && dismissedSuggestionIds.includes(suggestion.id)) return
    if (current) {
      if (current.id === suggestion.id) return // 이미 그 제안이 떠 있다
      // 선점 (#handoff-starved 2026-08-11) — 슬롯이 비기를 기다리기만 하면 영영 못 뜨는 제안이 있다.
      //   producer 채팅은 시스템 프롬프트상 되물을 거리가 있으면 거의 매 응답마다 [CHOICES] 를 내고,
      //   선택지도 같은 제안 슬롯을 쓴다. 그래서 게이트가 충족되는 순간에도 슬롯이 이미 차 있어
      //   "Writer 호출하기" 가 나타나지 못했다. 명시적으로 선점을 요청한 제안만 기존 것을 밀어낸다
      //   (암묵 교체는 금지 — 사용자가 답하려던 질문이 소리 없이 사라지면 안 된다).
      if (!opts?.preempt) return
      // 내릴 수 없는 제안(웰컴 등)은 못 민다.
      if (current.dismissible === false) return
      if (
        (current.action?.kind === 'choices' || current.restoredChoices) &&
        suggestion.action?.kind !== 'choices'
      ) {
        saveChoiceClearMarker(current.stage)
      }
    }
    set({ suggestion })
    if (suggestion.action?.kind === 'choices') saveChoiceStateMarker(suggestion)
  },

  // dismiss(또는 승인) — 제안을 내리고 id 를 기록해 같은 세션 재진입 시 재발사 막는다.
  //   implicit dismiss(유저가 다른 말을 해서 자동으로 내려간 것)는 기록하지 않는다 —
  //   명시적 거절("나중에"/선택 사용)만 재발사를 막을 자격이 있다(#handoff-suggestion-drop).
  dismissSuggestion: (opts) => {
    const current = get().suggestion
    if (current?.action?.kind === 'choices' || current?.restoredChoices) {
      saveChoiceClearMarker(current.stage)
    }
    set((state) => ({
      suggestion: null,
      dismissedSuggestionIds:
        state.suggestion && !opts?.implicit
          ? [...state.dismissedSuggestionIds, state.suggestion.id]
          : state.dismissedSuggestionIds,
    }))
  },

  offerPendingProposal: (proposal) => {
    const current = get().pendingProposal
    if (current && current.id !== proposal.id) return false
    set({ pendingProposal: proposal })
    return true
  },

  dismissPendingProposal: (id) => {
    const proposal = get().pendingProposal
    if (!proposal || (id && proposal.id !== id)) return
    set({ pendingProposal: null })
    const projectId = useProjectStore.getState().projectId
    if (proposal.traceId && projectId) {
      saveChatTracePatch(projectId, proposal.traceId, {
        pendingProposal: false,
        generationStatus: 'skipped',
      })
      set((state) => {
        const current = state.lastTrace
        if (!current || current.traceId !== proposal.traceId) return state
        return {
          lastTrace: {
            ...current,
            pendingProposal: false,
            generationStatus: 'skipped',
          },
        }
      })
    }
  },

  approvePendingProposal: async (id) => {
    const proposal = get().pendingProposal
    if (!proposal) return false
    if (id && proposal.id !== id) return false
    const projectId = useProjectStore.getState().projectId
    const traceId = proposal.traceId ?? null
    const patchTrace = (patch: Partial<ChatTrace>) => {
      if (!traceId) return
      set((state) =>
        state.lastTrace?.traceId === traceId
          ? { lastTrace: { ...state.lastTrace, ...patch } }
          : state,
      )
      if (projectId) saveChatTracePatch(projectId, traceId, patch)
    }
    const observeGeneration: GenerationJobObserver = (receipt) => {
      const generationJobs = get().lastTrace?.generationJobs ?? []
      const nextJobs = receipt.jobId
        ? (() => {
            const existing = generationJobs.find((job) => job.jobId === receipt.jobId)
            const next: ChatGenerationJobTrace = {
              jobId: receipt.jobId,
              kind: existing?.kind ?? proposal.kind,
              status:
                receipt.status === 'completed' || receipt.status === 'failed'
                  ? receipt.status
                  : 'queued',
              resultReady: receipt.status === 'completed' && !!receipt.resultUrl,
              error: receipt.error ?? null,
            }
            return existing
              ? generationJobs.map((job) => (job.jobId === receipt.jobId ? next : job))
              : [...generationJobs, next]
          })()
        : generationJobs
      patchTrace({
        pendingProposal: false,
        generationStatus: generationStatusOf(receipt.status),
        generationJobs: nextJobs,
        ...(receipt.jobId ? { jobId: receipt.jobId } : {}),
        ...(receipt.httpStatus != null ? { generationHttpStatus: receipt.httpStatus } : {}),
        ...(receipt.error ? { error: receipt.error } : { error: null }),
      })
    }

    // 카드는 승인 즉시 내린다(#d2 2026-08-11) — 옛 코드는 실행이 다 끝나야 지웠는데, 뷰 3개
    //   재생성이면 그게 수 분이라 "승인을 눌렀는데 안 사라진다"로 읽혔다. 진행은 상단 알림바가,
    //   실패는 error 배너가 보고한다.
    set({ pendingProposal: null })
    patchTrace({ pendingProposal: false })
    try {
      if (proposal.kind === 'producerSourcePatch') {
        useProducerStore
          .getState()
          .applyProducerSourcePatch(proposal.payload.patch as ExtractedSettings)
        // 승인 후에야 실제 적용 — 이 시점에 applied로 집계한다(생성 Job 없는 무과금 패치).
        patchTrace({ appliedCount: 1 })
      } else if (proposal.kind === 'producerWriterInitialHandoff') {
        const ok = await useProducerStore.getState().saveAndHandoff()
        if (!ok) return false
        const path = await handoffToStage('writer')
        if (path) set({ pendingNavigatePath: path })
      } else if (proposal.kind === 'producerWriterRerunRequest') {
        const ok = await useProducerStore.getState().saveAndHandoff({ rerun: true })
        if (!ok) return false
        // 승인된 rerun도 최초 핸드오프와 같은 Writer 생성 화면으로 이동한다.
        const path = await handoffToStage('writer')
        if (path) set({ pendingNavigatePath: path })
      } else if (proposal.kind === 'artistRegenerateCharacterView') {
        const characterId = proposal.payload.characterId
        const view = proposal.payload.view
        if (typeof characterId !== 'string') throw new Error('characterId missing')
        if (!['main', 'back', 'sideLeft', 'sideRight'].includes(String(view))) {
          throw new Error('view missing')
        }
        const receipt = await useArtistStore
          .getState()
          .generateCharacterView(
            characterId,
            view as 'main' | 'back' | 'sideLeft' | 'sideRight',
            'chat',
            undefined,
            undefined,
            { traceId: traceId ?? undefined, onJob: observeGeneration },
          )
        if (receipt?.status === 'failed' || receipt?.status === 'timed_out') return false
      } else if (proposal.kind === 'artistRegenerateCharacterViews') {
        const characterId = proposal.payload.characterId
        const views = proposal.payload.views
        if (typeof characterId !== 'string') throw new Error('characterId missing')
        if (!Array.isArray(views)) throw new Error('views missing')
        for (const view of views) {
          if (!['main', 'back', 'sideLeft', 'sideRight'].includes(String(view))) {
            throw new Error('view missing')
          }
        }
        for (const view of views) {
          const receipt = await useArtistStore
            .getState()
            .generateCharacterView(
              characterId,
              view as 'main' | 'back' | 'sideLeft' | 'sideRight',
              'chat',
              undefined,
              undefined,
              { traceId: traceId ?? undefined, onJob: observeGeneration },
            )
          if (receipt?.status === 'failed' || receipt?.status === 'timed_out') return false
        }
      } else if (proposal.kind === 'artistRegenerateCharacterAllViews') {
        const characterId = proposal.payload.characterId
        if (typeof characterId !== 'string') throw new Error('characterId missing')
        const receipt = await useArtistStore
          .getState()
          .generateCharacterAllViews(characterId, 'chat', undefined, {
            traceId: traceId ?? undefined,
            onJob: observeGeneration,
          })
        if (receipt?.status === 'failed' || receipt?.status === 'timed_out') return false
      } else if (proposal.kind === 'artistRegenerateWorldAsset') {
        const locationId = proposal.payload.locationId
        if (typeof locationId !== 'string') throw new Error('locationId missing')
        await useArtistStore
          .getState()
          .generateWorldAsset(locationId, 'chat', {
            traceId: traceId ?? undefined,
            onJob: observeGeneration,
          })
      } else if (proposal.kind === 'artistSourceAppearancePatch') {
        const characterId = proposal.payload.characterId
        const appearance = proposal.payload.appearance
        if (typeof characterId !== 'string' || typeof appearance !== 'string') {
          throw new Error('appearance patch payload missing')
        }
        const projectId = useProjectStore.getState().projectId
        const res = await fetch('/api/artist/appearance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, characterId, appearance }),
        })
        if (!res.ok) {
          const b = await res.json().catch(() => ({}))
          throw new Error(b.error ?? `appearance patch failed HTTP ${res.status}`)
        }
        // 로컬 외형 갱신 → 기존 파생 이미지가 즉시 stale 로 표시(자동 재생성 없음, #57). 이후 cc 가 재생성 제안.
        useArtistStore.getState().applyAppearancePatch(characterId, appearance)
      } else if (proposal.kind === 'directorGenerateStoryboardImage') {
        const payloadUpdates = proposal.payload.updates
        if (!Array.isArray(payloadUpdates) || payloadUpdates.length === 0) {
          throw new Error('storyboard image updates missing')
        }
        const updates: DirectorCanvasUpdate[] = payloadUpdates.map((update) => {
          if (
            !update ||
            typeof update !== 'object' ||
            Array.isArray(update) ||
            (update as Record<string, unknown>).type !== 'generateImage' ||
            !Object.keys(update).every((key) => key === 'type' || key === 'id') ||
            ('id' in update &&
              (typeof (update as Record<string, unknown>).id !== 'string' ||
                !(update as Record<string, string>).id.trim()))
          ) {
            throw new Error('invalid storyboard image update')
          }
          const id = (update as Record<string, unknown>).id
          return typeof id === 'string' ? { type: 'generateImage', id } : { type: 'generateImage' }
        })
        const result = useDirectorCanvasStore.getState().applyUpdates(updates, {
          traceId: traceId ?? undefined,
          onJob: observeGeneration,
        })
        if (result.applied === 0) {
          throw new Error('no storyboard image updates could run')
        }
      } else if (proposal.kind === 'writerShrinkDialogue') {
        const shotId = proposal.payload.shotId
        const dialogueLines = proposal.payload.dialogueLines
        if (typeof shotId !== 'string' || !Array.isArray(dialogueLines)) {
          throw new Error('dialogue shrink payload missing')
        }
        useWriterStore
          .getState()
          .updateShot(shotId, { dialogueLines: dialogueLines as DialogueLine[] })
      }
      return true
    } catch (err) {
      patchTrace({
        pendingProposal: false,
        generationStatus: 'failed',
        error: err instanceof Error ? err.message : 'Failed to run the proposal',
      })
      set({
        error:
          err instanceof Error
            ? err.message
            : translate(contentLocale(), 'Failed to run the proposal'),
      })
      return false
    }
  },

  // 백그라운드 생성 완료 통지 (Phase 2). 유저가 *다른* stage에 있을 때만 알린다(보고 있으면 불필요).
  //   배지는 매번 bump(가벼운 카운트), 채팅 메시지는 stage당 10초 스로틀(배치 스팸 방지).
  notifyCompletion: (stage, label) => {
    const currentStage = useProjectStore.getState().currentStage
    if (currentStage === stage) return // 이미 해당 stage를 보고 있음 → 알림 불필요

    set((state) => ({
      stageBadges: {
        ...state.stageBadges,
        [stage]: (state.stageBadges[stage] ?? 0) + 1,
      },
    }))

    // 완료 메시지는 즉시 쌓지 않고 stage+label 로 모아 조용해지면 한 줄로 flush(스팸 방지).
    const key = completionKey(stage, label)
    const existing = pendingCompletions[key]
    if (existing) {
      existing.count += 1
      clearTimeout(existing.timer)
      existing.timer = setTimeout(() => flushCompletion(stage, label), COMPLETION_COALESCE_MS)
    } else {
      pendingCompletions[key] = {
        count: 1,
        timer: setTimeout(() => flushCompletion(stage, label), COMPLETION_COALESCE_MS),
      }
    }
  },

  // 생성 트리거 실패 통지(#double-fire 2026-07-31) — 방금 누른 버튼의 즉답이므로 완료 통지와
  //   달리 코얼레싱하지 않고 바로 띄우고, 보고 있는 stage 여도 띄운다(사용자가 결과를 기다리는 중).
  //   다만 같은 문구가 연속으로 쌓이는 것은 막는다 — 일괄 생성이 같은 사유로 무더기 실패할 때
  //   채팅이 같은 줄로 도배되는 것을 피한다.
  notifyActionError: (stage, label, message) => {
    const trimmed = message.trim()
    // ⚠ prefix 는 상태 행 판별(chat-blocks.classifyChatMessage)이 읽는 고정 마커다 — 번역 밖에 둔다.
    const locale = contentLocale()
    get().notifyIssue(
      stage,
      `⚠ ${translate(locale, "Couldn't start {label} generation — {message}", {
        label,
        message: trimmed || translate(locale, 'Unknown error'),
      })}`,
    )
  },

  notifyIssue: (stage, content) => {
    // 같은 문구 연속 중복 방지 — 병렬 생성이 같은 사유로 무더기 실패하면 스레드가 도배된다.
    const last = get().messages[get().messages.length - 1]
    if (last && last.role === 'model' && last.content === content) return
    set((state) => ({
      messages: [...state.messages, { id: makeId(), stage, role: 'model', content }],
    }))
    const projectId = useProjectStore.getState().projectId
    if (projectId) saveChatMessage(projectId, stage, 'model', content)
  },

  // stage 진입 시 배지 클리어 (studio layout에서 호출).
  clearStageBadge: (stage) =>
    set((state) => {
      if (!state.stageBadges[stage]) return state
      const next = { ...state.stageBadges }
      delete next[stage]
      return { stageBadges: next }
    }),

  clearError: () => set({ error: null }),

  reset: () => {
    // 프로젝트 전환 시 진행 중인 완료-코얼레싱 타이머/누적도 비운다.
    for (const k of Object.keys(pendingCompletions)) {
      clearTimeout(pendingCompletions[k].timer)
      delete pendingCompletions[k]
    }
    // 진행 중인 응답도 끊는다 — 이전 프로젝트의 답이 새 프로젝트 스레드에 꽂히면 안 된다.
    activeGeneration?.abort()
    activeGeneration = null
    set({
      messages: [],
      loading: false,
      error: null,
      lastTrace: null,
      suggestion: null,
      pendingProposal: null,
      dismissedSuggestionIds: [],
      stageBadges: {},
      messagesLoadedProjectId: null,
    })
  },
}))
