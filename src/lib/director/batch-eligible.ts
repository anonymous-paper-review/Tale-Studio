// 서버가 고르는 "아직 영상이 없는 샷" — 순수 함수. DB 행만 받아 판정한다.
//
// #batch-resume(2026-09-09) 슬라이스 C: 화면 기준(eligibleVideoBatchShotIds)은 캔버스 노드를
//   보는데 서버에는 노드가 없다. 기준이 어긋나면 서버가 이미 만든 샷을 또 만들거나(Take 낭비)
//   남은 샷을 건너뛴다. 그래서 같은 두 조건을 DB 행으로 그대로 옮긴다:
//     ① 완성돼서 재생 가능한 영상이 있나 (status='completed' + url 있음)
//     ② 만드는 중인 영상이 있나 (status 또는 last_attempt_status 가 'generating')
//   둘 중 하나라도 참이면 그 샷은 제외한다.

export interface ShotVideoRow {
  shot_id: string
  status: string | null
  url: string | null
  last_attempt_status: string | null
  deleted_at: string | null
}

/**
 * @param shotIds 이 프로젝트의 샷 — 순서를 그대로 지킨다(일괄은 앞에서부터 낸다).
 * @param clips   그 샷들에 딸린 영상 행.
 */
export function eligibleShotIdsFromRows(
  shotIds: readonly string[],
  clips: readonly ShotVideoRow[],
): string[] {
  const blocked = new Set<string>()
  for (const clip of clips) {
    // 지운 영상은 없는 것으로 본다.
    if (clip.deleted_at) continue

    const playable =
      clip.status === 'completed' && typeof clip.url === 'string' && clip.url.trim().length > 0
    const generating =
      clip.status === 'generating' || clip.last_attempt_status === 'generating'

    if (playable || generating) blocked.add(clip.shot_id)
  }
  return shotIds.filter((shotId) => !blocked.has(shotId))
}
