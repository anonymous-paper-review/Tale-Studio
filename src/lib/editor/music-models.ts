// ============================================================================
// Editor 음악 만들기 모델 레지스트리(2026-11-26 m1126 E1 · 리드 답 O2 · O3) — 영상 video-models.ts 와 같은 모양.
//
// 처리 업체는 fal 만이다(정책 문서가 밝힌 처리 업체 밖으로 사용자 글을 보내지 않는다 — video-models.ts 머리말 2026-10-11).
//   ElevenLabs Music(기본): 길이를 3초 ~ 3분 사이로 정확히 정한다(music_length_ms). [반주만]은 force_instrumental 로 반주만 보장하고,
//     [노래]는 분위기 글을 따른다(목소리가 나올 수도 안 나올 수도 있다 — fal 문서). 가사 칸은 없다.
//   MiniMax Music 2.6: 노래 · 가사(3500자). 노래인데 가사가 비면 lyrics_optimizer 로 분위기 글에서 가사를 짓는다. 길이는 모델이 정한다.
//   Lyria 는 넣지 않는다(리드 O2).
// 한 곡 = 1 Take(take-cost.ts takeCostForMusic, 리드 O3). 길이 상한 3분은 리드가 정했다(O3 — ElevenLabs API 는 10분까지 받는다).
// client-safe(서버 전용 의존 없음) — 화면 검사와 서버 검사가 같은 규칙을 쓴다.
// 약속: tests/editor/music-panel.test.ts · tests/job/editor-music-job.test.ts
// ============================================================================

export type MusicModelKey = 'elevenlabs-music' | 'minimax-music-2.6'

export interface MusicModelSpec {
  key: MusicModelKey
  /** 칩에 보이는 이름(상품 이름이라 두 말 모두 같다). */
  label: string
  /** fal 끝점. */
  endpoint: string
  /** 길이 — 'exact' 는 고른 초 그대로(3 ~ 180초), 'model' 은 모델이 정한다(길이 칸 대신 안내 한 줄). */
  length: 'exact' | 'model'
  /** 노래일 때 가사 칸이 있나. */
  lyrics: boolean
  /** 분위기 글 최소 글자 수(모델 규칙 — MiniMax 10자). */
  promptMin: number
}

export const MUSIC_MODELS: Record<MusicModelKey, MusicModelSpec> = {
  'elevenlabs-music': {
    key: 'elevenlabs-music',
    label: 'ElevenLabs Music',
    endpoint: 'fal-ai/elevenlabs/music',
    length: 'exact',
    lyrics: false,
    promptMin: 1,
  },
  'minimax-music-2.6': {
    key: 'minimax-music-2.6',
    label: 'MiniMax Music 2.6',
    endpoint: 'fal-ai/minimax-music/v2.6',
    length: 'model',
    lyrics: true,
    promptMin: 10,
  },
}

/** 칩 차례 — 처음 값(기본)이 앞. */
export const MUSIC_MODEL_ORDER: readonly MusicModelKey[] = ['elevenlabs-music', 'minimax-music-2.6']
export const DEFAULT_MUSIC_MODEL: MusicModelKey = 'elevenlabs-music'

/** 길이 범위(초) — ElevenLabs 최소 3초, 상한 3분(리드 O3). */
export const MUSIC_LENGTH_MIN_SEC = 3
export const MUSIC_LENGTH_MAX_SEC = 180
/** 시퀀스가 비어 길이를 가늠할 수 없을 때의 처음 값. */
export const MUSIC_LENGTH_FALLBACK_SEC = 30
/** 분위기 글 · 가사 상한(MiniMax 규칙, ElevenLabs 도 같은 상한을 쓴다). */
export const MUSIC_PROMPT_MAX = 2000
export const MUSIC_LYRICS_MAX = 3500
/** 곡 이름 — 분위기 글 첫 줄 앞 이만큼. */
export const MUSIC_TITLE_MAX = 40

export function isMusicModelKey(value: unknown): value is MusicModelKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MUSIC_MODELS, value)
}

/** 한 곡 만들기 요청 — 화면이 보내고 서버가 다시 검사한다. */
export interface MusicRequest {
  model: MusicModelKey
  prompt: string
  instrumental: boolean
  /** 노래 + 가사 칸이 있는 모델일 때만 쓴다. */
  lyrics?: string | null
  /** 길이를 정하는 모델(ElevenLabs)만 쓴다. */
  durationSec?: number | null
}

export type MusicRequestProblem = 'prompt_empty' | 'prompt_short' | 'prompt_long' | 'lyrics_long'

