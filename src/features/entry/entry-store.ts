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
import { useProjectStore } from '@/stores/project-store'
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
      set({ ...initialData(), projectId, status: 'loading', locale: useLocaleStore.getState().locale })
      try {
        const res = await fetch(`/api/produce/entry?projectId=${encodeURIComponent(projectId)}`)
        if (gen !== generation) return
        if (!res.ok) {
          set({ status: 'error' })
          return
        }
        const body = (await readJson(res)) ?? {}
        if (gen !== generation) return
        const draft = normalizeEntryDraft(body.draft)
        const writer = parseWriter(body.writer)
        set({
          status: 'ready',
          draft,
          title: typeof body.title === 'string' ? body.title : 'Untitled',
          locale: parseAppLocale(body.locale) ?? useLocaleStore.getState().locale,
          stage: typeof body.stage === 'string' ? body.stage : null,
          format: parseProjectFormat(body.format),
          writer,
          writerStart: body.writerStart && typeof body.writerStart === 'object' ? (body.writerStart as EntryWriterStartBody) : null,
          formStep: recIsCurrent(draft) ? 2 : 1,
        })
        // 새로 고침해도 쓰는 중인 산문 초안을 놓치지 않는다. 확정 뒤의 Writer 작업(초안 아님)은 시작 화면이 잠그지 않는다.
        if (draft.startedAt && writer?.started && writer.status === 'running' && writer.draft) {
          set({ writing: { status: 'writing', step: 0 } })
          void pollWriter(gen)
        }
      } catch {
        if (gen === generation) set({ status: 'error' })
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
      set({ chat: { ...get().chat, hint: null, showExamples: false } })
      return 'ok'
    },

    chatReply: async (text) => {
      const said = text.trim()
      if (!said || locked()) return
      const draft = get().draft
      const parsed = parseChatAnswer(said, { keepAllowed: hasOriginalText(draft.idea, draft.file) })
      const keys = (Object.keys(parsed) as PickKey[]).filter((k) => parsed[k])
      if (!keys.length) {
        set({ chat: { ...get().chat, hint: { said, keys: [] } } })
        return
      }
      const patch = parsedPatch(draft, parsed, { asPre: false })
      const order: PickKey[] = ['mood', 'runtime', 'level', 'ratio']
      set({ draft: applyChatPatch(draft, patch), chat: { ...get().chat, hint: { said, keys: order.filter((k) => keys.includes(k)) } } })
      await sendPatch(patch)
    },

    chatAnswer: async (key, value) => {
      if (locked()) return
      const draft = get().draft
      const patch = answerPatch(draft, key, value)
      set({ draft: applyChatPatch(draft, patch), chat: { ...get().chat, hint: null } })
      await sendPatch(patch)
    },

    chatAcceptRecommendation: async (key) => {
      const value = recommendedValue(get().draft, key)
      if (value) await get().chatAnswer(key, value)
    },

    chatReask: async (key) => {
      if (locked()) return
      const draft = get().draft
      const patch = reaskPatch(draft, key)
      set({ draft: applyChatPatch(draft, patch), chat: { ...get().chat, hint: null } })
      await sendPatch(patch)
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
      if (title && project.projectId === projectId) useProjectStore.setState({ projectTitle: title })
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
