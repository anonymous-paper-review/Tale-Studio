import { summarizeChatUsage, type ChatLlmUsage } from '@/lib/chat-trace'
import { create } from 'zustand'
import { createChatRequestSession, ChatResponseError } from '@/lib/chat-response'
import { runChatToolLoop } from '@/lib/chat-tools/loop'
import { writerInputRoute } from '@/lib/chat-harness'
import { executeProjectInspection } from '@/lib/chat-tools/inspect'
import { createChatToolExecutor, sameToolValue, type ToolResource } from '@/lib/chat-tools/executor'
import type { ArtistSourceSnapshot } from '@/lib/artist/source-snapshot'
import { createStudioToolResources } from '@/stores/chat-tool-bindings'
import { createStudioWorkflow } from '@/stores/chat-workflow-bindings'
import { chatToolReceipt, guardChatToolReply, latestEdits, omitRepeatedToolEdits, requestsImageInspection, requestsSupportedChatEdit } from '@/lib/chat-tools/receipt'
import type { ToolCall, ToolMessage, ToolOutcome, ToolResult } from '@/lib/chat-tools/protocol'
import { isImageModelKey } from '@/lib/image-models'
import { toast } from 'sonner'
import type { DialogueLine, StageId } from '@/types'
import type { PendingProposal } from '@/lib/pending-proposal'
import { createPendingProposal, combinePendingProposals, isApprovalUtterance, isCancellationUtterance, isDeferralUtterance } from '@/lib/pending-proposal'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { detectScript, parseScript } from '@/lib/writer/script/parse'
import { useProjectStore } from '@/stores/project-store'
import { extractedChangesProducer, useProducerStore, type ExtractedSettings } from '@/stores/producer-store'
import { evaluateProducerGate } from '@/lib/producer-gate'
import { selectedProducerDialogueLanguage } from '@/lib/producer-dialogue-language'
import { fixKoreanParticles } from '@/lib/korean-particles'
import { coerceCardFill, matchImageUseAnswer, matchImageUseInText, type CardFill, type ImageUseAnswer } from '@/lib/producer/image-role'
import { MAX_COMIC_PAGES, comicStyleQuestion, imageBatchQuestion, matchBatchImageAnswer, matchComicAnswer, matchComicIntentInText, matchComicStyleAnswer, sortComicPages } from '@/lib/producer/comic-intake'
import { CHAT_IMAGE_ROLE_CONSENT, COMIC_ANALYSIS_CONSENT, CREATION_ANALYSIS_CONSENT, STYLE_PICKER_CONSENT } from '@/lib/style-facets/consent'
import type { PendingCreation } from '@/stores/pending-creation-store'
import type { BoardBusy } from '@/lib/producer/busy'
import { backgroundMentions, castMentions } from '@/lib/card-mention'
import {
  requireDefaultAppearanceKey,
  useArtistStore,
  type ArtistUpdate,
} from '@/stores/artist-store'
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
import { matchHandoffIntent, nextStepAction, resolveDirectorHandoffIntent, type HandoffSpec } from '@/lib/handoff-intent'
import { loadDirectorReadiness } from '@/lib/director-readiness-loader'
import type { DirectorReadinessReport } from '@/lib/director-readiness'
import { sceneGatePhase } from '@/lib/writer/scene-gate'
import { REWRITE_LEVELS, rewriteLevelOf, type RewriteLevel } from '@/lib/producer/scene-story-rewrite'
import { restartWriterStatus } from '@/lib/writer/use-writer-status'
import { completeKoreanDialogue, dialogueHandoffTarget } from '@/lib/writer/dialogue-handoff'
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
import { isDemoSession, getDemoSnapshot, withDemoShare } from '@/lib/demo/context'
import { cannedFor } from '@/lib/demo/canned'
import { handoffMarker } from '@/lib/chat-blocks'
import {
  buildChatTrace,
  createChatTraceId,
  type ChatGenerationJobTrace,
  type ChatTrace,
} from '@/lib/chat-trace'
import {
  pollGenerationJob,
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
import { parseAppLocale, type AppLocale } from '@/lib/locale'
import { useLocaleStore } from '@/stores/locale-store'
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
 *   본문은 최초 제안 시 대화에 저장한다. `action`이 있으면 승인 버튼을 별도로 표시한다.
 *   나중에는 프로젝트별 보류 목록으로 옮기며, 명시적으로 다시 열기 전에는 재등장하지 않는다.
 *   비용이 드는 생성은 별도의 PendingProposal 승인 경로를 따른다.
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
    | { kind: 'message'; utterance: string; label: string; answeringProducerQuestion?: boolean }
    // #s3-gate P3b: 씬 게이트 확정 버튼 — 클릭 시 /api/writer/scene-gate confirm (수정 요청은 게이트 패널이 주 경로)
    | { kind: 'confirmScenes'; label: string }
    // #p4-choices: 다중 선택지 — 클릭 = 그 문구를 채팅 입력(핸드오프 패턴, 직접 입력과 동일 경로)
    | { kind: 'choices'; options: Array<{ label: string; utterance: string }>; answeringProducerQuestion?: true }
    | null
  /** 새로고침으로 복원한 선택지는 표시 전용이며 action을 복원하지 않는다. */
  restoredChoices?: { options: string[] }
}

interface GlobalChatState {
  messages: GlobalChatMessage[]
  loading: boolean
  /** 직접 수정 팝업이 열려 있는 동안에만 채팅 입력을 막는다. */
  sceneStoryEdit: { projectId: string; mode: 'manual'; busy: boolean } | null
  beginSceneStoryEdit: (mode: 'manual' | 'ai') => boolean
  endSceneStoryEdit: () => void
  setSceneStoryEditBusy: (busy: boolean) => void
  sceneStoryRefresh: number
  refreshSceneStory: () => void
  sceneStoryProposalPending: { projectId: string; id: string | null } | null
  syncSceneStoryProposal: (projectId: string, id: string | null) => void
  /** variantId — 다시 쓰기의 세 안 중 고른 안(2026-10-02 시안 v04). AI 수정안 하나면 비운다. */
  resolveSceneStoryProposal: (action: 'apply' | 'discard', proposalId: string, variantId?: string) => Promise<boolean>
  /** 다시 쓰기(시안 v04) — 정도 하나로 세 가지 안을 요청한다. */
  rewriteSceneStory: (level: RewriteLevel) => Promise<boolean>
  /** 셋 다 별로 · 다시 만들기 — 지금 안들을 버리고 같은 정도로 다시 요청한다. */
  regenerateSceneStoryRewrite: (proposalId: string, level: RewriteLevel) => Promise<boolean>
  /** 트리트먼트 초안을 다 썼다고 채팅에 한 줄 남긴다(시안 v04). runKey(실행) 하나에 한 번, 넘기기 단추 없이. */
  announceTreatmentReady: (projectId: string, runKey: string) => boolean
  /** 트리트먼트에 미리 보이는 안(v1 · v2 · v3). 채팅 카드와 트리트먼트가 같은 값을 읽는다. */
  sceneStoryVariantPreview: { projectId: string; proposalId: string; variantId: string } | null
  previewSceneStoryVariant: (proposalId: string, variantId: string) => void
  /** 적용한 안 되돌리기 · 그대로 두기. */
  resolveSceneStoryUndo: (action: 'undo' | 'keep', undoId: string) => Promise<boolean>
  recoveryProgress: 'continue' | 'retry' | null
  error: string | null
  /** 마지막 채팅 요청의 입력·출력·적용 경계 계측. 화면 하단에 표시한다. */
  lastTrace: ChatTrace | null
  suggestion: ChatSuggestion | null
  dismissedSuggestionIds: string[]
  pendingProposal: PendingProposal | null
  /** #script-preserve: 대본 보존 질문에 답하기 전까지 붙들어 둔 턴 — 결정이 나면 숨은 요청으로 모델에 이어 보낸다. */
  scriptPreserveHeld: ScriptPreserveHeld | null
  /** #image-to-artist: 올린 그림의 쓰임새(인물·배경·참고)를 답하기 전까지 붙들어 둔 턴. 장마다 묻고 다 답하면 한꺼번에 처리한다. */
  imageRoleGate: ImageRoleGate | null
  /** 만화 원고 받기(2026-10-09): 여러 장을 올렸을 때 한 번에 묻는 질문(만화 그대로 · 그림마다 · 모두 참고)에 답하기 전까지 붙들어 둔 턴. */
  imageBatchGate: ImageBatchGate | null
  /** 새 프로젝트가 넘긴 일을 하는 중인 프로젝트 — 그동안 보드의 트리트먼트 쓰기 단추를 숨긴다(카드를 채운 뒤 바로 쓴다). */
  creationPlanFor: string | null
  /** 만화를 대본으로 옮기지 못했을 때 다시 옮길 거리(같은 쪽 · 같은 동의 · 이어서 할 일). */
  comicRetry: ComicRetry | null
  /** 만화를 고른 뒤 그림체(만화 그림체로 고정 · 실사 등으로 각색)를 묻는 중 — 답하면 옮기기를 시작한다(2026-10-09 오너). */
  comicStyleGate: { images: ChatImageInput[]; plan?: ImageRoleGate } | null
  /** Producer 본문을 막고 로딩 원을 보일 일 — 새 프로젝트가 넘긴 일 · 만화 옮기기(2026-10-09 오너, lib/producer/busy.ts). */
  boardBusy: BoardBusy | null
  deferredProposals: PendingProposal[]
  deferredSuggestions: ChatSuggestion[]
  recordedSuggestionIds: string[]
  executingProposalIds: string[]
  cancelledProposalIds: string[]
  /** 크로스스테이지 완료 알림 배지 카운트 (chat-proactive-copilot Phase 2). 사이드바가 읽는다. */
  stageBadges: Partial<Record<StageId, number>>
  /** 핸드오프 성공 후 이동할 경로 — 라우팅은 컴포넌트 몫이라 GlobalChat 이 소비하고 비운다. */
  pendingNavigatePath: string | null
  workflowNavigation: { projectId: string; stage: StageId } | null
  finishWorkflowNavigation: (arrived: boolean) => void
  directorHandoff: { id: string; projectId: string; phase: 'checking' | 'waiting' | 'navigating'; notice?: string } | null
  /** 다음 단계 버튼·채팅 넘김이 연 확인 창(2026-10-01 오너). producerLock = Writer 로 넘기기 전 확정(넘기면 Producer 잠금),
   *  directorReadiness = 준비가 덜 된 샷 목록과 "그래도 진행". Writer→Artist·Director→Editor 는 창이 없다. */
  handoffConfirm: HandoffConfirm | null
  /** 단계 화면 오른쪽 위 "다음 단계" 버튼 — 버튼 = 넘김 문장 타이핑. 확인 창이 필요한 넘김은 창을 먼저 연다. */
  requestNextStep: () => Promise<void>
  /** 채팅 승인 카드(Writer 첫 넘김)의 승인 버튼 — 바로 승인하지 않고 같은 확정 창을 연다. */
  openProducerLock: (proposalId?: string) => void
  /** Producer 확정 창의 "확정하고 넘기기" — 넘김 문장을 채팅에 남기고 Writer 를 시작한다(카드에서 열었으면 그 카드를 승인). */
  confirmProducerLock: () => Promise<void>
  /** Director 준비 창의 "그래도 진행" — 준비가 덜 된 샷이 있어도 Director 로 넘긴다. */
  proceedToDirectorAnyway: () => Promise<void>
  /** 확인 창 닫기("더 고칠게요"·"채우러 가기") — 아무것도 넘기지 않는다. */
  closeHandoffConfirm: () => void
  /** 씬 스토리 확정(2026-10-01 오너 — 확정 단계는 Producer 메인). 성공하면 나머지 생성이 이어지고 Writer 화면으로 간다.
   *  null = 이미 보내는 중(두 번 누름) — 아무 안내도 하지 않는다. */
  confirmSceneGate: () => Promise<boolean | null>
  /** 씬 스토리 수정 요청 — 초안을 다시 쓰고 다시 확정을 기다린다. */
  reviseSceneGate: (feedback: string) => Promise<boolean>
  requestDirectorHandoff: (mode: 'check' | 'move' | 'whenReady', resumeId?: string) => Promise<void>
  resumeDirectorHandoff: () => Promise<void>
  confirmDirectorHandoff: (projectId: string, pathname: string) => void
  failDirectorHandoff: () => void
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
    /** consentedHandoff: 명시적 핸드오프 버튼("Writer 호출하기")에서 온 호출 — 버튼이 곳 동의라
     *  승인 카드를 다시 띄우지 않고 바로 실행한다(D12, 2026-08-31 오너). */
    /** acceptIncomplete: Director 준비 창에서 "그래도 진행"을 고른 넘김 — 준비가 덜 된 샷이 있어도 막지 않는다(Writer 미완료는 그대로 막는다). */
    opts?: { consentedHandoff?: boolean; stageOverride?: StageId; silentUser?: boolean; cardFill?: CardFill; acceptIncomplete?: boolean; answeringProducerQuestion?: boolean },
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
  cancelDeferredProposal: (id: string) => void
  deferPendingProposal: (id?: string) => void
  restorePendingProposal: (id: string) => boolean
  deferSuggestion: () => void
  restoreSuggestion: (id: string) => boolean
  dismissPendingProposal: (id?: string) => void
  /** #script-preserve: 붙여 넣은 글이 대본이면 그 글을 그대로 스토리로 두고 "그대로 보존할까요" 카드를 띄운다. 대본이 아니면 false(종전 경로). */
  offerScriptPreserve: (text: string, opts?: { traceId?: string; held?: ScriptPreserveHeld }) => boolean
  /** #script-preserve: 카드를 내리고 결정을 "참고 자료(각색)" 로 기록한다. */
  declineScriptPreserve: () => void
  /** #image-to-artist: 올린 그림의 쓰임새를 정한다 — 말이 분명하면 바로, 아니면 장마다 선택지로 묻는다. 그림이 없으면 false. */
  offerImageRoles: (images: ChatImageInput[], opts: { typed: string; msg: string }) => boolean
  /** 새 프로젝트 화면에서 고른 대로 이어서 한다 — 그림 카드 · 그림체 · 원작(대본 · 만화) 채우기 뒤 트리트먼트(2026-10-09 오너). 묻지 않는다. */
  runCreationPlan: (plan: PendingCreation) => Promise<void>
  /** 스타일 선택 창의 "내 그림체 올리기"로 올린 그림을 그림체로 쓴다 — 채팅의 "그림체"와 같은 규칙(2026-10-10 오너). */
  applyUploadedStyle: (image: ChatImageInput) => Promise<void>
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

type SavedConversationState = Pick<GlobalChatState, 'pendingProposal' | 'deferredProposals' | 'deferredSuggestions' | 'dismissedSuggestionIds' | 'recordedSuggestionIds' | 'suggestion' | 'cancelledProposalIds'>
function persistConversationState(state: SavedConversationState, projectId = useProjectStore.getState().projectId): void {
  if (!projectId || typeof localStorage === 'undefined') return
  const { pendingProposal, deferredProposals, deferredSuggestions, dismissedSuggestionIds, recordedSuggestionIds, suggestion, cancelledProposalIds } = state
  try { localStorage.setItem(`tale:chat-actions:${projectId}`, JSON.stringify({ pendingProposal, deferredProposals, deferredSuggestions, dismissedSuggestionIds, recordedSuggestionIds, suggestion: suggestion?.action?.kind === 'choices' || suggestion?.restoredChoices ? null : suggestion, cancelledProposalIds })) } catch { /* 대화 자체는 서버에 남는다. */ }
}
function loadConversationState(projectId: string): Partial<SavedConversationState> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const value = JSON.parse(localStorage.getItem(`tale:chat-actions:${projectId}`) ?? 'null')
    if (!value || !Array.isArray(value.deferredProposals) || !Array.isArray(value.deferredSuggestions)) return {}
    return value
  } catch { return {} }
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
      ? ` ${translate(locale, 'and {count} more', { count: deleted.length - 3 })}` // copy-ok: fragment
      : ''
  return previewLines.length > 0
    ? `${translate(locale, 'Dialogue to delete: {lines}', { lines: previewLines.join(' / ') })}${suffix}`
    : translate(locale, 'Dialogue to delete: {count} lines', {
        count: Math.max(0, current.length - next.length),
      })
}

// 완료 알림 코얼레싱 — 같은 stage+label 완료를 짧은 윈도우로 모아 한 줄("N개 생성 완료")로 emit.
//   배치 이미지(웹훅 다발) 스팸 방지. 창 안에 이어지면 누적, 조용해지면 1개 메시지로 flush.
type PendingCompletion = { count: number; timer: ReturnType<typeof setTimeout> }
const pendingCompletions: Record<string, PendingCompletion> = {}
const completionKey = (stage: StageId, label: string) => `${stage}::${label}`

// 진행 중인 LLM 응답의 abort 컨트롤러 (#oiioii-chat) — 한 번에 한 요청만 뜨므로(loading 가드) 단일 슬롯.
let activeGeneration: AbortController | null = null
let chatSession = 0
let chatHistoryLoad = 0

/** #script-preserve: 대본 보존 질문 동안 붙들어 둔 사용자 턴(붙여 넣은 글·첨부). */
export type ScriptPreserveHeld = { msg: string; imageUrls?: string[]; thumbUrls?: string[] }

// 결정 뒤 붙들어 둔 턴을 숨은 요청으로 이어 보낸다 — 보존이면 카드(인물·배경·설정)만 채우게, 참고 자료면 종전대로
//   새 이야기를 만들게. setTimeout(0): 타이핑 승인 경로(sendMessage → approvePendingProposal)는 loading 이 켜져 있어
//   즉시 부르면 무시되므로 그 턴이 닫힌 뒤에 보낸다. 붙들어 둔 턴이 없으면(카드만 있던 경우) 보낼 것도 없다.
function resumeScriptPreserveHeld(
  get: () => GlobalChatState,
  set: (patch: Partial<GlobalChatState>) => void,
  decision: 'preserve' | 'reference',
): void {
  const held = get().scriptPreserveHeld
  if (!held) return
  set({ scriptPreserveHeld: null })
  const voice = contentLocale()
  const text =
    decision === 'preserve'
      ? translate(voice, 'Keep my script exactly as written. Do not rewrite or summarize it. Fill in only the cast, background and project setting cards it supports.')
      : translate(voice, 'Use my text as reference material and draft a new story from it.')
  const attachments = held.imageUrls?.length ? { imageUrls: held.imageUrls } : undefined
  setTimeout(() => {
    void get().sendMessage(text, attachments, { silentUser: true })
  }, 0)
}

/** #image-to-artist: 채팅에 올린 그림 한 장 — 원본(thumbUrl)과 판독용 슬라이스. */
export interface ChatImageInput {
  id: string
  name: string
  thumbUrl: string
  sliceUrls: string[]
}
interface ImageRoleGate {
  items: Array<{ image: ChatImageInput; role: ImageUseAnswer | null }>
  typed: string
  msg: string
  /** 사용자가 읽고 고른 분석 안내의 판 — 없으면 채팅 그림마다 질문(chat-image-role-v1). */
  consent?: string
}

interface ImageBatchGate {
  images: ChatImageInput[]
  typed: string
  msg: string
}

interface ComicRetry {
  pages: ChatImageInput[]
  consent: string
  /** 새 프로젝트에서 왔으면 다시 옮긴 뒤 이어서 트리트먼트를 쓴다. */
  then: { startTreatment: boolean; locale: AppLocale } | null
}

/** 여러 장을 한 번에 묻는 질문을 세운다 — 닫을 수 없다(올린 그림이 조용히 사라지면 안 된다). */
function askImageBatch(get: () => GlobalChatState): void {
  const gate = get().imageBatchGate
  if (!gate || gate.images.length === 0) return
  const question = imageBatchQuestion(contentLocale(), gate.images.length)
  get().offerSuggestion(
    { id: `image-batch:${gate.images[0].id}`, stage: 'producer', content: question.content, dismissible: false, action: { kind: 'choices', options: question.options } },
    { preempt: true },
  )
}

/** 사용자 말풍선을 그림과 함께 남긴다(질문을 세우기 전 · 묻지 않고 바로 쓸 때). */
function recordImageTurn(set: (fn: (state: GlobalChatState) => Partial<GlobalChatState>) => void, msg: string, images: ChatImageInput[]): void {
  const projectId = useProjectStore.getState().projectId
  const content = withAttachmentMarker(msg, images.map((image) => image.thumbUrl))
  set((state) => ({ messages: [...state.messages, { id: makeId(), stage: 'producer' as const, role: 'user' as const, content }] }))
  if (projectId) saveChatMessage(projectId, 'producer', 'user', content)
}

const comicPageUrls = (page: ChatImageInput) => (page.sliceUrls.length ? page.sliceUrls : [page.thumbUrl])

/**
 * 채팅이 다른 요청을 처리하는 중이면 끝날 때까지 기다렸다가 보낸다 — sendMessage 는 바쁘면 보내지 않고 돌아가서,
 *   사용자 말과 겹친 숨은 요청(카드 채우기 등)이 조용히 버려졌다(10/9 검토).
 */
async function sendWhenIdle(get: () => GlobalChatState, ...args: Parameters<GlobalChatState['sendMessage']>): Promise<void> {
  for (;;) {
    if (!get().loading) return get().sendMessage(...args)
    await new Promise<void>((resolve) => {
      const unsubscribe = useGlobalChatStore.subscribe((state) => {
        if (!state.loading) {
          unsubscribe()
          resolve()
        }
      })
    })
  }
}

/** 새 프로젝트가 넘긴 일 끝에 트리트먼트를 쓴다 — Writer 가 언어를 잠그면 화면도 맞춘다(beginTreatment 와 같은 규칙). */
async function startCreationTreatment(locale: AppLocale): Promise<void> {
  const started = await useProducerStore.getState().startTreatment()
  if (started && !useProjectStore.getState().projectLocaleLocked) useProjectStore.getState().adoptProjectLocale(locale, true)
}

/** 만화를 대본으로 옮기지 못했으면 "다시 옮기기"를 고를 수 있게 한다 — 만화 전부를 다시 올리지 않아도 된다(10/9 검토). */
function offerComicRetry(get: () => GlobalChatState, retry: ComicRetry): void {
  const voice = contentLocale()
  useGlobalChatStore.setState({ comicRetry: retry })
  get().offerSuggestion(
    {
      id: `comic-retry:${retry.pages[0]?.id ?? 'pages'}:${Date.now()}`,
      stage: 'producer',
      content: translate(voice, 'Try reading the comic again?'),
      dismissible: true,
      action: { kind: 'choices', options: [{ label: translate(voice, 'Read the comic again'), utterance: translate(voice, 'Turn the comic into a script again') }] },
    },
    { preempt: true },
  )
}

function isComicRetryAnswer(text: string, voice: AppLocale): boolean {
  return text === translate(voice, 'Turn the comic into a script again') || text === translate(voice, 'Read the comic again')
}

/** 같은 쪽으로 다시 옮긴다(그림체는 이미 정했으니 다시 하지 않는다). 새 프로젝트에서 왔으면 이어서 트리트먼트. */
async function retryComicScript(get: () => GlobalChatState, retry: ComicRetry): Promise<void> {
  const comic = await runComicAdaptation(get, retry.pages, { consent: retry.consent, skipStyle: true, then: retry.then })
  if (comic.scriptSet && retry.then?.startTreatment) await startCreationTreatment(retry.then.locale)
}

/**
 * 만화를 고르면 대본을 옮기기 전에 그림체를 묻는다(2026-10-09 오너 "그림체로 고정할지 실사와 같은 각색을 할지 물어봐줘").
 *   닫을 수 없는 선택지다. 이미 그림체가 고정된 프로젝트면 물을 것이 없어 대본만 옮긴다.
 */
function askComicStyle(get: () => GlobalChatState, images: ChatImageInput[], plan?: ImageRoleGate): void {
  if (useProducerStore.getState().customStyleAnchor?.locked === true) {
    if (plan) void runChatImagePlan(get, plan, null)
    else void runComicAdaptation(get, images, { styleMode: 'keep' })
    return
  }
  useGlobalChatStore.setState({ comicStyleGate: { images, ...(plan ? { plan } : {}) } })
  const question = comicStyleQuestion(contentLocale())
  get().offerSuggestion(
    { id: `comic-style:${images[0]?.id ?? 'pages'}`, stage: 'producer', content: question.content, dismissible: false, action: { kind: 'choices', options: question.options } },
    { preempt: true },
  )
}

