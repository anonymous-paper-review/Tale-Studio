// Editor [생성] 음악 만들기 화면 상태(2026-11-26 m1126 E1 · 리드 답 O2 · O3) — 만들기 칸(초안) · 만든 곡 목록 · 받은 곡의 길이와 파형.
//   목록의 진실은 서버(/api/editor/music, 표 editor_music)다 — 다른 브라우저 · 기기에서 열어도 같은 곡이 보인다(오너 E1 "프로젝트에 저장").
//   만드는 중인 곡은 작업 폴링(pollGenerationJob)으로 지켜보고, 끝나거나 실패하면 목록을 다시 읽는다 — 화면을 떠났다 와도(다시 열어도) 이어서 지켜본다.
//   끝난 곡은 이 브라우저가 받아 길이 · 파형을 잰다(올린 소리와 같은 decodeAudioPeaks) — 타임라인에 놓을 때 그 길이를 쓴다.
//   약속: tests/editor/music-panel.test.ts
import { create } from 'zustand'
import { toast } from 'sonner'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import { decodeAudioPeaks } from '@/lib/audio-waveform'
import { notifyIfQuotaExceeded } from '@/lib/generation-quota-toast'
import { refetchTakeBalance } from '@/lib/billing/use-take-balance'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import {
  DEFAULT_MUSIC_MODEL,
  MUSIC_LYRICS_MAX,
  MUSIC_MODELS,
  MUSIC_PROMPT_MAX,
  defaultMusicLengthSec,
  musicRequestProblem,
  normalizeMusicRequest,
  type EditorMusicItem,
  type MusicModelKey,
  type MusicRequestProblem,
} from '@/lib/editor/music-models'

export type { EditorMusicItem } from '@/lib/editor/music-models'

/** 만들기 칸. durationSec 가 null 이면 지금 시퀀스 길이를 따라간다(길이 칸 처음 값). */
export interface MusicDraft {
  model: MusicModelKey
  prompt: string
  instrumental: boolean
  lyrics: string
  durationSec: number | null
}

/** 받은 곡의 길이 · 파형 — 타임라인 조각을 만들 때 쓴다. */
export interface DecodedMusic {
  durationSec: number
  peaks: number[]
}

/** 타임라인에 놓을 수 있는 곡(끝났고 길이를 잰 것). */
export interface PlaceableMusic {
  id: string
  title: string
  url: string
  durationSec: number
  peaks: number[]
}

const EMPTY_DRAFT: MusicDraft = { model: DEFAULT_MUSIC_MODEL, prompt: '', instrumental: true, lyrics: '', durationSec: null }

interface EditorMusicState {
  projectId: string | null
  items: EditorMusicItem[]
  loading: boolean
  creating: boolean
  draft: MusicDraft
  decoded: Record<string, DecodedMusic>
  setProject: (projectId: string | null) => void
  setDraft: (patch: Partial<MusicDraft>) => void
  load: (projectId: string) => Promise<void>
  /** sequenceSec = 지금 시퀀스 길이(길이 칸이 비었을 때의 값). 보냈으면 true. */
  create: (sequenceSec: number) => Promise<boolean>
  /** 실패한 곡의 글 · 모델 · 반주/노래 · 가사 · 길이로 만들기 칸을 채운다. */
  retry: (id: string) => void
  remove: (id: string) => Promise<void>
  reset: () => void
}

const t = (key: string, vars?: Record<string, string | number>) => translate(useLocaleStore.getState().locale, key, vars)

/** 화면 검사 까닭 → 안내 글. */
export function musicProblemMessage(problem: MusicRequestProblem, model: MusicModelKey): string {
  switch (problem) {
    case 'prompt_empty':
      return t('Write the mood first.')
    case 'prompt_short':
      return t('Write at least {min} characters of mood for {model}.', { model: MUSIC_MODELS[model].label, min: MUSIC_MODELS[model].promptMin })
    case 'prompt_long':
      return t('The mood can be up to {max} characters.', { max: MUSIC_PROMPT_MAX })
    case 'lyrics_long':
      return t('Lyrics can be up to {max} characters.', { max: MUSIC_LYRICS_MAX })
  }
}

// 지켜보는 작업 · 재는 곡 — 같은 것을 두 번 하지 않는다(화면을 다시 열면 load 가 다시 부른다).
const watching = new Set<string>()
const decoding = new Set<string>()

