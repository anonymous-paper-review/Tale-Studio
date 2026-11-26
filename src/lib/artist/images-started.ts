// Artist 그림을 그리기 시작했는가(m1126 O1 · 리드 2026-11-26 2차 — Artist 새 흐름).
//   인물 시트 · 배경 · 소품 그림 작업(generation_jobs)이 한 번이라도 있었으면 참 — 그리는 중 · 다 그림 · 실패 모두.
//   사람이 레퍼런스로 올려 그대로 쓰는 그림은 작업이 없어 거짓으로 남는다(그래도 아직 [만들기] 전이다).
//   읽지 못하면 null(모름) — 화면은 그림이 있는지로만 가리고 [만들기] 단추는 상태를 읽을 때까지 꺼 둔다.
//   service role 전용(generation_jobs 는 화면이 직접 못 읽는다). 약속: tests/artist/make-images-flow.test.ts
import { supabaseAdmin } from '@/lib/supabase/admin'

/** Artist 가 그리는 그림 작업 종류 — 인물 시트 · 배경 · 소품. */
export const ARTIST_IMAGE_JOB_KINDS = ['character_view', 'world_shot', 'prop_image'] as const

export async function artistImagesStarted(projectId: string): Promise<boolean | null> {
  try {
    const { count, error } = await supabaseAdmin
      .from('generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .in('kind', [...ARTIST_IMAGE_JOB_KINDS])
      .limit(1)
    if (error) return null
    return (count ?? 0) > 0
  } catch {
    return null
  }
}
