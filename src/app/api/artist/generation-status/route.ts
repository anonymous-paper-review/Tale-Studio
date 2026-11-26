// GET /api/artist/generation-status?projectId=... — 아티스트 캐릭터 생성 상태(실패/대기) 조회 창구.
//
// generation_jobs 는 RLS(ENABLE+policy 없음)로 클라 직접 접근 불가 → service-role 서버 라우트만 노출.
//   loadData 가 1회 호출해 per-character/per-view 실패(reload-survivable)와 queued main 잡을 받는다.
//   queued main 은 클라가 /api/generation-jobs/[id] 로 reconcile 해 마무리한다(단일 경로).
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import {
  listFailedCharacterViewJobs,
  listFailedWorldShotJobs,
  listQueuedMainJobs,
  listQueuedWorldShotJobs,
  listCapacitySkips,
  userOwnsProject,
} from '@/lib/generation-jobs'
import { listFailedPropImageJobs, listQueuedPropImageJobs } from '@/lib/artist/prop-jobs'
import { artistImagesStarted } from '@/lib/artist/images-started'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'Invalid request: projectId required' }, { status: 400 })
  }
  if (!(await userOwnsProject(projectId, user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const [failures, queuedMain, worldFailures, queuedWorld, capacitySkips, propFailures, queuedProps, imagesStarted] = await Promise.all([
    listFailedCharacterViewJobs(projectId),
    listQueuedMainJobs(projectId),
    listFailedWorldShotJobs(projectId), // 약속 B8(2026-09-04): 배경 실패 표시·우회 재시도의 근거
    listQueuedWorldShotJobs(projectId),
    // 서버 초안이 자리 때문에 건너뛴 칸의 축 — 화면은 내 한도에 막힌 칸만 이어 그린다(2026-10-27 디자이너 QA 1차 #06).
    //   기록을 못 읽어도 상태 조회는 막지 않는다(빈 값이면 모든 빈칸을 내 한도로 본다).
    listCapacitySkips(projectId).catch(() => ({})),
    // 소품 그림(D7 2026-11-22) — 카드 "그림 실패" 표시 · 서버가 그리는 중인 소품. 배경과 같은 규칙.
    //   소품 기록을 못 읽어도 인물 · 배경 상태 조회는 막지 않는다(빈 값 = 실패 · 대기 없음으로 본다).
    listFailedPropImageJobs(projectId).catch(() => []),
    listQueuedPropImageJobs(projectId).catch(() => []),
    // Artist 새 흐름(m1126 O1): 그림을 그리기 시작했는가 — 아니면 화면이 그림체와 [만들기]를 보인다. 모르면 null.
    artistImagesStarted(projectId),
  ])
  return NextResponse.json({ failures, queuedMain, worldFailures, queuedWorld, capacitySkips, propFailures, queuedProps, imagesStarted })
}
