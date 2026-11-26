'use client'

// Storyboard 실사 카드 한 장 다시 그리기(오너 2026-11-26 m1126 O7 "채팅으로") — 채팅이 고른 샷 하나의 실사를 바꿀 점과 함께 다시 그린다.
//   Director 샷 상세 [이미지 고치기]와 같은 서버 요청(POST /api/director/generate-storyboard) · 같은 글(promptWithChange) —
//   지시문 글자는 바뀌지 않는다(리드 "그림 지시문을 바꾸는 고침은 리드에게"). 참고 그림(콘티 시트 · 인물 시트 · 배경)은 서버가 DB 로 다시 짠다.
//   샷 그림 글은 Director 가 Writer 샷에서 받는 것과 같다(use-writer-director-sync writerDirectorPromptSource — 같은지는 시험이 본다).
//   모델은 [시작] 일괄처럼 서버 기본(시트 되는 모델). 카드 기다림은 작업 큐가 맡는다 — 맡기자마자 큐를 다시 읽는다.
//   약속: tests/writer/real-redraw.test.ts
import { promptWithChange } from '@/lib/director/shot-detail'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import { refreshGenerationQueue } from '@/lib/generation-queue'
import { notifyIfQuotaExceeded } from '@/lib/generation-quota-toast'
import type { Shot } from '@/types/shot'

type RedrawShot = Pick<Shot, 'shotId' | 'prompt' | 'actionDescription'>

/** 맡긴 그림의 끝 — 그려짐 · 못 그림(실패 또는 조회 시간 넘김 — pollGenerationJob 이 둘 다 거절로 끝낸다). */
export type RedrawDone = 'drawn' | 'failed'

export type RedrawOutcome =
  | { ok: true; jobId: string; done: Promise<RedrawDone> }
  /** busy = 그 샷을 이미 그리는 중(서버가 새로 맡지 않음) · missing_sheets = 인물 시트 없음 · quota = 자리 부족 · 내용 규칙(공용 안내를 이미 띄움) · error = 그 밖. */
  | { ok: false; reason: 'busy' | 'quota' }
  | { ok: false; reason: 'missing_sheets' | 'error'; message: string }

/** 서버에 보낼 몸통 — Director 상세와 같은 글. 참고 그림 · 모델은 싣지 않는다(서버가 DB 로 짓는다 · 서버 기본 모델). */
export function redrawRequestBody(projectId: string, shot: RedrawShot, change: string, traceId?: string) {
  const base = shot.prompt || shot.actionDescription || ''
  return {
    projectId,
    writerShotId: shot.shotId,
    prompt: promptWithChange(base, change),
    ...(traceId ? { traceId } : {}),
  }
}

/** 한 샷 실사를 다시 그리라고 맡긴다. 맡겨지면 끝(done)을 함께 돌려준다 — 채팅이 실패를 알릴 때 쓴다. */
export async function redrawStoryboardImage(input: {
  projectId: string
  shot: RedrawShot
  change: string
  traceId?: string
}): Promise<RedrawOutcome> {
  let res: Response
  try {
    res = await fetch('/api/director/generate-storyboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(redrawRequestBody(input.projectId, input.shot, input.change, input.traceId)),
    })
  } catch (error) {
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) }
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; jobId?: unknown; replayed?: boolean; error?: unknown; code?: unknown } | null
  if (res.ok && typeof body?.jobId === 'string') {
    // 같은 샷을 그리는 작업이 이미 있어 서버가 그 번호를 돌려줬다 — 이번 바꿀 점은 맡겨지지 않았다.
    if (body.replayed) return { ok: false, reason: 'busy' }
    refreshGenerationQueue()
    const jobId = body.jobId
    const done = pollGenerationJob(jobId).then(
      (): RedrawDone => 'drawn',
      (): RedrawDone => 'failed',
    )
    return { ok: true, jobId, done }
  }
  if (res.status === 409 && body?.code === 'missing_character_sheets') {
    return { ok: false, reason: 'missing_sheets', message: typeof body.error === 'string' ? body.error : `HTTP ${res.status}` }
  }
  if (notifyIfQuotaExceeded(res.status, body)) return { ok: false, reason: 'quota' }
  return { ok: false, reason: 'error', message: typeof body?.error === 'string' ? body.error : `HTTP ${res.status}` }
}