export const useEditorMusicStore = create<EditorMusicState>((set, get) => {
  const decodeCompleted = () => {
    for (const item of get().items) {
      if (item.status !== 'completed' || !item.url || get().decoded[item.id] || decoding.has(item.id)) continue
      decoding.add(item.id)
      const url = item.url
      void decodeAudioPeaks(url)
        .then(({ durationSec, peaks }) => {
          if (!(durationSec > 0)) return
          set((state) => ({ decoded: { ...state.decoded, [item.id]: { durationSec, peaks } } }))
        })
        .catch((error) => console.error('[editor-music] decode failed:', item.id, error instanceof Error ? error.message : error))
        .finally(() => decoding.delete(item.id))
    }
  }

  const watch = () => {
    for (const item of get().items) {
      if (item.status !== 'queued' || !item.jobId || watching.has(item.jobId)) continue
      const jobId = item.jobId
      const projectId = get().projectId
      watching.add(jobId)
      void pollGenerationJob(jobId, { onStatus: () => {} })
        .then(() => {
          if (get().projectId !== projectId || !projectId) return
          const title = item.title
          return get().load(projectId).then(() => {
            if (get().items.find((x) => x.id === item.id)?.status === 'completed') toast.success(t('Music is ready: {title}', { title }))
          })
        })
        .catch(() => {
          // 실패 · 시간 초과 — 서버 목록이 진실이다(실패면 까닭이 적혀 온다). 시간 초과면 다시 열 때 이어서 지켜본다.
          if (get().projectId === projectId && projectId) return get().load(projectId)
        })
        .finally(() => {
          watching.delete(jobId)
          refetchTakeBalance()
        })
    }
  }

  return {
    projectId: null,
    items: [],
    loading: false,
    creating: false,
    draft: { ...EMPTY_DRAFT },
    decoded: {},

    setProject: (projectId) => {
      if (get().projectId === projectId) return
      set({ projectId, items: [], decoded: {}, draft: { ...EMPTY_DRAFT } })
    },

    setDraft: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),

    load: async (projectId) => {
      get().setProject(projectId)
      set({ loading: true })
      try {
        const res = await fetch(`/api/editor/music?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
        if (!res.ok) return
        const body = (await res.json().catch(() => null)) as { items?: EditorMusicItem[] } | null
        if (get().projectId !== projectId || !Array.isArray(body?.items)) return
        set({ items: body.items })
        watch()
        decodeCompleted()
      } catch (error) {
        console.error('[editor-music] load failed:', error instanceof Error ? error.message : error)
      } finally {
        if (get().projectId === projectId) set({ loading: false })
      }
    },

    create: async (sequenceSec) => {
      const { projectId, draft, creating } = get()
      if (!projectId || creating) return false
      const request = normalizeMusicRequest({
        model: draft.model,
        prompt: draft.prompt,
        instrumental: draft.instrumental,
        lyrics: draft.lyrics,
        durationSec: draft.durationSec ?? defaultMusicLengthSec(sequenceSec),
      })
      const problem = musicRequestProblem(request)
      if (problem) {
        toast.error(musicProblemMessage(problem, request.model))
        return false
      }
      set({ creating: true })
      try {
        const res = await fetch('/api/editor/music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            model: request.model,
            prompt: request.prompt,
            instrumental: request.instrumental,
            ...(request.lyrics ? { lyrics: request.lyrics } : {}),
            ...(request.durationSec != null ? { durationSec: request.durationSec } : {}),
          }),
        })
        const body = (await res.json().catch(() => null)) as { item?: EditorMusicItem; error?: string } | null
        if (!res.ok || !body?.item) {
          // 자리 · Take · 내용 규칙 · 검사 장애는 공용 안내(영상과 같은 문구 · [Take 채우기] 단추).
          if (!notifyIfQuotaExceeded(res.status, body)) toast.error(t('Could not make the music. Please try again.'))
          // 서버가 실패로 적은 곡(확정 거절 등)도 목록에 보이게 다시 읽는다.
          void get().load(projectId)
          refetchTakeBalance()
          return false
        }
        const item = body.item
        set((state) => ({ items: [item, ...state.items.filter((x) => x.id !== item.id)] }))
        toast.info(t('Making music. You can keep editing.'))
        refetchTakeBalance()
        watch()
        return true
      } catch (error) {
        console.error('[editor-music] create failed:', error instanceof Error ? error.message : error)
        toast.error(t('Could not make the music. Please try again.'))
        return false
      } finally {
        set({ creating: false })
      }
    },

    retry: (id) => {
      const item = get().items.find((x) => x.id === id)
      if (!item) return
      set({
        draft: {
          model: item.model,
          prompt: item.prompt,
          instrumental: item.instrumental,
          lyrics: item.lyrics ?? '',
          durationSec: item.requestedDurationSec,
        },
      })
    },

    remove: async (id) => {
      const { projectId, items } = get()
      const item = items.find((x) => x.id === id)
      if (!projectId || !item || item.status === 'queued') return
      try {
        const res = await fetch(`/api/editor/music/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' })
        if (!res.ok && res.status !== 404) {
          toast.error(t('Could not remove the music. Please try again.'))
          return
        }
        set((state) => ({ items: state.items.filter((x) => x.id !== id) }))
        toast.info(t('Removed from the list. Pieces already on the timeline stay.'))
      } catch {
        toast.error(t('Could not remove the music. Please try again.'))
      }
    },

    reset: () => {
      watching.clear()
      decoding.clear()
      set({ projectId: null, items: [], loading: false, creating: false, draft: { ...EMPTY_DRAFT }, decoded: {} })
    },
  }
})

/** 끝났고 길이를 잰 곡 — 프로젝트 판 "만든 음악"과 [타임라인에 넣기]가 쓴다. */
export function placeableMusic(items: readonly EditorMusicItem[], decoded: Readonly<Record<string, DecodedMusic>>): PlaceableMusic[] {
  const out: PlaceableMusic[] = []
  for (const item of items) {
    const info = decoded[item.id]
    if (item.status !== 'completed' || !item.url || !info) continue
    out.push({ id: item.id, title: item.title, url: item.url, durationSec: info.durationSec, peaks: info.peaks })
  }
  return out
}
