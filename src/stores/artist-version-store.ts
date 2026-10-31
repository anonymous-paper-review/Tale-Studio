// Artist 작품 스타일 기록(버전) 화면 상태(2026-10-28 오너, 프로토타입 A5 · A6 · AV · AY).
//   서버 창구(/api/artist/versions*)가 버전 · 재생성 진행을 정하고, 이 스토어는 그것을 읽어 머리 줄 · 창 · 채팅 카드에 준다.
//   [다시 만들기] 뒤 그림은 이 화면이 칸마다 지금의 [다시 만들기]와 같은 함수(generateCharacterView · generateWorldShot, actor 'ui')로 그린다 —
//   지금 그림을 얼굴 참고로(오너 결정 1). 기본 모습을 먼저, 다른 모습은 그 인물 · 배경의 기본 모습이 끝난 뒤.
//   이어 그리기 규칙은 draw-continue 와 같다: Artist 화면이 열려 있을 때만, 실패한 칸은 다시 보내지 않고(9/11), 내 한도에 막히면 잠시 뒤 다시,
//   모두의 자리에 막히면 멈추고 단추로 남긴다. 다 그리면(완료 표시는 서버가 한 번만) 채팅에 알린다. Storyboard 를 연 뒤(완료)면 더 그리지 않는다.
//   멈춘 재생성은 [남은 그림 다시 그리기](resumeRegen) 또는 [이전 버전으로 돌아가기](goBackToPrevious)로 빠져나간다 — 멈춘 동안의 불러오기는
//   남은 재생성을 그만두고 불러온다(2026-10-28 검토 지적). 약속: tests/artist/style-version-store.test.ts · style-version-way-out.test.ts
import { create } from 'zustand'
import { toast } from 'sonner'
import { useArtistStore } from '@/stores/artist-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { contentLocale } from '@/lib/i18n/content'
import { translate } from '@/lib/i18n/translate'
import { useLocaleStore } from '@/stores/locale-store'
import { fetchArtistGenerationLimit, runAdaptivePool } from '@/lib/artist/generation-slots'
import { STYLE_WAIT_RECHECK_MS, USER_LIMIT_RECHECK_MS, USER_LIMIT_WAIT_MAX_MS } from '@/lib/artist/draw-continue'
import {
  ARTIST_VERSION_CODES,
  earlierVersions,
  nextRegenTargets,
  regenDoneMessage,
  regenSlotKey,
  versionLoadedMessage,
  versionStyleLabel,
  type RegenProgress,
  type RegenSlot,
  type VersionCustomStyle,
  type VersionView,
} from '@/lib/artist/style-versions'
import type { GenerationJobReceipt } from '@/lib/generation-jobs-client'

/** 그리는 중인 칸 · 잠시 기다리는 칸을 다시 볼 때까지. */
export const REGEN_POLL_MS = 4_000

export interface ArtistVersionsResponse {
  versions: VersionView[]
  currentN: number
  regen: RegenProgress | null
  completed: boolean
  /** 버전을 불러오는 중(끊긴 불러오기를 서버가 아직 마저 하지 못함). */
  restoring?: boolean
  /** 지금 작품 스타일 — 기록을 읽을 때마다 화면 값을 맞춘다. */
  style?: { key: string | null; custom: VersionCustomStyle | null }
}

interface RegenRun {
  running: boolean
  /** 모두의 자리가 차서 멈췄다 — [남은 그림 그리기]로 다시 켠다. */
  stopped: boolean
  /** 내 한도에 막혀 기다리기 시작한 때 — 새로 보낸 그림이 생기면 다시 잰다. */
  userWaitSince: number | null
}