/** 모델이 받지 않는 요청인가 — 받지 않으면 그 까닭, 받으면 null. */
export function musicRequestProblem(req: MusicRequest): MusicRequestProblem | null {
  const prompt = req.prompt.trim()
  if (!prompt) return 'prompt_empty'
  if ([...prompt].length < MUSIC_MODELS[req.model].promptMin) return 'prompt_short'
  if ([...prompt].length > MUSIC_PROMPT_MAX) return 'prompt_long'
  if ([...(req.lyrics ?? '').trim()].length > MUSIC_LYRICS_MAX) return 'lyrics_long'
  return null
}

/** 길이를 정수 초 · 3 ~ 180 안으로. 숫자가 아니면 처음 값(30초). */
export function clampMusicLength(sec: number | null | undefined): number {
  const n = typeof sec === 'number' && Number.isFinite(sec) ? Math.round(sec) : MUSIC_LENGTH_FALLBACK_SEC
  return Math.min(MUSIC_LENGTH_MAX_SEC, Math.max(MUSIC_LENGTH_MIN_SEC, n))
}

/** 길이 칸 처음 값 — 지금 시퀀스 길이(초, 올림)를 3 ~ 180 안으로. 시퀀스가 비었으면 30초. */
export function defaultMusicLengthSec(sequenceSec: number): number {
  if (!(sequenceSec > 0)) return MUSIC_LENGTH_FALLBACK_SEC
  return clampMusicLength(Math.ceil(sequenceSec - 1e-6))
}

/** 요청에서 그 모델이 실제로 쓰는 칸만 남긴다 — 가사는 노래 + 가사 칸 있는 모델, 길이는 길이를 정하는 모델만. */
export function normalizeMusicRequest(req: MusicRequest): MusicRequest {
  const spec = MUSIC_MODELS[req.model]
  const lyrics = spec.lyrics && !req.instrumental ? (req.lyrics ?? '').trim() : ''
  return {
    model: req.model,
    prompt: req.prompt.trim(),
    instrumental: req.instrumental,
    lyrics: lyrics || null,
    durationSec: spec.length === 'exact' ? clampMusicLength(req.durationSec) : null,
  }
}

/** fal 에 보낼 입력 — 모델마다 칸 이름이 다르다. 사용자 글은 앞뒤 공백만 다듬고 덧붙이지 않는다. */
export function buildMusicInput(req: MusicRequest): { endpoint: string; input: Record<string, unknown> } {
  const spec = MUSIC_MODELS[req.model]
  const r = normalizeMusicRequest(req)
  if (spec.length === 'exact') {
    return {
      endpoint: spec.endpoint,
      input: {
        prompt: r.prompt,
        music_length_ms: clampMusicLength(r.durationSec) * 1000,
        force_instrumental: r.instrumental,
        output_format: 'mp3_44100_128',
      },
    }
  }
  return {
    endpoint: spec.endpoint,
    input: {
      prompt: r.prompt,
      is_instrumental: r.instrumental,
      ...(r.instrumental ? {} : r.lyrics ? { lyrics: r.lyrics } : { lyrics_optimizer: true }),
    },
  }
}

/** [생성] 목록의 곡 길이 — 분:초(20초 → 0:20, 152초 → 2:32). 목록에는 줄 표시가 없어 타임코드(초:장)는 분으로 읽힌다. */
export function formatMusicLength(sec: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** 곡 이름 — 분위기 글 첫 줄 앞 40자(넘으면 …). */
export function musicTitle(prompt: string): string {
  const line = prompt.trim().split(/\r?\n/)[0]?.trim() ?? ''
  const chars = [...line]
  return chars.length > MUSIC_TITLE_MAX ? `${chars.slice(0, MUSIC_TITLE_MAX).join('')}…` : line
}

/** 실패 까닭 — 화면은 이 말로 고칠 수 있는 안내를 고른다(내용 규칙 · Take 부족 · 너무 오래 걸림 · 그 밖). */
export type MusicFailureCode = 'content_policy' | 'insufficient_takes' | 'timed_out' | 'submit_rejected' | 'generation_failed'

/** 화면 · 서버가 주고받는 만든 곡 한 줄(editor_music 행 + 작업 상태). */
export interface EditorMusicItem {
  id: string
  /** 분위기 글 첫 줄 앞 40자(musicTitle). */
  title: string
  model: MusicModelKey
  prompt: string
  lyrics: string | null
  instrumental: boolean
  /** 길이를 정하는 모델에서 고른 길이(초). 모델이 정하면 null. */
  requestedDurationSec: number | null
  status: 'queued' | 'completed' | 'failed'
  /** 끝나면 보관함 공개 주소. */
  url: string | null
  /** 실패면 그 까닭(MusicFailureCode). */
  error: string | null
  jobId: string | null
  createdAt: string
}
