// 채팅 수정 명령의 샷 id 결정론 해석(#p4-understand A2, 2026-08-06).
//   LLM 이 낸 id 가 실재하지 않을 때 — 임의 무시(침묵 no-op) 대신 제품 레이어가 관용 해석:
//   ① 레거시 상호 변환(shot_N ↔ sh_XX_NN — 구 프로젝트 혼재 체계), ② 위치형("scene2 shot3",
//   "씬2 샷3"). 해석 실패는 null — 호출자가 skipped 로 표면화한다(#p4-understand B).
//   오너 2026-11-02 "전체 번호로 통일": 그냥 "샷 8"·"Shot 8"·shot_8 은 보드 전체 번호다(id 숫자가 아니라 지금 순서).
//   "씬2 샷5"는 보드 Shot 5(그 씬에 있을 때)와 그 씬의 다섯 번째 샷 두 가지로 읽힌다 — 둘 다 되고 서로 다르면 고르지 않고
//   ambiguous 로 돌려 묻게 한다(2026-11-02 리뷰 M3). "3번째"처럼 씬 안 자리를 분명히 말하거나 보드 이름("Scene 2 · Shot 3")을
//   그대로 쓰면 한 가지로 읽는다. 약속: tests/writer/chat-id-resolve.test.ts · tests/writer/chat-shot-ambiguity.test.ts

export interface ResolvableShot {
  shotId: string
  sceneId: string
}

export type ChatShotRef =
  | { kind: 'shot'; shotId: string }
  /** 보드 번호로 읽은 샷, 씬 안 자리로 읽은 샷 — 어느 쪽인지 사용자에게 묻는다. */
  | { kind: 'ambiguous'; shotIds: [string, string] }

export function resolveChatShotRef(shots: ResolvableShot[], raw: string): ChatShotRef | null {
  const id = raw.trim()
  if (!id) return null
  if (shots.some((s) => s.shotId === id)) return { kind: 'shot', shotId: id }

  // 보드 순서 — 씬 등장 순서 → 그 씬 안 샷 순서(보드 카드와 같은 셈).
  const sceneOrder: string[] = []
  for (const s of shots) if (!sceneOrder.includes(s.sceneId)) sceneOrder.push(s.sceneId)
  const board = sceneOrder.flatMap((sceneId) => shots.filter((s) => s.sceneId === sceneId))

  // 그냥 샷 번호(shot_7 · "Shot 7" · "샷 7") → 보드 전체 번호. 보드에 없으면 레거시 id 숫자(sh_XX_07)로.
  const bare = /^(?:shot|샷)\s*[_-]?\s*0*(\d{1,3})$/i.exec(id)
  if (bare) {
    const n = parseInt(bare[1], 10)
    const byBoard = board[n - 1]
    if (byBoard) return { kind: 'shot', shotId: byBoard.shotId }
    const nn = String(n).padStart(2, '0')
    const hit = shots.find((s) => new RegExp(`^sh_\\d{2}_${nn}$`).test(s.shotId))
    if (hit) return { kind: 'shot', shotId: hit.shotId }
  }
  // 메인 → 레거시: sh_02_07 → shot_7 (구 프로젝트 행)
  const main = /^sh_\d{2}_(\d{1,3})$/i.exec(id)
  if (main) {
    const hit = shots.find((s) => s.shotId === `shot_${parseInt(main[1], 10)}`)
    if (hit) return { kind: 'shot', shotId: hit.shotId }
  }
  // 보드 이름 그대로("Scene 2 · Shot 3") — 그 씬에 있는 보드 Shot 3 만.
  const label = /^scene\s*0*(\d+)\s*·\s*shot\s*0*(\d+)$/i.exec(id)
  if (label) {
    const shot = board[parseInt(label[2], 10) - 1]
    return shot && shot.sceneId === sceneOrder[parseInt(label[1], 10) - 1] ? { kind: 'shot', shotId: shot.shotId } : null
  }
  // 위치형: "scene2 shot3" / "씬2 샷3" / "sc_02 3번째"
  const pos = /(?:scene|씬|sc)\s*[_-]?0*(\d+)\D+?(?:shot|샷)?\s*[_-]?0*(\d+)/i.exec(id)
  if (pos) {
    const sceneId = sceneOrder[parseInt(pos[1], 10) - 1]
    const n = parseInt(pos[2], 10)
    if (sceneId) {
      const inScene = shots.filter((s) => s.sceneId === sceneId)[n - 1]
      // "3번째" · "3rd" 처럼 씬 안 자리를 분명히 말하면 보드 번호로 읽지 않는다.
      const position = /번째|\d\s*(?:st|nd|rd|th)\b/i.test(id.slice(pos.index))
      const onBoard = position ? undefined : board[n - 1]
      const boardHere = onBoard && onBoard.sceneId === sceneId ? onBoard : undefined
      if (inScene && boardHere && inScene.shotId !== boardHere.shotId) return { kind: 'ambiguous', shotIds: [boardHere.shotId, inScene.shotId] }
      const pick = boardHere ?? inScene
      if (pick) return { kind: 'shot', shotId: pick.shotId }
    }
  }
  return null
}

/** 한 샷으로 정해질 때만 그 id — 못 찾거나 두 샷으로 읽히면 null(고르지 않는다). */
export function resolveChatShotId(shots: ResolvableShot[], raw: string): string | null {
  const ref = resolveChatShotRef(shots, raw)
  return ref?.kind === 'shot' ? ref.shotId : null
}