interface ArtistVersionState {
  projectId: string | null
  versions: VersionView[]
  currentN: number
  regen: RegenProgress | null
  completed: boolean
  /** 서버가 버전을 불러오는 중이라고 한다 — 머리 줄은 불러오는 중을 보이고 몇 초마다 다시 읽는다. */
  restoring: boolean
  loaded: boolean
  busy: 'regenerate' | 'load' | null
  lastError: string | null
  regenDialogOpen: boolean
  historyDialogOpen: boolean
  /** 그리는 중 잠금 화면을 닫은 재생성 번호 — 닫아도 머리 줄 단추 · [완료하기]는 다 그릴 때까지 꺼져 있다. */
  overlayDismissedFor: number | null
  /** Artist 화면이 열려 있나 — 닫혀 있으면 남은 칸을 보내지 않는다. */
  screen: { projectId: string | null; open: boolean }
  run: RegenRun
  setScreenOpen: (projectId: string, open: boolean) => void
  refresh: (opts?: { ensure?: boolean }) => Promise<ArtistVersionsResponse | null>
  openRegenerate: () => void
  closeRegenerate: () => void
  openHistory: () => void
  closeHistory: () => void
  dismissOverlay: () => void
  regenerate: (styleKey: string) => Promise<boolean>
  /** 버전을 불러온다. cancelRegen 을 주지 않으면 재생성 그림이 멈춘 채일 때만 그 재생성을 그만두고 불러온다. */
  loadVersion: (n: number, opts?: { cancelRegen?: boolean }) => Promise<boolean>
  /** 멈춘 재생성을 그만두고 재생성 전 버전으로 돌아간다([이전 버전으로 돌아가기]). */
  goBackToPrevious: () => Promise<boolean>
  /** 남은 재생성 칸을 이어 그린다 — 이미 도는 중이면 그 일을 기다린다. */
  continueRegen: () => Promise<void>
  /** 멈춘 이어 그리기를 다시 켠다([남은 그림 그리기]). */
  resumeRegen: () => Promise<void>
  reset: () => void
}

const IDLE_RUN: RegenRun = { running: false, stopped: false, userWaitSince: null }
let inflight: Promise<void> | null = null

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 거절 까닭 코드 → 화면 안내(번역 키). */
function messageForCode(code: string | undefined, fallback: string): string {
  if (code === ARTIST_VERSION_CODES.completed) return 'The style cannot be changed after Storyboard opens.'
  if (code === ARTIST_VERSION_CODES.drawing || code === ARTIST_VERSION_CODES.regenPending) return 'Wait until the images are drawn, then try again.'
  if (code === ARTIST_VERSION_CODES.conflict || code === ARTIST_VERSION_CODES.alreadyCurrent) return 'Another window changed the version first. Check the history and try again.'
  if (code === ARTIST_VERSION_CODES.nothingToDraw) return 'There are no characters or backgrounds to remake yet.'
  if (code === ARTIST_VERSION_CODES.unknownStyle) return 'Pick a style that is available.'
  if (code === ARTIST_VERSION_CODES.restoring) return 'Loading the version. Try again in a moment.'
  return fallback
}

/**
 * 기록을 몇 초마다 다시 읽어야 하나 — 버전을 불러오는 중이거나, 다 그리기 전 재생성이 그리는 중(멈췄어도 그리던 그림이 남았으면).
 *   멈춘 뒤 끝난 그림이 진행 · "만들었어요" 알림에 반영되지 않아 단추를 눌러야 바뀌었다(2026-10-31 재검토 지적).
 */
export function versionsNeedRefresh(state: { regen: Pick<RegenProgress, 'complete' | 'drawing'> | null; run: Pick<RegenRun, 'stopped'>; restoring: boolean }): boolean {
  if (state.restoring) return true
  const regen = state.regen
  if (!regen || regen.complete) return false
  return !state.run.stopped || regen.drawing > 0
}

/** 재생성 그림이 다 그려지기 전에 멈췄나 — 이어 그리기가 모두의 자리 · 오랜 한도 기다림으로 멈춘 채 남은 칸이 있다. */
function regenStopped(state: Pick<ArtistVersionState, 'regen' | 'run'>): boolean {
  return !!state.regen && !state.regen.complete && state.run.stopped
}

/** 재생성 전 버전 — 기록에 적어 둔 번호, 없으면(예전 기록) 재생성을 시작할 때 떠난 버전, 그것도 없으면 가장 최근의 이전 버전. */
function versionBeforeRegen(regen: RegenProgress, versions: readonly VersionView[]): number | null {
  if (regen.fromN != null) return regen.fromN
  const left = versions.find((version) => !version.current && version.active.some((range) => range.to === regen.startedAt))
  return left?.n ?? earlierVersions(versions)[0]?.n ?? null
}

/** 버전의 스타일을 Producer 스토어(작품 스타일의 화면 값)에 옮긴다 — 서버가 이미 바꿨다. */
function applyStyle(styleKey: string | null, customStyle: VersionCustomStyle | null) {
  useProducerStore.setState({ styleAnchorKey: styleKey || null, customStyleAnchor: customStyle ? { url: customStyle.url, label: customStyle.label, medium: customStyle.medium, ...(customStyle.locked ? { locked: true } : {}) } : null })
}

