// Producer 시작 화면 라우트 공용(리뉴얼 1차 2026-10-19): 로그인 · 프로젝트 주인 확인 · 데모 쓰기 막기 · 초안 읽고 쓰기.
//   뼈대는 produce/anchor-medium 과 같다(getUser → userOwnsProject, 쓰기는 demoWriteBlock 먼저). 쓰기는 supabaseAdmin.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { userOwnsProject } from '@/lib/generation-jobs'
import type { EntryDraft } from '@/lib/entry/draft'

/** 저장소 경로 · 쿼리에 쓰는 id 꼴(produce/ingest 와 같다). */
export const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/** 새 흐름의 시작 화면이 다루는 단계 — entry(새 프로젝트) · producer(예전 기본값 · 시작 직후). */
export const ENTRY_STAGES = ['entry', 'producer'] as const

export type EntryAccess = { ok: true; userId: string } | { ok: false; response: Response }

/** 로그인만 — 본문을 읽기 전에 막을 때(파일 올리기). 데모(공유) 세션의 쓰기도 먼저 막는다. */
export async function authorizeEntryUser(req: Request): Promise<EntryAccess> {
  const blocked = demoWriteBlock(req)
  if (blocked) return { ok: false, response: blocked }
  const user = await getUser()
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return { ok: true, userId: user.id }
}

export type EntrySignedIn = { ok: true; userId: string; projectId: string } | { ok: false; response: Response }

/**
 * 주인 확인 앞까지 — 로그인 · 프로젝트 번호 꼴. write = 데모(공유) 세션의 쓰기를 먼저 막는다.
 *   시작 화면 GET 은 이것을 지난 뒤 주인 확인(authorizeEntryOwner)과 자료 읽기를 함께 시작한다 — 익명 요청은 데이터베이스를 읽지 않는다.
 *   규칙은 여기 한 곳 — GET · PATCH · 파일 · 추천 · 시작이 같은 확인을 쓴다(2차 검토 11/4, 약속 tests/producer/entry-read-speed.test.ts).
 */
export async function authorizeEntrySignedIn(req: Request, projectId: unknown, opts: { write: boolean }): Promise<EntrySignedIn> {
  if (opts.write) {
    const blocked = demoWriteBlock(req)
    if (blocked) return { ok: false, response: blocked }
  }
  const user = await getUser()
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (typeof projectId !== 'string' || !PROJECT_ID_RE.test(projectId)) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid request: projectId is required' }, { status: 400 }) }
  }
  return { ok: true, userId: user.id, projectId }
}

/** 주인 확인 — authorizeEntrySignedIn 을 지난 사용자가 그 프로젝트 주인인가. */
export async function authorizeEntryOwner(signedIn: { userId: string; projectId: string }): Promise<EntryAccess> {
  if (!(await userOwnsProject(signedIn.projectId, signedIn.userId))) return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true, userId: signedIn.userId }
}

/** 로그인 · 주인 확인을 차례로. write = 데모(공유) 세션의 쓰기를 먼저 막는다. */
export async function authorizeEntry(req: Request, projectId: unknown, opts: { write: boolean }): Promise<EntryAccess> {
  const signedIn = await authorizeEntrySignedIn(req, projectId, opts)
  if (!signedIn.ok) return signedIn
  return authorizeEntryOwner(signedIn)
}

export interface EntryProjectRow {
  id?: string
  workspace_id?: string
  title?: string | null
  locale?: string | null
  current_stage?: string | null
  entry_draft?: unknown
  story_text?: string | null
  settings?: { format?: unknown } | null
  /** 시리즈 다음 화가 앞 화에서 이어받은 것(projects.series jsonb) — parseSeries 로 읽는다. */
  series?: unknown
}

export async function loadEntryProject(projectId: string, columns: string): Promise<EntryProjectRow | null> {
  const { data, error } = await supabaseAdmin.from('projects').select(columns).eq('id', projectId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as EntryProjectRow | null) ?? null
}

export async function saveEntryDraft(projectId: string, draft: EntryDraft): Promise<void> {
  const { error } = await supabaseAdmin.from('projects').update({ entry_draft: draft }).eq('id', projectId)
  if (error) throw new Error(error.message)
}

export function isEntryStage(stage: unknown): boolean {
  return (ENTRY_STAGES as readonly unknown[]).includes(stage)
}

export function serverError(tag: string, error: unknown): Response {
  console.error(`[produce/entry${tag}]`, error instanceof Error ? error.message : error)
  return NextResponse.json({ error: 'Failed to process the request.' }, { status: 500 })
}
