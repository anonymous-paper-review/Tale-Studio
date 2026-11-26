// Storyboard 지난 판 [채택](오너 2026-11-26 S3) — Director 상세와 같은 이미지 판 고르기 길(POST /api/director/storyboard-image/version,
//   다시 그리지 않는다 · Take 0)로 그 판을 지금 그림으로 만들고, Storyboard 카드 그림(useStoryboardRealImages)을 새로 읽어 바로 바뀌게 한다.
//   Director 캔버스 스토어는 쓰지 않는다 — Storyboard 는 shots 사물함을 읽는다(Director 는 들어갈 때 DB 에서 다시 읽는다).
//   약속: tests/writer/real-history.test.ts
import { useStoryboardRealImages } from '@/lib/storyboard/real-images-store'

/** 고르면 true. 서버가 받지 않으면(없는 판 · 권한 · 오류) false — 카드 그림은 그대로다. */
export async function adoptStoryboardVersion(projectId: string, shotId: string, versionId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/director/storyboard-image/version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, writerShotId: shotId, versionId }),
    })
    if (!res.ok) return false
  } catch {
    return false
  }
  // 끝난 순간의 사물함은 옛 행이라 낡음으로 표시하고 다시 받는다(실사 작업이 끝날 때와 같은 길).
  await useStoryboardRealImages.getState().load(projectId, { fresh: true })
  return true
}
