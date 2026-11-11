// Producer 시작 화면 저장소(리뉴얼 1차 2026-10-19). 화면에서 고르기 · 채팅으로 만들기 두 탭이 이 저장소 하나를 쓴다.
//   진실은 서버 초안(projects.entry_draft)이다 — 글은 잠시 뒤 한 번 저장하고(다음 · 시작 직전에는 바로), 고른 값 · 채팅 진행은 바로 저장한다.
//   서버로 가는 고침은 한 줄로 세워 보낸다(앞 고침의 저장을 뒤 고침이 덮지 않게).
//   시작: 시작 요청(화면 비율 잠금 · 이야기 · 설정 저장) → Writer 시작 요청(산문 초안) → 초안이 다 될 때까지 진행 단계를 묻는다.
//   약속: tests/producer/entry-store.test.ts
import { create } from 'zustand'
import { translate } from '@/lib/i18n/translate'
import { parseAppLocale, type AppLocale } from '@/lib/locale'
import { emptyEntryDraft, fileHasText, normalizeEntryDraft, recIsCurrent, type EntryDraft } from '@/lib/entry/draft'
import type { EntryWriterStartBody } from '@/lib/entry/start-plan'
import { useLocaleStore } from '@/stores/locale-store'
import { settleProjectRename, useProjectStore } from '@/stores/project-store'
import { isUntitled } from '@/lib/project/title'
import { stageIndex } from '@/lib/stage-gate'
import { parseProjectFormat, type ProjectFormat } from '@/types/project'
import type { StageId } from '@/types'
import {
  EXAMPLES,
  IDEA_MAX_CHARS,
  checkEntryFile,
  examplesPage,
  hasOriginalText,
  isExampleRequest,
  materialProblem,
  parseChatAnswer,
  writerProgress,
  type ChatQuestionKey,
  type FileProblem,
  type PickKey,
} from './options'
import {
  EMPTY_CHAT_UI,
  answerPatch,
  applyChatPatch,
  parsedPatch,
  reaskPatch,
  recommendedValue,
  type ChatPatch,
  type ChatUi,
  type Translator,
} from './chat-flow'
import { parseEntrySeries, type EntrySeries } from './series'
import { onSignedInChange } from '@/lib/signed-in-reset'

const IDEA_SAVE_DEBOUNCE_MS = 600
const READ_STEP_MS = 1400
const WRITER_POLL_MS = 2500

export type NextResult = 'ok' | 'too_short' | 'no_text' | 'error' | 'busy' | 'examples'

export interface WriterInfo {
  started: boolean
  status: string | null
  draft: boolean
}

export type UploadError = { code: FileProblem['code'] | 'unreadable' | 'failed'; name: string }

export interface WritingState {
  status: 'idle' | 'starting' | 'writing' | 'failed' | 'done'
  /** 잠금 화면 단계(0 자료 정리 · 1 이야기 뼈대 · 2 씬 스토리 쓰기 · 3 다 됨). */
  step: number
  error?: 'start_failed' | 'writer_failed'
}

interface EntryData {
  projectId: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  draft: EntryDraft
  title: string
  /** 프로젝트 언어(새 흐름은 사이트 언어로 잠근다) — 장르 이름 · 대사 언어 · 추천 이유의 언어. */
  locale: AppLocale
  stage: string | null
  format: ProjectFormat | null
  /** 시리즈 다음 화면 앞 화 비율 · 언어 · 이어받은 개수(프로토타입 E3s · E4s). 시리즈가 아니면 null. */
  series: EntrySeries | null
  writer: WriterInfo | null
  writerStart: EntryWriterStartBody | null
  /** 화면에서 고르기: ① 이야기 재료 · ② 설정. */
  formStep: 1 | 2
  /** 20자 규칙을 어기고 다음을 눌렀다(글이 길어지면 화면이 알아서 안내를 감춘다). */
  showLengthError: boolean
  chat: ChatUi
  upload: { status: 'idle' | 'uploading' | 'error'; error: UploadError | null; name: string | null }
  /** AI가 글을 읽고 추천을 만드는 중(잠금 화면). */
  reading: { image: boolean; step: number } | null
  readError: boolean
  writing: WritingState
  saveError: boolean
  /** 파일 첨부 창(두 탭이 같은 창을 연다). */
  fileDialogOpen: boolean
}

