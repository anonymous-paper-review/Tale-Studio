// /api/editor/music — Editor [생성] 음악 만들기(2026-11-26 m1126 E1 · 리드 답 O2 · O3).
//   GET ?projectId= : 만든 곡 목록(뺀 곡 빼고 새것 위, 만드는 중인 곡은 작업 장부를 보고 실패를 옮겨 적는다).
//   POST {projectId, model, prompt, instrumental, lyrics?, durationSec?} : 한 곡 만들기. 순서는 미리보기 영상과 같다(#previz-record-before-submit) —
//     요청 검사 → 자리(이미지 축) → 사용자 글 검사(Creem) → 작업 예약(generation_jobs 'editor_music') + 곡 행(editor_music) → Take 1 묶기 → fal 제출 →
//     접수 번호 기록. 확정 거절만 예약 · Take 를 닫고 돌려주고, 접수 여부를 모르는 실패는 그대로 두어 웹훅 · 폴링이 마무리한다.
//   끝은 웹훅 · 폴링(/api/generation-jobs/[id])이 finalizeEditorMusicJob 으로 — 보관함에 올리고 곡 행을 끝으로.
//   약속: tests/job/editor-music-job.test.ts · tests/billing/music-take.test.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import {
  confirmGenerationJobReceipt,
  rejectGenerationJobReservation,
  reserveGenerationJob,
  type GenerationJob,
} from '@/lib/generation-jobs'
import { checkGenerationCapacity } from '@/lib/generation-quota'
import { capacityReservationRejection, quotaRejectionResponse } from '@/lib/api/quota'
import { assertUserTextAllowed, moderatedSubmitInput, type ModerationReceipt } from '@/lib/moderation/creem'
import { moderationRejectionResponse, recordModerationPass } from '@/lib/api/moderation'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { falKeyById } from '@/lib/fal/keys'
import { falMusicSubmit } from '@/lib/fal/music'
import { isDefiniteSubmitRejection } from '@/lib/fal/submit-rejection'
import { holdTakesForJob, releaseTakesForJob } from '@/lib/billing/take-hold'
import { takeCostForMusic } from '@/lib/billing/take-cost'
import { buildMusicInput, isMusicModelKey, musicRequestProblem, normalizeMusicRequest, type MusicRequest } from '@/lib/editor/music-models'
import { listEditorMusic, markEditorMusicFailed, toMusicItem, type EditorMusicRow } from '@/lib/editor/music-server'

export const runtime = 'nodejs'
export const maxDuration = 60

const KIND = 'editor_music'

/** 닫기 · 돌려주기처럼 실패해도 응답을 바꾸지 않을 뒷정리 — 실패는 서버 기록에만 남긴다(다음 폴링 · 유령 청소가 다시 본다). */
async function quietly(label: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work()
  } catch (error) {
    console.error(`[editor/music] ${label} failed:`, error instanceof Error ? error.message : error)
  }
}

const BodySchema = z.object({
  projectId: z.string().uuid(),
  model: z.string().refine(isMusicModelKey),
  prompt: z.string(),
  instrumental: z.boolean(),
  lyrics: z.string().nullish(),
  durationSec: z.number().nullish(),
})

