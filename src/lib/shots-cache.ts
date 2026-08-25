// shots 읽기의 단일 사물함 — 브라우저 전용.
//
// 왜: writer·director·editor·내보내기가 같은 프로젝트의 shots 를 각자 질의해서
// 각자 들고 있었다(읽기 6곳). 화면을 오갈 때마다 같은 행들을 다시 받았고, 한 화면의
// 편집을 다른 화면이 모르는 "사본 갈림"이 여기서 났다. 이 모듈이 그 여섯 읽기를
// 칸 하나(['shots', projectId])로 합친다 — 30초 신선 기간 안의 재방문·교차 화면
// 진입은 네트워크 없이 답하고, 동시 호출은 한 요청으로 합쳐진다.
//
// 훅이 없는 이유: 여섯 소비처 전부가 store 액션/일반 함수다(컴포넌트가 아님).
// fetchQuery 기반의 명령형 진입만 두고, 화면이 직접 구독할 일이 생기면 그때
// useQuery 래퍼를 추가한다 — 지금 만들면 소비처 0인 죽은 코드다.
//
// 쓰기는 여기 없다. 각 store 의 직접 update/insert/delete(RLS owner-write)는
// 그대로 두고, 성공 지점에서 invalidateShots() 로 "이 칸 못 믿겠다"만 표시한다.
// 관찰자가 없는 칸의 무효화는 표시일 뿐이라 공짜고, 다음 loadShots 가 다시 받는다.
//
// 서버(웹훅 finalize·writer 파이프라인)의 shots 접근은 이 모듈과 무관하다 —
// 그쪽은 supabaseAdmin 이고, 캐시는 브라우저 메모리 층이다.

import { createClient } from '@/lib/supabase/client'
import { getQueryClient } from '@/lib/query-client'
import type { Database } from '@/types/database'

export type ShotRow = Database['public']['Tables']['shots']['Row']

export const shotsKey = (projectId: string) => ['shots', projectId] as const

/** 샷은 편집 중 자주 바뀌는 층 — 캐릭터 시트(5분)보다 짧게. */
const SHOTS_STALE_MS = 30_000

async function fetchShots(projectId: string): Promise<ShotRow[]> {
  const { data, error } = await createClient()
    .from('shots')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as ShotRow[]
}

/**
 * 프로젝트의 shots 전체 행. 칸이 신선하면(30초) 네트워크 없이 즉답하고,
 * 아니면 한 번 받아서 칸을 채운다. 동시 호출은 자동으로 한 요청으로 합쳐진다.
 *
 * 전체 행(select *)인 이유: writer·editor 가 이미 전체 행을 받고 있었고,
 * 나머지 소비처의 부분집합은 전체 행의 진부분집합이다. 칸을 소비처별로 쪼개면
 * "같은 진실의 사본"이 다시 생긴다 — 각자 필요한 열만 골라 쓰는 것은 소비처 몫.
 */
export function loadShots(projectId: string): Promise<ShotRow[]> {
  return getQueryClient().fetchQuery({
    queryKey: shotsKey(projectId),
    queryFn: () => fetchShots(projectId),
    staleTime: SHOTS_STALE_MS,
  })
}

/**
 * 칸을 낡음으로 표시한다 — 쓰기 성공 직후, 그리고 "생성이 끝났다"를 안 순간에.
 * 다음 loadShots 가 신선 기간과 무관하게 다시 받는다.
 */
export function invalidateShots(projectId: string): Promise<void> {
  return getQueryClient().invalidateQueries({ queryKey: shotsKey(projectId) })
}

/** supabase 의 { data, error } 반환 모양이 필요한 자리(기존 Promise.all 다리)용 어댑터.
 *  옛 코드의 오류 처리 분기를 바꾸지 않고 다리만 갈아끼우게 한다. */
export function loadShotsResult(
  projectId: string,
): Promise<{ data: ShotRow[] | null; error: { message: string } | null }> {
  return loadShots(projectId).then(
    (data) => ({ data, error: null }),
    (err) => ({
      data: null,
      // supabase 오류는 Error 인스턴스가 아니라 { message } 일반 객체다 — 둘 다 받는다.
      error: {
        message:
          err instanceof Error
            ? err.message
            : typeof (err as { message?: unknown })?.message === 'string'
              ? (err as { message: string }).message
              : String(err),
      },
    }),
  )
}