interface EntryActions {
  load: (projectId: string) => Promise<void>
  /** 미리 받기(스튜디오 워밍) — 지금 화면 상태는 그대로, 시작한 프로젝트면 다시 열 때 바로 보일 완료 화면만 받아 둔다. */
  prefetch: (projectId: string) => Promise<void>
  setIdea: (text: string) => void
  flushIdea: () => Promise<void>
  formNext: () => Promise<NextResult>
  formBack: () => void
  formPick: (key: PickKey, value: string) => Promise<void>
  chatSendFirst: () => Promise<NextResult>
  chatReply: (text: string) => Promise<void>
  chatAnswer: (key: ChatQuestionKey, value: string) => Promise<void>
  chatAcceptRecommendation: (key: ChatQuestionKey) => Promise<void>
  chatReask: (key: PickKey) => Promise<void>
  /** 첫 인사 빠른 답(11/5 시안 P1) — idea: 입력칸에 커서 · script: 대본을 어디에 넣는지 알리고 커서 · file: 파일 고르는 창. */
  chatQuick: (kind: 'idea' | 'script' | 'file') => void
  /** 정리 카드의 [아니요, 더 고칠래요](11/5 시안 P2) — 무엇을 바꿀지 묻고 입력칸에 커서. */
  chatRevise: () => void
  showExamples: () => void
  nextExamples: () => void
  pickExample: (index: number, t?: Translator) => void
  uploadFile: (file: File) => Promise<'ok' | 'no_text' | 'rejected' | 'error'>
  clearUploadError: () => void
  openFileDialog: () => void
  closeFileDialog: () => void
  removeFile: () => Promise<void>
  continueWithoutFile: (tab: 'form' | 'chat') => Promise<NextResult>
  start: () => Promise<boolean>
  retryWriter: () => Promise<boolean>
  dismissWriting: () => void
  reset: () => void
}

export type EntryStoreState = EntryData & EntryActions

function initialData(): EntryData {
  return {
    projectId: null,
    status: 'idle',
    draft: emptyEntryDraft(),
    title: 'Untitled',
    locale: 'en',
    stage: null,
    format: null,
    series: null,
    writer: null,
    writerStart: null,
    formStep: 1,
    showLengthError: false,
    chat: { ...EMPTY_CHAT_UI },
    upload: { status: 'idle', error: null, name: null },
    reading: null,
    readError: false,
    writing: { status: 'idle', step: 0 },
    saveError: false,
    fileDialogOpen: false,
  }
}

/**
 * 시작한 프로젝트인가 — 시작 시각이 있거나, 예전 흐름으로 이미 Writer 이후를 연 프로젝트.
 *   projectReached = 단계 레일의 지금까지 연 최고 단계(공유 보기처럼 시작 화면 초안이 없는 경우).
 */
export function entryStarted(state: Pick<EntryData, 'draft' | 'stage' | 'writer'>, projectReached?: StageId | null): boolean {
  if (state.draft.startedAt) return true
  if (state.stage && state.stage !== 'entry' && state.stage !== 'producer') return true
  if (state.stage === 'producer' && state.writer?.started) return true
  return !!projectReached && stageIndex(projectReached) >= stageIndex('artist')
}

// ── 모듈 상태: 비동기 무효화 · 글 저장 대기 · 저장 줄 ────────────────────────────
let generation = 0
let ideaTimer: ReturnType<typeof setTimeout> | null = null
let pendingIdea: { projectId: string; idea: string } | null = null
let saveQueue: Promise<unknown> = Promise.resolve()
let readTicker: ReturnType<typeof setInterval> | null = null

/**
 * 시작한 프로젝트의 시작 화면에서 받아 둔 것(QA 2026-11-03 "Producer 탭 로딩이 너무 길다") — 탭을 떠나도(reset) 남는다.
 *   시작한 프로젝트의 시작 화면은 읽기만 하는 완료 화면이라, 다시 열면 이것을 바로 보이고 뒤에서 새로 받는다.
 *   시작 전 프로젝트는 넣지 않는다(고치는 화면 — 옛 초안을 먼저 보이면 고치는 동안 새 초안과 겹친다). 프로젝트 하나만 둔다.
 *   약속: tests/producer/entry-revisit.test.ts
 */