/** 서버의 지금 작품 스타일이 화면 값과 다르면 맞춘다 — 답을 못 받은 불러오기 뒤에도 스타일 이름 · 카드 기록 가리기가 맞게(2026-10-31 재검토 지적). */
function syncStyle(style: ArtistVersionsResponse['style']) {
  if (!style) return
  const producer = useProducerStore.getState()
  const custom = producer.customStyleAnchor
  const sameCustom = (!custom && !style.custom) || (!!custom && !!style.custom && custom.url === style.custom.url && custom.label === style.custom.label && (custom.medium ?? null) === (style.custom.medium ?? null))
  if ((producer.styleAnchorKey || null) === (style.key || null) && sameCustom) return
  applyStyle(style.key, style.custom)
}

function styleLabelOf(version: { styleKey: string | null; customStyle: VersionCustomStyle | null }): string {
  return versionStyleLabel(version, useProducerStore.getState().styleAnchors, contentLocale())
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { ok: res.ok, body: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown> }
  } catch (e) {
    return { ok: false, body: { error: e instanceof Error ? e.message : String(e) } }
  }
}

/** 칸 하나의 마지막 답으로 이어 그리기가 할 일을 가른다. */
function classify(receipts: GenerationJobReceipt[]): 'submitted' | 'user' | 'global' | 'wait' | 'style' | 'refused' {
  const last = receipts.at(-1)
  if (!last) return 'refused'
  if (receipts.some((receipt) => receipt.jobId)) return 'submitted'
  if (last.status === 'deduped') return last.error === 'waiting_for_style' ? 'style' : 'wait'
  if (last.status === 'failed' && last.httpStatus === 429 && last.quotaScope === 'user') return 'user'
  if (last.status === 'failed' && last.httpStatus === 429 && last.quotaScope === 'global') return 'global'
  return 'refused'
}