const postJson = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** Producer 한 줄을 채팅에 남긴다 — 보던 프로젝트가 바뀌었으면 남기지 않는다. */
function producerSpeaker(projectId: string): (content: string) => void {
  return (content) => {
    if (useProjectStore.getState().projectId !== projectId) return
    useGlobalChatStore.setState((state) => ({
      messages: [...state.messages, { id: makeId(), stage: 'producer' as const, role: 'model' as const, content }],
    }))
    saveChatMessage(projectId, 'producer', 'model', content)
  }
}

/**
 * 그림 한 장을 이 프로젝트 그림체(사용자 앵커)로 정하고 그림체 분석기로 분석한다(2026-10-09 — 만화 원고 · 새 프로젝트의 그림체 그림).
 *   그림체 등록은 매체(애니 · 카툰 · 실사 등)가 있어야 받는다 — 먼저 허용 목록에서 고르고, 못 고르면 정하지 않는다.
 *   분석이 실패해도 그림은 그림체로 남는다. consent = 사용자가 읽고 고른 분석 안내의 판.
 */
async function runStyleFromImage(image: ChatImageInput, kind: 'comic' | 'picture', consent: string): Promise<void> {
  const projectId = useProjectStore.getState().projectId
  if (!projectId) return
  const voice = contentLocale()
  const speak = producerSpeaker(projectId)
  const sameProject = () => useProjectStore.getState().projectId === projectId
  const comic = kind === 'comic'
  // 고정된 그림체(그림체 추출로 정함)는 바꾸지 않는다 — 분석 모델도 부르지 않는다(2026-10-09 오너).
  if (useProducerStore.getState().customStyleAnchor?.locked === true) {
    speak(translate(voice, 'The art style is fixed to the picture you chose, so I kept it.'))
    return
  }
  const label = translate(voice, comic ? 'Comic art style' : 'My art style')
  const notSet = comic ? translate(voice, "Couldn't set the comic as the art style.") : translate(voice, "Couldn't set {name} as the art style.", { name: image.name })
  const analysisFailed = translate(voice, comic
    ? "The art style analysis didn't work, so new pictures follow the comic page image only."
    : "The art style analysis didn't work, so new pictures follow the picture only.")
  try {
    const mediumRes = await postJson('/api/produce/anchor-medium', { projectId, imageUrl: image.thumbUrl, consent })
    const picked = (await mediumRes.json().catch(() => ({}))) as { medium?: string }
    if (!sameProject()) return
    if (!mediumRes.ok || !picked.medium) {
      speak(notSet)
      return
    }
    // 그림에서 그림체를 뽑는 것은 언제나 사용자가 고른 일이다(그림을 "그림체"로 고름 · 만화 그림체로 고정을 고름) — 고정한다.
    const anchorRes = await postJson('/api/produce/style-anchor', { projectId, imageUrl: image.thumbUrl, label, medium: picked.medium, lock: true })
    const anchor = (await anchorRes.json().catch(() => ({}))) as { key?: string; imageUrl?: string; label?: string; medium?: string | null; locked?: boolean }
    if (!sameProject()) return
    if (!anchorRes.ok || !anchor.key || !anchor.imageUrl) {
      speak(notSet)
      return
    }
    useProducerStore.getState().applyCustomStyleAnchor({ key: anchor.key, url: anchor.imageUrl, label: anchor.label ?? label, medium: anchor.medium ?? null, locked: anchor.locked === true })
    speak(comic
      ? translate(voice, 'Set the art style to this comic. Analyzing the art style now.')
      : translate(voice, 'Set the art style to {name}. Analyzing the art style now.', { name: image.name }))
    const facetRes = await postJson('/api/produce/style-facets', { projectId, consent })
    const facet = (await facetRes.json().catch(() => ({}))) as { facets?: boolean }
    if (!sameProject()) return
    speak(facetRes.ok && facet.facets
      ? translate(voice, comic
        ? 'Finished analyzing the art style. New pictures will follow the comic art style description too.'
        : 'Finished analyzing the art style. New pictures will follow the art style description too.')
      : analysisFailed)
  } catch (error) {
    console.error('[style] failed:', error)
    speak(analysisFailed)
  }
}

interface ComicAdaptationOptions {
  /** 그림체로 따로 고른 그림 — 있으면 첫 쪽 대신 이 그림이 그림체가 된다(새 프로젝트). */
  styleImage?: ChatImageInput | null
  /** 사용자가 읽고 고른 분석 안내의 판 — 채팅 질문(comic-choice-v1) · 새 프로젝트(creation-choice-v1). */
  consent?: string
  /** 대본을 넣은 뒤 카드 채우기 요청 전에 기다릴 일(새 프로젝트의 그림 카드 채우기 — 채팅은 한 번에 한 요청). */
  beforeFill?: Promise<unknown>
  /** 다시 옮기기 — 그림체는 이미 정했으니 대본만 옮긴다. */
  skipStyle?: boolean
  /** 만화 그림체 — lock = 첫 쪽 그림체로 고정, adapt = 만화 그림을 그림체로 쓰지 않고 스타일을 고르게 한다,
   *  keep = 그림체를 건드리지 않는다(이미 고정됨). 그림체 그림(styleImage)이 있으면 그 그림이 그림체다. */
  styleMode?: 'lock' | 'adapt' | 'keep'
  /** 옮기기에 실패해 다시 옮길 때 이어서 할 일(새 프로젝트의 트리트먼트). */
  then?: ComicRetry['then']
}

/**
 * 만화 원고로 그대로 영상화(2026-10-09 오너) — 두 일을 함께 돌린다.
 *   ① 대본: 쪽 순서(파일 이름 숫자 순)대로 /api/produce/comic-script 에 읽혀 대본으로 옮기고, 이야기에 넣은 뒤 대본 그대로 쓰기를 켠다.
 *      이어서 그대로 쓰기와 같은 숨은 요청으로 인물 · 배경 · 설정 카드를 채우되 만화 그림도 함께 보낸다(모습은 그림이 정확하다).
 *   ② 그림체: 첫 쪽(따로 고른 그림체 그림이 있으면 그 그림)을 그림체로 정하고 분석한다(runStyleFromImage).
 *   어느 쪽이 실패해도 다른 쪽은 이어 가고, 실패는 채팅에 한 줄로 알린다.
 *   대본 쪽이 끝나면 돌아온다(scriptSet = 대본을 넣었는가). 그림체 분석은 1~2분 더 걸려 styleDone 으로 따로 기다린다 —
 *   트리트먼트는 분석 결과를 쓰지 않으므로 기다리지 않는다(10/9 로컬 시험).
 */
async function runComicAdaptation(
  get: () => GlobalChatState,
  images: ChatImageInput[],
  opts: ComicAdaptationOptions = {},
): Promise<{ scriptSet: boolean; styleDone: Promise<void> }> {
  const projectId = useProjectStore.getState().projectId
  if (!projectId) return { scriptSet: false, styleDone: Promise.resolve() }
  const voice = contentLocale()
  const speak = producerSpeaker(projectId)
  const pages = sortComicPages(images)
  if (pages.length > MAX_COMIC_PAGES) {
    speak(translate(voice, 'I can read up to {max} comic pages at once. Please upload {max} pages or fewer.', { max: String(MAX_COMIC_PAGES) }))
    return { scriptSet: false, styleDone: Promise.resolve() }
  }
  const styleMode = opts.styleImage ? 'lock' : opts.styleMode ?? 'lock'
  speak(opts.skipStyle
    ? translate(voice, 'Reading the {n} comic pages again.', { n: String(pages.length) })
    : styleMode === 'lock'
      ? translate(voice, 'Reading the {n} comic pages. I will turn them into a script and analyze the art style. This takes a minute or two.', { n: String(pages.length) })
      : translate(voice, 'Reading the {n} comic pages. I will turn them into a script. This takes about a minute.', { n: String(pages.length) }))
  const sameProject = () => useProjectStore.getState().projectId === projectId
  const consent = opts.consent ?? COMIC_ANALYSIS_CONSENT
  // 대본을 옮기는 동안 Producer 본문을 막는다 — 새 프로젝트의 일(runCreationPlan)이 이미 막았으면 그쪽이 걷는다.
  const ownsBusy = !useGlobalChatStore.getState().boardBusy
  if (ownsBusy) useGlobalChatStore.setState({ boardBusy: { projectId, kind: 'comic' } })
  const releaseBusy = () => {
    if (ownsBusy && useGlobalChatStore.getState().boardBusy?.projectId === projectId) useGlobalChatStore.setState({ boardBusy: null })
  }

  const script = (async (): Promise<boolean> => {
    const failed = translate(voice, "Couldn't turn the comic into a script. Please try again in a moment.")
    try {
      const res = await postJson('/api/produce/comic-script', {
        projectId,
        pages: pages.map((page) => ({ name: page.name, urls: comicPageUrls(page) })),
        actionLanguage: voice === 'en' ? 'en' : 'ko',
      })
      const body = (await res.json().catch(() => ({}))) as { script?: unknown; stats?: { scenes?: number; dialogue_lines?: number } }
      if (!sameProject()) return false
      if (!res.ok || typeof body.script !== 'string' || !body.script.trim()) {
        speak(failed)
        offerComicRetry(get, { pages, consent, then: opts.then ?? null })
        return false
      }
      const producer = useProducerStore.getState()
      producer.setStoryText(body.script)
      producer.setPreserveScript(true)
      speak(
        translate(voice, 'Turned the comic into a script: {scenes} scenes and {lines} lines of dialogue. I will keep it exactly as written.', {
          scenes: String(body.stats?.scenes ?? 0),
          lines: String(body.stats?.dialogue_lines ?? 0),
        }),
      )
      if (opts.beforeFill) await opts.beforeFill.catch(() => null)
      if (!sameProject()) return true
      await sendWhenIdle(
        get,
        translate(voice, 'Keep my comic script exactly as written. Do not rewrite or summarize it. The attached pictures are the comic pages it came from. Fill in only the cast, background and project setting cards, and use the pictures for how the characters and places look.'),
        { imageUrls: pages.flatMap(comicPageUrls) },
        { silentUser: true },
      )
      return true
    } catch (error) {
      console.error('[comic] script failed:', error)
      if (!sameProject()) return false
      speak(failed)
      offerComicRetry(get, { pages, consent, then: opts.then ?? null })
      return false
    } finally {
      releaseBusy()
    }
  })()

  let styleDone: Promise<void> = Promise.resolve()
  if (!opts.skipStyle && opts.styleImage) styleDone = runStyleFromImage(opts.styleImage, 'picture', consent)
  else if (!opts.skipStyle && styleMode === 'lock') styleDone = runStyleFromImage(pages[0], 'comic', consent)
  else if (!opts.skipStyle && styleMode === 'adapt') {
    // 각색: 만화 그림을 그림체로 쓰지 않는다 — 만들 스타일(실사 등)을 사용자가 고르게 스타일 고르기 창을 띄운다.
    speak(translate(voice, "I won't use the comic art style. Choose the style to make it in."))
    useChatUiStore.getState().requestStylePicker(projectId)
  }
  return { scriptSet: await script, styleDone }
}

// 그림마다 묻는 선택지 — 새 프로젝트 화면과 같은 다섯 가지(2026-10-10 오너 "채팅으로 올린 그림에도 그림체 선택지 넣어줘").
function imageRoleOptions(voice: AppLocale): Array<{ label: string; utterance: string }> {
  return [
    { label: translate(voice, 'Comic pages'), utterance: translate(voice, 'Use it as a comic page') },
    { label: translate(voice, 'Character card'), utterance: translate(voice, 'Use it as a character') },
    { label: translate(voice, 'Background card'), utterance: translate(voice, 'Use it as a background') },
    { label: translate(voice, 'Art style'), utterance: translate(voice, 'Use it as the art style') },
    { label: translate(voice, 'Reference only'), utterance: translate(voice, 'Use it as reference only') },
  ]
}

// 아직 답하지 않은 첫 그림의 질문을 세운다. 닫을 수 없는 선택지(dismissible:false) — 올린 그림이 조용히 사라지면 안 된다.
function askImageRole(get: () => GlobalChatState): void {
  const gate = get().imageRoleGate
  if (!gate) return
  const idx = gate.items.findIndex((it) => it.role === null)
  if (idx < 0) return
  const voice = contentLocale()
  const item = gate.items[idx]
  const content =
    gate.items.length > 1
      ? translate(voice, 'Picture {i} of {n}: {name}. How should I use it? If you choose art style or comic page, the picture goes to an analysis model.', { i: String(idx + 1), n: String(gate.items.length), name: item.image.name })
      : translate(voice, 'How should I use this picture? ({name}) If you choose art style or comic page, the picture goes to an analysis model.', { name: item.image.name })
  get().offerSuggestion(
    { id: `image-role:${item.image.id}`, stage: 'producer', content, dismissible: false, action: { kind: 'choices', options: imageRoleOptions(voice) } },
    { preempt: true },
  )
}

// 다 답한 그림들을 정한 대로 쓴다 — 인물·배경은 카드를 만들고 그림을 붙인 뒤 숨은 요청으로 글 칸을 채우게 하고,
//   참고 자료는 사용자의 말과 함께 종전대로 채팅에 보낸다. 순서대로 기다린다(채팅은 한 번에 한 요청).
async function runImageRolePlan(get: () => GlobalChatState, plan: ImageRoleGate): Promise<void> {
  const voice = contentLocale()
  const projectId = useProjectStore.getState().projectId
  const speak = (content: string) => {
    useGlobalChatStore.setState((state) => ({
      messages: [...state.messages, { id: makeId(), stage: 'producer' as const, role: 'model' as const, content }],
    }))
    if (projectId) saveChatMessage(projectId, 'producer', 'model', content)
  }
  const userSaid = plan.typed ? `\n${translate(voice, 'The user said: {text}', { text: plan.typed })}` : ''
  for (const it of plan.items) {
    if (it.role === 'character') {
      const localId = useProducerStore.getState().addCastFromImage(it.image.thumbUrl)
      if (!localId) continue
      const label = castMentions(useProducerStore.getState().cast, voice).find((m) => m.ref === localId)?.label ?? localId
      speak(translate(voice, 'Added a character card with {name}. I will fill in the appearance from the picture.', { name: it.image.name }))
      const ask = translate(
        voice,
        'The attached picture is the character on card @{label}. Look at it and fill in only that card: a detailed appearance, and the name if it is obvious from the picture. Do not write a story.',
        { label },
      )
      await sendWhenIdle(get, `${ask}${userSaid}`, { imageUrls: it.image.sliceUrls }, { silentUser: true, cardFill: { kind: 'character', ref: localId } })
    } else if (it.role === 'background') {
      const localId = useProducerStore.getState().addBackgroundFromImage(it.image.thumbUrl)
      if (!localId) continue
      const label = backgroundMentions(useProducerStore.getState().backgrounds, voice).find((m) => m.ref === localId)?.label ?? localId
      speak(translate(voice, 'Added a background card with {name}. I will fill in the description from the picture.', { name: it.image.name }))
      const ask = translate(
        voice,
        'The attached picture is the background on card @{label}. Look at it and fill in only that card: a name for the place, a detailed visual description, and its purpose in a story. Do not write a story.',
        { label },
      )
      await sendWhenIdle(get, `${ask}${userSaid}`, { imageUrls: it.image.sliceUrls }, { silentUser: true, cardFill: { kind: 'background', ref: localId } })
    }
  }
  const refs = plan.items.filter((it) => it.role === 'reference')
  if (refs.length > 0) {
    await sendWhenIdle(get, plan.msg, {
      imageUrls: refs.flatMap((r) => r.image.sliceUrls),
      thumbUrls: refs.map((r) => r.image.thumbUrl),
    })
  }
}

/**
 * 그림마다 다 답했다(2026-10-10 오너) — 만화 원고가 있고 그림체 그림이 없으면 그림체(고정 · 각색)부터 묻고,
 *   아니면 바로 쓴다. 웹툰 원고 + 다른 그림체 그림이면 대본은 원고에서, 그림체는 그 그림으로.
 */
async function finishImageRoles(get: () => GlobalChatState, plan: ImageRoleGate): Promise<void> {
  const hasComic = plan.items.some((it) => it.role === 'comic')
  const hasStyle = plan.items.some((it) => it.role === 'style')
  if (hasComic && !hasStyle && useProducerStore.getState().customStyleAnchor?.locked !== true) {
    askComicStyle(get, plan.items.filter((it) => it.role === 'comic').map((it) => it.image), plan)
    return
  }
  await runChatImagePlan(get, plan, null)
}

/** 그림마다 고른 대로 쓴다 — 인물 · 배경 · 참고는 종전대로(runImageRolePlan), 그림체 그림은 그림체로, 만화 원고는 대본으로. */
async function runChatImagePlan(get: () => GlobalChatState, plan: ImageRoleGate, comicStyle: 'lock' | 'adapt' | null): Promise<void> {
  const pages = plan.items.filter((it) => it.role === 'comic').map((it) => it.image)
  const styleImage = plan.items.find((it) => it.role === 'style')?.image ?? null
  const consent = plan.consent ?? CHAT_IMAGE_ROLE_CONSENT
  const roleItems = plan.items.filter((it) => it.role === 'character' || it.role === 'background' || it.role === 'reference')
  const cardsDone = roleItems.length ? runImageRolePlan(get, { ...plan, items: roleItems }) : Promise.resolve()
  if (pages.length) {
    const locked = useProducerStore.getState().customStyleAnchor?.locked === true
    const comic = await runComicAdaptation(get, pages, {
      styleImage,
      styleMode: locked ? 'keep' : comicStyle ?? 'lock',
      consent,
      beforeFill: cardsDone,
    })
    await cardsDone
    await comic.styleDone
    return
  }
  const style = styleImage ? runStyleFromImage(styleImage, 'picture', consent) : Promise.resolve()
  await cardsDone
  await style
}

function projectChatStage(): { projectId: string | null; stage: StageId } {
  const project = useProjectStore.getState()
  return { projectId: project.projectId, stage: project.currentStage }
}

