// shots.storyboard_image 읽고 바꿔 쓰기(서버 전용, 디자이너 11/13 D6 · 오너 2026-11-14 답 5번) — 버전 목록이 생겨 쓰기가 "덮기"에서
//   "읽고 덧붙이기"가 됐다. 두 쓰기가 겹치면(그림이 끝나는 순간 v1 을 고르는 등) 뒤 쓰기가 앞 쓰기를 덮어 버전을 잃을 수 있어,
//   JSON 안 rev 가 읽은 때와 같을 때만 쓰고 아니면 다시 읽고 쓴다. 약속: tests/director/image-versions-store.test.ts
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { StoryboardImage } from '@/types/director'

const MAX_TRIES = 5

/**
 * 샷의 storyboard_image 를 change 로 바꿔 쓴다. change 가 null 을 돌려주면 쓰지 않는다.
 * 샷이 없으면(만드는 사이 지운 샷) 아무것도 하지 않고 null — 종전처럼 작업 마무리는 그대로 이어 간다.
 */
export async function updateStoryboardImage(
  projectId: string,
  writerShotId: string,
  change: (current: StoryboardImage | null) => StoryboardImage | null,
): Promise<StoryboardImage | null> {
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('shots')
      .select('storyboard_image')
      .eq('project_id', projectId)
      .eq('shot_id', writerShotId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const current = ((data as { storyboard_image?: unknown }).storyboard_image ?? null) as StoryboardImage | null
    const next = change(current)
    if (!next) return null
    const base = supabaseAdmin
      .from('shots')
      .update({ storyboard_image: next })
      .eq('project_id', projectId)
      .eq('shot_id', writerShotId)
    const guarded = typeof current?.rev === 'number'
      ? base.eq('storyboard_image->>rev', String(current.rev))
      : base.is('storyboard_image->>rev', null)
    const { data: written, error: writeError } = await guarded.select('shot_id')
    if (writeError) throw writeError
    if (written?.length) return next
  }
  throw new Error(`storyboard image of ${writerShotId} kept changing; gave up after ${MAX_TRIES} tries`)
}