export const useArtistVersionStore = create<ArtistVersionState>((set, get) => {
  const sameProject = (projectId: string) => useProjectStore.getState().projectId === projectId
  const screenOpen = (projectId: string) => sameProject(projectId) && get().screen.projectId === projectId && get().screen.open

  /** 칸들을 그린다(지금의 다시 만들기와 같은 함수 · 같은 동시 장수) — 칸마다 받은 답을 돌려준다. */
  async function drawSlots(projectId: string, slots: RegenSlot[], quietQuota: boolean): Promise<Map<string, GenerationJobReceipt[]>> {
    const receipts = new Map<string, GenerationJobReceipt[]>()
    const tasks = slots.map((slot) => async () => {
      if (!screenOpen(projectId)) return
      const key = regenSlotKey(slot)
      const list: GenerationJobReceipt[] = []
      receipts.set(key, list)
      const onJob = (receipt: GenerationJobReceipt) => { list.push(receipt) }
      const artist = useArtistStore.getState()
      if (slot.kind === 'character') {
        await artist.generateCharacterView(slot.id, slot.appearanceKey ?? '', 'main', 'ui', undefined, undefined, undefined, { onJob, quietQuota })
      } else {
        await artist.generateWorldShot(slot.id, 'wideShot', undefined, 'ui', undefined, { appearanceKey: slot.appearanceKey, onJob, quietQuota })
      }
    })
    await runAdaptivePool(tasks, fetchArtistGenerationLimit).catch(() => undefined)
    return receipts
  }

  async function finish(projectId: string, regen: RegenProgress): Promise<void> {
    const { ok, body } = await postJson('/api/artist/versions/regen', { projectId, n: regen.n, action: 'finish' })
    if (!ok || body.announced !== true || !sameProject(projectId)) return
    const version = get().versions.find((item) => item.n === regen.n)
    const style = version ? styleLabelOf(version) : styleLabelOf({ styleKey: useProducerStore.getState().styleAnchorKey, customStyle: useProducerStore.getState().customStyleAnchor })
    useGlobalChatStore.getState().notifyIssue('artist', regenDoneMessage(contentLocale(), { style, n: regen.n, failed: typeof body.failed === 'number' ? body.failed : regen.failed }))
    await get().refresh()
  }

  async function regenLoop(projectId: string): Promise<void> {
    if (!screenOpen(projectId) || get().run.stopped) return
    set({ run: { ...get().run, running: true } })
    // 칸마다 다시 볼 때 — 내 한도 · 그림체 읽기 · 겹친 요청은 잠시 뒤 다시 본다.
    const retryAt = new Map<string, number>()
    let userWaitSince = get().run.userWaitSince
    try {
      for (;;) {
        if (!screenOpen(projectId)) return
        const view = await get().refresh()
        if (!view || !screenOpen(projectId)) return
        // 다른 창에서 [완료하기]를 눌렀다 — Storyboard 로 넘어간 그림을 바꾸지 않게 더 그리지 않는다(2026-10-28 검토 지적).
        if (view.completed) return
        const regen = view.regen
        if (!regen) return
        if (regen.complete) {
          await finish(projectId, regen)
          return
        }
        const now = Date.now()
        const targets = nextRegenTargets(regen, regen.states).filter((slot) => (retryAt.get(regenSlotKey(slot)) ?? 0) <= now)
        if (targets.length === 0) {
          // 그리는 중인 칸을 기다리거나, 다시 볼 때를 기다린다. 내 한도 기다림은 시간으로 끊는다(draw-continue 와 같은 30분).
          if (userWaitSince != null && now - userWaitSince >= USER_LIMIT_WAIT_MAX_MS) {
            set({ run: { running: false, stopped: true, userWaitSince: null } })
            return
          }
          const soonest = Math.min(...[...retryAt.values()].filter((at) => at > now), now + REGEN_POLL_MS)
          await sleep(Math.max(10, Math.min(REGEN_POLL_MS, soonest - now)))
          continue
        }
        const receipts = await drawSlots(projectId, targets, userWaitSince != null)
        if (!sameProject(projectId)) return
        const refused: string[] = []
        let submitted = 0
        let global = false
        for (const [key, list] of receipts) {
          const outcome = classify(list)
          if (outcome === 'submitted') submitted++
          else if (outcome === 'global') global = true
          else if (outcome === 'user') retryAt.set(key, Date.now() + USER_LIMIT_RECHECK_MS)
          else if (outcome === 'style') retryAt.set(key, Date.now() + STYLE_WAIT_RECHECK_MS)
          else if (outcome === 'wait') retryAt.set(key, Date.now() + REGEN_POLL_MS)
          else refused.push(key)
        }
        const userRefused = [...receipts.values()].some((list) => classify(list) === 'user')
        userWaitSince = userRefused ? (submitted > 0 ? Date.now() : userWaitSince ?? Date.now()) : submitted > 0 ? null : userWaitSince
        set({ run: { ...get().run, userWaitSince } })
        // 접수 전에 다른 까닭으로 막힌 칸은 실패로 적는다 — 다시 보내도 같은 답이다(내용 규칙 · 기준 얼굴 없음 등).
        if (refused.length) await postJson('/api/artist/versions/regen', { projectId, n: regen.n, action: 'fail', slots: refused })
        if (global) {
          set({ run: { running: false, stopped: true, userWaitSince: null } })
          return
        }
      }
    } finally {
      if (get().run.running) set({ run: { ...get().run, running: false } })
    }
  }

  return {
    projectId: null,
    versions: [],
    currentN: 1,
    regen: null,
    completed: false,
    restoring: false,
    loaded: false,
    busy: null,
    lastError: null,
    regenDialogOpen: false,
    historyDialogOpen: false,
    overlayDismissedFor: null,
    screen: { projectId: null, open: false },
    run: { ...IDLE_RUN },

    setScreenOpen: (projectId, open) => {
      const projectChanged = get().projectId !== projectId
      set({ screen: { projectId, open }, ...(projectChanged ? { projectId, versions: [], currentN: 1, regen: null, completed: false, restoring: false, loaded: false, run: { ...IDLE_RUN }, overlayDismissedFor: null } : {}) })
    },

    refresh: async (opts) => {
      const projectId = useProjectStore.getState().projectId
      if (!projectId) return null
      try {
        const res = await fetch(`/api/artist/versions?projectId=${encodeURIComponent(projectId)}${opts?.ensure ? '&ensure=1' : ''}`, { cache: 'no-store' })
        if (!res.ok) return null
        const body = (await res.json()) as ArtistVersionsResponse
        if (!sameProject(projectId)) return null
        set({ projectId, versions: body.versions ?? [], currentN: body.currentN ?? 1, regen: body.regen ?? null, completed: body.completed === true, restoring: body.restoring === true, loaded: true })
        syncStyle(body.style)
        // 멈춘 재생성이라도 그리던 그림이 끝나 다 그렸으면 멈춤을 풀고 다 그렸다고 알린다(이어 그리기가 마무리한다).
        if (body.regen?.complete && !body.regen.announced && get().run.stopped) {
          set({ run: { ...IDLE_RUN } })
          void get().continueRegen()
        }
        return body
      } catch {
        return null
      }
    },

    openRegenerate: () => set({ regenDialogOpen: true, historyDialogOpen: false }),
    closeRegenerate: () => set({ regenDialogOpen: false }),
    openHistory: () => {
      set({ historyDialogOpen: true, regenDialogOpen: false })
      // 기록 창을 처음 열 때 지금 그림 · 지금 스타일로 v1 을 남긴다(이 기능 전 그림은 v1).
      void get().refresh({ ensure: true })
    },
    closeHistory: () => set({ historyDialogOpen: false }),
    dismissOverlay: () => set({ overlayDismissedFor: get().regen?.n ?? null }),

    regenerate: async (styleKey) => {
      const projectId = useProjectStore.getState().projectId
      if (!projectId || get().busy) return false
      set({ busy: 'regenerate', lastError: null })
      try {
        const { ok, body } = await postJson('/api/artist/versions/regenerate', { projectId, styleAnchorKey: styleKey })
        if (!sameProject(projectId)) return false
        if (!ok) {
          set({ lastError: translate(useLocaleStore.getState().locale, messageForCode(body.code as string | undefined, 'Could not start the regeneration. Please try again.')) })
          return false
        }
        const producer = useProducerStore.getState()
        const keepsCustom = styleKey === producer.styleAnchorKey && !!producer.customStyleAnchor
        if (!keepsCustom) applyStyle(styleKey, null)
        set({ regenDialogOpen: false, historyDialogOpen: false, overlayDismissedFor: null, run: { ...IDLE_RUN } })
        await get().refresh()
        // 새 스타일 키로 그림 지문을 다시 맞춘다 — 그리는 동안 옛 그림은 "최종 룩 전"으로 보일 수 있다.
        void useArtistStore.getState().loadData()
        void get().continueRegen()
        return true
      } finally {
        set({ busy: null })
      }
    },

    loadVersion: async (n, opts) => {
      const projectId = useProjectStore.getState().projectId
      if (!projectId || get().busy) return false
      const cancelRegen = opts?.cancelRegen ?? regenStopped(get())
      set({ busy: 'load', lastError: null })
      try {
        const { ok, body } = await postJson('/api/artist/versions/load', { projectId, n, ...(cancelRegen ? { cancelRegen: true } : {}) })
        if (!sameProject(projectId)) return false
        if (!ok) {
          const code = body.code as string | undefined
          set({ lastError: translate(useLocaleStore.getState().locale, messageForCode(code, 'Could not load the version. Please try again.')) })
          // 답을 못 받았으면(시간 제한 등) 서버가 어디까지 했는지 모른다 — 기록 · 그림을 다시 읽어 화면을 맞춘다.
          if (!code) {
            await get().refresh()
            void useArtistStore.getState().loadData()
          }
          return false
        }
        const styleKey = typeof body.styleKey === 'string' ? body.styleKey : null
        const customStyle = (body.customStyle ?? null) as VersionCustomStyle | null
        applyStyle(styleKey, customStyle)
        await useArtistStore.getState().loadData()
        await get().refresh()
        // 멈춤은 기록을 다시 읽은 뒤에 푼다 — 먼저 풀면 그 사이 잠금 화면이 "그림을 만들고 있어요"로 다시 떴다(2026-10-28 개발 DB e2e).
        if (cancelRegen) set({ run: { ...IDLE_RUN } })
        // 다른 모습이 있는 배경은 지금 그림 그대로다 — 일부 배경이 안 바뀐 까닭을 한 줄로 알린다(2026-10-31 오너 결정 A).
        const kept = typeof body.keptBackgrounds === 'number' ? body.keptBackgrounds : 0
        if (kept > 0) toast.info(translate(useLocaleStore.getState().locale, '{count} backgrounds with other looks keep their current pictures.', { count: kept }))
        set({ historyDialogOpen: false, regenDialogOpen: false })
        useGlobalChatStore.getState().notifyIssue('artist', versionLoadedMessage(contentLocale(), { n, style: styleLabelOf({ styleKey, customStyle }) }))
        return true
      } finally {
        set({ busy: null })
      }
    },

    goBackToPrevious: async () => {
      const regen = get().regen
      if (!regen) return false
      const n = versionBeforeRegen(regen, get().versions)
      if (n == null) return false
      return get().loadVersion(n, { cancelRegen: true })
    },

    continueRegen: () => {
      const projectId = useProjectStore.getState().projectId
      if (!projectId) return Promise.resolve()
      if (inflight) return inflight
      inflight = regenLoop(projectId).finally(() => { inflight = null })
      return inflight
    },

    resumeRegen: async () => {
      set({ run: { ...IDLE_RUN }, overlayDismissedFor: null })
      await get().continueRegen()
    },

    reset: () => set({
      projectId: null, versions: [], currentN: 1, regen: null, completed: false, restoring: false, loaded: false, busy: null, lastError: null,
      regenDialogOpen: false, historyDialogOpen: false, overlayDismissedFor: null, screen: { projectId: null, open: false }, run: { ...IDLE_RUN },
    }),
  }
})
