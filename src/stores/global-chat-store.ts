import { create } from 'zustand'
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
import { useWriterStore, type WriterChatUpdate } from '@/stores/writer-store'
import {
  buildScriptLines,
  resolveLineRefs,
  serializeWriterScriptContext,
} from '@/lib/script-lines'
import { saveChatMessage } from '@/lib/chat-persistence'
import { isDemoSession } from '@/lib/demo/context'
import { cannedFor } from '@/lib/demo/canned'
import {
  STAGE_LABEL,
  CHAT_HISTORY_WINDOW,
  CHAT_HISTORY_CHAR_BUDGET,
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
    | null
}

interface GlobalChatState {
  messages: GlobalChatMessage[]
  loading: boolean
  error: string | null
  suggestion: ChatSuggestion | null
  dismissedSuggestionIds: string[]
  pendingProposal: PendingProposal | null
  /** 크로스스테이지 완료 알림 배지 카운트 (chat-proactive-copilot Phase 2). 사이드바가 읽는다. */
  stageBadges: Partial<Record<StageId, number>>

  loadMessages: (projectId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  offerSuggestion: (suggestion: ChatSuggestion) => void
  dismissSuggestion: () => void
  offerPendingProposal: (proposal: PendingProposal) => boolean
  dismissPendingProposal: (id?: string) => void
  approvePendingProposal: (id?: string) => Promise<boolean>
  /** 백그라운드 생성 완료 통지 — 다른 stage에 있을 때만 배지 bump + 스로틀된 채팅 메시지. */
  notifyCompletion: (stage: StageId, label: string) => void
  clearStageBadge: (stage: StageId) => void
  clearError: () => void
  reset: () => void
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
  const suffix = deleted.length > 3 ? ` 외 ${deleted.length - 3}개` : ''
  return previewLines.length > 0
    ? `삭제되는 대사: ${previewLines.join(' / ')}${suffix}`
    : `삭제되는 대사: ${Math.max(0, current.length - next.length)}개`
}

// 완료 알림 코얼레싱 — 같은 stage+label 완료를 짧은 윈도우로 모아 한 줄("N개 생성 완료")로 emit.
//   배치 이미지(웹훅 다발) 스팸 방지. 창 안에 이어지면 누적, 조용해지면 1개 메시지로 flush.
const COMPLETION_COALESCE_MS = 2500
type PendingCompletion = { count: number; timer: ReturnType<typeof setTimeout> }
const pendingCompletions: Record<string, PendingCompletion> = {}
const completionKey = (stage: StageId, label: string) => `${stage}::${label}`

function flushCompletion(stage: StageId, label: string): void {
  const key = completionKey(stage, label)
  const entry = pendingCompletions[key]
  if (!entry) return
  delete pendingCompletions[key]
  const projectId = useProjectStore.getState().projectId
  const content =
    entry.count > 1
      ? `✓ ${label} ${entry.count}개 생성이 완료됐어요. ${STAGE_LABEL[stage]} 탭에서 확인하세요.`
      : `✓ ${label} 생성이 완료됐어요. ${STAGE_LABEL[stage]} 탭에서 확인하세요.`
  useGlobalChatStore.setState((state) => ({
    messages: [...state.messages, { id: makeId(), stage, role: 'model', content }],
  }))
  if (projectId) saveChatMessage(projectId, stage, 'model', content)
}

export const useGlobalChatStore = create<GlobalChatState>((set, get) => ({
  messages: [],
  loading: false,
  error: null,
  suggestion: null,
  dismissedSuggestionIds: [],
  pendingProposal: null,
  stageBadges: {},

  loadMessages: async (projectId) => {
    try {
      const res = await fetch(`/api/project/${projectId}/messages`)
      if (!res.ok) {
        set({ messages: [] })
        return
      }
      const { messages } = await res.json()
      const normalized: GlobalChatMessage[] = (messages ?? []).map(
        (m: { stage: string; role: 'user' | 'model'; content: string }) => ({
          id: makeId(),
          stage: m.stage as StageId,
          role: m.role,
          content: m.content,
        }),
      )
      set({ messages: normalized })
    } catch (err) {
      console.error('[global-chat-store] loadMessages failed:', err)
      set({ messages: [] })
    }
  },

  sendMessage: async (content) => {
    const trimmed = content.trim()
    if (!trimmed || get().loading) return

    // 온보딩 인사 등 비-dismissible 제안은 유저가 말을 걸면 자동으로 치운다(넘김 버튼 없이).
    if (get().suggestion?.dismissible === false) get().dismissSuggestion()

    const stage = useProjectStore.getState().currentStage
    const projectId = useProjectStore.getState().projectId
    const history = get().messages

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
      const content = approved
        ? `승인했어요: ${pendingProposal.action}`
        : '제안을 승인하지 못했어요. 잠시 후 다시 시도해 주세요.'
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
      content: m.content,
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
        })
        body = {
          message: trimmed,
          history: historyPayload,
          currentSettings: p.projectSettings,
          storyText: p.storyText,
          currentCast: p.cast,
          currentBackgrounds: p.backgrounds,
          gate: {
            canHandoff: gate.canHandoff,
            hardMissing: gate.hardMissing.map((i) => (i.detail ? `${i.label} (${i.detail})` : i.label)),
            softMissing: gate.softMissing.map((i) => (i.detail ? `${i.label} (${i.detail})` : i.label)),
          },
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

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      const reply: string = data.reply ?? data.message ?? ''

      set((state) => ({
        loading: false,
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
        useProducerStore
          .getState()
          .applyExtractedSettings(data.extractedSettings)
      }
      if (stage === 'artist' && Array.isArray(data.updates)) {
        const updates = data.updates as ArtistUpdate[]
        const costUpdate = updates.find((u) =>
          u.type === 'regenerateCharacter' || u.type === 'regenerateWorldAsset'
        )
        const immediateUpdates = updates.filter((u) => u.type === 'createCharacter')

        if (costUpdate) {
          const proposal = costUpdate.type === 'regenerateCharacter'
            ? createPendingProposal({
                stage: 'artist',
                kind: costUpdate.views?.length === 1
                  ? 'artistRegenerateCharacterView'
                  : costUpdate.views && costUpdate.views.length > 1
                    ? 'artistRegenerateCharacterViews'
                    : 'artistRegenerateCharacterAllViews',
                target: costUpdate.characterId,
                action: costUpdate.views?.length
                  ? `캐릭터 뷰 재생성: ${costUpdate.views.join(', ')}`
                  : '캐릭터 전체 뷰 재생성',
                impact: [
                  '이미지 생성 비용이 발생합니다.',
                  '기존 선택 이미지는 새 생성이 끝날 때까지 유지됩니다.',
                  '승인 전에는 재생성이 시작되지 않습니다.',
                ],
                payload: {
                  characterId: costUpdate.characterId,
                  view: costUpdate.views?.[0],
                  views: costUpdate.views,
                },
              })
            : createPendingProposal({
                stage: 'artist',
                kind: 'artistRegenerateWorldAsset',
                target: costUpdate.locationId,
                action: '월드/배경 이미지 재생성',
                impact: [
                  '이미지 생성 비용이 발생합니다.',
                  'World 이미지는 MVP Director gate의 기본 hard blocker가 아닙니다.',
                  '승인 전에는 재생성이 시작되지 않습니다.',
                ],
                payload: { locationId: costUpdate.locationId },
              })

          const accepted = get().offerPendingProposal(proposal)
          if (!accepted) set({ error: '이미 대기 중인 제안이 있어 새 Artist 생성 제안을 보류했어요.' })
        }

        if (immediateUpdates.length > 0) {
          void useArtistStore.getState().applyUpdates(immediateUpdates)
        }

        // 원천(외형) 변경 제안(C3 F6) — 자동 실행 금지, pending-proposal 승인 게이트 전용.
        const appearanceProposals = Array.isArray(data.proposals) ? data.proposals : []
        if (appearanceProposals.length > 0 && !get().pendingProposal) {
          const ap = appearanceProposals[0] as { characterId: string; appearance: string }
          get().offerPendingProposal(
            createPendingProposal({
              stage: 'artist',
              kind: 'artistSourceAppearancePatch',
              target: ap.characterId,
              action: `캐릭터 기본 외형(원천) 변경: ${ap.appearance.slice(0, 60)}${ap.appearance.length > 60 ? '…' : ''}`,
              impact: [
                '캐릭터의 canonical 외형(원천)이 바뀝니다.',
                '승인 후 그 캐릭터의 기존 이미지들이 낡음(stale)으로 표시돼요 — 자동 재생성은 하지 않아요.',
                '승인 전에는 외형이 바뀌지 않습니다.',
              ],
              payload: { characterId: ap.characterId, appearance: ap.appearance },
            }),
          )
        }
      }
      if (stage === 'director') {
        // Agentic 응답 — DirectorCanvasUpdate[]
        if (Array.isArray(data.updates)) {
          const result = useDirectorCanvasStore
            .getState()
            .applyUpdates(data.updates as DirectorCanvasUpdate[])
          if (result.skipped.length > 0) {
            console.warn(
              '[global-chat-store] director updates skipped:',
              result.skipped,
            )
          }
        }
      }
      if (stage === 'writer' && Array.isArray(data.updates)) {
        // 검증된 씬/샷 CRUD 액션 — writer-store 가 기존 CRUD 로 DB 반영.
        const result = await useWriterStore
          .getState()
          .applyChatUpdates(data.updates as WriterChatUpdate[])
        for (const shrink of result.pendingDialogueShrinks) {
          const proposal = createPendingProposal({
            stage: 'writer',
            kind: 'writerShrinkDialogue',
            target: shrink.shotId,
            action: `대사 ${shrink.currentDialogueLines.length}개 → ${shrink.dialogueLines.length}개로 줄이는 수정`,
            impact: [
              deletedDialoguePreview(shrink.currentDialogueLines, shrink.dialogueLines),
              '승인 전에는 적용되지 않습니다.',
            ],
            payload: {
              shotId: shrink.shotId,
              dialogueLines: shrink.dialogueLines,
            },
          })
          const accepted = get().offerPendingProposal(proposal)
          if (!accepted) {
            set({ error: '이미 대기 중인 제안이 있어 새 Writer 대사 축소 제안을 보류했어요.' })
            break
          }
        }
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Chat failed',
      })
    }
  },

  // 프로액티브 제안 띄우기 — 한 번에 하나만(이미 떠 있으면 무시), 이미 dismiss/승인한 id 도 무시.
  offerSuggestion: (suggestion) => {
    const { suggestion: current, dismissedSuggestionIds } = get()
    if (current) return
    if (dismissedSuggestionIds.includes(suggestion.id)) return
    set({ suggestion })
  },

  // dismiss(또는 승인) — 제안을 내리고 id 를 기록해 같은 세션 재진입 시 재발사 막는다.
  dismissSuggestion: () =>
    set((state) => ({
      suggestion: null,
      dismissedSuggestionIds: state.suggestion
        ? [...state.dismissedSuggestionIds, state.suggestion.id]
        : state.dismissedSuggestionIds,
    })),

  offerPendingProposal: (proposal) => {
    const current = get().pendingProposal
    if (current && current.id !== proposal.id) return false
    set({ pendingProposal: proposal })
    return true
  },

  dismissPendingProposal: (id) =>
    set((state) => {
      if (id && state.pendingProposal?.id !== id) return state
      return { pendingProposal: null }
    }),

  approvePendingProposal: async (id) => {
    const proposal = get().pendingProposal
    if (!proposal) return false
    if (id && proposal.id !== id) return false

    try {
      if (proposal.kind === 'producerSourcePatch') {
        useProducerStore
          .getState()
          .applyProducerSourcePatch(proposal.payload.patch as ExtractedSettings)
      } else if (proposal.kind === 'producerWriterRerunRequest') {
        const ok = await useProducerStore.getState().saveAndHandoff()
        if (!ok) return false
      } else if (proposal.kind === 'artistRegenerateCharacterView') {
        const characterId = proposal.payload.characterId
        const view = proposal.payload.view
        if (typeof characterId !== 'string') throw new Error('characterId missing')
        if (!['main', 'back', 'sideLeft', 'sideRight'].includes(String(view))) {
          throw new Error('view missing')
        }
        await useArtistStore
          .getState()
          .generateCharacterView(characterId, view as 'main' | 'back' | 'sideLeft' | 'sideRight', 'chat')
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
          await useArtistStore
            .getState()
            .generateCharacterView(characterId, view as 'main' | 'back' | 'sideLeft' | 'sideRight', 'chat')
        }
      } else if (proposal.kind === 'artistRegenerateCharacterAllViews') {
        const characterId = proposal.payload.characterId
        if (typeof characterId !== 'string') throw new Error('characterId missing')
        await useArtistStore.getState().generateCharacterAllViews(characterId, 'chat')
      } else if (proposal.kind === 'artistRegenerateWorldAsset') {
        const locationId = proposal.payload.locationId
        if (typeof locationId !== 'string') throw new Error('locationId missing')
        await useArtistStore.getState().generateWorldAsset(locationId, 'chat')
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
      set({ pendingProposal: null })
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '제안 실행 실패' })
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
    set({
      messages: [],
      loading: false,
      error: null,
      suggestion: null,
      pendingProposal: null,
      dismissedSuggestionIds: [],
      stageBadges: {},
    })
  },
}))