export async function GET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get('projectId')
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response
    return NextResponse.json({ items: await listEditorMusic(access.projectId) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[editor/music GET]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    const { projectId } = parsed.data

    // 주인만 — 로그인만으로 남의 프로젝트에 Take 를 쓰게 하지 않는다(#access-audit).
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response
    const userId = access.userId as string

    const request: MusicRequest = normalizeMusicRequest({
      model: parsed.data.model as MusicRequest['model'],
      prompt: parsed.data.prompt,
      instrumental: parsed.data.instrumental,
      lyrics: parsed.data.lyrics ?? null,
      durationSec: parsed.data.durationSec ?? null,
    })
    const problem = musicRequestProblem(request)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })

    // 음악은 DB 자리 트리거가 이미지 축으로 센다(영상 두 종류 밖) — 미리 물어 헛 예약을 줄인다. 최종 판정은 예약 트리거가 한다.
    const quota = await checkGenerationCapacity(userId, 'image')
    if (!quota.ok) return quotaRejectionResponse(quota, { projectId, kind: KIND, userId })

    const { data: project, error: projectError } = await supabaseAdmin.from('projects').select('workspace_id').eq('id', projectId).maybeSingle()
    if (projectError) throw projectError
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const workspaceId = project.workspace_id as string

    // #creem-moderation: 작업 기록 · Take · 제출 전에 사용자가 쓴 글(분위기 글 · 가사)만 검사한다.
    let moderation: ModerationReceipt
    try {
      moderation = await assertUserTextAllowed([request.prompt, request.lyrics], { projectId, kind: KIND, userId })
    } catch (error) {
      const rejected = moderationRejectionResponse(error, { projectId, kind: KIND, userId })
      if (rejected) return rejected
      throw error
    }

    const { endpoint, input } = buildMusicInput(request)
    const musicId = crypto.randomUUID()
    let job: GenerationJob
    try {
      job = await reserveGenerationJob({
        projectId,
        userId,
        workspaceId,
        model: endpoint,
        kind: KIND,
        provider: 'fal',
        target: { workspaceId, musicId },
        inputSnapshot: { model: request.model, ...input },
      })
    } catch (reserveError) {
      const rejection = capacityReservationRejection(reserveError, { projectId, kind: KIND, userId })
      if (rejection) return rejection
      throw reserveError
    }

    const row: Omit<EditorMusicRow, 'url' | 'error' | 'created_at'> & { created_by: string; created_at: string } = {
      id: musicId,
      project_id: projectId,
      job_id: job.id,
      created_by: userId,
      model: request.model,
      prompt: request.prompt,
      lyrics: request.lyrics ?? null,
      instrumental: request.instrumental,
      requested_duration_sec: request.durationSec ?? null,
      status: 'queued',
      created_at: new Date().toISOString(),
    }
    const { error: insertError } = await supabaseAdmin.from('editor_music').insert(row)
    if (insertError) {
      // 아직 아무것도 보내지 않았다 — 예약을 닫는다(Take 는 묶기 전이다).
      await quietly('reservation close', () => rejectGenerationJobReservation(job.id, projectId, `editor_music row insert failed: ${insertError.message}`))
      throw insertError
    }
    recordModerationPass(moderation, { projectId, kind: KIND, userId, jobId: job.id })

    // Take 1 묶기 — 제출 앞이라 모자라면 아직 되돌릴 수 있다(리드 O3).
    const required = takeCostForMusic()
    let hold: Awaited<ReturnType<typeof holdTakesForJob>>
    try {
      hold = await holdTakesForJob({ workspaceId, userId, jobId: job.id, amount: required, projectId })
    } catch (holdError) {
      // 묶다가 오류가 나면 보내지 않는다 — 예약과 곡을 닫고(묶인 것이 있으면 돌려주고) 오류를 그대로 올린다.
      await quietly('reservation close', () => rejectGenerationJobReservation(job.id, projectId, 'take hold failed'))
      await quietly('take release', () => releaseTakesForJob(job.id))
      await markEditorMusicFailed(projectId, musicId, 'generation_failed')
      throw holdError
    }
    if (!hold.ok && hold.insufficient) {
      await quietly('insufficient-takes reservation close', () => rejectGenerationJobReservation(job.id, projectId, 'insufficient_takes'))
      await markEditorMusicFailed(projectId, musicId, 'insufficient_takes')
      return NextResponse.json({ error: 'insufficient_takes', required, balance: hold.balance }, { status: 402 })
    }

    // 제출 — 반드시 예약 행의 키로(트리거가 여유 있는 계정으로 바꿨을 수 있다). 한 번만 보낸다.
    try {
      const key = falKeyById(job.fal_key_id)
      if (!key) throw Object.assign(new Error(`unknown fal key id: ${job.fal_key_id ?? '(missing)'}`), { status: 400 })
      const receipt = await falMusicSubmit(moderatedSubmitInput({ endpoint, input, webhookUrl: resolveWebhookUrl(job.id) }, moderation), key)
      try {
        await confirmGenerationJobReceipt(job.id, projectId, receipt)
      } catch (confirmError) {
        // 접수 번호를 못 적어도 웹훅이 주소의 작업 번호로 되찾는다(C05). Take 와 예약은 그대로 둔다.
        console.error('[editor/music] receipt confirm failed; webhook will recover by jobId:', job.id, confirmError instanceof Error ? confirmError.message : confirmError)
      }
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError)
      if (isDefiniteSubmitRejection(submitError)) {
        // 확실히 들어가지 않았다 — 예약을 닫고 묶은 Take 를 돌려준다.
        await quietly('reservation close', () => rejectGenerationJobReservation(job.id, projectId, message || 'fal submit rejected'))
        await quietly('take release', () => releaseTakesForJob(job.id))
        await markEditorMusicFailed(projectId, musicId, 'submit_rejected')
        return NextResponse.json({ error: 'submit_rejected' }, { status: 502 })
      }
      // 접수 여부를 모른다(통신 오류 · 5xx · 408/425/429) — 이미 들어갔을 수 있다. 예약 · Take · 곡을 그대로 두고 웹훅 · 폴링을 기다린다.
      console.error('[editor/music] submit outcome unknown, reservation kept:', job.id, message)
    }

    return NextResponse.json({ item: toMusicItem({ ...row, url: null, error: null }) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[editor/music POST]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