type StartedView = Pick<EntryData, 'draft' | 'title' | 'locale' | 'stage' | 'format' | 'series' | 'writer' | 'writerStart'>
let startedView: { projectId: string; view: StartedView } | null = null
/** 로그인한 사람이 바뀔 때마다 오른다 — 그 전에 나간 읽기 · 미리 받기의 답은 받아 두지도 화면에 올리지도 않는다(검토 C 2차). */
let signedInEpoch = 0

/** 받아 둔 시작 화면을 버린다 — 로그인한 사람이 바뀔 때(로그아웃 · 다른 계정 로그인, 검토 C). 도는 읽기 · 폴링도 그 답을 버린다.
 *  약속: tests/login/signed-in-reset.test.ts */
export function forgetStartedView(): void {
  signedInEpoch += 1
  generation += 1
  startedView = null
}
onSignedInChange(forgetStartedView)

/** GET /api/produce/entry 답 → 시작 화면이 보이는 값. */
function viewFrom(body: Record<string, unknown>): StartedView {
  return {
    draft: normalizeEntryDraft(body.draft),
    title: typeof body.title === 'string' ? body.title : 'Untitled',
    locale: parseAppLocale(body.locale) ?? useLocaleStore.getState().locale,
    stage: typeof body.stage === 'string' ? body.stage : null,
    format: parseProjectFormat(body.format),
    series: parseEntrySeries(body.series),
    writer: parseWriter(body.writer),
    writerStart: body.writerStart && typeof body.writerStart === 'object' ? (body.writerStart as EntryWriterStartBody) : null,
  }
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = saveQueue.then(task, task)
  saveQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function uiTranslator(): Translator {
  const locale = useLocaleStore.getState().locale
  return (key, params) => translate(locale, key, params)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = await res.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function parseWriter(raw: unknown): WriterInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const w = raw as Record<string, unknown>
  return { started: w.started === true, status: typeof w.status === 'string' ? w.status : null, draft: w.draft === true }
}

export const useEntryStore = create<EntryStoreState>((set, get) => {
  /** 서버 초안을 받되, 아직 저장하지 않은 글은 지킨다. */
  const adopt = (raw: unknown): EntryDraft => {
    const server = normalizeEntryDraft(raw)
    return pendingIdea ? { ...server, idea: get().draft.idea } : server
  }

  const patchDraft = async (projectId: string, patch: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await fetch('/api/produce/entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, patch }),
      })
      if (get().projectId === projectId) set({ saveError: !res.ok })
      return res.ok
    } catch {
      if (get().projectId === projectId) set({ saveError: true })
      return false
    }
  }

  const sendPatch = (patch: ChatPatch) => {
    const { projectId } = get()
    if (!projectId) return Promise.resolve(false)
    return enqueue(() => patchDraft(projectId, { picks: patch.picks, chat: patch.chat }))
  }

  const locked = () => !!get().draft.startedAt || get().writing.status === 'starting' || get().writing.status === 'writing'

  /** 화면을 떠나거나 다른 프로젝트를 열 때 — 아직 안 보낸 글은 버리지 않고 그 프로젝트에 저장한다. */
  const savePendingIdea = () => {
    if (ideaTimer) clearTimeout(ideaTimer)
    ideaTimer = null
    const pending = pendingIdea
    pendingIdea = null
    if (pending) void enqueue(() => patchDraft(pending.projectId, { idea: pending.idea }))
  }

  const stopReadTicker = () => {
    if (readTicker) clearInterval(readTicker)
    readTicker = null
  }

  /** AI가 글(과 파일)을 읽고 추천을 만든다 — 그동안 잠금 화면에 읽는 단계를 보인다. */
  const readAndRecommend = async (): Promise<NextResult> => {
    const { projectId, draft } = get()
    if (!projectId) return 'error'
    const gen = generation
    set({ reading: { image: draft.file?.kind === 'image' && !fileHasText(draft.file), step: 0 }, readError: false })
    stopReadTicker()
    // 서버가 단계를 알려주지 않는다 — 마지막 단계(추천 설정 만들기)는 답이 올 때까지 머문다.
    readTicker = setInterval(() => {
      const reading = get().reading
      if (reading && reading.step < 2) set({ reading: { ...reading, step: reading.step + 1 } })
    }, READ_STEP_MS)
    try {
      const res = await enqueue(() =>
        fetch('/api/produce/entry/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        }),
      )
      const body = await readJson(res)
      if (gen !== generation) return 'error'
      if (body?.draft) set({ draft: adopt(body.draft) })
      if (body?.error === 'no_text') return 'no_text'
      if (body?.error === 'too_short') {
        set({ showLengthError: true })
        return 'too_short'
      }
      if (!res.ok || !body?.draft) {
        set({ readError: true })
        return 'error'
      }
      return 'ok'
    } catch {
      if (gen === generation) set({ readError: true })
      return 'error'
    } finally {
      stopReadTicker()
      if (gen === generation) set({ reading: null })
    }
  }

  /** 산문 초안 진행을 묻는다 — 다 되면 done(화면이 Writer 로 보낸다), 실패하면 failed(다시 시도). */
  const pollWriter = async (gen: number) => {
    const projectId = get().projectId
    while (gen === generation && projectId && get().projectId === projectId) {
      try {
        const res = await fetch(`/api/writer/status/${encodeURIComponent(projectId)}`)
        if (gen !== generation) return
        if (res.ok) {
          const progress = writerProgress(await res.json())
          if (gen !== generation) return
          if (progress.phase === 'ready') {
            set({ writing: { status: 'done', step: 3 }, writer: { started: true, status: 'awaiting_confirmation', draft: true } })
            return
          }
          if (progress.phase === 'failed') {
            set({ writing: { status: 'failed', step: progress.step, error: 'writer_failed' }, writer: { started: true, status: 'failed', draft: true } })
            return
          }
          set({ writing: { status: 'writing', step: Math.max(progress.step, Math.min(get().writing.step, 2)) } })
        }
      } catch {
        // 한 번 못 읽었을 뿐 — 다음 차례에 다시 묻는다.
      }
      await sleep(WRITER_POLL_MS)
    }
  }

  /** Writer 시작 요청(트리트먼트 초안). restart = 실패한 · 기다리던 초안을 내려놓고 다시 쓴다. */
  const startWriter = async (restart: boolean): Promise<boolean> => {
    const { projectId, writerStart } = get()
    if (!projectId || !writerStart) {
      set({ writing: { status: 'failed', step: 0, error: 'writer_failed' } })
      return false
    }
    const gen = generation
    set({ writing: { status: 'starting', step: 0 } })
    let ready = false
    try {
      const res = await fetch('/api/writer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(restart ? { ...writerStart, restartDraft: true } : writerStart),
      })
      const body = await readJson(res)
      if (gen !== generation) return false
      if (res.status === 409 && body?.code === 'writer_gate_pending') ready = true
      else if (!(res.status === 409 && body?.code === 'writer_run_active') && !res.ok) {
        set({ writing: { status: 'failed', step: 0, error: 'writer_failed' } })
        return false
      }
    } catch {
      if (gen === generation) set({ writing: { status: 'failed', step: 0, error: 'writer_failed' } })
      return false
    }
    // Writer 가 열린다(산문 초안을 쓰는 실행이 생겼다).
    const project = useProjectStore.getState()
    if (project.projectId === projectId) {
      project.unlockThrough('producer')
      project.setTreatmentDraft(true)
    }
    if (ready) {
      set({ writing: { status: 'done', step: 3 }, writer: { started: true, status: 'awaiting_confirmation', draft: true } })
      return true
    }
    set({ writing: { status: 'writing', step: 0 }, writer: { started: true, status: 'running', draft: true } })
    void pollWriter(gen)
    return true
  }

  return {
    ...initialData(),

    load: async (projectId) => {
      generation += 1
      const gen = generation
      savePendingIdea()
      stopReadTicker()
      // 시작한 프로젝트를 다시 열면 받아 둔 완료 화면을 바로 보인다 — 아래 새로 받기가 끝나면 그 값으로 바꾼다.
      const kept = startedView?.projectId === projectId ? startedView.view : null
      set({ ...initialData(), projectId, status: kept ? 'ready' : 'loading', locale: useLocaleStore.getState().locale, ...kept })
      try {
        const res = await fetch(`/api/produce/entry?projectId=${encodeURIComponent(projectId)}`)
        if (gen !== generation) return
        if (!res.ok) {
          // 서버가 잠깐 실패한 것이면 받아 둔 완료 화면을 그대로 둔다. 로그인 · 주인 · 프로젝트가 없다는 답이면 받아 둔 것도 버린다.
          const refused = res.status === 401 || res.status === 403 || res.status === 404
          if (refused && startedView?.projectId === projectId) startedView = null
          if (!kept || refused) set({ status: 'error' })
          return
        }
        const body = (await readJson(res)) ?? {}
        if (gen !== generation) return
        const view = viewFrom(body)
        const { draft, writer } = view
        set({ status: 'ready', ...view, formStep: recIsCurrent(draft) ? 2 : 1 })
        startedView = entryStarted(view) ? { projectId, view } : startedView?.projectId === projectId ? null : startedView
        // 새로 고침해도 쓰는 중인 산문 초안을 놓치지 않는다. 확정 뒤의 Writer 작업(초안 아님)은 시작 화면이 잠그지 않는다.
        if (draft.startedAt && writer?.started && writer.status === 'running' && writer.draft) {
          set({ writing: { status: 'writing', step: 0 } })
          void pollWriter(gen)
        }
      } catch {
        // 연결이 잠깐 끊긴 것이면 받아 둔 완료 화면을 그대로 둔다.
        if (gen === generation && !kept) set({ status: 'error' })
      }
    },

    prefetch: async (projectId) => {
      if (startedView?.projectId === projectId) return
      const epoch = signedInEpoch
      try {
        const res = await fetch(`/api/produce/entry?projectId=${encodeURIComponent(projectId)}`)
        if (!res.ok || epoch !== signedInEpoch) return
        const view = viewFrom((await readJson(res)) ?? {})
        if (epoch !== signedInEpoch) return
        // 시작한(읽기만 하는) 프로젝트만 받아 둔다 — 시작 전 화면은 늘 새로 받은 초안으로 연다.
        if (entryStarted(view)) startedView = { projectId, view }
      } catch {
        // 미리 받기는 실패해도 된다 — 화면을 열 때 다시 받는다.
      }
    },

    setIdea: (text) => {
      const { projectId, draft } = get()
      if (!projectId || locked()) return
      const idea = text.slice(0, IDEA_MAX_CHARS)
      set({ draft: { ...draft, idea } })
      pendingIdea = { projectId, idea }
      if (ideaTimer) clearTimeout(ideaTimer)
      ideaTimer = setTimeout(() => {
        ideaTimer = null
        void get().flushIdea()
      }, IDEA_SAVE_DEBOUNCE_MS)
    },

    flushIdea: async () => {
      if (ideaTimer) clearTimeout(ideaTimer)
      ideaTimer = null
      const pending = pendingIdea
      pendingIdea = null
      if (pending) {
        await enqueue(() => patchDraft(pending.projectId, { idea: pending.idea }))
        return
      }
      await saveQueue
    },

    formNext: async () => {
      if (get().reading || locked()) return 'busy'
      await get().flushIdea()
      const draft = get().draft
      if (draft.file?.noText) return 'no_text'
      if (materialProblem(draft.idea, draft.file)) {
        set({ showLengthError: true })
        return 'too_short'
      }
      set({ showLengthError: false })
      if (recIsCurrent(draft)) {
        set({ formStep: 2 })
        return 'ok'
      }
      const result = await readAndRecommend()
      if (result === 'ok') set({ formStep: 2 })
      return result
    },

    formBack: () => set({ formStep: 1 }),

    formPick: async (key, value) => {
      if (locked()) return
      const draft = get().draft
      const patch = answerPatch(draft, key === 'level' && draft.file ? 'file' : key, value)
      set({ draft: applyChatPatch(draft, patch) })
      await sendPatch(patch)
    },

    chatSendFirst: async () => {
      if (get().reading || locked()) return 'busy'
      await get().flushIdea()
      const draft = get().draft
      if (!draft.file && isExampleRequest(draft.idea)) {
        set({ chat: { ...get().chat, showExamples: true, lengthError: false } })
        get().setIdea('')
        await get().flushIdea()
        return 'examples'
      }
      if (draft.file?.noText) return 'no_text'
      if (materialProblem(draft.idea, draft.file)) {
        set({ chat: { ...get().chat, lengthError: true } })
        return 'too_short'
      }
      set({ chat: { ...get().chat, lengthError: false } })
      if (!recIsCurrent(draft)) {
        const result = await readAndRecommend()
        if (result !== 'ok') return result
        // 처음 보낸 글에 이미 적힌 값은 정하고 그 질문은 건너뛴다(이야기 속 낱말은 읽지 않는다).
        const after = get().draft
        const parsed = parseChatAnswer(after.idea, { keepAllowed: hasOriginalText(after.idea, after.file), strict: true })
        if (Object.keys(parsed).length) {
          const patch = parsedPatch(after, parsed, { asPre: true })
          set({ draft: applyChatPatch(after, patch) })
          await sendPatch(patch)
        }
      }
      set({ chat: { ...get().chat, hint: null, showExamples: false, nudge: null } })
      return 'ok'
    },

    chatReply: async (text) => {
      const said = text.trim()
      if (!said || locked()) return
      const draft = get().draft
      const parsed = parseChatAnswer(said, { keepAllowed: hasOriginalText(draft.idea, draft.file) })
      const keys = (Object.keys(parsed) as PickKey[]).filter((k) => parsed[k])
      if (!keys.length) {
        set({ chat: { ...get().chat, hint: { said, keys: [] }, nudge: null } })
        return
      }
      const patch = parsedPatch(draft, parsed, { asPre: false })
      const order: PickKey[] = ['mood', 'runtime', 'level', 'ratio']
      set({ draft: applyChatPatch(draft, patch), chat: { ...get().chat, hint: { said, keys: order.filter((k) => keys.includes(k)) }, nudge: null } })
      await sendPatch(patch)
    },

    chatAnswer: async (key, value) => {
      if (locked()) return
      const draft = get().draft
      const patch = answerPatch(draft, key, value)
      set({ draft: applyChatPatch(draft, patch), chat: { ...get().chat, hint: null, nudge: null } })
      await sendPatch(patch)
    },

    chatAcceptRecommendation: async (key) => {
      const value = recommendedValue(get().draft, key, get().series)
      if (value) await get().chatAnswer(key, value)
    },

    chatReask: async (key) => {
      if (locked()) return
      const draft = get().draft
      const patch = reaskPatch(draft, key)
      set({ draft: applyChatPatch(draft, patch), chat: { ...get().chat, hint: null, nudge: null } })
      await sendPatch(patch)
    },

    chatQuick: (kind) => {
      if (kind === 'file') {
        get().openFileDialog()
        return
      }
      const chat = get().chat
      set({ chat: { ...chat, nudge: kind === 'script' ? 'script' : (chat.nudge ?? null), focus: (chat.focus ?? 0) + 1 } })
    },

    chatRevise: () => {
      if (locked()) return
      const chat = get().chat
      set({ chat: { ...chat, hint: null, nudge: 'revise', focus: (chat.focus ?? 0) + 1 } })
    },

    showExamples: () => set({ chat: { ...get().chat, showExamples: true, lengthError: false } }),

    nextExamples: () => set({ chat: { ...get().chat, examplePage: examplesPage(get().chat.examplePage + 1).page } }),

    pickExample: (index, t) => {
      const example = EXAMPLES[index]
      if (!example) return
      get().setIdea((t ?? uiTranslator())(example.text))
      set({ chat: { ...get().chat, lengthError: false }, showLengthError: false })
    },

    uploadFile: async (file) => {
      const { projectId } = get()
      if (!projectId || locked()) return 'error'
      const problem = checkEntryFile(file.name, file.size)
      if (problem) {
        set({ upload: { status: 'error', error: { code: problem.code, name: file.name }, name: null } })
        return 'rejected'
      }
      await get().flushIdea()
      set({ upload: { status: 'uploading', error: null, name: file.name } })
      try {
        const form = new FormData()
        form.set('projectId', projectId)
        form.set('file', file)
        const res = await enqueue(() => fetch('/api/produce/entry/file', { method: 'POST', body: form }))
        const body = await readJson(res)
        if (get().projectId !== projectId) return 'error'
        if (!res.ok || !body?.draft) {
          const code = body?.error
          const known = code === 'bad_ext' || code === 'too_large' || code === 'empty' || code === 'unreadable'
          set({ upload: { status: 'error', error: { code: known ? code : 'failed', name: file.name }, name: null } })
          return 'error'
        }
        const draft = adopt(body.draft)
        set({ draft, upload: { status: 'idle', error: null, name: null }, fileDialogOpen: false, showLengthError: false, chat: { ...get().chat, lengthError: false } })
        return draft.file?.noText ? 'no_text' : 'ok'
      } catch {
        set({ upload: { status: 'error', error: { code: 'failed', name: file.name }, name: null } })
        return 'error'
      }
    },

    clearUploadError: () => set({ upload: { status: 'idle', error: null, name: null } }),

    openFileDialog: () => {
      if (!locked()) set({ fileDialogOpen: true, upload: { status: 'idle', error: null, name: null } })
    },

    closeFileDialog: () => {
      if (get().upload.status !== 'uploading') set({ fileDialogOpen: false, upload: { status: 'idle', error: null, name: null } })
    },

    removeFile: async () => {
      const { projectId, draft } = get()
      if (!projectId || locked() || !draft.file) return
      set({ draft: { ...draft, file: null } })
      await enqueue(() => patchDraft(projectId, { file: null }))
    },

    continueWithoutFile: async (tab) => {
      await get().removeFile()
      return tab === 'form' ? get().formNext() : get().chatSendFirst()
    },

    start: async () => {
      const { projectId, writing } = get()
      if (!projectId || writing.status === 'starting' || writing.status === 'writing') return false
      await get().flushIdea()
      // 머리에서 고친 제목이 저장된 뒤에 시작한다 — 시작이 저장 전 제목(제목 없음)을 읽고 AI 제목을 붙이지 않게(10/21 검토).
      await settleProjectRename()
      const gen = generation
      set({ writing: { status: 'starting', step: 0 } })
      let body: Record<string, unknown>
      try {
        const res = await enqueue(() =>
          fetch('/api/produce/entry/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId }),
          }),
        )
        const json = await readJson(res)
        if (gen !== generation) return false
        // 이미 시작한 프로젝트 — 새로 고치기 전에 누른 시작이 뒤에서 끝났다(만화 쪽 그대로는 옮기기로 시작이 30~60초 길다, 2026-11-11).
        //   시작 실패를 되풀이하지 않고 시작한 화면으로 바꾼다 — 거기서 산문 초안을 (다시) 쓴다.
        if (res.status === 409 && json?.error === 'already_started') {
          set({ writing: { status: 'idle', step: 0 } })
          await get().load(projectId)
          return false
        }
        if (!res.ok || !json || json.ok !== true) {
          set({ writing: { status: 'failed', step: 0, error: 'start_failed' } })
          return false
        }
        body = json
      } catch {
        if (gen === generation) set({ writing: { status: 'failed', step: 0, error: 'start_failed' } })
        return false
      }
      const title = typeof body.title === 'string' && body.title ? body.title : null
      set({
        draft: normalizeEntryDraft(body.draft),
        writerStart: (body.writerStart as EntryWriterStartBody) ?? null,
        stage: 'producer',
        ...(title ? { title } : {}),
      })
      const project = useProjectStore.getState()
      // AI 제목은 아직 제목 없음일 때만 머리에 넣는다 — 직접 정한 제목을 덮지 않는다(10/21).
      if (title && project.projectId === projectId && isUntitled(project.projectTitle)) useProjectStore.setState({ projectTitle: title })
      return startWriter(false)
    },

    retryWriter: async () => {
      if (!get().draft.startedAt) return get().start()
      return startWriter(true)
    },

    dismissWriting: () => {
      if (get().writing.status === 'failed') set({ writing: { status: 'idle', step: 0 } })
    },

    reset: () => {
      generation += 1
      savePendingIdea()
      stopReadTicker()
      set(initialData())
    },
  }
})
