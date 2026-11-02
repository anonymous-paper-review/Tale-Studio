// 채팅 수정 명령의 샷 id 결정론 해석(#p4-understand A2, 2026-08-06).
//   LLM 이 낸 id 가 실재하지 않을 때 — 임의 무시(침묵 no-op) 대신 제품 레이어가 관용 해석:
//   ① 레거시 상호 변환(shot_N ↔ sh_XX_NN — 구 프로젝트 혼재 체계), ② 위치형("scene2 shot3",
//   "씬2 샷3"). 해석 실패는 null — 호출자가 skipped 로 표면화한다(#p4-understand B).
//   오너 2026-11-02 "전체 번호로 통일": 말로 쓴 "샷 8"·"Shot 8"은 보드 전체 번호다(id 숫자가 아니라 지금 순서).
//   보드 순서는 보드와 같은 셈(boardShots) — 씬 차례는 보드의 씬 목록이다. 샷 목록에 처음 나온 차례로 세면 끼워 넣은 씬의
//   샷(목록 맨 뒤에 붙는다)이 다른 번호로 풀렸다(2026-11-02 리뷰 3차 M1). id 꼴(shot_7)은 보드 번호로 읽지 않는다(리뷰 3차 L4).
//   "씬2 샷5"는 보드 Shot 5(그 씬에 있을 때)와 그 씬의 다섯 번째 샷 두 가지로 읽힌다 — 둘 다 되고 서로 다르면 고르지 않고
//   ambiguous 로 돌려 묻게 한다(2026-11-02 리뷰 M3). 지우기는 strict — 정확한 id 나 보드 이름으로만 찾는다.
//   약속: tests/writer/chat-id-resolve.test.ts · chat-shot-ambiguity.test.ts · chat-shot-board-order.test.ts
import { boardShots } from '@/lib/writer/board-summary'

export interface ResolvableShot {
  shotId: string
  sceneId: string
}

export type ChatShotRef =
  | { kind: 'shot'; shotId: string }
  /** 보드 번호로 읽은 샷, 씬 안 자리로 읽은 샷 — 어느 쪽인지 사용자에게 묻는다. */
  | { kind: 'ambiguous'; shotIds: [string, string] }

export interface ShotResolveOptions {
  /** 보드의 씬 목록(차례) — 화면에서는 늘 넘긴다. 없으면(옛 호출) 샷 목록에 처음 나온 차례로 센다. */
  manifest?: { scenes: ReadonlyArray<{ sceneId: string }> } | null
  /** 지우기 — 정확한 id 나 보드 이름("Scene 2 · Shot 8" · "Shot 8" · "샷 8")으로만 찾는다. 옛 id 숫자 · 씬 안 자리로는 찾지 않는다. */
  strict?: boolean
}

/** 보드의 씬 차례와 샷 차례 — 보드 카드와 같은 셈. */
function boardOrder(shots: ResolvableShot[], manifest: ShotResolveOptions['manifest']): { sceneOrder: string[]; board: ResolvableShot[] } {
  if (manifest) {
    return { sceneOrder: manifest.scenes.map((scene) => scene.sceneId), board: boardShots(manifest, shots).map((entry) => entry.shot) }
  }
  const sceneOrder: string[] = []
  for (const s of shots) if (!sceneOrder.includes(s.sceneId)) sceneOrder.push(s.sceneId)
  return { sceneOrder, board: sceneOrder.flatMap((sceneId) => shots.filter((s) => s.sceneId === sceneId)) }
}

export function resolveChatShotRef(shots: ResolvableShot[], raw: string, opts: ShotResolveOptions = {}): ChatShotRef | null {
  const id = raw.trim()
  if (!id) return null
  if (shots.some((s) => s.shotId === id)) return { kind: 'shot', shotId: id }
  const { sceneOrder, board } = boardOrder(shots, opts.manifest)

  // 말로 쓴 샷 번호("Shot 7" · "샷 7") → 보드 전체 번호.
  const words = /^(?:shot\s+|샷\s*)0*(\d{1,3})$/i.exec(id)
  if (words) {
    const shot = board[parseInt(words[1], 10) - 1]
    return shot ? { kind: 'shot', shotId: shot.shotId } : null
  }
  // 보드 이름 그대로("Scene 2 · Shot 3") — 그 씬에 있는 보드 Shot 3 만.
  const label = /^scene\s*0*(\d+)\s*·\s*shot\s*0*(\d+)$/i.exec(id)
  if (label) {
    const shot = board[parseInt(label[2], 10) - 1]
    return shot && shot.sceneId === sceneOrder[parseInt(label[1], 10) - 1] ? { kind: 'shot', shotId: shot.shotId } : null
  }
  if (opts.strict) return null

  // 레거시 → 메인: shot_7 → sh_XX_07 (id 숫자가 같은 메인 id). 보드 번호로는 읽지 않는다.
  const legacy = /^shot[_-]?0*(\d{1,3})$/i.exec(id)
  if (legacy) {
    const n = String(parseInt(legacy[1], 10)).padStart(2, '0')
    const hit = shots.find((s) => new RegExp(`^sh_\\d{2}_${n}$`).test(s.shotId))
    return hit ? { kind: 'shot', shotId: hit.shotId } : null
  }
  // 메인 → 레거시: sh_02_07 → shot_7 (구 프로젝트 행)
  const main = /^sh_\d{2}_(\d{1,3})$/i.exec(id)
  if (main) {
    const hit = shots.find((s) => s.shotId === `shot_${parseInt(main[1], 10)}`)
    if (hit) return { kind: 'shot', shotId: hit.shotId }
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
export function resolveChatShotId(shots: ResolvableShot[], raw: string, opts: ShotResolveOptions = {}): string | null {
  const ref = resolveChatShotRef(shots, raw, opts)
  return ref?.kind === 'shot' ? ref.shotId : null
}
