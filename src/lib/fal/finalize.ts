// 완료된 FAL 결과를 영속화 (webhook 핸들러 + poll reconcile 양쪽에서 공유).
//
// 캐릭터 뷰: FAL 이미지 URL → 바이트 회수 → Supabase storage 업로드 → characters 컬럼 갱신.
//            (옛 동기 generate-sheet 라우트의 3~4단계를 그대로 서버사이드로 이동)
// 샷 영상:   FAL 영상 URL → shots.video_url 갱신(writerShotId 있을 때만) + job 완료.
//
// 멱등성: webhook은 같은 request_id를 재전송할 수 있다(2시간 10회). 호출 전 job.status==='queued'
//         가드(호출부)로 1차 차단하고, storage upsert/컬럼 update는 동일 결과라 재실행돼도 무해.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { completeGenerationJob, type GenerationJob } from '@/lib/generation-jobs'

/** 캐릭터 뷰 이미지 영속화 → 저장된 publicUrl 반환. */
export async function finalizeCharacterViewJob(
  job: GenerationJob,
  falImageUrl: string,
): Promise<string> {
  const { workspaceId, characterId, column } = job.target
  if (!workspaceId || !characterId || !column) {
    throw new Error('character_view job target missing workspaceId/characterId/column')
  }

  const imgRes = await fetch(falImageUrl)
  if (!imgRes.ok) throw new Error(`fal image fetch failed: ${imgRes.status}`)
  const buf = Buffer.from(await imgRes.arrayBuffer())

  const path = `${workspaceId}/${job.project_id}/characters/${characterId}_${column}.png`
  const { error: upErr } = await supabaseAdmin.storage
    .from('media')
    .upload(path, buf, { contentType: 'image/png', upsert: true })
  if (upErr) throw upErr
  const publicUrl = supabaseAdmin.storage.from('media').getPublicUrl(path).data
    .publicUrl

  const { error: updErr } = await supabaseAdmin
    .from('characters')
    .update({ [column]: publicUrl })
    .eq('project_id', job.project_id)
    .eq('character_id', characterId)
  if (updErr) throw updErr

  await completeGenerationJob(job.id, publicUrl)
  return publicUrl
}

/** 공통: 원격 이미지 바이트 회수 → media 스토리지 업로드 → publicUrl. */
export async function uploadImageFromUrl(
  remoteUrl: string,
  path: string,
): Promise<string> {
  const imgRes = await fetch(remoteUrl)
  if (!imgRes.ok) throw new Error(`fal image fetch failed: ${imgRes.status}`)
  const buf = Buffer.from(await imgRes.arrayBuffer())
  const { error: upErr } = await supabaseAdmin.storage
    .from('media')
    .upload(path, buf, { contentType: 'image/png', upsert: true })
  if (upErr) throw upErr
  return supabaseAdmin.storage.from('media').getPublicUrl(path).data.publicUrl
}

/** 월드 샷(wide/establishing) 이미지 영속화 → locations[column] 갱신. */
export async function finalizeWorldShotJob(
  job: GenerationJob,
  falImageUrl: string,
): Promise<string> {
  const { workspaceId, locationId, column } = job.target
  if (!workspaceId || !locationId || !column) {
    throw new Error('world_shot job target missing workspaceId/locationId/column')
  }
  const path = `${workspaceId}/${job.project_id}/locations/${locationId}_${column}.png`
  const publicUrl = await uploadImageFromUrl(falImageUrl, path)

  const { error } = await supabaseAdmin
    .from('locations')
    .update({ [column]: publicUrl })
    .eq('project_id', job.project_id)
    .eq('location_id', locationId)
  if (error) throw error

  await completeGenerationJob(job.id, publicUrl)
  return publicUrl
}

/** 샷 스토리보드 이미지(I2I) 영속화 → shots.storyboard_image(JSONB) 갱신(writerShotId 있을 때). */
export async function finalizeShotStoryboardJob(
  job: GenerationJob,
  falImageUrl: string,
): Promise<string> {
  const { workspaceId, writerShotId } = job.target
  if (!workspaceId || !writerShotId) {
    throw new Error('shot_storyboard job target missing workspaceId/writerShotId')
  }
  const path = `${workspaceId}/${job.project_id}/shots/${writerShotId}_storyboard_image.png`
  const publicUrl = await uploadImageFromUrl(falImageUrl, path)

  // upload-image 라우트와 동일한 JSONB shape (ShotNode/StoryboardGridView가 소비).
  const { error } = await supabaseAdmin
    .from('shots')
    .update({
      storyboard_image: {
        url: publicUrl,
        status: 'completed',
        errorMessage: null,
        generatedAt: Date.now(),
      },
    })
    .eq('project_id', job.project_id)
    .eq('shot_id', writerShotId)
  if (error) throw error

  await completeGenerationJob(job.id, publicUrl)
  return publicUrl
}

/** 러프 스토리보드 패널(writer 탭, mannequin previz) 영속화 → shots.rough_storyboard(JSONB) 갱신. */
export async function finalizeShotRoughStoryboardJob(
  job: GenerationJob,
  falImageUrl: string,
): Promise<string> {
  const { workspaceId, writerShotId } = job.target
  if (!workspaceId || !writerShotId) {
    throw new Error('shot_rough_storyboard job target missing workspaceId/writerShotId')
  }
  const path = `${workspaceId}/${job.project_id}/shots/${writerShotId}_rough_storyboard.png`
  const publicUrl = await uploadImageFromUrl(falImageUrl, path)

  // RoughStoryboardImage shape (src/types/shot.ts — writer 러프 보드가 소비).
  const { error } = await supabaseAdmin
    .from('shots')
    .update({
      rough_storyboard: {
        url: publicUrl,
        status: 'completed',
        errorMessage: null,
        generatedAt: Date.now(),
      },
    })
    .eq('project_id', job.project_id)
    .eq('shot_id', writerShotId)
  if (error) throw error

  await completeGenerationJob(job.id, publicUrl)
  return publicUrl
}

/** 샷 영상 URL 영속화. writerShotId 있으면 shots.video_url 갱신. */
export async function finalizeShotVideoJob(
  job: GenerationJob,
  videoUrl: string,
): Promise<string> {
  const { writerShotId } = job.target
  if (writerShotId) {
    const { error } = await supabaseAdmin
      .from('shots')
      .update({ video_url: videoUrl, updated_at: new Date().toISOString() })
      .eq('project_id', job.project_id)
      .eq('shot_id', writerShotId)
    if (error) throw error
  }
  await completeGenerationJob(job.id, videoUrl)
  return videoUrl
}
