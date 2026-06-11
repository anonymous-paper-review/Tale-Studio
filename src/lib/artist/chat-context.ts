// Artist 채팅 작업공간 인식(workspace awareness) 컨텍스트 빌더 — chat-aware-regeneration.
//
// 설계: 채팅은 이벤트를 push로 받지 않는다. 매 요청 시점에 generation_jobs(활동 로그)를
//   pull로 읽어 "누가(ui/chat/writer) 언제 무엇을 생성/재생성했고 지금 뭐가 진행 중인지"를
//   시스템 컨텍스트로 주입한다. 진실은 DB 한 곳 — 별도 이벤트 버스/파일 없음.
// server-only (supabaseAdmin 경유) — API 라우트에서만 import.
import {
  listRecentGenerationJobs,
  type GenerationJob,
  type GenerationJobActor,
} from '@/lib/generation-jobs'

const ACTOR_LABEL: Record<GenerationJobActor, string> = {
  ui: 'ui',     // 유저가 카드/다이얼로그에서 직접
  chat: 'chat', // 글로벌 채팅 updates 경유
  writer: 'writer', // 핸드오프 파이프라인 자동 생성
}

function relativeTime(iso: string): string {
  const raw = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(raw)) return '시각 미상'
  const diffMs = Math.max(0, raw) // DB now() ↔ 서버리스 인스턴스 시계 오차 음수 클램프
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.floor(hr / 24)}일 전`
}

function describeTarget(job: GenerationJob): string {
  const t = job.target
  if (job.kind === 'character_view' && t.characterId) {
    return `캐릭터 ${t.characterId} ${t.view ?? ''} 뷰`.trim()
  }
  if (job.kind === 'world_shot' && t.locationId) {
    return `장소 ${t.locationId} ${t.column ?? ''}`.trim()
  }
  if (t.shotId || t.writerShotId) return `샷 ${t.shotId ?? t.writerShotId}`
  return job.kind
}

function describeStatus(job: GenerationJob): string {
  switch (job.status) {
    case 'queued':
      return '진행 중'
    case 'completed':
      return '완료'
    case 'failed':
      return `실패${job.error ? ` (${job.error.slice(0, 80)})` : ''}`
  }
}

/**
 * 최근 생성 활동 로그 섹션을 직렬화한다. 잡이 없으면 빈 문자열 (섹션 생략).
 * 예: `- 3분 전 [ui] 캐릭터 char_woman main 뷰 — 진행 중`
 */
export async function buildArtistActivityContext(
  projectId: string,
  limit = 12,
): Promise<string> {
  const jobs = await listRecentGenerationJobs(projectId, limit)
  if (jobs.length === 0) return ''

  const lines = jobs.map(
    (j) =>
      `- ${relativeTime(j.created_at)} [${ACTOR_LABEL[j.actor ?? 'ui']}] ${describeTarget(j)} — ${describeStatus(j)}`,
  )
  return ['## 최근 생성 활동 (최신순)', ...lines].join('\n')
}
