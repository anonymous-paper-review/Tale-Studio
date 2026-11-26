// fal 음악 작업 제출 · 조회(2026-11-26 m1126 E1) — Editor [생성]의 음악 한 곡. 이미지 · 영상 제출(src/lib/writer/llm/fal.ts)과 같은 규칙:
//   · 제출은 과금이라 다시 보내지 않는다(#fal-submit-no-retry) — 키 레지스트리의 submitQueueOnce 로 한 번만, 응답을 잃으면 예약이 남아 기다린다.
//   · 검사를 통과한 입력만 받는다(#creem-moderation) — 입력 타입이 ModerationProof 표식을 요구한다.
//   · 조회는 제출한 키로만 한다(#fal-key-pool). 결과의 audio 는 파일 칸({url})이거나 주소 글이다(fal 문서 — 모델마다 다르다).
//   약속: tests/job/editor-music-job.test.ts · tests/billing/music-take.test.ts
import { falKeyById, FalUnknownKeyError, type FalKeyEntry } from '@/lib/fal/keys'
import type { ModerationProof } from '@/lib/moderation/creem'

export interface FalMusicSubmitOptions {
  /** fal 끝점(music-models.ts MUSIC_MODELS[key].endpoint). */
  endpoint: string
  input: Record<string, unknown>
  webhookUrl?: string
}

export interface FalMusicReceipt {
  request_id: string
  model: string
  fal_key_id: string
}

export type FalMusicFetchResult =
  | { status: 'IN_QUEUE' | 'IN_PROGRESS' }
  | { status: 'COMPLETED'; url: string; raw: unknown }
  | { status: 'FAILED'; error: string }

/** 결과에서 소리 주소를 꺼낸다 — {audio: {url}} · {audio: "주소"} 둘 다. 없으면 빈 글. */
export function extractAudioUrl(payload: unknown): string {
  const audio = (payload as { audio?: unknown } | null | undefined)?.audio
  if (typeof audio === 'string') return audio
  if (audio && typeof audio === 'object' && typeof (audio as { url?: unknown }).url === 'string') return (audio as { url: string }).url
  return ''
}

/** 한 번만 제출한다. 실패는 상태 번호(status)를 단 채로 그대로 던진다 — 확정 거절인지는 호출부가 isDefiniteSubmitRejection 으로 가린다. */
export async function falMusicSubmit(opts: FalMusicSubmitOptions & ModerationProof, key: FalKeyEntry): Promise<FalMusicReceipt> {
  const { request_id } = await key.submitQueueOnce(opts.endpoint, opts.input, opts.webhookUrl)
  return { request_id, model: opts.endpoint, fal_key_id: key.id }
}

function errorDetail(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error)
  const e = error as { status?: unknown; message?: unknown; body?: unknown }
  const parts: string[] = []
  if (e.status != null) parts.push(`status=${String(e.status)}`)
  if (typeof e.message === 'string' && e.message) parts.push(e.message)
  if (e.body != null) {
    try {
      const body = typeof e.body === 'string' ? e.body : JSON.stringify(e.body)
      if (body && body !== '{}') parts.push(`body=${body.slice(0, 600)}`)
    } catch {
      // 본문을 글로 못 바꿔도 상태 번호 · 메시지는 남는다.
    }
  }
  return parts.length ? parts.join(' | ') : String(error)
}

/** fal 큐 상태 + 결과. 끝났으면 소리 주소, 진행 중이면 그 상태. 조회는 과금이 없다. */
export async function falMusicFetch(model: string, requestId: string, falKeyId: string): Promise<FalMusicFetchResult> {
  const key = falKeyById(falKeyId)
  if (!key) throw new FalUnknownKeyError(falKeyId)
  const status = await key.client.queue.status(model, { requestId, logs: false })
  const s = String(status.status).toUpperCase()
  if (s === 'COMPLETED') {
    let result
    try {
      result = await key.client.queue.result(model, { requestId })
    } catch (error) {
      // 이미지 · 영상과 같다 — 처리 중 실패한 요청은 COMPLETED 인데 결과 조회가 422 로 실패 상세를 준다(터미널).
      if ((error as { status?: number })?.status === 422) return { status: 'FAILED', error: errorDetail(error) }
      throw error
    }
    const url = extractAudioUrl(result.data)
    if (!url) return { status: 'FAILED', error: 'no audio URL in result' }
    return { status: 'COMPLETED', url, raw: result.data }
  }
  if (s === 'FAILED') return { status: 'FAILED', error: 'fal queue FAILED' }
  return { status: s === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'IN_QUEUE' }
}