function isProducerChoice(suggestion: ChatSuggestion | null): boolean {
  return suggestion?.stage === 'producer' && (suggestion.action?.kind === 'choices' || !!suggestion.restoredChoices)
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
  // 고정된 그림체(2026-10-09 오너)는 다른 그림으로 바꾸지 않는다 — 저장 창구도 409 로 막는다.
  if (useProducerStore.getState().customStyleAnchor?.locked === true) return translate(contentLocale(), "The art style comes from the picture you chose, so it can't be changed.")

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
    if (useProjectStore.getState().projectId !== projectId) return null
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

/** 씬 스토리 확정을 보내는 중인 프로젝트 — 두 번 누름 방지(2026-10-01). */
const sceneGateInFlight = new Set<string>()
const sceneStoryRequests = new Map<string, symbol>()
// 트리트먼트를 다 썼다고 알린 실행(프로젝트:실행) — 화면이 다시 그려져도 같은 말을 두 번 남기지 않는다.
const announcedTreatments = new Set<string>()

/** 넘김 확인 창(2026-10-01 오너). via = 창을 연 곳 — 채팅에서 연 창은 진행할 때 넘김 문장을 다시 남기지 않는다. */
export type HandoffConfirm =
  | { kind: 'producerLock'; projectId: string; proposalId?: string }
  | { kind: 'directorReadiness'; projectId: string; report: DirectorReadinessReport; gateGaps: string[]; via: 'button' | 'chat' }

/** Director 게이트 막힘 중 Writer 쪽(씬·샷 미완성) — "그래도 진행"으로도 넘기지 않는다. 나머지(Artist 이미지)는 창에서 고른다. */
function writerSideBlockers(): string[] {
  const gate = useProjectStore.getState().lifecycleStatus.director
  if (gate?.ready !== false) return []
  return gate.blockers.filter((b) => b.field.startsWith('writer:')).map((b) => b.label)
}

function artistSideBlockers(): string[] {
  const gate = useProjectStore.getState().lifecycleStatus.director
  if (gate?.ready !== false) return []
  return gate.blockers.filter((b) => !b.field.startsWith('writer:')).map((b) => b.label)
}

/** 샷별 준비 판정. 재료를 못 읽으면(네트워크 등) 단계 게이트의 Artist 막힘만으로 판정한다. */
async function directorReadinessOf(projectId: string): Promise<{ report: DirectorReadinessReport; gateGaps: string[]; incomplete: boolean }> {
  const gateGaps = artistSideBlockers()
  try {
    const report = await loadDirectorReadiness(projectId)
    return { report, gateGaps, incomplete: report.incompleteCount > 0 || gateGaps.length > 0 }
  } catch {
    return { report: { scenes: [], readyCount: 0, incompleteCount: 0 }, gateGaps, incomplete: gateGaps.length > 0 }
  }
}

interface HandoffBlockers {
  /** 비워있으면 핸드오프를 차단한다 (기존 동작 불변). */
  hard: string[]
  /** 비워있어도 진행하되, 품질(퀴얼리티) 경고를 함께 보여준다(오너 확정 2026-08-28). */
  soft: string[]
}

function currentProducerGate() {
  const p = useProducerStore.getState()
  return evaluateProducerGate({ settings: p.projectSettings, storyReady: p.storyReady, cast: p.cast, backgrounds: p.backgrounds, styleAnchorKey: p.styleAnchorKey, locale: contentLocale(), preserveScript: p.preserveScript })
}

/** 도구 저장 뒤 다음 응답도 최신 보드와 같은 필수 항목을 보도록 매 호출마다 만든다. */
function producerChatContext() {
  const p = useProducerStore.getState()
  const gate = currentProducerGate()
  return {
    currentSettings: p.projectSettings,
    storyText: p.storyText,
    preserveScript: p.preserveScript === true,
    currentCast: p.cast,
    currentBackgrounds: p.backgrounds,
    gate: {
      canHandoff: gate.canHandoff,
      hardMissing: gate.hardMissing.map((i) => (i.detail ? `${i.label} (${i.detail})` : i.label)),
      softMissing: gate.softMissing.map((i) => (i.detail ? `${i.label} (${i.detail})` : i.label)),
    },
  }
}

function handoffBlockers(spec: HandoffSpec, opts?: { acceptIncomplete?: boolean }): HandoffBlockers {
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
      preserveScript: p.preserveScript,
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
    // "그래도 진행"(acceptIncomplete)은 Artist 쪽 빈 곳만 넘어간다 — Writer 가 안 끝났으면 넘길 샷이 없다.
    const hard = opts?.acceptIncomplete ? writerSideBlockers() : gate?.ready === false ? gate.blockers.map((b) => b.label) : []
    // 넘어간 뒤에도 무엇이 비어 있는지는 남긴다(품질 경고 줄).
    const incomplete = opts?.acceptIncomplete ? artistSideBlockers() : []
    // artist → director soft: 옛 "뒷모습·측면 없음" 경고는 약속 C9(2026-09-04)로 뺐다 — 시트 1장에 모든 각도가 있어
    //   따로 만들 뒷모습·측면이 없다(개별 방향 뷰 생성은 2026-07-11 폐기).
    const soft: string[] = [...incomplete]
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
async function runHandoff(spec: HandoffSpec): Promise<{ ok: boolean; path: string | null; error?: string; existing?: boolean; gated?: boolean }> {
  const projectId = useProjectStore.getState().projectId
  if (projectId && ['producer', 'writer'].includes(spec.from)) {
    try {
      const response = await fetch(`/api/writer/status/${projectId}${spec.to === 'artist' ? '?assets=1&strict=1' : ''}`, { cache: 'no-store' })
      const status = await response.json()
      if (!response.ok || typeof status.started !== 'boolean') throw new Error('Could not check the handoff requirements. Please try again.')
      if (useProjectStore.getState().projectId !== projectId) return { ok: false, path: null }
      if (spec.to === 'artist') {
        if (status.assets?.images_ready !== true) return { ok: false, path: null, error: translate(contentLocale(), 'Artist images are not ready. Check project status for the remaining work.') }
        useProjectStore.getState().setArtistAssetGate(status.assets)
      }
      // 트리트먼트 초안(아직 넘기지 않은 실행)은 이어 가는 넘김이 아니다 — 아래 saveAndHandoff 가 그 초안을 Producer 값으로 이어 간다.
      if (spec.from === 'producer' && status.started && status.draft !== true) {
        useProjectStore.getState().unlockThrough('writer')
        // Writer 가 이미 시작됐다 — 이어 가는 넘김도 Producer 를 잠근다(단계 저장만 실패했던 경우 포함).
        useProjectStore.getState().lockProducer()
        // 씬 스토리를 쓰는 중이거나 확정을 기다리면 그 일은 Producer 메인에서 한다 — Writer 로 보내지 않는다.
        const phase = sceneGatePhase(status)
        if (phase === 'writing' || phase === 'gate') return { ok: true, path: null, existing: true, gated: true }
        return { ok: true, path: await handoffToStage('writer', { verify: true }), existing: true }
      }
    } catch (error) { return { ok: false, path: null, error: translate(contentLocale(), error instanceof Error ? error.message : 'Could not check the handoff requirements. Please try again.') } }
  }
  if (spec.from === 'producer') {
    const ok = await useProducerStore.getState().saveAndHandoff()
    if (useProjectStore.getState().projectId !== projectId) return { ok: false, path: null }
    if (!ok && projectId && useProjectStore.getState().projectId === projectId) {
      // Submission may have succeeded before the stage save failed. Reconnect; never start again here.
      try {
        const response = await fetch(`/api/writer/status/${projectId}`, { cache: 'no-store' })
        const status = await response.json()
        if (response.ok && status.started === true && status.draft !== true && useProjectStore.getState().projectId === projectId) {
          useProjectStore.getState().unlockThrough('writer')
          useProjectStore.getState().lockProducer()
          const phase = sceneGatePhase(status)
          if (phase === 'writing' || phase === 'gate') return { ok: true, path: null, existing: true, gated: true }
          return { ok: true, path: await handoffToStage('writer', { verify: true }), existing: true }
        }
      } catch { /* Keep the original failure when the execution cannot be confirmed. */ }
    }
    // 서버가 씬 스토리 확정 단계로 시작했다고 알리면(2026-10-01 오너) Producer 메인에 머문다 — 확정 뒤에 Writer 로 간다.
    if (ok && useProducerStore.getState().lastHandoffGated) return { ok: true, path: null, gated: true }
    const path = ok ? await handoffToStage(spec.to, { verify: true }) : null
    return { ok: ok && !!path, path }
  }
  if (spec.from === 'writer' && spec.to === 'artist') {
    const path = await handoffToStage(spec.to, { verify: true })
    return { ok: !!path, path, ...(!path ? { error: translate(contentLocale(), 'Could not save the stage change. Please try again.') } : {}) }
  }
  return { ok: true, path: await handoffToStage(spec.to) }
}

export const useGlobalChatStore = create<GlobalChatState>((set, get) => ({
  messages: [],
  loading: false,
  recoveryProgress: null,
  error: null,
  lastTrace: null,
  suggestion: null,
  dismissedSuggestionIds: [],
  pendingProposal: null,
  scriptPreserveHeld: null,
  imageRoleGate: null,
  imageBatchGate: null,
  creationPlanFor: null,
  comicRetry: null,
  comicStyleGate: null,
  boardBusy: null,
  deferredProposals: [],
  deferredSuggestions: [],
  recordedSuggestionIds: [],
  executingProposalIds: [],
  cancelledProposalIds: [],
  stageBadges: {},
  pendingNavigatePath: null,
  workflowNavigation: null,
  finishWorkflowNavigation: arrived => {
    const pending = get().workflowNavigation
    if (!pending) return
    set({ workflowNavigation: null })
    if (useProjectStore.getState().projectId !== pending.projectId) return
    get().notifyIssue(pending.stage, translate(contentLocale(), arrived ? '{stage} is now open.' : 'Could not open {stage}. Your saved work is preserved.', { stage: STAGE_LABEL[pending.stage] }))
  },
  directorHandoff: null,
  handoffConfirm: null,
  messagesLoadedProjectId: null,
  sceneStoryEdit: null,
  sceneStoryRefresh: 0,
  sceneStoryProposalPending: null,
  sceneStoryVariantPreview: null,
  refreshSceneStory: () => set((state) => ({ sceneStoryRefresh: state.sceneStoryRefresh + 1 })),
  previewSceneStoryVariant: (proposalId, variantId) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    set({ sceneStoryVariantPreview: { projectId, proposalId, variantId } })
  },
  syncSceneStoryProposal: (projectId, id) => {
    if (projectId !== useProjectStore.getState().projectId || sceneStoryRequests.has(projectId)) return
    const current = get().sceneStoryProposalPending
    if (current?.projectId === projectId && current.id === id) return
    if (!current && !id) return
    set({ sceneStoryProposalPending: id ? { projectId, id } : null })
  },

  beginSceneStoryEdit: (mode) => {
    const projectId = useProjectStore.getState().projectId
    const chat = get()
    if (!projectId || (mode === 'ai' && chat.loading) || chat.pendingProposal || chat.executingProposalIds.length || chat.sceneStoryEdit || sceneGateInFlight.has(projectId)) return false
    if (chat.suggestion) chat.dismissSuggestion({ implicit: true })
    set({ sceneStoryEdit: mode === 'manual' ? { projectId, mode, busy: false } : null, error: null })
    if (mode === 'ai') {
      const locale = contentLocale()
      get().offerSuggestion({
        id: `scene-story-edit:${projectId}`,
        stage: 'producer',
        dismissible: false,
        content: translate(locale, 'How would you like to revise the scene story?'),
        action: {
          kind: 'choices',
          options: [
            ['Light polish', 'Keep the scene story content and only polish the sentences.'],
            ['Fresh wording', 'Keep the story flow and rewrite the wording.'],
            ['Rethink the idea', 'Rework the scene story, including its events and ending.'],
          ].map(([label, utterance]) => ({ label: translate(locale, label), utterance: translate(locale, utterance) })),
        },
      }, { preempt: true })
      useChatUiStore.getState().setCollapsed(false)
      useChatUiStore.getState().requestChatFocus()
    }
    return true
  },

  endSceneStoryEdit: () => {
    if (get().sceneStoryEdit?.busy) return
    const projectId = useProjectStore.getState().projectId
    if (get().suggestion?.id === `scene-story-edit:${projectId}`) get().dismissSuggestion({ implicit: true })
    set({ sceneStoryEdit: null })
  },

  setSceneStoryEditBusy: (busy) => {
    const edit = get().sceneStoryEdit
    if (!edit) return
    if (edit.projectId !== useProjectStore.getState().projectId) { set({ sceneStoryEdit: null }); return }
    set({ sceneStoryEdit: { ...edit, busy } })
  },

  loadMessages: async (projectId) => {
    // #welcome-race: 아래 hydrate 의 set 은 suggestion 을 (복원 선택지 또는 null 로) 덮어쓴다.
    //   완료 마커를 로드 전 비우고 모든 종료 경로에서 세워, 제안 발사측이 로드 뒤에만 쏘게 한다.
    set({ messagesLoadedProjectId: null, lastTrace: null, suggestion: null, pendingProposal: null, deferredProposals: [], deferredSuggestions: [], recordedSuggestionIds: [], dismissedSuggestionIds: [], cancelledProposalIds: [], sceneStoryEdit: null, sceneStoryProposalPending: null, sceneStoryVariantPreview: null, ...loadConversationState(projectId) })
    if (get().pendingProposal?.stage === 'producer' && isProducerChoice(get().suggestion)) get().dismissSuggestion()
    const hadProducerApproval = get().pendingProposal?.stage === 'producer'
    const loadSession = chatSession
    const loadId = ++chatHistoryLoad
    const stillCurrent = () => loadSession === chatSession && loadId === chatHistoryLoad && useProjectStore.getState().projectId === projectId
    const messagesAtStart = get().messages
    const suggestionAtStart = get().suggestion
    const traceAtStart = get().lastTrace
    let traceMessages = messagesAtStart
    const hydrate = (
      rows: Array<{
        stage: string
        role: 'user' | 'model'
        content: string
        created_at?: string
      }>,
    ) => {
      // 조회 중 새 대화나 선택지가 생겼으면 과거 스냅샷으로 덮지 않는다.
      // 서버 행에는 안정적인 메시지 ID가 없어 본문을 비교해 합치면 같은 발화를 잘못 지울 수 있다.
      if (get().messages !== messagesAtStart || get().suggestion !== suggestionAtStart) return
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
      traceMessages = visible
      set({
        messages: visible,
        suggestion: suggestion ?? get().suggestion,
      })
      if (isProducerChoice(get().suggestion) &&
        (hadProducerApproval || get().pendingProposal?.stage === 'producer' ||
          get().dismissedSuggestionIds.includes(get().suggestion!.id))) get().dismissSuggestion()
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
      if (!stillCurrent()) return
      if (!res.ok) {
        set({ messagesLoadedProjectId: projectId })
        return
      }
      const messagesResponse = res.json() as Promise<{ messages?: unknown }>
      // 응답 통계가 느려도 이전 대화와 입력 준비는 먼저 끝낸다.
      void Promise.resolve(loadLatestChatTrace(projectId)).then((persistedTrace) => {
        if (!stillCurrent() || get().lastTrace !== traceAtStart || get().messages !== traceMessages) return
        set({ lastTrace: persistedTrace ?? null })
      }).catch((err) => console.error('[global-chat-store] trace load failed:', err))
      const { messages } = await messagesResponse
      if (!stillCurrent()) return
      hydrate((messages ?? []) as Array<{
        stage: string
        role: 'user' | 'model'
        content: string
      }>)
      set({ messagesLoadedProjectId: projectId })
    } catch (err) {
      if (!stillCurrent()) return
      console.error('[global-chat-store] loadMessages failed:', err)
      // 실패도 "로드 종료"다 — 마커를 세워야 웰컴 등 제안 발사측이 영영 굶지 않는다(빈 이력으로 진행).
      set({ messagesLoadedProjectId: projectId })
    }
  },

  requestDirectorHandoff: async (mode, resumeId) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) {
      get().notifyIssue('writer', translate(contentLocale(), 'Open a project before handing over.'))
      set({ loading: false })
      return
    }
    const previous = get().directorHandoff
    const keepWaiting = mode === 'whenReady' || (mode === 'check' && previous?.phase === 'waiting' && previous.projectId === projectId)
    if (resumeId && (previous?.id !== resumeId || previous.phase !== 'waiting')) return
    const id = resumeId ?? makeId()
    const session = chatSession
    const active = () => session === chatSession && projectId === useProjectStore.getState().projectId && get().directorHandoff?.id === id
    set({ directorHandoff: { id, projectId, phase: 'checking', notice: previous?.notice } })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch(`/api/project/${projectId}/handoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ targetStage: 'director', action: mode === 'check' ? 'check' : 'move', locale: contentLocale() }),
      })
      const result = await response.json()
      if (!active()) return
      if (response.status === 401) throw new Error(translate(contentLocale(), 'Please sign in again, then ask me to hand over.'))
      if (response.status === 403) throw new Error(translate(contentLocale(), 'You do not have permission to change this project. Open a project you own.'))
      if ((!response.ok && response.status !== 409) || typeof result.ready !== 'boolean') {
        throw new Error(typeof result.error?.message === 'string' ? result.error.message : translate(contentLocale(), 'Could not check the handoff requirements. Please try again.'))
      }
      if (!result.ready) {
        const blockers = Array.isArray(result.blockers) ? result.blockers : []
        const details = blockers.map((blocker: { label?: string; action?: string }) => [blocker.label, blocker.action].filter(Boolean).join(' — ')).join('\n')
        const notice = translate(contentLocale(), "Can't move to {stage} yet. Please fill these in first:", { stage: 'Director' })
          + '\n' + (details || translate(contentLocale(), 'Could not check the handoff requirements. Please try again.'))
          + (keepWaiting ? '\n\n' + translate(contentLocale(), 'I will check again and open Director when it is ready. Say cancel to stop waiting.') : '')
        if (notice !== previous?.notice) get().notifyIssue('writer', notice)
        set({ loading: false, directorHandoff: keepWaiting ? { id, projectId, phase: 'waiting', notice } : null })
        return
      }
      if (mode === 'check') {
        get().notifyIssue('writer', translate(contentLocale(), 'Director is ready. I checked {scenes} saved scenes and {shots} saved shots. Ask me to hand over when you are ready.', { scenes: result.counts.scenes, shots: result.counts.shots }))
        set({ loading: false, directorHandoff: keepWaiting ? { id, projectId, phase: 'waiting' } : null })
        return
      }
      if (result.path !== '/studio/director') throw new Error(translate(contentLocale(), 'Could not save the stage change. Please try again.'))
      // 서버가 저장한 개방만 반영한다. 현재 화면과 성공 안내는 실제 경로 도착 뒤에 바뀐다.
      useProjectStore.getState().unlockThrough('director')
      get().notifyIssue('writer', translate(contentLocale(), 'The saved scenes and shots are ready. Opening Director.'))
      set({ loading: false, directorHandoff: { id, projectId, phase: 'navigating' }, pendingNavigatePath: withDemoShare(`/studio/director?projectId=${encodeURIComponent(projectId)}`) })
    } catch (error) {
      if (!active()) return
      const detail = error instanceof Error && error.name !== 'AbortError' ? error.message : translate(contentLocale(), 'Could not check the handoff requirements. Please try again.')
      get().notifyIssue('writer', detail)
      set({ loading: false, directorHandoff: null, pendingNavigatePath: null })
    } finally {
      clearTimeout(timeout)
    }
  },

  resumeDirectorHandoff: async () => {
    const pending = get().directorHandoff
    if (get().loading || pending?.phase !== 'waiting' || pending.projectId !== useProjectStore.getState().projectId) return
    await get().requestDirectorHandoff('whenReady', pending.id)
  },

  confirmDirectorHandoff: (projectId, pathname) => {
    const pending = get().directorHandoff
    if (pending?.phase !== 'navigating' || pending.projectId !== projectId || projectId !== useProjectStore.getState().projectId || pathname !== '/studio/director') return
    set({ directorHandoff: null, pendingNavigatePath: null })
    get().notifyIssue('writer', translate(contentLocale(), 'Director is now open.'))
    get().notifyIssue('writer', handoffMarker('writer', 'director'))
  },

  failDirectorHandoff: () => {
    if (get().directorHandoff?.phase !== 'navigating') return
    set({ directorHandoff: null, pendingNavigatePath: null, loading: false })
    get().notifyIssue('writer', translate(contentLocale(), 'Could not open Director. Your work is saved. Select Director on the left or ask me to try again.'))
  },

  requestNextStep: async () => {
    const project = useProjectStore.getState()
    const { projectId, currentStage } = project
    if (!projectId || get().loading || get().handoffConfirm) return
    const action = nextStepAction(currentStage, { producerLocked: project.producerLocked })
    if (!action) return
    if (action.kind === 'open') {
      // 잠긴 Producer: 다시 넘기지 않고 Writer 화면으로 간다. Writer 가 결과 없이 끝나 되돌아온 경우만 같은 내용으로 다시 넘긴다.
      if (project.canNavigateTo(action.stage)) {
        const path = await handoffToStage(action.stage)
        if (path && useProjectStore.getState().projectId === projectId) set({ pendingNavigatePath: path })
        return
      }
      await get().sendMessage(translate(useLocaleStore.getState().locale, 'Please hand over to Writer'), undefined, { consentedHandoff: true })
      return
    }
    // 버튼 = 그 문장을 타이핑한 것(#handoff-to-chat). 버튼의 언어는 화면(UI) 언어다 — 예전 채팅 위 칩과 같다.
    const utterance = translate(useLocaleStore.getState().locale, action.utterance)
    if (action.from === 'producer') {
      // 그림 쓰임새 질문이 남아 있으면 확정 창을 열지 않는다 — 채팅이 먼저 고르라고 답한다(확정 뒤 넘김이 삼켜지지 않게).
      if (get().imageRoleGate || get().imageBatchGate || get().comicStyleGate) {
        await get().sendMessage(utterance, undefined, { consentedHandoff: true })
        return
      }
      // 필수 칸이 비었으면 확정할 것이 없다 — 창 대신 채팅이 빈 곳을 알려 준다(타이핑했을 때와 같은 답).
      if (handoffBlockers(action).hard.length > 0) {
        await get().sendMessage(utterance, undefined, { consentedHandoff: true })
        return
      }
      // Writer 로 넘기면 Producer 가 잠긴다 — 확정 창을 먼저 연다(2026-10-01 오너 "writer로 넘어갈 때 경고 팝업").
      set({ handoffConfirm: { kind: 'producerLock', projectId } })
      return
    }
    if (action.from === 'artist' && writerSideBlockers().length === 0) {
      // 준비가 덜 된 샷이 있으면 넘기지 않고 목록 창을 연다(2026-10-01 오너 "director 넘어갈 때 미완성 팝업").
      const readiness = await directorReadinessOf(projectId)
      if (useProjectStore.getState().projectId !== projectId) return
      if (readiness.incomplete) {
        set({ handoffConfirm: { kind: 'directorReadiness', projectId, report: readiness.report, gateGaps: readiness.gateGaps, via: 'button' } })
        return
      }
      await get().sendMessage(utterance, undefined, { consentedHandoff: true, acceptIncomplete: true })
      return
    }
    // Writer→Artist · Director→Editor 는 창 없이 바로(2026-10-01 오너 "그 2구간은 일단 없이").
    await get().sendMessage(utterance, undefined, { consentedHandoff: true })
  },

  openProducerLock: (proposalId) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    if (useProjectStore.getState().producerLocked) {
      // 이미 잠긴 프로젝트의 다시 넘기기 — 바뀌는 것이 없으니 확인 창 없이 그 카드를 승인한다.
      if (proposalId) void get().approvePendingProposal(proposalId)
      return
    }
    set({ handoffConfirm: { kind: 'producerLock', projectId, ...(proposalId ? { proposalId } : {}) } })
  },

  confirmProducerLock: async () => {
    const confirm = get().handoffConfirm
    if (confirm?.kind !== 'producerLock' || confirm.projectId !== useProjectStore.getState().projectId) return
    set({ handoffConfirm: null })
    const card = get().pendingProposal
    // 채팅 카드에서 연 창이면 그 카드를 승인한다(카드 승인 경로가 넘김·⇄ 연출·이동을 그대로 한다).
    if (confirm.proposalId && card?.id === confirm.proposalId) {
      await get().approvePendingProposal(confirm.proposalId)
      return
    }
    // 버튼에서 열었는데 예전 카드가 남아 있으면 내린다 — 같은 넘김이 두 번 남지 않게.
    if (card?.kind === 'producerWriterInitialHandoff') get().dismissPendingProposal(card.id)
    await get().sendMessage(translate(useLocaleStore.getState().locale, 'Please hand over to Writer'), undefined, { consentedHandoff: true })
  },

  proceedToDirectorAnyway: async () => {
    const confirm = get().handoffConfirm
    if (confirm?.kind !== 'directorReadiness' || confirm.projectId !== useProjectStore.getState().projectId) return
    set({ handoffConfirm: null })
    await get().sendMessage(translate(useLocaleStore.getState().locale, 'Please hand over to Director'), undefined, {
      consentedHandoff: true,
      acceptIncomplete: true,
      // 채팅에서 연 창이면 사용자의 넘김 말이 이미 스레드에 있다 — 다시 남기지 않는다.
      silentUser: confirm.via === 'chat',
      stageOverride: 'artist',
    })
  },

  closeHandoffConfirm: () => set({ handoffConfirm: null }),

  confirmSceneGate: async () => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return false
    if (get().sceneStoryEdit || get().sceneStoryProposalPending?.projectId === projectId) return null
    // 넘기기 전 트리트먼트 초안(2026-10-02 시안 v04)의 확정 = Writer 로 넘기기 — 같은 확인 창을 거친다(빈 칸이 있으면 채팅이 알려 준다).
    const project = useProjectStore.getState()
    if (!project.producerLocked && project.treatmentDraft) {
      if (get().suggestion?.action?.kind === 'confirmScenes') get().dismissSuggestion({ implicit: true })
      await get().requestNextStep()
      return null
    }
    // 두 번 누름(Enter + 버튼 등) — 두 번째 확정은 409 로 돌아와 성공 직후 오류처럼 보인다.
    if (sceneGateInFlight.has(projectId)) return null
    sceneGateInFlight.add(projectId)
    // 확정 안내를 먼저 내린다 — 보내는 동안 Enter 가 다시 확정을 누르지 않게(실패하면 Producer 가 3초 안에 다시 띄운다).
    if (get().suggestion?.action?.kind === 'confirmScenes') get().dismissSuggestion({ implicit: true })
    try {
      const response = await fetch('/api/writer/scene-gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, action: 'confirm' }),
      })
      if (!response.ok) {
        // 화면이 아직 초안인 줄 몰랐다 — 서버가 넘기기를 거치라고 하면 그 확인 창을 연다.
        const refused = await response.json().catch(() => null) as { code?: string } | null
        if (refused?.code === 'treatment_draft_handoff_required' && useProjectStore.getState().projectId === projectId) {
          useProjectStore.getState().setTreatmentDraft(true)
          sceneGateInFlight.delete(projectId)
          await get().requestNextStep()
          return null
        }
        return false
      }
    } catch {
      return false
    } finally {
      sceneGateInFlight.delete(projectId)
    }
    // 상태를 바로 다시 읽는다 — 3초 폴링 사이 옛 "확정 대기"가 화면에 남지 않게.
    restartWriterStatus(projectId)
    if (useProjectStore.getState().projectId !== projectId) return false
    // 확정은 Producer 메인에서 한다 — 확정하면 나머지 생성이 도는 Writer 화면으로 간다(그 화면은 조작 없이 진행만 보여 준다).
    if (useProjectStore.getState().currentStage === 'producer') {
      useProjectStore.getState().unlockThrough('writer')
      set({ pendingNavigatePath: withDemoShare('/studio/writer') })
    }
    return true
  },

  reviseSceneGate: async (feedback) => {
    const projectId = useProjectStore.getState().projectId
    const text = feedback.trim()
    if (!projectId || !text || get().sceneStoryEdit) return false
    if (sceneGateInFlight.has(projectId) || sceneStoryRequests.has(projectId) || get().sceneStoryProposalPending?.projectId === projectId) {
      set({ error: translate(contentLocale(), 'Apply or discard the current scene story proposal before requesting another.') })
      return false
    }
    const session = chatSession
    const requestId = Symbol()
    const isCurrent = () => session === chatSession && projectId === useProjectStore.getState().projectId
    sceneStoryRequests.set(projectId, requestId)
    set({ sceneStoryProposalPending: { projectId, id: null }, error: null })
    let success = false
    try {
      const response = await fetch('/api/writer/scene-gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, action: 'revise', feedback: text }),
      })
      const accepted = await response.json() as { proposalId?: string; code?: string }
      if (!isCurrent()) return false
      if (!response.ok) {
        if (accepted.code === 'scene_story_proposal_pending') set({ error: translate(contentLocale(), 'Apply or discard the current scene story proposal before requesting another.') })
        return false
      }
      set({ sceneStoryProposalPending: { projectId, id: accepted.proposalId ?? null } })
      success = true
      get().refreshSceneStory()
      return true
    } catch {
      return false
    } finally {
      if (sceneStoryRequests.get(projectId) === requestId) sceneStoryRequests.delete(projectId)
      if (!success && isCurrent()) {
        set({ sceneStoryProposalPending: null, error: get().error ?? translate(contentLocale(), 'Could not send the change request. Please try again.') })
        get().refreshSceneStory()
      }
    }
  },

  resolveSceneStoryProposal: async (action, proposalId, variantId) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId || !proposalId || get().sceneStoryEdit || sceneGateInFlight.has(projectId) || sceneStoryRequests.has(projectId)) return false
    const session = chatSession
    const isCurrent = () => session === chatSession && projectId === useProjectStore.getState().projectId
    sceneGateInFlight.add(projectId)
    set({ error: null })
    try {
      const response = await fetch('/api/writer/scene-gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, action, proposalId, ...(action === 'apply' && variantId ? { variantId } : {}) }),
      })
      const result = await response.json() as { code?: string }
      if (!isCurrent()) return false
      if (!response.ok) {
        set({ error: translate(contentLocale(), result.code === 'scene_story_changed'
          ? 'The scene story changed. Ask for a new proposal based on the latest version.'
          : 'Could not update the scene story proposal. Please try again.') })
        get().refreshSceneStory()
        return false
      }
      set({ sceneStoryProposalPending: null, sceneStoryVariantPreview: null })
      get().refreshSceneStory()
      restartWriterStatus(projectId)
      return true
    } catch {
      if (isCurrent()) set({ error: translate(contentLocale(), 'Could not update the scene story proposal. Please try again.') })
      return false
    } finally {
      sceneGateInFlight.delete(projectId)
    }
  },

  rewriteSceneStory: async (level) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId || get().sceneStoryEdit) return false
    if (sceneGateInFlight.has(projectId) || sceneStoryRequests.has(projectId) || get().sceneStoryProposalPending?.projectId === projectId) {
      set({ error: translate(contentLocale(), 'Apply or discard the current scene story proposal before requesting another.') })
      return false
    }
    const session = chatSession
    const requestId = Symbol()
    const isCurrent = () => session === chatSession && projectId === useProjectStore.getState().projectId
    sceneStoryRequests.set(projectId, requestId)
    set({ sceneStoryProposalPending: { projectId, id: null }, sceneStoryVariantPreview: null, error: null })
    let success = false
    try {
      const response = await fetch('/api/writer/scene-gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, action: 'rewrite', level }),
      })
      const accepted = await response.json() as { proposalId?: string; code?: string }
      if (!isCurrent()) return false
      if (!response.ok) {
        if (accepted.code === 'scene_story_proposal_pending') set({ error: translate(contentLocale(), 'Apply or discard the current scene story proposal before requesting another.') })
        return false
      }
      set({ sceneStoryProposalPending: { projectId, id: accepted.proposalId ?? null } })
      success = true
      get().refreshSceneStory()
      return true
    } catch {
      return false
    } finally {
      if (sceneStoryRequests.get(projectId) === requestId) sceneStoryRequests.delete(projectId)
      if (!success && isCurrent()) {
        set({ sceneStoryProposalPending: null, error: get().error ?? translate(contentLocale(), 'Could not start the rewrite. Please try again.') })
        get().refreshSceneStory()
      }
    }
  },

  regenerateSceneStoryRewrite: async (proposalId, level) => {
    const discarded = await get().resolveSceneStoryProposal('discard', proposalId)
    if (!discarded) return false
    return get().rewriteSceneStory(level)
  },

  // 시안 v04 "아이디어로 트리트먼트를 만들었어요" — 확정 안내(단추)는 넘기기 전 초안에 띄우지 않으므로(sceneGateOfferMode)
  //   다 썼다는 사실과 다음 할 일만 평범한 말 한 줄로 남긴다. Producer 채팅은 그대로 쓰인다.
  announceTreatmentReady: (projectId, runKey) => {
    if (useProjectStore.getState().projectId !== projectId) return false
    const key = `${projectId}:${runKey}`
    if (announcedTreatments.has(key)) return false
    announcedTreatments.add(key)
    const content = translate(contentLocale(), 'The treatment is ready. Edit it on the screen, or use Rewrite to get three versions. When it looks right, press Hand over to Writer at the top right.')
    set((state) => ({ messages: [...state.messages, { id: makeId(), stage: 'producer', role: 'model', content }] }))
    saveChatMessage(projectId, 'producer', 'model', content)
    return true
  },

  resolveSceneStoryUndo: async (action, undoId) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId || !undoId || get().sceneStoryEdit || sceneGateInFlight.has(projectId) || sceneStoryRequests.has(projectId)) return false
    const session = chatSession
    const isCurrent = () => session === chatSession && projectId === useProjectStore.getState().projectId
    sceneGateInFlight.add(projectId)
    set({ error: null })
    try {
      const response = await fetch('/api/writer/scene-gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, action, undoId }),
      })
      if (!isCurrent()) return false
      if (!response.ok) {
        set({ error: translate(contentLocale(), action === 'undo'
          ? 'Could not go back. The treatment changed after the version was applied.'
          : 'Could not update the treatment. Please try again.') })
        get().refreshSceneStory()
        return false
      }
      get().refreshSceneStory()
      restartWriterStatus(projectId)
      return true
    } catch {
      if (isCurrent()) set({ error: translate(contentLocale(), 'Could not update the treatment. Please try again.') })
      return false
    } finally {
      sceneGateInFlight.delete(projectId)
    }
  },

  sendMessage: async (content, attachments, opts) => {
    const trimmed = content.trim()
    if (!trimmed || get().loading) return
    const attachmentImageUrls = attachments?.imageUrls
    const thumbUrls = attachments?.thumbUrls ?? []

    const stage = opts?.stageOverride ?? useProjectStore.getState().currentStage
    const projectId = useProjectStore.getState().projectId
    // 고정된 그림체(2026-10-09 오너) — 이 턴에 스타일을 바꾸자는 결과가 와도 바꾸지 않고 그렇다고 답한다.
    const styleLockedTurn = stage === 'producer' && useProducerStore.getState().customStyleAnchor?.locked === true
    const history = get().messages
    const session = chatSession
    const isCurrentSession = () => session === chatSession && projectId === useProjectStore.getState().projectId

    const sceneEdit = get().sceneStoryEdit
    if (sceneEdit) {
      if (sceneEdit.projectId !== projectId) set({ sceneStoryEdit: null })
      return
    }

    const sceneSuggestion = get().suggestion
    const sceneChoices = sceneSuggestion?.id === `scene-story-edit:${projectId}`
    // 넘기기 전 트리트먼트 초안(2026-10-02 시안 v04)은 Producer 채팅이 살아 있다 — 다시 쓰기를 연 때(선택지)만 트리트먼트로 보낸다.
    const draftLive = !useProjectStore.getState().producerLocked && useProjectStore.getState().treatmentDraft
    const sceneGate = !draftLive && (sceneSuggestion?.action?.kind === 'confirmScenes' || get().sceneStoryProposalPending?.projectId === projectId)
    // 다시 쓰기 정도(시안 v04) — 선택지나 그 이름을 말하면 세 가지 안을 만든다. 다른 말은 아래처럼 수정안 하나로 간다.
    const rewriteLevel = stage === 'producer' && (sceneChoices || sceneGate)
      ? rewriteLevelOf(trimmed, contentLocale()) ?? rewriteLevelOf(trimmed, useLocaleStore.getState().locale)
      : null
    if (rewriteLevel) {
      get().dismissSuggestion({ implicit: true })
      set({ error: null })
      const ok = await get().rewriteSceneStory(rewriteLevel)
      if (!isCurrentSession()) return
      const levelLabel = translate(contentLocale(), REWRITE_LEVELS.find((option) => option.level === rewriteLevel)!.label)
      const reply = ok
        ? fixKoreanParticles(translate(contentLocale(), 'Writing three versions with {level}. Compare the changes in the treatment, then pick one here and apply it.', { level: levelLabel }), [levelLabel])
        : get().error ?? translate(contentLocale(), 'Could not start the rewrite. Please try again.')
      get().appendLocalExchange('producer', trimmed, reply)
      if (!ok) set({ error: reply })
      return
    }
    if (stage === 'producer' && (sceneChoices || sceneGate) && writerInputRoute(trimmed, { sceneGate: true, running: false, explicitRevision: !sceneChoices }) === 'revise') {
      if (isCancellationUtterance(trimmed) && sceneChoices) { get().dismissSuggestion({ implicit: true }); return }
      get().dismissSuggestion({ implicit: true })
      set({ error: null })
      const ok = await get().reviseSceneGate(trimmed)
      if (!isCurrentSession()) return
      const reply = ok
        ? translate(contentLocale(), 'Creating a scene story proposal. You can keep chatting and editing while it is prepared.')
        : get().error ?? translate(contentLocale(), 'Could not send the change request. Please try again.')
      get().appendLocalExchange('producer', trimmed, reply)
      if (!ok) set({ error: reply })
      return
    }

    if (get().directorHandoff && isCancellationUtterance(trimmed)) {
      set({ directorHandoff: null, pendingNavigatePath: null })
      get().appendLocalExchange(stage, trimmed, translate(contentLocale(), 'Cancelled the pending stage move. Your saved work is unchanged.'))
      return
    }

    const directorRequest = resolveDirectorHandoffIntent(trimmed, stage, history)
    if (directorRequest) {
      set(state => ({ messages: [...state.messages, { id: makeId(), stage, role: 'user', content: trimmed }], loading: true, error: null }))
      if (projectId) saveChatMessage(projectId, stage, 'user', trimmed)
      await get().requestDirectorHandoff(directorRequest.mode)
      return
    }

    // 유저가 말을 걸면 화면에 떠 있는 제안은 종류 불문 내린다(#suggestion-linger 2026-08-06) —
    //   무시하고 딴 얘기를 시작한 넛지가 "나중에"를 누를 때까지 떠 있으면 대화가 아니라 팝업이다.
    //   선택지 칩도 동일(자유 입력 = '기타' 답변). 다른 stage 의 제안은 화면에 없으므로 남기고,
    //   승인 게이트(pendingProposal)는 비용 방어라 별개 — 명시 응답으로만 처리한다.
    //   implicit(#handoff-suggestion-drop 2026-08-07): 자동 내림은 id 를 기록하지 않는다 —
    //   기록하면 핸드오프 준비 완료 버튼이 "나중에"를 누른 적 없이도 세션 내내 사라진다.
    const activeSuggestion = get().suggestion
    const producerChoices = stage === 'producer' && activeSuggestion?.stage === 'producer' && activeSuggestion.action?.kind === 'choices'
      ? activeSuggestion.action : null
    const shortLanguageAnswer = /^(?:한국어|한글|영어|영문|일본어|중국어|Korean|English|Japanese|Chinese|Mandarin|ko|en|ja|zh)(?:\s*\((?:ko|en|ja|zh)\))?(?:로|으로)?[.!]?$/i // i18n-ok: 언어 선택지에 대한 짧은 답을 판별하는 정규식.
    const languageChoices = producerChoices?.options.some((option) => selectedProducerDialogueLanguage(option.utterance, history) || shortLanguageAnswer.test(option.label))
    const answersProducerChoice = !!producerChoices && (producerChoices.options.some((option) => option.utterance === trimmed || option.label === trimmed) ||
      (languageChoices && !requestsSupportedChatEdit(stage, trimmed) && (selectedProducerDialogueLanguage(trimmed, history) !== null || shortLanguageAnswer.test(trimmed))))
    const answeringProducerQuestion = stage === 'producer' && !opts?.cardFill &&
      (opts?.answeringProducerQuestion === true || (producerChoices?.answeringProducerQuestion === true && answersProducerChoice))
    const planningChoiceTurn = answeringProducerQuestion ||
      (!requestsSupportedChatEdit(stage, trimmed) && !(answersProducerChoice && !producerChoices?.answeringProducerQuestion))
    if (
      activeSuggestion &&
      !(activeSuggestion.action?.kind === 'confirmScenes' && writerInputRoute(trimmed, { sceneGate: true, running: false, explicitRevision: true }) === 'chat') &&
      (activeSuggestion.stage === stage || activeSuggestion.dismissible === false)
    ) {
      get().dismissSuggestion({ implicit: true })
    }

    // 만화 그림체(2026-10-09 오너): 만화를 고른 뒤 그림체를 고정할지 각색할지 묻는 중 — 답이면 옮기기를 시작하고, 아니면 다시 묻는다.
    const styleGate = get().comicStyleGate
    if (styleGate && stage === 'producer' && !opts?.silentUser) {
      const mode = matchComicStyleAnswer(trimmed)
      if (!mode) {
        get().appendLocalExchange(
          'producer',
          trimmed,
          translate(contentLocale(), 'Please choose first how the art style should work: fix the comic art style, or adapt to another style like live action.'),
        )
        askComicStyle(get, styleGate.images)
        return
      }
      set((state) => ({ comicStyleGate: null, messages: [...state.messages, { id: makeId(), stage, role: 'user' as const, content: trimmed }] }))
      if (projectId) saveChatMessage(projectId, stage, 'user', trimmed)
      if (styleGate.plan) void runChatImagePlan(get, styleGate.plan, mode)
      else void runComicAdaptation(get, styleGate.images, { styleMode: mode })
      return
    }

    // 만화 다시 옮기기(2026-10-09 검토): 옮기기에 실패하고 "다시 옮기기"를 골랐다 — 같은 쪽으로 다시 옮긴다.
    const comicRetry = get().comicRetry
    if (comicRetry && stage === 'producer' && !opts?.silentUser && isComicRetryAnswer(trimmed, contentLocale())) {
      set((state) => ({ comicRetry: null, messages: [...state.messages, { id: makeId(), stage, role: 'user' as const, content: trimmed }] }))
      if (projectId) saveChatMessage(projectId, stage, 'user', trimmed)
      void retryComicScript(get, comicRetry)
      return
    }

    // 만화 원고 받기(2026-10-09): 여러 장을 한 번에 묻는 질문에 답하는 중 — 만화 그대로 · 그림마다 정하기 · 모두 참고.
    const batchGate = get().imageBatchGate
    if (batchGate && stage === 'producer' && !opts?.silentUser) {
      const choice = matchBatchImageAnswer(trimmed)
      if (!choice) {
        get().appendLocalExchange(
          'producer',
          trimmed,
          translate(contentLocale(), 'Please choose first how to use the pictures: turn the comic into video as drawn, decide for each picture, or use them all as reference.'),
        )
        askImageBatch(get)
        return
      }
      set((state) => ({ messages: [...state.messages, { id: makeId(), stage, role: 'user' as const, content: trimmed }] }))
      if (projectId) saveChatMessage(projectId, stage, 'user', trimmed)
      set({ imageBatchGate: null })
      if (choice === 'comic') {
        askComicStyle(get, batchGate.images)
        return
      }
      if (choice === 'reference') {
        await runImageRolePlan(get, { items: batchGate.images.map((image) => ({ image, role: 'reference' as const })), typed: batchGate.typed, msg: batchGate.msg })
        return
      }
      set({ imageRoleGate: { items: batchGate.images.map((image) => ({ image, role: null })), typed: batchGate.typed, msg: batchGate.msg } })
      askImageRole(get)
      return
    }

    // #image-to-artist: 그림 쓰임새 질문에 답하는 중 — 답이면 기록하고 다음 그림을 묻거나 다 답했으면 실행, 답이 아니면 다시 묻는다.
    const imageGate = get().imageRoleGate
    if (imageGate && stage === 'producer' && !opts?.silentUser) {
      const answer = matchImageUseAnswer(trimmed)
      // "스토리" · "만화를 영상화하고 싶어"처럼 이야기 원작으로 답하면 만화 원고로 받는다(2026-10-09 — 같은 질문만 되풀이하던 것).
      if (!answer && matchComicAnswer(trimmed)) {
        set((state) => ({ messages: [...state.messages, { id: makeId(), stage, role: 'user' as const, content: trimmed }] }))
        if (projectId) saveChatMessage(projectId, stage, 'user', trimmed)
        set({ imageRoleGate: null })
        askComicStyle(get, imageGate.items.map((it) => it.image))
        return
      }
      if (!answer) {
        get().appendLocalExchange(
          'producer',
          trimmed,
          translate(contentLocale(), 'Please choose first how to use the picture: comic page, character, background, art style or reference.'),
        )
        askImageRole(get)
        return
      }
      const userMsg: GlobalChatMessage = { id: makeId(), stage, role: 'user', content: trimmed }
      set((state) => ({ messages: [...state.messages, userMsg] }))
      if (projectId) saveChatMessage(projectId, stage, 'user', trimmed)
      const idx = imageGate.items.findIndex((it) => it.role === null)
      // 그림체는 한 장만 — 다른 그림을 그림체로 고르면 앞의 그림체 그림은 참고 자료로 바뀐다(새 프로젝트 화면과 같은 규칙).
      const items = imageGate.items.map((it, i) => (i === idx ? { ...it, role: answer } : answer === 'style' && it.role === 'style' ? { ...it, role: 'reference' as const } : it))
      if (items.some((it) => it.role === null)) {
        set({ imageRoleGate: { ...imageGate, items } })
        askImageRole(get)
        return
      }
      set({ imageRoleGate: null })
      await finishImageRoles(get, { ...imageGate, items })
      return
    }

    const pendingProposal = get().pendingProposal
    if (pendingProposal && (pendingProposal.stage === stage || pendingProposal.payload.toolEdit) && isCancellationUtterance(trimmed)) {
      const deferred = isDeferralUtterance(trimmed)
      if (deferred) get().deferPendingProposal(pendingProposal.id)
      else get().dismissPendingProposal(pendingProposal.id)
      const reply = deferred ? translate(contentLocale(), 'Saved for later. Reopen it when you are ready.') : translate(contentLocale(), 'Cancelled the pending change. Nothing was executed.')
      set((state) => ({
        messages: [
          ...state.messages,
          { id: makeId(), stage, role: 'user', content: trimmed },
          { id: makeId(), stage, role: 'model', content: reply },
        ],
        error: null,
      }))
      if (projectId) {
        saveChatMessage(projectId, stage, 'user', trimmed)
        saveChatMessage(projectId, stage, 'model', reply)
      }
      return
    }
    if (pendingProposal && isApprovalUtterance(trimmed) && pendingProposal.kind === 'producerWriterInitialHandoff' && !useProjectStore.getState().producerLocked) {
      // Writer 첫 넘김 = Producer 잠금(2026-10-01) — 말로 승인해도 버튼과 같은 확정 창을 거친다.
      get().appendLocalExchange(stage, trimmed, translate(contentLocale(), 'Check the values in the window, then confirm to hand over.'))
      get().openProducerLock(pendingProposal.id)
      return
    }
    if (pendingProposal && isApprovalUtterance(trimmed)) {
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
      if (!isCurrentSession()) return
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
    const dialogueTarget = stage === 'writer' ? dialogueHandoffTarget(trimmed, history) : null
    const dialogueSnapshot = dialogueTarget ? structuredClone(useWriterStore.getState().shots) : []
    const requestedHandoff = dialogueTarget ? null : matchHandoffIntent(trimmed, stage)
    // Keep the deterministic handoff UX; compound edits must finish before any move.
    const compoundWorkflow = requestedHandoff && ['writer', 'artist'].includes(requestedHandoff.to) && requestsSupportedChatEdit(stage, trimmed)
    const handoffSpec = requestedHandoff && !compoundWorkflow && !(stage === 'producer' && useProjectStore.getState().reachedStage !== 'producer' && !opts?.consentedHandoff) ? requestedHandoff : null
    if (handoffSpec) {
      // silentUser: 채팅에서 연 확인 창의 "그래도 진행" — 사용자의 넘김 말은 이미 스레드에 있다.
      if (opts?.silentUser) set({ loading: true, error: null })
      else {
        const userMsg: GlobalChatMessage = { id: makeId(), stage, role: 'user', content: trimmed }
        set((state) => ({ messages: [...state.messages, userMsg], loading: true, error: null }))
        if (projectId) saveChatMessage(projectId, stage, 'user', trimmed)
      }

      // Director 준비 창(2026-10-01 오너 "director 넘어갈 때 미완성 팝업", "그래도 진행을 줘야해") — Artist 에서 넘길 때
      //   준비가 덜 된 샷이 있으면 넘기지 않고 창을 연다. Writer 가 안 끝난 경우는 아래 게이트가 종전대로 막는다.
      let acceptIncomplete = opts?.acceptIncomplete === true
      if (handoffSpec.from === 'artist' && handoffSpec.to === 'director' && !acceptIncomplete && projectId && writerSideBlockers().length === 0) {
        const readiness = await directorReadinessOf(projectId)
        if (!isCurrentSession()) return
        if (readiness.incomplete) {
          const notice = translate(contentLocale(), "Some shots aren't ready yet. Check the list in the window, then proceed anyway or fill them in first.")
          set((state) => ({
            loading: false,
            handoffConfirm: { kind: 'directorReadiness', projectId, report: readiness.report, gateGaps: readiness.gateGaps, via: 'chat' },
            messages: [...state.messages, { id: makeId(), stage, role: 'model' as const, content: notice }],
          }))
          saveChatMessage(projectId, stage, 'model', notice)
          return
        }
        acceptIncomplete = true
      }

      const { hard, soft } = handoffBlockers(handoffSpec, { acceptIncomplete })
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
        if (handoffSpec.from === 'producer' && handoffSpec.to === 'writer' && projectId &&
          !useProducerStore.getState().styleAnchorKey && !get().pendingProposal && get().executingProposalIds.length === 0) {
          useChatUiStore.getState().requestStylePicker(projectId)
        }
        reply =
          translate(locale, "Can't move to {stage} yet. Please fill these in first:", {
            stage: STAGE_LABEL[handoffSpec.to],
          })
          + '\n'
          + hard.map((b) => `· ${b}`).join('\n')
      } else if (handoffSpec.from === 'producer' && handoffSpec.to === 'writer' && !opts?.consentedHandoff && !useProjectStore.getState().producerLocked) {
        // 잠긴 Producer 의 다시 넘기기(Writer 가 결과 없이 끝나 되돌아온 경우)는 바뀌는 것이 없어 카드 없이 아래에서 바로 넘긴다.
        const accepted = get().offerPendingProposal(
          createPendingProposal({
            stage: 'producer',
            kind: 'producerWriterInitialHandoff',
            target: STAGE_LABEL.writer,
            action: translate(locale, 'Invite Writer'),
            impact: [
              translate(locale, 'Nothing runs until you approve.'),
              // 2026-10-01 오너 "producer 완성 시 잠그기" — 카드로 승인해도 잠금을 미리 알린다.
              translate(locale, 'Once handed over, Producer is locked. Changes after that need a new project.'),
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
        // D11: 제안 순간의 발화는 사람 말이어야 한다 — "승인 전에는 아무 실행도 시작하지
        //   않습니다."만 덩그러니 남던 것(2026-08-31 오너 실측)을 교체. 실행 경계 고지는
        //   카드 impact가 이미 말한다.
        reply = accepted
          ? softWarning(
              translate(
                locale,
                "Everything's ready. Approve the card below and I'll bring in the Writer right away.",
              ),
            )
          : translate(
              locale,
              'A proposal is already pending, so the new Producer change proposal was held back.',
            )
      } else {
        // 명시 버튼(consentedHandoff)의 producer→writer 또는 비-producer 전이 — 카드 없이 직접 실행.
        //   D12(2026-08-31 오너): "Writer 호출하기를 늈는데 승인 카드가 또 뜨는 게 이상함".
        if (handoffSpec.from === 'producer') {
          // 느린 saveAndHandoff(수 초) 동안 무반응 공백을 즉시 반응 발화로 메운다(D11).
          const reaction = translate(
            locale,
            'On it, handing your materials to the Writer! Scene and shot design starts now.',
          )
          set((state) => ({
            messages: [
              ...state.messages,
              { id: makeId(), stage, role: 'model' as const, content: reaction },
            ],
          }))
          if (projectId) saveChatMessage(projectId, stage, 'model', reaction)
        }
        const result = await runHandoff(handoffSpec)
        if (!isCurrentSession()) return
        path = result.path
        if (result.ok && result.gated) {
          reply = translate(
            locale,
            "Writer started drafting the scene story. It appears on this Producer screen as it's written. Ask for changes in chat, or confirm it to continue.",
          )
        } else if (result.ok) {
          reply = softWarning(
            handoffSpec.from === 'producer' && !result.existing
              ? translate(
                  locale,
                  'Handed over to {stage}. Starting scene and shot generation. You can follow the progress in the {stage} tab.',
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
            result.error ?? (handoffSpec.from === 'producer' ? useProducerStore.getState().error : null)
          reply = detail
            ? translate(locale, 'Handoff failed: {detail}', { detail })
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
        if (['writer', 'artist'].includes(handoffSpec.to) && projectId) set({ workflowNavigation: { projectId, stage: handoffSpec.to } })
        setTimeout(() => {
          if (isCurrentSession()) set({ pendingNavigatePath: target })
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

    const artistSelection = useArtistStore.getState().chatSelection
    const turnArtistSelection = artistSelection?.projectId === projectId ? { ...artistSelection } : null
    let endpoint: string
    let body: Record<string, unknown>

    switch (stage) {
      case 'producer': {
        endpoint = '/api/produce/chat'
        body = {
          message: trimmed,
          history: historyPayload,
          // 웹페이지(UI) 언어 — 안 잠긴 프로젝트는 이 언어를 물려받는다(#chat-locale-follow v2).
          uiLocale: useLocaleStore.getState().locale,
          attachmentImageUrls: attachmentImageUrls ?? [],
          ...producerChatContext(),
          // 잠긴 Producer(2026-10-01) — 서버가 모델에 "바꾸지 말 것"을 알린다(최종 방어는 producer-store 가드).
          ...(useProjectStore.getState().producerLocked ? { producerLocked: true } : {}),
          // 고정된 그림체(2026-10-09 오너) — 서버가 모델에 다른 스타일을 고르거나 권하지 말라고 알린다(최종 방어는 producer-store 가드).
          ...(styleLockedTurn ? { styleLocked: true } : {}),
          // 넘기기 전 트리트먼트 초안(2026-10-02) — 서버가 모델에 "씬 고치기는 다시 쓰기로 안내할 것"을 알린다.
          ...(!useProjectStore.getState().producerLocked && useProjectStore.getState().treatmentDraft ? { treatmentDraft: true } : {}),
          // #image-to-artist: 카드 채우기 턴 — 서버가 모델에 "그 카드만" 을 알린다(최종 방어는 coerceCardFill).
          ...(opts?.cardFill ? { cardFill: opts.cardFill } : {}),
          ...(answeringProducerQuestion ? { answeringProducerQuestion: true } : {}),
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
        //   외형 타임라인(#g4-chat 2026-08-31): 4뷰 횟수만 알려서는 "늙은/젊은 버전" 요청을 changeAppearance(원천
        //   교체)로 오인해 4뷰 레거시 어휘로만 답하던 오너 실측("천사의 old 버전")을 고친다 — 모습 목록을 노출해야
        //   cc 가 createAppearance(신규 행)와 changeAppearance 를 구분할 근거가 생긴다.
        // 약속 C9(2026-09-04): 뒷모습·측면 4뷰 어휘를 쓰지 않는다 — 모습마다 시트 1장이 있는지만 말한다.
        const charLines = a.characterAssets.flatMap((c) => {
          const header = `- ${c.name} (${c.characterId})`
          if (c.appearances.length <= 1) {
            const only = c.appearances[0]
            const hasImage = only?.sheetUrl ? 'has sheet' : 'no sheet'
            return [header, `  외형 타임라인: 기본 모습만 있음 (${only?.appearanceKey ?? 'default'}, ${hasImage})`]
          }
          const appearanceLines = c.appearances.map((appearance) => {
            const time = appearance.narrativeTime ?? '-'
            const hasImage = appearance.sheetUrl ? 'has sheet' : 'no sheet'
            const dflt = appearance.isDefault ? ', default' : ''
            return `  · ${appearance.appearanceKey} ("${appearance.label}", ${time}${dflt}, ${hasImage})`
          })
          return [header, '  외형 타임라인:', ...appearanceLines]
        })
        const worldLines = a.worldAssets.flatMap((w) => {
          const header = `- ${w.name} (${w.locationId}) — ${w.wideShot ? 'has image' : 'no image'}`
          const variants = w.appearances ?? []
          if (!variants.length) return [header, '  배경 타임라인: 기본 모습만 있음 (default)']
          return [
            header,
            '  배경 타임라인:',
            `  · default ("${translate(contentLocale(), 'Default')}", ${w.wideShot ? 'has image' : 'no image'})`,
            ...variants.map((v) => `  · ${v.appearanceKey} ("${v.label}", ${v.narrativeTime ?? '-'}, ${v.wideShot ? 'has image' : 'no image'})`),
          ]
        })
        const canvasContext = [
          '## Artist 에셋',
          ...(turnArtistSelection ? [`Last explicit UI selection (target hint, not permission; dialog may now be closed): ${JSON.stringify(turnArtistSelection)}`] : []),
          `### 캐릭터 (${a.characterAssets.length})`,
          ...(charLines.length ? charLines : ['- (없음)']),
          `### 장소 (${a.worldAssets.length})`,
          ...(worldLines.length ? worldLines : ['- (없음)']),
        ].join('\n')
        endpoint = '/api/artist/chat'
        body = {
          message: trimmed,
          history: historyPayload,
          // 웹페이지(UI) 언어 — 안 잠긴 프로젝트는 이 언어를 물려받는다(#chat-locale-follow v2).
          uiLocale: useLocaleStore.getState().locale,
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
          // 웹페이지(UI) 언어 — 안 잠긴 프로젝트는 이 언어를 물려받는다(#chat-locale-follow v2).
          uiLocale: useLocaleStore.getState().locale,
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
          // 웹페이지(UI) 언어 — 안 잠긴 프로젝트는 이 언어를 물려받는다(#chat-locale-follow v2).
          uiLocale: useLocaleStore.getState().locale,
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
    if (['producer', 'writer', 'artist'].includes(stage)) {
      body.modelSettings = { ...useChatUiStore.getState().modelSettings }
      body.taskContext = { pending: get().pendingProposal ? [get().pendingProposal] : [], deferred: get().deferredProposals }
    }
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

    // silentUser(#script-preserve): 대본 보존 결정 뒤 이어지는 숨은 요청 — 사용자 말풍선은 붙여 넣은 턴에 이미 있다.
    const silentUser = opts?.silentUser === true
    set((state) => ({
      messages: silentUser ? state.messages : [...state.messages, userMsg],
      loading: true,
      recoveryProgress: null,
      error: null,
      lastTrace: requestTrace,
    }))

    if (projectId && !silentUser) saveChatMessage(projectId, stage, 'user', displayContent)

    // 응답 중단 (#oiioii-chat) — Stop 버튼이 이 컨트롤러를 abort 한다. LLM 호출 경로에만
    //   건다(핸드오프·승인 등 로컬 빠른 경로는 순식간이라 중단 대상이 아니다).
    const controller = new AbortController()
    activeGeneration = controller
    let responseStatus: number | null = null
    const completedTools: ToolOutcome[] = []
    const modelUsages: ChatLlmUsage[] = []
    let pendingReplyId: string | null = null
    try {
      const toolsEnabled = !!projectId && ['producer', 'writer', 'artist'].includes(stage) && !dialogueTarget
      const requestSession = createChatRequestSession({
        signal: controller.signal,
        onStatus: status => { responseStatus = status },
        onUsage: usage => { modelUsages.push(usage) },
        onRecovery: event => { if (isCurrentSession()) set({ recoveryProgress: event.mode }) },
      })
      const request = async (toolMessages: ToolMessage[]) => {
        try {
          return await requestSession(endpoint, { ...body, ...(stage === 'producer' ? producerChatContext() : {}), ...(toolsEnabled ? { chatTools: true, chatWorkflow: true, chatDomain: stage === 'writer' || stage === 'artist', toolMessages } : {}) })
        } catch (error) {
          if (error instanceof ChatResponseError) {
            const partial = error.partialReply ? `${translate(contentLocale(), 'Unfinished reply:')}\n${error.partialReply}` : ''
            throw new ChatResponseError(translate(contentLocale(), error.message), partial)
          }
          throw error
        } finally { if (isCurrentSession()) set({ recoveryProgress: null }) }
      }
      let data: Awaited<ReturnType<Response['json']>>
      let toolLoopStopped: string | undefined
      let toolOutcomes: ToolOutcome[] = []
      let appResources: Record<string, ToolResource> = {}
      let executeApp: ReturnType<typeof createChatToolExecutor> | undefined
      let executeWorkflow: ReturnType<typeof createStudioWorkflow> | undefined
      if (toolsEnabled && projectId) {
        const resources = createStudioToolResources({ stage, projectId, traceId, isCurrent: isCurrentSession, signal: controller.signal,
          markProducerApproval: () => {
            const proposal = get().pendingProposal
            if (proposal?.traceId === traceId && proposal.kind === 'producerSourcePatch') {
              set({ pendingProposal: { ...proposal, payload: { ...proposal.payload, verifyToolSave: true } } })
              persistConversationState(get())
            }
          },
          offerProposal: proposal => {
            if (!get().offerPendingProposal(proposal)) {
              set(state => ({ deferredProposals: [...state.deferredProposals, proposal] }))
              persistConversationState(get())
            }
          },
        })
        const execute = createChatToolExecutor({ resources, isCurrent: isCurrentSession, signal: controller.signal })
        appResources = resources
        executeApp = execute
        const workflow = createStudioWorkflow({ projectId, stage, message: trimmed, signal: controller.signal, isCurrent: isCurrentSession, requiresEdit: requestsSupportedChatEdit(stage, trimmed), outcomes: () => completedTools,
          navigate: async target => {
            if (!isCurrentSession()) throw new DOMException('Chat stopped', 'AbortError')
            set({ workflowNavigation: { projectId, stage: target }, pendingNavigatePath: withDemoShare(`/studio/${target}?projectId=${encodeURIComponent(projectId)}`) })
            return { status: 'navigation_requested', targetStage: target }
          },
          handoff: async () => {
            const proposal = createPendingProposal({ traceId, stage: 'producer', kind: 'producerWriterInitialHandoff', target: STAGE_LABEL.writer, action: translate(contentLocale(), 'Invite Writer'), impact: [translate(contentLocale(), 'Nothing runs until you approve.'), translate(contentLocale(), 'Once handed over, Producer is locked. Changes after that need a new project.')], payload: {} })
            proposal.projectId = projectId
            if (!get().offerPendingProposal(proposal)) return { status: 'blocked', message: 'Another approval is pending. Finish or defer it before starting Writer.' }
            return { status: 'approval_required', proposalId: proposal.id, message: 'Initial Writer generation is waiting for user approval.' }
          },
        })
        executeWorkflow = workflow
        const loop = await runChatToolLoop({ request, execute: call => call.name === 'inspect_project' ? executeProjectInspection(projectId, stage, call.input, controller.signal, turnArtistSelection) : call.name === 'project_workflow' ? workflow(call) : execute(call), isCurrent: isCurrentSession, signal: controller.signal, onResult: outcome => completedTools.push(outcome), requireEdit: requestsSupportedChatEdit(stage, trimmed), requireInspection: requestsImageInspection(stage, trimmed), locale: contentLocale() })
        data = loop.data
        toolLoopStopped = loop.stopped
        toolOutcomes = loop.results
        omitRepeatedToolEdits(data, toolOutcomes)
      } else data = await request([])
      const recordJsonResult = (resource: string, id: string, patch: Record<string, unknown>, result: ToolResult) => {
        const outcome: ToolOutcome = { call: { type: 'tool_use', id: `json:${traceId}:${completedTools.length}`, name: 'edit_project', input: { resource, id, patch } }, result: { ...result, source: 'json' } }
        toolOutcomes.push(outcome); completedTools.push(outcome)
        return result
      }
      const executeJsonEdit = async (resource: string, id: string, patch: Record<string, unknown>): Promise<ToolResult> => {
        if (!executeApp) return recordJsonResult(resource, id, patch, { status: 'unsupported', message: 'The verified editor is unavailable.' })
        const read = await executeApp({ type: 'tool_use', id: `json-read:${makeId()}`, name: 'read_project', input: { resource, id } })
        if (read.status !== 'ok') return recordJsonResult(resource, id, patch, read)
        const row = (read.records as Array<{ revision: string }> | undefined)?.[0]
        const result = await executeApp({ type: 'tool_use', id: `json-edit:${makeId()}`, name: 'edit_project', input: { resource, id, revision: row?.revision, patch } })
        return recordJsonResult(resource, id, patch, result)
      }
      const prepareJsonApproval = async (proposal: PendingProposal, resource: string, id: string, patch: Record<string, unknown>) => {
        try {
          const adapter = appResources[resource]
          if (!adapter) throw new Error('The verified editor is unavailable.')
          const rows = await adapter.read()
          if (!isCurrentSession()) throw new DOMException('Chat stopped', 'AbortError')
          const row = rows.find(row => row.id === id)
          const before = row?.values
          if (!before) throw new Error('The requested target was not found.')
          const validated = adapter.validate(patch)
          proposal.payload = { ...proposal.payload, toolEdit: {
            resource, id, patch: validated, before,
            ...(row?.sourceSnapshot ? { sourceSnapshot: row.sourceSnapshot } : {}),
          } }
          proposal.projectId = projectId ?? undefined
          recordJsonResult(resource, id, patch, { status: 'approval_required', proposalId: proposal.id })
          return proposal
        } catch (error) {
          if (!isCurrentSession() || controller.signal.aborted) throw error
          recordJsonResult(resource, id, patch, { status: 'read_failed', message: String(error) })
          return null
        }
      }
      if (!isCurrentSession()) return
      // 발화 언어 추종 동기화(#chat-locale-follow 2026-08-31) — 서버가 이번 턴에 콘텐츠 언어를
      //   바꿨으면(한글 발화 → ko 채택) 같은 턴의 코드 발화(contentLocale())부터 따라가야
      //   한 대화창에 두 언어가 섞이지 않는다. reply 처리보다 먼저 반영한다.
      const adoptedLocale = parseAppLocale((data as { contentLocale?: unknown }).contentLocale)
      const switchedLocale = parseAppLocale((data as { localeSwitched?: unknown }).localeSwitched)
      if (adoptedLocale) useProjectStore.getState().adoptProjectLocale(adoptedLocale, switchedLocale ? true : undefined)
      // 채팅이 언어를 바꿨으면(#chat-locale-follow v2) 답변 뒤에 "채팅 언어를 …로 바꿨어요" 한 줄을 남긴다.
      const localeNotice = switchedLocale
        ? translate(switchedLocale, 'Chat language switched to {lang}', {
            lang: translate(switchedLocale, switchedLocale === 'ko' ? 'Korean' : 'English'),
          })
        : null
      const replyValue = data.reply ?? data.message ?? ''
      let reply = stripLegacyStageMarkers(
        typeof replyValue === 'string' ? replyValue : String(replyValue),
      )
      // 잠긴 Producer(2026-10-01 오너 "잠금을 풀 수 없게") — 모델이 바꾸자고 한 것은 적용하지 않는다(producer-store 가드).
      //   바꾸는 제안이었으면 아래에서 모델 답 대신 "바꾸지 않았다"를 남기고, 질문 답은 그대로 둔다.
      const producerLockedTurn = stage === 'producer' && useProjectStore.getState().producerLocked
      const lockedChangeAttempt = producerLockedTurn && extractedChangesProducer(useProducerStore.getState(), data.extractedSettings)
      const trace: ChatTrace = {
        ...(data.trace && typeof data.trace === 'object' ? data.trace as ChatTrace : requestTrace),
        ...modelUsages.at(-1),
        requestUsage: summarizeChatUsage(modelUsages),
      }
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

      // #image-to-artist: 카드 채우기 턴은 모델 제안을 그 카드 하나로 좁힌다(줄거리·설정·다른 카드·화풍 제안은 버린다).
      //   아래 대사 언어 경로와 일반 적용 경로가 같은 값을 써야 우회가 없다.
      let extractedForApply: ExtractedSettings | undefined =
        stage === 'producer' && data.extractedSettings && !producerLockedTurn
          ? opts?.cardFill
            ? (coerceCardFill(data.extractedSettings as ExtractedSettings, opts.cardFill) as ExtractedSettings)
            : (data.extractedSettings as ExtractedSettings)
          : undefined
      // 서버가 컨텍스트 보호용으로 되돌려 준 기존 언어는 이번 턴의 변경이 아니다.
      // 사용자가 직접 다시 지정한 경우에는 이전 저장 실패를 복구할 수 있도록 저장한다.
      if (extractedForApply?.dialogueLanguage === useProducerStore.getState().projectSettings.dialogueLanguage &&
        !selectedProducerDialogueLanguage(trimmed, historyPayload)) {
        const copy = { ...extractedForApply }
        delete copy.dialogueLanguage
        extractedForApply = Object.keys(copy).length ? copy : undefined
      }
      // 언어 변경의 답변은 모델의 예정 발화가 아니라 실제 적용·저장 결과로 만든다.
      let producerExtractOutcome: ReturnType<ReturnType<typeof useProducerStore.getState>['applyExtractedSettings']> | undefined
      let producerLanguageSaved: boolean | undefined
      if (stage === 'producer' && extractedForApply && typeof extractedForApply.dialogueLanguage === 'string') {
        const language = extractedForApply.dialogueLanguage as string
        producerExtractOutcome = useProducerStore.getState().applyExtractedSettings(extractedForApply, trace?.traceId ?? null)
        if (producerExtractOutcome === 'applied') {
          producerLanguageSaved = await useProducerStore.getState().saveDraftNow()
          if (!isCurrentSession()) return
        }
        const names: Record<string, string> = { ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Chinese' }
        const label = translate(contentLocale(), names[language] ?? language)
        reply = producerExtractOutcome === 'pending'
          ? translate(contentLocale(), 'Approve the change below to save the dialogue language as {language}.', { language: label })
          : producerExtractOutcome === 'rejected'
            ? translate(contentLocale(), 'Another change is awaiting approval. The dialogue language has not been changed.')
            : producerLanguageSaved
              ? [reply, translate(contentLocale(), 'Dialogue language saved as {language}.', { language: label })].filter(Boolean).join('\n\n')
              : translate(contentLocale(), 'Could not save the dialogue language as {language}. Please ask me to save it again.', { language: label })
      }

      // Legacy Producer edits share the same final result ledger as native tool edits.
      const recordLegacy = (patch: Record<string, unknown>, status: string, message?: string) => {
        const outcome: ToolOutcome = {
          call: { type: 'tool_use', id: `json:${traceId}:${toolOutcomes.length}`, name: 'edit_project', input: { resource: 'settings', id: 'settings', patch } },
          result: { status, source: 'json', ...(message ? { message } : {}) },
        }
        toolOutcomes.push(outcome)
        completedTools.push(outcome)
      }
      let styleAnchorFailure: string | null = null
      if (stage === 'producer' && extractedForApply) {
        const settingsPatch = Object.fromEntries(Object.entries(extractedForApply).filter(([key]) => ['playtime', 'genre', 'subGenre', 'format', 'tone', 'dialogueLanguage'].includes(key)))
        if (Object.keys(settingsPatch).length) {
          producerExtractOutcome ??= useProducerStore.getState().applyExtractedSettings(extractedForApply, traceId)
          if (producerExtractOutcome === 'pending' && get().pendingProposal?.traceId === traceId) {
            const pending = get().pendingProposal!
            set({ pendingProposal: { ...pending, payload: { ...pending.payload, verifyToolSave: true } } })
            persistConversationState(get())
          }
          if (producerExtractOutcome === 'applied' && producerLanguageSaved === undefined) {
            producerLanguageSaved = await useProducerStore.getState().saveDraftNow()
            if (!isCurrentSession()) return
          }
          recordLegacy(settingsPatch, producerExtractOutcome === 'pending' ? 'approval_required' : producerExtractOutcome === 'rejected' ? 'blocked' : producerLanguageSaved ? 'ok' : 'failed',
            producerLanguageSaved === false ? (extractedForApply.dialogueLanguage ? reply : translate(contentLocale(), 'Could not verify the saved changes.')) : undefined)
        }
        const key = extractedForApply.styleAnchorKey
        if (typeof key === 'string' && key && !styleLockedTurn) {
          const outcome = await useProducerStore.getState().applyStyleAnchorKeyFromChat(key)
          if (!isCurrentSession()) return
          const styleError =
            outcome === 'applied'
              ? undefined
              : useProducerStore.getState().error ??
                translate(contentLocale(), 'Could not verify the saved changes.')
          recordLegacy(
            { styleAnchorKey: key },
            outcome === 'applied'
              ? 'ok'
              : outcome === 'unknown_key'
                ? 'invalid_input'
                : 'unverified',
            styleError,
          )
          if (outcome !== 'applied') {
            patchTrace({ skippedCount: 1 })
            styleAnchorFailure = translate(
              contentLocale(),
              "Couldn't find that art style in the catalog. Tell me the feel again or choose one using the palette icon below the chat input.",
            )
          } else {
            patchTrace({ appliedCount: 1 })
          }
        }
      }
      // 잠긴 Producer 에 바꿔 달라고 했을 때의 답(2026-10-01 오너 "잠금을 풀 수 없게 해줘"). 바꾸면서 넘겨 달라는 말(뒤늦게 확정되는
      //   답)도 같은 문장이어야 하므로 확정 전 사본(replyBeforeReceipt)보다 먼저 정한다.
      const lockedReply = producerLockedTurn && (lockedChangeAttempt || toolOutcomes.some((o) => o.call.name === 'edit_project' && o.result.reason === 'producer_locked'))
        ? translate(
            contentLocale(),
            "Producer was confirmed when it went to Writer, so I didn't change it. To change it, start a new project. You can still edit scenes and dialogue in Writer, and character and background pictures in Artist.",
          )
        : null
      if (lockedReply) reply = lockedReply
      // 고정된 그림체에 스타일을 바꾸자는 결과가 왔다 — 바꾸지 않았으니 모델 답("바꿨어요") 대신 바꿀 수 없다고 답한다.
      const styleLockedReply = styleLockedTurn && (
        (typeof extractedForApply?.styleAnchorKey === 'string' && !!extractedForApply.styleAnchorKey) ||
        !!(data.extractedSettings as { styleAnchorFromAttachment?: unknown } | undefined)?.styleAnchorFromAttachment
      )
        ? translate(contentLocale(), "The art style comes from the picture you chose, so it can't be changed.")
        : null
      if (styleLockedReply) reply = styleLockedReply
      const replyBeforeReceipt = reply
      const waitForLegacy = !dialogueTarget && toolsEnabled && ((requestedHandoff && requestsSupportedChatEdit(stage, trimmed)) || (stage === 'writer' && data.updates?.length) || (stage === 'artist' && (data.proposals?.length || data.locationProposals?.length)))
      reply = guardChatToolReply(reply, toolOutcomes, contentLocale() === 'ko')
      if (lockedReply) reply = lockedReply
      if (styleLockedReply) reply = styleLockedReply
      // Unfinished prose is display-only and must survive the guard that removes unverified completion claims.
      if (typeof data.partialReply === 'string' && data.partialReply && !reply.includes(data.partialReply)) reply = [reply, data.partialReply].filter(Boolean).join('\n\n')
      const replyId = makeId()
      if (waitForLegacy) pendingReplyId = replyId

      if (dialogueTarget) reply = translate(contentLocale(), 'Checking all dialogue and saving each completed scene before continuing.')
      set((state) => ({
        loading: stage === 'producer' || !!dialogueTarget || !!waitForLegacy,
        lastTrace: trace,
        messages: [
          ...state.messages,
          {
            id: replyId,
            stage,
            role: 'model',
            content: waitForLegacy ? translate(contentLocale(), 'Checking the requested changes and their saved results.') : reply,
          },
          ...(localeNotice ? [{ id: makeId(), stage, role: 'model' as const, content: localeNotice }] : []),
        ],
      }))

      if (projectId && !waitForLegacy) saveChatMessage(projectId, stage, 'model', reply)
      if (projectId && localeNotice) saveChatMessage(projectId, stage, 'model', localeNotice)

      if (lockedChangeAttempt) patchTrace({ skippedCount: 1 })
      if (stage === 'producer' && extractedForApply && !producerLockedTurn) {
        // 영수증은 실제 결과를 기록한다 — 승인 카드로 간 것을 applied로 적으면 거짓 영수증이 된다.
        //   제안에 traceId를 실어 승인/거절이 같은 trace로 이어지게 한다.
        const extractOutcome = producerExtractOutcome ?? useProducerStore
          .getState()
          .applyExtractedSettings(extractedForApply, trace?.traceId ?? null)
        patchTrace(
          extractOutcome === 'pending'
            ? { pendingProposal: true }
            : extractOutcome === 'rejected'
              ? { skippedCount: 1 }
              : producerLanguageSaved === false
                ? { skippedCount: 1, error: useProducerStore.getState().error ?? 'Save failed' }
                : { appliedCount: extractOutcome === 'applied' ? 1 : 0 },
        )

        // #p1-attach: 채팅이 "이 그림체로" 의도를 읽었으면 앵커로 확정한다.
        //   모델은 인덱스만 주고 URL 은 우리가 이번 턴 첨부에서 꺼낸다 — 모델이 뱉은 URL 은
        //   나중에 이미지 생성 프로바이더가 직접 가져가므로 신뢰하면 안 된다.
        const anchorError = opts?.cardFill || styleLockedReply
          ? null
          : await applyStyleAnchorIntent(
              data.extractedSettings.styleAnchorFromAttachment,
              attachmentImageUrls ?? [],
              projectId,
            )
        if (!isCurrentSession()) return
        if (anchorError) {
          patchTrace({ skippedCount: 1 })
          // 모델은 이미 "이 화풍으로 잡았어요"라고 답했다. 저장이 실패했는데 조용하면 거짓말이 된다.
          const failure = translate(
            contentLocale(),
            "Couldn't save the art style: {reason}",
            { reason: anchorError },
          )
          set((state) => ({
            messages: [...state.messages, { id: makeId(), stage, role: 'model', content: failure }],
          }))
          if (projectId) saveChatMessage(projectId, stage, 'model', failure)
        }
      }
      // #p4-choices: 에이전트가 낸 선택지를 버튼 제안으로 — 클릭 = 채팅 입력.
      if (stage === 'producer' && !lockedChangeAttempt && Array.isArray(data.choices) && data.choices.length >= 2) {
        get().offerSuggestion({
          id: `choices:${makeId()}`,
          stage: 'producer',
          dismissible: true,
          // 질문은 직전 reply 가 이미 물었다 — 칩 위 질문 라벨은 비운다(#p4-choices v2).
          content: '',
          action: {
            kind: 'choices',
            options: (data.choices as string[]).slice(0, 4).map((c) => ({ label: c, utterance: c })),
            ...(planningChoiceTurn ? { answeringProducerQuestion: true as const } : {}),
          },
        })
      }
      if (stage === 'artist' && Array.isArray(data.updates)) {
        const updates = data.updates as ArtistUpdate[]
        const artistProposals: PendingProposal[] = []
        const costUpdates = updates.filter((u) =>
          u.type === 'regenerateCharacter' || u.type === 'regenerateWorldAsset'
        )
        const immediateUpdates = updates.filter((u) => u.type === 'createCharacter')

        for (const costUpdate of costUpdates) {
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
                  appearanceKey: costUpdate.appearanceKey,
                  instruction: costUpdate.instruction,
                  model: costUpdate.model,
                  ...(costUpdate.safeMode ? { safeMode: true } : {}),
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
                payload: { locationId: costUpdate.locationId, appearanceKey: costUpdate.appearanceKey, ...(costUpdate.model ? { model: costUpdate.model } : {}), ...(costUpdate.safeMode ? { safeMode: true } : {}) },
              })

          artistProposals.push(proposal)
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
        for (const ap of appearanceProposals as { characterId: string; appearance: string }[]) {
          const apName =
            useArtistStore.getState().characterAssets.find((c) => c.characterId === ap.characterId)
              ?.name || ap.characterId
          const apLocale = contentLocale()
          const prepared = await prepareJsonApproval(
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
                  'After approval the existing images of that character are marked stale. They are not regenerated automatically.',
                ),
                translate(apLocale, 'The appearance does not change until you approve.'),
              ],
              payload: { characterId: ap.characterId, appearance: ap.appearance },
            }),
            'characters', ap.characterId, { appearance: ap.appearance },
          )
          if (prepared) artistProposals.push(prepared)
        }
        // 새 모습 만들기 제안(약속 C3·C4, 2026-09-04) — 승인하면 행 추가 + 이미지 자동 생성(과금). 요청 대상은 하나의 승인 카드에 묶는다.
        const appearanceCreations = Array.isArray(data.appearanceCreations) ? data.appearanceCreations : []
        for (const ac of appearanceCreations as { characterId: string; label: string; appearance: string; narrativeTime?: string }[]) {
          const acName =
            useArtistStore.getState().characterAssets.find((c) => c.characterId === ac.characterId)?.name ||
            ac.characterId
          const acLocale = contentLocale()
          artistProposals.push(
            createPendingProposal({
              traceId,
              stage: 'artist',
              kind: 'artistCreateAppearance',
              target: acName,
              action: translate(acLocale, 'Add the appearance "{label}" and generate its image', { label: ac.label }),
              impact: [
                translate(acLocale, 'A new appearance tab is added to the character. The default appearance stays as it is.'),
                translate(acLocale, 'Its image is generated right away using the default appearance as the face reference (generation cost).'),
              ],
              payload: {
                characterId: ac.characterId,
                label: ac.label,
                appearance: ac.appearance,
                ...(ac.narrativeTime ? { narrativeTime: ac.narrativeTime } : {}),
              },
            }),
          )
        }
        // 배경 모습 만들기 제안(약속 C10) — 캐릭터 모습 만들기와 같은 승인 카드.
        const locationAppearanceCreations = Array.isArray(data.locationAppearanceCreations) ? data.locationAppearanceCreations : []
        for (const lc of locationAppearanceCreations as { locationId: string; label: string; visualDescription: string; narrativeTime?: string }[]) {
          const lcName = useArtistStore.getState().worldAssets.find((w) => w.locationId === lc.locationId)?.name || lc.locationId
          const lcLocale = contentLocale()
          artistProposals.push(
            createPendingProposal({
              traceId,
              stage: 'artist',
              kind: 'artistCreateLocationAppearance',
              target: lcName,
              action: translate(lcLocale, 'Add the appearance "{label}" and generate its image', { label: lc.label }),
              impact: [
                translate(lcLocale, 'A new appearance tab is added to the background. The default background stays as it is.'),
                translate(lcLocale, 'Its image is generated right away using the default background as the reference (generation cost).'),
              ],
              payload: { locationId: lc.locationId, label: lc.label, visualDescription: lc.visualDescription, ...(lc.narrativeTime ? { narrativeTime: lc.narrativeTime } : {}) },
            }),
          )
        }
        // 모습 삭제 제안(기본 동작 매트릭스 A, 2026-09-11) — 되돌릴 수 없어 승인 카드를 거친다. 기본 모습·없는 모습은 카드를 만들지 않는다.
        const appearanceDeletions = Array.isArray(data.appearanceDeletions) ? data.appearanceDeletions : []
        for (const ad of appearanceDeletions as { characterId: string; appearanceKey: string }[]) {
          const character = useArtistStore.getState().characterAssets.find((c) => c.characterId === ad.characterId)
          const appearance = character?.appearances.find((a) => a.appearanceKey === ad.appearanceKey)
          if (!character || !appearance || appearance.isDefault) { patchTrace({ skippedCount: 1 }); continue }
          const adLocale = contentLocale()
          artistProposals.push(
            createPendingProposal({
              traceId,
              stage: 'artist',
              kind: 'artistDeleteAppearance',
              target: character.name,
              action: translate(adLocale, 'Delete the appearance "{label}"', { label: appearance.label }),
              impact: [
                translate(adLocale, 'The appearance tab and its saved description and images are removed. This cannot be undone.'),
                translate(adLocale, 'The default appearance and other appearances stay as they are. Nothing is generated.'),
              ],
              payload: { characterId: ad.characterId, appearanceKey: ad.appearanceKey, label: appearance.label },
            }),
          )
        }
        const locationAppearanceDeletions = Array.isArray(data.locationAppearanceDeletions) ? data.locationAppearanceDeletions : []
        for (const ld of locationAppearanceDeletions as { locationId: string; appearanceKey: string }[]) {
          const world = useArtistStore.getState().worldAssets.find((w) => w.locationId === ld.locationId)
          const appearance = world?.appearances?.find((a) => a.appearanceKey === ld.appearanceKey)
          if (!world || !appearance) { patchTrace({ skippedCount: 1 }); continue }
          const ldLocale = contentLocale()
          artistProposals.push(
            createPendingProposal({
              traceId,
              stage: 'artist',
              kind: 'artistDeleteLocationAppearance',
              target: world.name,
              action: translate(ldLocale, 'Delete the appearance "{label}"', { label: appearance.label }),
              impact: [
                translate(ldLocale, 'The appearance tab and its saved description and images are removed. This cannot be undone.'),
                translate(ldLocale, 'The default background and other appearances stay as they are. Nothing is generated.'),
              ],
              payload: { locationId: ld.locationId, appearanceKey: ld.appearanceKey, label: appearance.label },
            }),
          )
        }
        // 배경 설명(원천) 변경 제안(약속 B6, 2026-09-04) — 외형 제안과 같은 승인 게이트. 같은 턴의 대상을 모두 보존한다.
        const locationProposals = Array.isArray(data.locationProposals) ? data.locationProposals : []
        for (const lp of locationProposals as { locationId: string; visualDescription: string }[]) {
          const lpName =
            useArtistStore.getState().worldAssets.find((w) => w.locationId === lp.locationId)?.name ||
            lp.locationId
          const lpLocale = contentLocale()
          const prepared = await prepareJsonApproval(
            createPendingProposal({
              traceId,
              stage: 'artist',
              kind: 'artistSourceLocationPatch',
              target: lpName,
              action: translate(lpLocale, 'Change the background description (source): {description}', {
                description: `${lp.visualDescription.slice(0, 60)}${lp.visualDescription.length > 60 ? '…' : ''}`,
              }),
              impact: [
                translate(lpLocale, "The background's description (source) changes, and Writer scenes read the new one."),
                translate(
                  lpLocale,
                  'After approval the existing image of that background is marked "description changed". It is not regenerated automatically.',
                ),
                translate(lpLocale, 'The description does not change until you approve.'),
              ],
              payload: { locationId: lp.locationId, visualDescription: lp.visualDescription },
            }),
            'backgrounds', lp.locationId, { visualDescription: lp.visualDescription },
          )
          if (prepared) artistProposals.push(prepared)
        }
        if (artistProposals.length > 0) {
          const proposal = combinePendingProposals(artistProposals)
          proposal.projectId = projectId ?? undefined
          if (!get().offerPendingProposal(proposal)) {
            set(state => ({ deferredProposals: [...state.deferredProposals, proposal] }))
            persistConversationState(get())
            get().notifyIssue('artist', translate(contentLocale(), '{target}: saved for later while another approval is open.', { target: proposal.target }))
          }
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
          // 약속 E3(2026-09-04): 영상 일괄도 승인 카드로만 — 버튼 확인창과 같은 숫자를 보인다.
          const videoBatchUpdates = updates.filter((update) => update.type === 'generateVideos')
          const immediateUpdates = updates.filter(
            (update) => update.type !== 'generateImage' && update.type !== 'generateVideos',
          )
          const result = useDirectorCanvasStore
            .getState()
            .applyUpdates(immediateUpdates, {
              traceId,
              onJob: observeGeneration,
            })
          const resolvedIds = result.resolvedIds ?? {}
          const imageUpdates = updates.filter((update) => update.type === 'generateImage').map(update =>
            update.id && Object.hasOwn(resolvedIds, update.id) ? { ...update, id: resolvedIds[update.id] } : update,
          )
          let imageProposalAccepted = false
          let videoProposalAccepted = false
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
          if (videoBatchUpdates.length > 0) {
            const locale = contentLocale()
            const tr = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars)
            if (imageUpdates.length > 0) {
              set({ error: tr('A proposal is already pending, so the video generation proposal was held back.') })
            } else {
              // 러너·잔액 훅은 지연 로드 — video-batch-client 가 스토어를 import 하므로 정적 import 는 순환이 된다.
              const [{ eligibleVideoBatchShotIds }, { fetchTakeBalance }, { planVideoBatch, videoBatchTakeCosts, describeVideoBatchPlan }] =
                await Promise.all([
                  import('@/lib/director/video-batch-client'),
                  import('@/lib/billing/use-take-balance'),
                  import('@/lib/director/video-batch-plan'),
                ])
              const { buildVideoBatchInputs } = await import('@/lib/director/video-batch-inputs')
              if (!isCurrentSession()) return
              const nodes = useDirectorCanvasStore.getState().nodes
              const eligible = eligibleVideoBatchShotIds(nodes)
              const inputs = buildVideoBatchInputs(projectId ?? '', nodes, eligible)
              const inputSignature = JSON.stringify({ projectId, eligible, inputs })
              if (eligible.length === 0) {
                get().notifyIssue('director', tr('Every shot already has a video or one in progress.'))
              } else if (inputs.skipped.length > 0) {
                const reason = inputs.skipped[0].reason
                const message = reason === 'missing_writer_shot_id'
                  ? 'Video generation is on hold because a shot is not linked to Writer. Please request videos for shots created in Writer.'
                  : reason === 'unresolvable_manual_wiring'
                    ? 'Video generation is on hold because a connected image or previous video is not ready. Check the image connections or wait for the previous video to finish.'
                    : 'Video generation is on hold because a shot could not be found. Check the current shots and try again.'
                get().notifyIssue('director', tr(message))
              } else {
                const takes = await fetchTakeBalance()
                if (!isCurrentSession()) return
                const plan = planVideoBatch(videoBatchTakeCosts(nodes, eligible), takes.balance, takes.mode)
                videoProposalAccepted = get().offerPendingProposal(
                  createPendingProposal({
                    traceId,
                    stage: 'director',
                    kind: 'directorGenerateVideoBatch',
                    target: tr('Videos'),
                    action: tr('Generate videos for {count} shots', { count: plan.total }),
                    impact: [
                      tr('Costs Takes for every generated video.'),
                      ...describeVideoBatchPlan(plan, tr),
                      tr('Nothing runs until you approve.'),
                    ],
                    payload: {
                      projectId,
                      inputSignature,
                      limit: plan.runCount,
                      total: plan.total,
                      requiredTakes: plan.requiredTakes,
                      balance: plan.balance,
                      mode: plan.mode,
                    },
                  }),
                )
                if (!videoProposalAccepted) {
                  set({ error: tr('A proposal is already pending, so the video generation proposal was held back.') })
                }
              }
            }
          }
          patchTrace({
            appliedCount: result.applied,
            skippedCount: result.skipped.length,
            pendingProposal: imageProposalAccepted || videoProposalAccepted,
            ...(imageProposalAccepted || videoProposalAccepted
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
            // 약속 E3(2026-09-04): 일괄은 승인 카드로 되지만 샷 하나는 여전히 안 된다 — 문구도 그대로 말한다.
            const honestNotice = translate(
              contentLocale(),
              'Chat can start videos only for all remaining shots at once. For one shot, use the Video take button on the Shot node.',
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
      if (stage === 'writer' && dialogueTarget && projectId) {
        if (dialogueSnapshot.length === 0) throw new Error(translate(contentLocale(), 'No shots yet'))
        const statusResponse = await fetch(`/api/writer/status/${projectId}`, { signal: controller.signal })
        if (!statusResponse.ok) throw new Error(translate(contentLocale(), 'Could not confirm whether draft generation has finished.'))
        const status = await statusResponse.json()
        if (status.started && !status.pipeline_completed && !status.pipeline_failed) throw new Error(translate(contentLocale(), 'Draft generation is in progress. You can edit once scene confirmation and generation finish'))
        const active = () => isCurrentSession() && !controller.signal.aborted
        const progressId = `dialogue-progress:${traceId}`
        const progressLocale = contentLocale()
        let progressContent = ''
        const showProgress = (content: string) => {
          if (!isCurrentSession()) return
          set(state => ({ messages: state.messages.some(message => message.id === progressId)
            ? state.messages.map(message => message.id === progressId ? { ...message, content } : message)
            : [...state.messages, { id: progressId, stage: 'writer', role: 'model', content }],
          }))
        }
        const completed = await completeKoreanDialogue({
          shots: dialogueSnapshot,
          initialUpdates: Array.isArray(data.updates) ? data.updates : [],
          isActive: active,
          save: (shot, lines) => useWriterStore.getState().saveDialogueTranslation(projectId, shot, lines),
          onProgress: (done, total) => {
            progressContent = translate(progressLocale, 'Dialogue saved: {done}/{total} shots.', { done, total })
            showProgress(active() && done < total
              ? translate(progressLocale, 'Dialogue saved: {done}/{total} shots. Continuing with the remaining scenes.', { done, total })
              : progressContent)
          },
          requestScene: async (shots) => {
            const writer = useWriterStore.getState()
            const manifest = writer.sceneManifest ? { ...writer.sceneManifest, scenes: writer.sceneManifest.scenes.filter(scene => scene.sceneId === shots[0].sceneId) } : null
            const context = serializeWriterScriptContext(manifest, shots, buildScriptLines(manifest, shots))
            const response = await fetch('/api/writer/chat', {
              signal: controller.signal, method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId, uiLocale: useLocaleStore.getState().locale, traceId: createChatTraceId(), history: historyPayload,
                writerContext: context,
                message: `${trimmed}\n\nContinue the authorized Korean dialogue translation now for these unfinished shots only: ${shots.map(shot => shot.shotId).join(', ')}. Return executable updateShot operations with complete dialogueLines arrays, preserving every speaker, line count, emotion and delivery. Do not promise future work or hand off yet. Earlier scenes are already saved; do not edit them again.`,
              }),
            })
            if (!response.ok) {
              const body = await response.json().catch(() => ({}))
              throw new Error(body.error ?? `HTTP ${response.status}`)
            }
            const next = await response.json()
            return Array.isArray(next.updates) ? next.updates : []
          },
        }).finally(() => {
          // 한 요청의 진행은 같은 행에서 갱신하고, 완료·실패·중단 시 마지막 저장 수만 기록한다.
          if (!progressContent) return
          showProgress(progressContent)
          saveChatMessage(projectId, 'writer', 'model', progressContent)
        })
        if (!active()) return
        patchTrace({ appliedCount: completed.completed, skippedCount: completed.remaining.length })
        if (completed.remaining.length > 0) {
          const sceneNames = [...new Set(dialogueSnapshot.filter(shot => completed.remaining.includes(shot.shotId)).map(shot => {
            const scene = useWriterStore.getState().sceneManifest?.scenes.find(scene => scene.sceneId === shot.sceneId)
            return scene ? translate(contentLocale(), 'Scene {number}', { number: (useWriterStore.getState().sceneManifest?.scenes.findIndex(item => item.sceneId === scene.sceneId) ?? 0) + 1 }) : shot.sceneId
          }))]
          get().notifyIssue('writer', translate(contentLocale(), 'Could not finish all dialogue. Remaining: {scenes}. {reason} No handoff was made.', {
            scenes: sceneNames.join(', '), reason: completed.errors.join('; ') || translate(contentLocale(), 'No complete dialogue changes were returned for the remaining scenes.'),
          }))
          set({ loading: false })
          return
        }
        if (dialogueTarget === 'director') {
          get().notifyIssue('writer', translate(contentLocale(), 'All dialogue changes are saved.'))
          await get().requestDirectorHandoff('move')
          return
        }
        get().notifyIssue('writer', translate(contentLocale(), 'All dialogue changes are saved. Handing over to {stage}.', { stage: STAGE_LABEL[dialogueTarget] }))
        const path = await handoffToStage(dialogueTarget)
        if (!isCurrentSession()) return
        get().notifyIssue('writer', handoffMarker('writer', dialogueTarget))
        set({ loading: false, ...(path ? { pendingNavigatePath: path } : {}) })
        return
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
          .applyChatUpdates(rawUpdates.filter((u) => u.type !== 'clarify'), executeApp ? { executeEdit: executeJsonEdit } : undefined)
        for (const skipped of result.skipped) {
          const updates = rawUpdates.filter(u => (u.type === 'updateScene' || u.type === 'updateShot') && (skipped.type === 'all' || (u.type === skipped.type && (!skipped.id || u.id === skipped.id))))
          for (const update of updates) {
            if (update.type !== 'updateScene' && update.type !== 'updateShot') continue
            const resource = update.type === 'updateScene' ? 'scenes' : 'shots'
            if (!toolOutcomes.some(o => o.result.source === 'json' && (o.call.input as Record<string, unknown>).id === update.id)) recordJsonResult(resource, update.id, update.patch, { status: 'blocked', message: skipped.reason })
          }
        }
        patchTrace({
          appliedCount: result.applied,
          skippedCount: result.skipped.length,
          pendingProposal: result.pendingDialogueShrinks.length > 0,
        })
        // #p4-understand B: 침묵 no-op 제거 — 적용/건너뜀을 즉시 표면화.
        const locale = contentLocale()
        if (result.skipped.length > 0) {
          toast.warning(
            translate(locale, "Couldn't apply {count} changes: {reason}", {
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
            (result.pendingDialogueShrinks.length > 0 || toolOutcomes.some(o => o.result.status === 'approval_required')) && !!get().pendingProposal,
        })
      }
      if (requestedHandoff && ['writer', 'artist'].includes(requestedHandoff.to) && requestsSupportedChatEdit(stage, trimmed) && executeWorkflow && !toolOutcomes.some(o => o.call.name === 'project_workflow' && o.result.status === 'navigation_requested')) {
        const call: ToolCall = { type: 'tool_use', id: `continuation:${traceId}`, name: 'project_workflow', input: { action: 'handoff', targetStage: requestedHandoff.to } }
        const result = await executeWorkflow(call)
        toolOutcomes.push({ call, result }); completedTools.push({ call, result })
        const edits = latestEdits(toolOutcomes)
        if (result.status === 'blocked' && edits.some(o => o.result.status === 'approval_required') && edits.every(o => ['ok', 'approval_required'].includes(o.result.status))) {
          const attach = (proposal: PendingProposal) => proposal.traceId === traceId ? { ...proposal, payload: { ...proposal.payload, workflowContinuation: { projectId, targetStage: requestedHandoff.to, message: trimmed, traceId } } } : proposal
          set(state => ({ pendingProposal: state.pendingProposal ? attach(state.pendingProposal) : null, deferredProposals: state.deferredProposals.map(attach) }))
          persistConversationState(get())
        }
      }
      if (waitForLegacy) {
        if (!isCurrentSession()) return
        const finalReply = lockedReply ?? guardChatToolReply(replyBeforeReceipt, toolOutcomes, contentLocale() === 'ko')
        set(state => ({ loading: false, messages: state.messages.map(message => message.id === replyId ? { ...message, content: finalReply } : message) }))
        if (projectId) saveChatMessage(projectId, stage, 'model', finalReply)
        pendingReplyId = null
      }
      if (styleAnchorFailure) {
        const failure = styleAnchorFailure
        set((state) => ({
          messages: [...state.messages, { id: makeId(), stage, role: 'model', content: failure }],
        }))
        if (projectId) saveChatMessage(projectId, stage, 'model', failure)
      }
      const replyAsksForInput = /[?？]|(?:알려|말해|들려|골라|선택해)\s*(?:주세요|줘)|\b(?:tell me|let me know|please (?:choose|pick|share))\b/i.test(replyBeforeReceipt) // i18n-ok: 이미 나온 입력 요청을 판별하며 화면에 표시하지 않는 정규식.
      if (answeringProducerQuestion && !replyAsksForInput && !producerLockedTurn && isCurrentSession() && !toolLoopStopped &&
        !get().pendingProposal && !get().suggestion && !get().error && !styleAnchorFailure && !data.partialReply &&
        producerExtractOutcome !== 'pending' && producerExtractOutcome !== 'rejected' &&
        toolOutcomes.every(({ result }) => result.status === 'ok')) {
        // 언어·캐스트 질문에 답한 뒤 모델이 저장 확인만 남겨도 실제 빈칸으로 이어갈 수 있다.
        // 스타일은 기존 팔레트 안내가 맡으며, 버튼을 누르기 전에는 추가 호출이나 변경이 없다.
        const missing = currentProducerGate().hardMissing.find((item) => item.field !== 'styleAnchor')
        if (missing) {
          const item = missing.detail ? `${missing.label} (${missing.detail})` : missing.label
          get().offerSuggestion({
            id: `producer-planning:${traceId}:${missing.field}`,
            stage: 'producer',
            content: translate(contentLocale(), 'Still needed before Writer: {item}', { item }),
            action: {
              kind: 'message',
              label: translate(contentLocale(), 'Fill this in together'),
              utterance: translate(contentLocale(), 'Help me fill in this required item: {item}', { item }),
              answeringProducerQuestion: true,
            },
          })
        }
      }
    } catch (err) {
      if (!isCurrentSession()) return
      // 사용자가 Stop 을 눌렀다 — 에러가 아니라 의도. 조용히 대기 상태만 푼다.
      if (err instanceof DOMException && err.name === 'AbortError') {
        const receipt = chatToolReceipt(completedTools, contentLocale() === 'ko')
        if (receipt) {
          const content = [contentLocale() === 'ko' ? '중단했습니다. 중단 전에 확인된 결과입니다.' : 'Stopped. These results were confirmed before stopping.', receipt].join('\n\n')
          set(state => ({ messages: [...state.messages, { id: makeId(), stage, role: 'model', content }] }))
          if (projectId) saveChatMessage(projectId, stage, 'model', content)
        }
        set((state) =>
          state.lastTrace?.traceId === traceId
            ? {
                loading: false,
                lastTrace: {
                  ...state.lastTrace,
                  ...modelUsages.at(-1),
                  requestUsage: summarizeChatUsage(modelUsages),
                  stopReason: 'aborted',
                  error: null,
                },
              }
            : { loading: false },
        )
        if (pendingReplyId) {
          const content = [translate(contentLocale(), 'Processing stopped before completion. Check the remaining targets and reasons below.'), receipt].filter(Boolean).join('\n\n')
          set(state => ({ messages: state.messages.map(message => message.id === pendingReplyId ? { ...message, content } : message) }))
        }
        if (projectId && get().lastTrace) saveChatTrace(projectId, get().lastTrace!)
        return
      }
      const error = err instanceof Error ? err.message : 'Chat failed'
      const receipt = chatToolReceipt(completedTools, contentLocale() === 'ko')
      const partialReply = err instanceof ChatResponseError ? err.partialReply : ''
      if (pendingReplyId || receipt || partialReply) {
        const content = [error, partialReply, receipt].filter(Boolean).join('\n\n')
        set(state => ({ messages: pendingReplyId
          ? state.messages.map(message => message.id === pendingReplyId ? { ...message, content } : message)
          : [...state.messages, { id: makeId(), stage, role: 'model', content }] }))
        if (projectId) saveChatMessage(projectId, stage, 'model', content)
      }
      set({
        loading: false,
        error,
        lastTrace: {
          ...requestTrace,
          ...modelUsages.at(-1),
          requestUsage: summarizeChatUsage(modelUsages),
          requestStatus: responseStatus,
          error,
          stopReason: modelUsages.at(-1)?.stopReason ?? null,
        },
      })
      if (projectId) {
        saveChatTrace(projectId, {
          ...requestTrace,
          ...modelUsages.at(-1),
          requestUsage: summarizeChatUsage(modelUsages),
          requestStatus: responseStatus,
          error,
          stopReason: modelUsages.at(-1)?.stopReason ?? null,
        })
      }
    } finally {
      if (isCurrentSession()) set({ recoveryProgress: null })
      if (stage === 'producer' && isCurrentSession()) set({ loading: false })
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
    const edit = get().sceneStoryEdit
    if (edit && suggestion.id !== `scene-story-edit:${edit.projectId}`) return
    if (get().pendingProposal?.stage === 'producer' && isProducerChoice(suggestion)) return
    const { suggestion: current, dismissedSuggestionIds } = get()
    if (suggestion.content && suggestion.action?.kind !== 'choices' && !get().recordedSuggestionIds.includes(suggestion.id)) {
      const message = { id: makeId(), stage: suggestion.stage, role: 'model' as const, content: suggestion.content }
      set(state => ({ messages: [...state.messages, message], recordedSuggestionIds: [...state.recordedSuggestionIds, suggestion.id] }))
      const projectId = useProjectStore.getState().projectId
      if (projectId) saveChatMessage(projectId, suggestion.stage, 'model', suggestion.content)
      persistConversationState(get())
    }
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
      // 내릴 수 없는 제안은 못 민다. 다만 버튼 없는 안내(웰컴 등 — 문장은 이미 채팅에 남았다)는 사용자가 답해야 하는
      //   질문(닫을 수 없는 선택지)이 밀어낸다 — 빈 새 프로젝트에서 그림을 올렸는데 쓰임새 질문이 안 뜨던 것(2026-10-10 로컬 시험).
      const questionOverNotice = current.action == null && suggestion.dismissible === false && suggestion.action?.kind === 'choices'
      if (current.dismissible === false && !questionOverNotice) return
      if (
        (current.action?.kind === 'choices' || current.restoredChoices) &&
        suggestion.action?.kind !== 'choices'
      ) {
        saveChoiceClearMarker(current.stage)
      }
    }
    set({ suggestion })
    persistConversationState(get())
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
    persistConversationState(get())
  },

  deferSuggestion: () => {
    const suggestion = get().suggestion
    if (!suggestion || suggestion.dismissible === false) return
    set(state => ({ deferredSuggestions: [...state.deferredSuggestions.filter(item => item.id !== suggestion.id), suggestion] }))
    get().dismissSuggestion()
  },

  restoreSuggestion: (id) => {
    if (get().suggestion?.dismissible === false) return false
    const suggestion = get().deferredSuggestions.find(item => item.id === id)
    if (!suggestion) return false
    if (get().pendingProposal?.stage === 'producer' && isProducerChoice(suggestion)) return false
    const current = get().suggestion
    set(state => ({ suggestion, deferredSuggestions: [
      ...state.deferredSuggestions.filter(item => item.id !== id && item.id !== current?.id),
      ...(current?.action ? [current] : []),
    ] }))
    persistConversationState(get())
    return true
  },

  cancelDeferredProposal: (id) => {
    const proposal = get().deferredProposals.find(item => item.id === id)
    if (!proposal) return
    set(state => ({
      deferredProposals: state.deferredProposals.filter(item => item.id !== id),
      cancelledProposalIds: [...state.cancelledProposalIds, id],
    }))
    persistConversationState(get())
    get().notifyIssue(proposal.stage, translate(contentLocale(), 'Cancelled the remaining requests. Work already started will keep its result.'))
  },

  deferPendingProposal: (id) => {
    const proposal = get().pendingProposal
    if (!proposal || (id && proposal.id !== id)) return
    set(state => ({ pendingProposal: null, deferredProposals: [...state.deferredProposals.filter(item => item.id !== proposal.id), proposal] }))
    persistConversationState(get())
  },

  restorePendingProposal: (id) => {
    if (get().executingProposalIds.includes(id)) return false
    if (get().pendingProposal) return false
    const proposal = get().deferredProposals.find(item => item.id === id)
    if (!proposal || (proposal.projectId && proposal.projectId !== useProjectStore.getState().projectId)) return false
    if (proposal.stage === 'producer' && isProducerChoice(get().suggestion)) get().dismissSuggestion()
    set(state => ({ pendingProposal: proposal, deferredProposals: state.deferredProposals.filter(item => item.id !== id) }))
    persistConversationState(get())
    return true
  },

  offerPendingProposal: (proposal) => {
    const current = get().pendingProposal
    if (current && current.id !== proposal.id) return false
    if (proposal.stage === 'producer' && isProducerChoice(get().suggestion)) get().dismissSuggestion()
    set({ pendingProposal: { ...proposal, projectId: proposal.projectId ?? useProjectStore.getState().projectId ?? undefined } })
    persistConversationState(get())
    return true
  },

  offerScriptPreserve: (text, opts) => {
    // 잠긴 Producer 는 이야기를 바꾸지 않는다 — 보존 여부도 묻지 않고 종전 경로(채팅 답)로 보낸다.
    if (useProjectStore.getState().producerLocked) return false
    const det = detectScript(text)
    if (det.kind === 'none') return false
    const doc = parseScript(text)
    if (!doc) return false
    const voice = contentLocale()
    const kindLabel =
      det.kind === 'screenplay' ? translate(voice, 'screenplay') : det.kind === 'stage_play' ? translate(voice, 'stage play') : translate(voice, 'radio drama') // copy-ok: fragment
    const lines = doc.stats.dialogue_lines
    const proposal = createPendingProposal({
      stage: 'producer',
      kind: 'producerPreserveScript',
      traceId: opts?.traceId,
      // 한국어 조사는 종류 이름의 받침에 맞춘다("희곡으로" / "시나리오로").
      target: fixKoreanParticles(translate(voice, 'This text looks like a {kind}.', { kind: kindLabel }), [kindLabel]),
      action: translate(voice, 'Keep the script as written: scenes, characters and dialogue stay unchanged.'),
      impact: [
        translate(voice, 'Scenes: {n}', { n: String(doc.scenes.length) }),
        translate(voice, 'Locations: {n}', { n: String(new Set(doc.scenes.map((sc) => sc.location.trim().toLowerCase()).filter(Boolean)).size) }),
        translate(voice, 'Characters: {n}', { n: String(doc.characters.length) }),
        translate(voice, 'Dialogue lines: {n}', { n: String(lines) }),
        // 대사 밖 요소(지문·카메라/전환·소리 지시)도 그대로 실린다 — 있는 것만 세어 보인다(0 은 "없다"가 아니라
        //   "표기된 지시가 없다"라 오해를 부른다: 소리는 대개 지문 문장 안에 있다).
        ...(() => {
          const parts: string[] = []
          if (doc.stats.action_blocks > 0) parts.push(translate(voice, 'stage directions {n}', { n: String(doc.stats.action_blocks) })) // copy-ok: fragment
          const cam = doc.stats.camera + doc.stats.transitions
          if (cam > 0) parts.push(translate(voice, 'camera and transition cues {n}', { n: String(cam) })) // copy-ok: fragment
          if (doc.stats.sound > 0) parts.push(translate(voice, 'sound cues {n}', { n: String(doc.stats.sound) })) // copy-ok: fragment
          return parts.length > 0 ? [translate(voice, 'Also kept as written: {items}', { items: parts.join(', ') })] : []
        })(),
        translate(voice, 'Decline to use it as reference only. The Writer will adapt it as before.'),
      ],
      payload: { kind: det.kind, confidence: det.confidence, scenes: doc.scenes.length, characters: doc.characters.length, dialogue_lines: lines },
    })
    // 다른 승인 카드가 떠 있으면 관문을 세우지 않는다(승인 카드는 명시 응답으로만 내려간다) — 호출부가 종전 경로로 보낸다.
    const accepted = get().offerPendingProposal(proposal)
    if (!accepted) return false
    // 압축(각색) 전에 원문을 그대로 스토리로 둔다 — 보존을 고르면 이 글이 Writer 에 그대로 간다.
    useProducerStore.getState().setStoryText(text)
    useProducerStore.getState().setPreserveScript(null)
    const projectId = useProjectStore.getState().projectId
    // 붙여 넣은 턴은 답을 듣기 전에는 모델로 보내지 않는다 — 말풍선만 남기고 턴을 붙들어 둔다.
    const held = opts?.held ?? null
    if (held) {
      const userContent = withAttachmentMarker(held.msg, held.thumbUrls ?? [])
      set((state) => ({ messages: [...state.messages, { id: makeId(), stage: 'producer' as const, role: 'user' as const, content: userContent }] }))
      if (projectId) saveChatMessage(projectId, 'producer', 'user', userContent)
    }
    const content = fixKoreanParticles(
      translate(voice, 'This looks like a {kind}. Should I keep it exactly as written, or use it as reference for a new story?', { kind: kindLabel }),
      [kindLabel],
    )
    set((state) => ({ scriptPreserveHeld: held, messages: [...state.messages, { id: makeId(), stage: 'producer' as const, role: 'model' as const, content }] }))
    if (projectId) saveChatMessage(projectId, 'producer', 'model', content)
    return true
  },

  declineScriptPreserve: () => {
    const proposal = get().pendingProposal
    if (!proposal || proposal.kind !== 'producerPreserveScript') return
    useProducerStore.getState().setPreserveScript(false)
    get().dismissPendingProposal(proposal.id)
    resumeScriptPreserveHeld(get, set, 'reference')
  },

  offerImageRoles: (images, opts) => {
    // 잠긴 Producer 에는 인물·배경 카드를 만들 수 없다 — 묻지 않고 종전 경로(참고 자료)로 보낸다.
    if (useProjectStore.getState().producerLocked) return false
    const ready = images.filter((img) => img && img.thumbUrl)
    if (ready.length === 0) return false
    const typed = opts.typed.trim()
    const msg = opts.msg.trim() || typed
    // 만화 원고라고 분명히 말했으면 묻지 않고 만화 원고로 받는다(2026-10-09 오너 "이 만화를 그대로 영상화하고 싶어").
    if (matchComicIntentInText(typed)) {
      recordImageTurn(set, msg, ready)
      askComicStyle(get, ready)
      return true
    }
    // 말이 분명하면 묻지 않는다 — 모든 그림에 같은 역할. 그림체는 한 장만이라 여러 장이면 묻는다.
    const used = matchImageUseInText(typed)
    const direct = used === 'style' && ready.length > 1 ? null : used
    if (direct === 'style') {
      recordImageTurn(set, msg, ready)
      void finishImageRoles(get, { items: [{ image: ready[0], role: 'style' }], typed, msg })
      return true
    }
    if (direct && direct !== 'comic') {
      // 사용자 말풍선은 그림과 함께 남긴다(참고 자료는 sendMessage 가 자기 말풍선을 만든다).
      if (direct !== 'reference') {
        const projectId = useProjectStore.getState().projectId
        const content = withAttachmentMarker(msg, ready.map((r) => r.thumbUrl))
        set((state) => ({ messages: [...state.messages, { id: makeId(), stage: 'producer' as const, role: 'user' as const, content }] }))
        if (projectId) saveChatMessage(projectId, 'producer', 'user', content)
      }
      void runImageRolePlan(get, { items: ready.map((image) => ({ image, role: direct })), typed, msg })
      return true
    }
    // 여러 장이면 장마다 묻기 전에 한 번에 묻는다 — 만화 원고로 그대로 영상화 · 그림마다 정하기 · 모두 참고 자료(2026-10-09 오너).
    if (ready.length >= 2) {
      recordImageTurn(set, msg, ready)
      set({ imageBatchGate: { images: ready, typed, msg } })
      askImageBatch(get)
      return true
    }
    // 묻는다 — 사용자 말풍선(그림 포함)을 먼저 남기고 첫 그림의 질문을 세운다.
    const projectId = useProjectStore.getState().projectId
    const content = withAttachmentMarker(msg, ready.map((r) => r.thumbUrl))
    set((state) => ({
      imageRoleGate: { items: ready.map((image) => ({ image, role: null })), typed, msg },
      messages: [...state.messages, { id: makeId(), stage: 'producer' as const, role: 'user' as const, content }],
    }))
    if (projectId) saveChatMessage(projectId, 'producer', 'user', content)
    askImageRole(get)
    return true
  },

  applyUploadedStyle: async (image) => {
    if (!useProjectStore.getState().projectId) return
    // 어떤 그림을 그림체로 골랐는지 채팅 기록에 남긴다(내 말풍선 + 그림).
    recordImageTurn(set, translate(contentLocale(), 'Use it as the art style'), [image])
    await finishImageRoles(get, { items: [{ image, role: 'style' }], typed: '', msg: '', consent: STYLE_PICKER_CONSENT })
  },

  runCreationPlan: async (plan) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    const voice = contentLocale()
    const sameProject = () => useProjectStore.getState().projectId === projectId
    set({ creationPlanFor: projectId, boardBusy: { projectId, kind: plan.original === 'comic' ? 'comic' : 'materials' } })
    const endPlan = () => {
      if (get().creationPlanFor === projectId) set({ creationPlanFor: null })
      if (get().boardBusy?.projectId === projectId) set({ boardBusy: null })
    }
    // 내 메모(원작이 있을 때 아이디어 칸 글 · 메모): 원작에 합치지 않고 사용자의 말로 남긴다 — 이어지는 채팅 요청이 이력으로 읽는다.
    if (plan.note) {
      const note = plan.note
      set((state) => ({ messages: [...state.messages, { id: makeId(), stage: 'producer' as const, role: 'user' as const, content: note }] }))
      saveChatMessage(projectId, 'producer', 'user', note)
    }
    // 그림 카드 · 참고 자료는 고른 대로 쓴다(묻지 않는다). 채팅은 한 번에 한 요청이라 차례로 돈다.
    const items = [
      ...plan.cards.map((card) => ({ image: card.image, role: card.role })),
      ...plan.references.map((image) => ({ image, role: 'reference' as const })),
    ]
    const referenceNames = plan.references.map((image) => image.name).join(', ')
    const cardsDone = items.length
      ? runImageRolePlan(get, { items, typed: '', msg: translate(voice, 'Uploaded {names} as reference pictures.', { names: referenceNames }) })
      : Promise.resolve()
    // 그림체 그림(만화와 함께면 만화 흐름이 쓴다) — 채팅을 쓰지 않으므로 함께 돌린다.
    const style = plan.styleImage && plan.original !== 'comic' ? runStyleFromImage(plan.styleImage, 'picture', CREATION_ANALYSIS_CONSENT) : Promise.resolve()
    let storyReady = useProducerStore.getState().storyText.trim().length > 0
    let comicStyle: Promise<void> = Promise.resolve()
    try {
      if (plan.original === 'comic') {
        const comic = await runComicAdaptation(get, plan.comicPages, {
          styleImage: plan.styleImage,
          styleMode: plan.comicStyle ?? 'lock',
          consent: CREATION_ANALYSIS_CONSENT,
          beforeFill: cardsDone,
          then: { startTreatment: plan.startTreatment, locale: plan.locale },
        })
        storyReady = comic.scriptSet
        comicStyle = comic.styleDone
        await cardsDone
      } else {
        await cardsDone
        // 원작 대본: 채팅이 대본을 읽고 설정 · 인물 · 배경 카드를 채운다(장르가 비어 있다) — 대본은 건드리지 않는다.
        if (plan.original === 'script' && sameProject()) {
          await sendWhenIdle(
            get,
            translate(voice, 'Keep my script exactly as written. Do not rewrite or summarize it. Read it and fill in only the cast, background and project setting cards.'),
            undefined,
            { silentUser: true },
          )
        }
      }
      // 카드 · 원작을 채운 뒤에 트리트먼트를 쓴다 — 그림 속 인물 · 원작의 장르가 빠지지 않게. 그림체 분석은 기다리지 않는다.
      if (plan.startTreatment && storyReady && sameProject()) await startCreationTreatment(plan.locale)
    } finally {
      endPlan()
    }
    await Promise.all([style, comicStyle])
  },

  dismissPendingProposal: (id) => {
    const proposal = get().pendingProposal
    if (!proposal || (id && proposal.id !== id)) return
    set({ pendingProposal: null })
    persistConversationState(get())
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
    if (get().executingProposalIds.includes(proposal.id)) return false
    const projectId = useProjectStore.getState().projectId
    const session = chatSession
    const isCurrentSession = () => session === chatSession && projectId === useProjectStore.getState().projectId
    if (proposal.projectId && proposal.projectId !== projectId) return false
    const items = proposal.items ?? [proposal]
    const remaining = [...items]
    const saveRemaining = () => {
      if (get().cancelledProposalIds.includes(proposal.id) || (projectId && loadConversationState(projectId).cancelledProposalIds?.includes(proposal.id))) return
      const queued = remaining.length ? { ...combinePendingProposals(remaining), id: proposal.id, projectId: projectId ?? undefined } : null
      if (queued && proposal.payload.workflowContinuation) queued.payload = { ...queued.payload, workflowContinuation: proposal.payload.workflowContinuation }
      if (!isCurrentSession()) {
        if (!projectId) return
        const saved = loadConversationState(projectId)
        const deferredProposals = [...(saved.deferredProposals ?? []).filter(item => item.id !== proposal.id), ...(queued ? [queued] : [])]
        persistConversationState({ pendingProposal: null, suggestion: null, dismissedSuggestionIds: [], recordedSuggestionIds: [], deferredSuggestions: [], cancelledProposalIds: [], ...saved, deferredProposals }, projectId)
        return
      }
      set(state => ({ deferredProposals: [
        ...state.deferredProposals.filter(item => item.id !== proposal.id),
        ...(queued ? [queued] : []),
      ] }))
      persistConversationState(get())
    }
    const traceId = proposal.traceId ?? null
    const patchTrace = (patch: Partial<ChatTrace>) => {
      if (!traceId || !isCurrentSession()) return
      set((state) =>
        state.lastTrace?.traceId === traceId
          ? { lastTrace: { ...state.lastTrace, ...patch } }
          : state,
      )
      if (projectId) saveChatTracePatch(projectId, traceId, patch)
    }
    const recordGeneration = (activeItem: PendingProposal, receipt: GenerationJobReceipt) => {
      if (receipt.jobId || receipt.status === 'completed' || receipt.status === 'skipped' || (receipt.httpStatus != null && receipt.httpStatus >= 400 && receipt.httpStatus < 500)) activeItem.submissionUncertain = false
      if (receipt.jobId && !activeItem.jobIds?.includes(receipt.jobId)) activeItem.jobIds = [...(activeItem.jobIds ?? []), receipt.jobId]
      saveRemaining()
      if (!isCurrentSession()) return
      const status = receipt.status === 'completed' ? 'Completed' : receipt.status === 'queued' || receipt.status === 'deduped' ? 'In progress' : receipt.jobId ? 'Generation failed' : 'Could not start'
      get().notifyIssue(proposal.stage, translate(contentLocale(), '{target}: {status}{reason}', {
        target: activeItem.target, status: translate(contentLocale(), status), reason: receipt.error ? ` — ${receipt.error}` : '',
      }))
      const generationJobs = get().lastTrace?.generationJobs ?? []
      const nextJobs = receipt.jobId
        ? (() => {
            const existing = generationJobs.find((job) => job.jobId === receipt.jobId)
            const next: ChatGenerationJobTrace = {
              jobId: receipt.jobId,
              kind: existing?.kind ?? activeItem.kind,
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
    set(state => ({ pendingProposal: null, executingProposalIds: [...state.executingProposalIds, proposal.id] }))
    saveRemaining()
    patchTrace({ pendingProposal: false })
    // D11(2026-08-31 오너 실측): 승인 버튼을 눌러도 채팅이 조용하다가 수 초 뒤 화면만 넘어갔다.
    //   승인 반응 발화를 즐시 스레드에 남기는 헬퍼 — 채팅 발화는 콘텐츠 언어(#i18n-content-voice).
    const speak = (content: string) => {
      if (!isCurrentSession()) return
      set((state) => ({
        messages: [
          ...state.messages,
          { id: makeId(), stage: proposal.stage, role: 'model' as const, content },
        ],
      }))
      if (projectId) saveChatMessage(projectId, proposal.stage, 'model', content)
    }
    const execute = async (proposal: PendingProposal, observeGeneration: GenerationJobObserver): Promise<boolean> => {
    try {
      if (
        ['artistSourceAppearancePatch', 'artistSourceLocationPatch'].includes(proposal.kind) &&
        !(proposal.payload.toolEdit as { sourceSnapshot?: ArtistSourceSnapshot } | undefined)?.sourceSnapshot
      ) {
        throw new Error('승인에 필요한 원천 확인 정보가 없습니다. 다시 읽어 변경을 요청해 주세요.')
      }
      if (proposal.payload.toolEdit && projectId) {
        const approved = proposal.payload.toolEdit as { resource: string; id: string; patch: Record<string, unknown>; before: Record<string, unknown>; sourceSnapshot?: ArtistSourceSnapshot }
        const resources = createStudioToolResources({ stage: proposal.stage, projectId, traceId: proposal.traceId ?? createChatTraceId(), isCurrent: isCurrentSession, signal: new AbortController().signal, approved })
        const resource = resources[approved.resource]
        if (!resource) throw new Error('This approved edit is no longer supported')
        const current = (await resource.read()).find(row => row.id === approved.id)
        if (!isCurrentSession()) return false
        if (!current ||
          !sameToolValue(current.values, approved.before) ||
          !sameToolValue(current.sourceSnapshot, approved.sourceSnapshot)) {
          throw new Error('승인 요청 후 대상이 변경되었습니다. 다시 읽어 변경을 요청해 주세요.')
        }
        const patch = resource.validate(approved.patch)
        const result = approved.sourceSnapshot
          ? await resource.write(approved.id, patch, current.values, approved.sourceSnapshot)
          : await resource.write(approved.id, patch, current.values)
        if (!isCurrentSession()) return false
        if (result.status !== 'ok') throw new Error(result.message ?? result.status)
        const saved = (await (resource.readSaved ?? resource.read)()).find(row => row.id === approved.id)
        if (!isCurrentSession()) return false
        if (!saved || !Object.entries(patch).every(([key, value]) => sameToolValue(saved.values[key], value))) throw new Error('요청한 값의 저장을 확인하지 못했습니다.')
        speak(`${proposal.target}: ${contentLocale() === 'ko' ? '저장을 확인했습니다.' : 'Saved and verified.'}`)
        patchTrace({ appliedCount: 1, pendingProposal: false })
        return true
      }
      // 이미 접수된 작업은 새로 발주하지 않는다. 남은 작업 확인은 기존 ID로만 이어간다.
      if (proposal.jobIds?.length) {
        for (const jobId of proposal.jobIds) {
          const resultUrl = await pollGenerationJob(jobId, { onStatus: observeGeneration })
          // 다른 화면이 같은 폴링을 이미 수행 중이면 observer 없이 기존 Promise를 받을 수 있다.
          observeGeneration({ jobId, status: 'completed', resultUrl })
        }
        return true
      }
      if (proposal.submissionUncertain) throw new Error(translate(contentLocale(), 'Request status unknown. Check the existing job before retrying.'))
      if (/^artist(?:Create|Regenerate)/.test(proposal.kind)) {
        proposal.submissionUncertain = true
        saveRemaining()
      }
      // 잠기기 전에 떠 있던 Producer 변경 카드를 잠긴 뒤 승인한 경우(2026-10-01) — 저장 실패가 아니라 잠금을 알린다.
      if ((proposal.kind === 'producerPreserveScript' || proposal.kind === 'producerSourcePatch') && useProjectStore.getState().producerLocked) {
        speak(translate(contentLocale(), "Producer was confirmed when it went to Writer, so I didn't change it. To change it, start a new project. You can still edit scenes and dialogue in Writer, and character and background pictures in Artist."))
        patchTrace({ skippedCount: 1, pendingProposal: false })
        return false
      }
      if (proposal.kind === 'producerPreserveScript') {
        // #script-preserve: 보존 결정 — Writer 시작 요청에 preserveScript 로 실린다(producer-store.saveAndHandoff).
        useProducerStore.getState().setPreserveScript(true)
        speak(translate(contentLocale(), 'Got it. I will keep the script exactly as written. Scenes, characters and dialogue will not be rewritten.'))
        patchTrace({ appliedCount: 1 })
        resumeScriptPreserveHeld(get, set, 'preserve')
      } else if (proposal.kind === 'producerSourcePatch') {
        useProducerStore
          .getState()
          .applyProducerSourcePatch(proposal.payload.patch as ExtractedSettings)
        const language = (proposal.payload.patch as ExtractedSettings).dialogueLanguage
        if (typeof language !== 'string' && proposal.payload.verifyToolSave === true) {
          const saved = await useProducerStore.getState().saveDraftNow()
          if (!isCurrentSession()) return false
          if (!saved) throw new Error(useProducerStore.getState().error ?? 'Save failed')
        }
        if (typeof language === 'string') {
          const saved = await useProducerStore.getState().saveDraftNow()
          if (!isCurrentSession()) return false
          const names: Record<string, string> = { ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Chinese' }
          const label = translate(contentLocale(), names[language] ?? language)
          speak(translate(contentLocale(), saved
            ? 'Dialogue language saved as {language}.'
            : 'Could not save the dialogue language as {language}. Please ask me to save it again.', { language: label }))
          if (!saved) {
            patchTrace({ skippedCount: 1, error: useProducerStore.getState().error ?? 'Save failed' })
            return false
          }
        }
        // 승인 후 실제 반영·저장 결과를 집계한다.
        patchTrace({ appliedCount: 1 })
      } else if (proposal.kind === 'producerWriterInitialHandoff') {
        // 승인 즉시 반응 — saveAndHandoff(수 초)가 끝나기 전 무반응 공백을 없앨다.
        const voice = contentLocale()
        speak(
          translate(
            voice,
            "On it, handing your materials to the Writer! Scene and shot design starts now.",
          ),
        )
        const handoff = await runHandoff({ from: 'producer', to: 'writer', utterance: '', label: '' })
        if (!isCurrentSession()) return false
        const ok = handoff.ok
        if (!ok) {
          // "넘어갈게요" 해놓고 침묵하면 거짓말이 된다 — 실패도 스레드에 남긴다.
          const detail = handoff.error ?? useProducerStore.getState().error
          speak(
            detail
              ? translate(voice, 'Handoff failed: {detail}', { detail })
              : translate(voice, 'Handoff failed. Please try again in a moment.'),
          )
          return false
        }
        const path = handoff.path
        if (handoff.gated) {
          // 씬 스토리 확정 단계는 Producer 메인에서 한다(2026-10-01 오너) — Writer 로 이동하지 않는다.
          speak(translate(voice, "Writer started drafting the scene story. It appears on this Producer screen as it's written. Ask for changes in chat, or confirm it to continue."))
          return true
        }
        // ⇄ 초대 연출(#oiioii-handoff)을 승인 경로에도 — 멈칫 대신 전이 애니메이션이 보인다(D11).
        speak(handoffMarker('producer', 'writer'))
        if (path) {
          const target = path
          if (projectId) set({ workflowNavigation: { projectId, stage: 'writer' } })
          setTimeout(() => { if (isCurrentSession()) set({ pendingNavigatePath: target }) }, HANDOFF_INVITE_NAVIGATE_MS)
        }
      } else if (proposal.kind === 'producerWriterRerunRequest') {
        const voice = contentLocale()
        speak(
          translate(
            voice,
            'On it, re-running the Writer with your current source. This can take a while.',
          ),
        )
        const ok = await useProducerStore.getState().saveAndHandoff({ rerun: true })
        if (!isCurrentSession()) return false
        if (!ok) {
          const detail = useProducerStore.getState().error
          speak(
            detail
              ? translate(voice, 'Handoff failed: {detail}', { detail })
              : translate(voice, 'Handoff failed. Please try again in a moment.'),
          )
          return false
        }
        // 씬 스토리 확정 단계로 다시 시작했으면 Producer 메인에 머문다(2026-10-01) — 확정 뒤에 Writer 로 간다.
        if (useProducerStore.getState().lastHandoffGated) {
          speak(translate(voice, "Writer started drafting the scene story. It appears on this Producer screen as it's written. Ask for changes in chat, or confirm it to continue."))
          return true
        }
        // 승인된 rerun도 최초 핸드오프와 같은 Writer 생성 화면으로 이동한다.
        const path = await handoffToStage('writer')
        speak(handoffMarker('producer', 'writer'))
        if (path) {
          const target = path
          setTimeout(() => { if (isCurrentSession()) set({ pendingNavigatePath: target }) }, HANDOFF_INVITE_NAVIGATE_MS)
        }
      } else if (proposal.kind === 'artistRegenerateCharacterView') {
        const characterId = proposal.payload.characterId
        const view = proposal.payload.view
        if (typeof characterId !== 'string') throw new Error('characterId missing')
        if (!['main', 'back', 'sideLeft', 'sideRight'].includes(String(view))) {
          throw new Error('view missing')
        }
        const character = useArtistStore
          .getState()
          .characterAssets.find((asset) => asset.characterId === characterId)
        if (!character) throw new Error(`Character ${characterId} was not found`)
        const receipt = await useArtistStore
          .getState()
          .generateCharacterView(
            characterId,
            typeof proposal.payload.appearanceKey === 'string' ? proposal.payload.appearanceKey : requireDefaultAppearanceKey(character),
            view as 'main' | 'back' | 'sideLeft' | 'sideRight',
            'chat',
            typeof proposal.payload.instruction === 'string' ? proposal.payload.instruction : undefined,
            undefined,
            isImageModelKey(proposal.payload.model) ? proposal.payload.model : undefined,
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
        const character = useArtistStore
          .getState()
          .characterAssets.find((asset) => asset.characterId === characterId)
        if (!character) throw new Error(`Character ${characterId} was not found`)
        const appearanceKey = typeof proposal.payload.appearanceKey === 'string' ? proposal.payload.appearanceKey : requireDefaultAppearanceKey(character)
        for (const view of views) {
          const receipt = await useArtistStore
            .getState()
            .generateCharacterView(
              characterId,
              appearanceKey,
              view as 'main' | 'back' | 'sideLeft' | 'sideRight',
              'chat',
              typeof proposal.payload.instruction === 'string' ? proposal.payload.instruction : undefined,
              undefined,
              isImageModelKey(proposal.payload.model) ? proposal.payload.model : undefined,
              { traceId: traceId ?? undefined, onJob: observeGeneration },
            )
          if (receipt?.status === 'failed' || receipt?.status === 'timed_out') return false
        }
      } else if (proposal.kind === 'artistRegenerateCharacterAllViews') {
        const characterId = proposal.payload.characterId
        if (typeof characterId !== 'string') throw new Error('characterId missing')
        const character = useArtistStore
          .getState()
          .characterAssets.find((asset) => asset.characterId === characterId)
        if (!character) throw new Error(`Character ${characterId} was not found`)
        if (proposal.payload.safeMode === true) {
          // 안전 모드는 UI retryCharacterViewSafe와 같이 시트 한 장(main)만 safeMode=true로 다시 그린다.
          const receipt = await useArtistStore.getState().generateCharacterView(
            characterId,
            typeof proposal.payload.appearanceKey === 'string' ? proposal.payload.appearanceKey : requireDefaultAppearanceKey(character),
            'main',
            'chat',
            typeof proposal.payload.instruction === 'string' ? proposal.payload.instruction : undefined,
            true,
            isImageModelKey(proposal.payload.model) ? proposal.payload.model : undefined,
            { traceId: traceId ?? undefined, onJob: observeGeneration },
          )
          if (receipt?.status === 'failed' || receipt?.status === 'timed_out') return false
          return true
        }
        const receipt = await useArtistStore
          .getState()
          .generateCharacterAllViews(characterId, typeof proposal.payload.appearanceKey === 'string' ? proposal.payload.appearanceKey : requireDefaultAppearanceKey(character), 'chat', typeof proposal.payload.instruction === 'string' ? proposal.payload.instruction : undefined, isImageModelKey(proposal.payload.model) ? proposal.payload.model : undefined, {
            traceId: traceId ?? undefined,
            onJob: observeGeneration,
          })
        if (receipt?.status === 'failed' || receipt?.status === 'timed_out') return false
      } else if (proposal.kind === 'artistRegenerateWorldAsset') {
        const locationId = proposal.payload.locationId
        if (typeof locationId !== 'string') throw new Error('locationId missing')
        const appearanceKey = proposal.payload.appearanceKey
        const worldModel = isImageModelKey(proposal.payload.model) ? proposal.payload.model : undefined
        const worldSafe = proposal.payload.safeMode === true
        if (typeof appearanceKey === 'string' && appearanceKey !== 'default') {
          const world = useArtistStore.getState().worldAssets.find(asset => asset.locationId === locationId)
          if (!world?.appearances?.some(appearance => appearance.appearanceKey === appearanceKey)) {
            throw new Error(`Appearance ${appearanceKey} was not found for location ${locationId}`)
          }
          await useArtistStore.getState().generateWorldShot(locationId, 'wideShot', undefined, 'chat', worldModel, { appearanceKey, ...(worldSafe ? { safeMode: true } : {}), traceId: traceId ?? undefined, onJob: observeGeneration })
        } else if (worldModel || worldSafe) {
          // 모델 지정·안전 모드는 배경 팝업과 같은 generateWorldShot 경로로 기본 모습을 다시 그린다.
          await useArtistStore.getState().generateWorldShot(locationId, 'wideShot', undefined, 'chat', worldModel, { appearanceKey: 'default', ...(worldSafe ? { safeMode: true } : {}), traceId: traceId ?? undefined, onJob: observeGeneration })
        } else {
          await useArtistStore.getState().generateWorldAsset(locationId, 'chat', {
            traceId: traceId ?? undefined,
            onJob: observeGeneration,
          })
        }
      } else if (proposal.kind === 'artistDeleteAppearance' || proposal.kind === 'artistDeleteLocationAppearance') {
        const appearanceKey = proposal.payload.appearanceKey
        if (typeof appearanceKey !== 'string') throw new Error('appearanceKey missing')
        if (proposal.kind === 'artistDeleteAppearance') {
          const characterId = proposal.payload.characterId
          if (typeof characterId !== 'string') throw new Error('characterId missing')
          const character = useArtistStore.getState().characterAssets.find((c) => c.characterId === characterId)
          const appearance = character?.appearances.find((a) => a.appearanceKey === appearanceKey)
          if (!character || !appearance) throw new Error(translate(contentLocale(), 'The appearance to delete was not found.'))
          if (appearance.isDefault) throw new Error(translate(contentLocale(), 'The default appearance cannot be deleted.'))
          await useArtistStore.getState().deleteAppearance(characterId, appearanceKey)
        } else {
          const locationId = proposal.payload.locationId
          if (typeof locationId !== 'string') throw new Error('locationId missing')
          const world = useArtistStore.getState().worldAssets.find((w) => w.locationId === locationId)
          if (!world?.appearances?.some((a) => a.appearanceKey === appearanceKey)) throw new Error(translate(contentLocale(), 'The appearance to delete was not found.'))
          await useArtistStore.getState().deleteLocationAppearance(locationId, appearanceKey)
        }
        if (!isCurrentSession()) return false
        speak(`${proposal.target}: ${translate(contentLocale(), 'Deleted the appearance "{label}".', { label: String(proposal.payload.label ?? appearanceKey) })}`)
        patchTrace({ appliedCount: 1, pendingProposal: false })
        return true
      } else if (proposal.kind === 'artistCreateAppearance') {
        const { characterId, label, appearance, narrativeTime } = proposal.payload as {
          characterId?: unknown
          label?: unknown
          appearance?: unknown
          narrativeTime?: unknown
        }
        if (typeof characterId !== 'string' || typeof label !== 'string' || typeof appearance !== 'string') {
          throw new Error('appearance creation payload missing')
        }
        const time = narrativeTime === 'past' || narrativeTime === 'present' || narrativeTime === 'future' ? narrativeTime : undefined
        // 승인 뒤: 행 추가 → 이미지 자동 생성(기본 모습 얼굴 참조, 잡 귀속 chat).
        const key = await useArtistStore.getState().createAppearance(characterId, label, appearance, time, {
          generate: true, actor: 'chat', traceId: traceId ?? undefined, onJob: observeGeneration,
          onCreated: (appearanceKey) => {
            proposal.kind = 'artistRegenerateCharacterView'
            proposal.payload = { characterId, appearanceKey, view: 'main' }
            saveRemaining()
          },
        })
        if (!key) { proposal.submissionUncertain = false; throw new Error(translate(contentLocale(), 'Could not start')) }
      } else if (proposal.kind === 'artistCreateLocationAppearance') {
        const { locationId, label, visualDescription, narrativeTime } = proposal.payload as {
          locationId?: unknown
          label?: unknown
          visualDescription?: unknown
          narrativeTime?: unknown
        }
        if (typeof locationId !== 'string' || typeof label !== 'string' || typeof visualDescription !== 'string') {
          throw new Error('location appearance creation payload missing')
        }
        const time = narrativeTime === 'past' || narrativeTime === 'present' || narrativeTime === 'future' ? narrativeTime : undefined
        const key = await useArtistStore.getState().createLocationAppearance(locationId, label, visualDescription, time, {
          generate: true, actor: 'chat', traceId: traceId ?? undefined, onJob: observeGeneration,
          onCreated: (appearanceKey) => {
            proposal.kind = 'artistRegenerateWorldAsset'
            proposal.payload = { locationId, appearanceKey }
            saveRemaining()
          },
        })
        if (!key) { proposal.submissionUncertain = false; throw new Error(translate(contentLocale(), 'Could not start')) }
      } else if (proposal.kind === 'directorGenerateStoryboardImage') {
        if (proposal.payload.projectId && proposal.payload.projectId !== useProjectStore.getState().projectId) {
          throw new Error(translate(contentLocale(), 'This approval belongs to a different project. Please request it again.'))
        }
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
      } else if (proposal.kind === 'directorGenerateVideoBatch') {
        // 약속 E3: 승인 = 버튼과 똑같이 runVideoBatch — 카드에 적힌 "만들 수 있는 수"(limit)만 요청한다.
        const pid = useDirectorCanvasStore.getState().projectId
        if (!pid) throw new Error('director project missing')
        const limit = typeof proposal.payload.limit === 'number' ? proposal.payload.limit : undefined
        if (limit === 0) {
          throw new Error(translate(contentLocale(), 'No videos can be made until you add Takes.'))
        }
        const [{ runVideoBatch, eligibleVideoBatchShotIds }, { buildVideoBatchInputs }] = await Promise.all([
          import('@/lib/director/video-batch-client'),
          import('@/lib/director/video-batch-inputs'),
        ])
        if (typeof proposal.payload.inputSignature === 'string') {
          const nodes = useDirectorCanvasStore.getState().nodes
          const eligible = eligibleVideoBatchShotIds(nodes)
          const currentSignature = JSON.stringify({ projectId: pid, eligible, inputs: buildVideoBatchInputs(pid, nodes, eligible) })
          if (proposal.payload.inputSignature !== currentSignature) {
            throw new Error(translate(contentLocale(), 'Video targets or settings have changed since this approval was shown. Please request a new approval.'))
          }
        }
        const outcome = await runVideoBatch(pid, { onJob: observeGeneration, limit })
        if (outcome.total === 0) {
          throw new Error(translate(contentLocale(), 'Every shot already has a video or one in progress.'))
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
      speak(translate(contentLocale(), '{target}: {status}{reason}', {
        target: proposal.target, status: translate(contentLocale(), proposal.jobIds?.length ? 'Generation failed' : 'Could not start'),
        reason: ` — ${err instanceof Error ? err.message : translate(contentLocale(), 'Unknown error')}`,
      }))
      if (!isCurrentSession()) return false
      set({
        error:
          err instanceof Error
            ? err.message
            : translate(contentLocale(), 'Failed to run the proposal'),
      })
      return false
    }
    }
    let allSucceeded = true
    const executions: Promise<boolean>[] = []
    for (const item of items) {
      if (!isCurrentSession()) { allSucceeded = false; break }
      if (get().cancelledProposalIds.includes(proposal.id)) { allSucceeded = false; break }
      let accepted!: () => void
      const submitted = new Promise<void>(resolve => { accepted = resolve })
      const run = (async () => {
        // 각 작업의 완료 관찰은 해당 인물에 고정한다. 첫 이미지가 큐에 들어가면
        // 완성까지 기다리지 않고 다음 인물도 접수하되, 접수 전 취소·프로젝트 전환은 지킨다.
        let itemReceipt: GenerationJobReceipt | null = null
        const ok = await execute(item, receipt => {
          itemReceipt = receipt
          recordGeneration(item, receipt)
          if (item.stage === 'artist' && receipt.jobId) accepted()
        })
        const receipt = itemReceipt as GenerationJobReceipt | null
        const succeeded = ok && (!receipt || !['failed', 'timed_out', 'skipped'].includes(receipt.status))
        if (succeeded) {
          item.submissionUncertain = false
          const index = remaining.indexOf(item)
          if (index >= 0) remaining.splice(index, 1)
          // 삭제는 실행부가 "삭제했어요"를 직접 말한다. 생성이 아닌데 '진행 중'으로 안내하지 않는다.
          if (!receipt && item.stage === 'artist' && !/^artistDelete/.test(item.kind)) speak(translate(contentLocale(), '{target}: {status}{reason}', {
            target: item.target, status: translate(contentLocale(), /^artistSource/.test(item.kind) ? 'Completed' : 'In progress'), reason: '',
          }))
        }
        saveRemaining()
        return succeeded
      })()
      executions.push(run)
      await Promise.race([run, submitted])
    }
    const results = await Promise.all(executions)
    set(state => ({ executingProposalIds: state.executingProposalIds.filter(id => id !== proposal.id) }))
    const succeeded = isCurrentSession() && allSucceeded && results.every(Boolean)
    const continuation = proposal.payload.workflowContinuation as { projectId?: string; targetStage?: string; message?: string; traceId?: string } | undefined
    if (succeeded && continuation?.projectId === projectId && typeof continuation.message === 'string' && ['writer', 'artist'].includes(continuation.targetStage ?? '') &&
      ![get().pendingProposal, ...get().deferredProposals].some(p => p?.traceId === continuation.traceId)) {
      const workflow = createStudioWorkflow({ projectId: projectId!, stage: proposal.stage, message: continuation.message, signal: new AbortController().signal, isCurrent: isCurrentSession, requiresEdit: false, outcomes: () => [],
        navigate: async target => { set({ workflowNavigation: { projectId: projectId!, stage: target }, pendingNavigatePath: withDemoShare(`/studio/${target}?projectId=${encodeURIComponent(projectId!)}`) });return { status: 'navigation_requested' } },
        handoff: async () => {
          const next = createPendingProposal({ stage: 'producer', kind: 'producerWriterInitialHandoff', target: 'Writer', action: translate(contentLocale(), 'Invite Writer'), impact: [translate(contentLocale(), 'Nothing runs until you approve.'), translate(contentLocale(), 'Once handed over, Producer is locked. Changes after that need a new project.')], payload: {} })
          next.projectId = projectId!
          return get().offerPendingProposal(next) ? { status: 'approval_required' } : { status: 'blocked' }
        },
      })
      const call: ToolCall = { type: 'tool_use', id: `approved-move:${proposal.id}`, name: 'project_workflow', input: { action: 'handoff', targetStage: continuation.targetStage } }
      const result = await workflow(call)
      if (isCurrentSession()) speak(chatToolReceipt([{ call, result }], contentLocale() === 'ko'))
    }
    return succeeded
  },

  // 백그라운드 생성 완료 통지 (Phase 2). 유저가 *다른* stage에 있을 때만 알린다(보고 있으면 불필요).
  //   배지는 매번 bump(가벼운 카운트), 채팅 메시지는 stage당 10초 스로틀(배치 스팸 방지).
  notifyCompletion: (stage, label) => {
    const currentStage = useProjectStore.getState().currentStage
    if (currentStage === stage) return // 이미 해당 stage를 보고 있음 → 알림 불필요

    // 배지는 더 이상 여기서 올리지 않는다(약속 D3) — 사이드바가 서버 완료 기록에서 파생한다(lib/stage-seen).
    // 완료 줄은 한 건에 한 줄(약속 D11·D13): 저장본은 건별로 남기고 화면이 연속된 줄을 스택으로 합친다 —
    //   새로고침해도 같은 규칙으로 합쳐지고, 사이에 다른 대화가 끼면 새 줄이 시작된다(D12).
    const key = completionKey(stage, label)
    const existing = pendingCompletions[key]
    if (existing) clearTimeout(existing.timer)
    delete pendingCompletions[key]
    pendingCompletions[key] = { count: 1, timer: setTimeout(() => flushCompletion(stage, label), 0) }
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
      `⚠ ${translate(locale, "Couldn't start {label} generation: {message}", {
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
    chatSession += 1
    sceneStoryRequests.clear()
    announcedTreatments.clear()
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
      sceneStoryEdit: null,
      sceneStoryRefresh: 0,
      sceneStoryProposalPending: null,
      sceneStoryVariantPreview: null,
      recoveryProgress: null,
      error: null,
      lastTrace: null,
      suggestion: null,
      pendingProposal: null,
      scriptPreserveHeld: null,
      imageRoleGate: null,
      imageBatchGate: null,
      creationPlanFor: null,
      comicRetry: null,
      comicStyleGate: null,
      boardBusy: null,
      deferredProposals: [],
      deferredSuggestions: [],
      recordedSuggestionIds: [],
      executingProposalIds: [],
      cancelledProposalIds: [],
      dismissedSuggestionIds: [],
      stageBadges: {},
      directorHandoff: null,
      handoffConfirm: null,
      pendingNavigatePath: null,
      workflowNavigation: null,
      messagesLoadedProjectId: null,
    })
  },
}))
