// 채팅 수정 명령의 샷 id 결정론 해석(#p4-understand A2, 2026-08-06).
//   LLM 이 낸 id 가 실재하지 않을 때 — 임의 무시(침묵 no-op) 대신 제품 레이어가 관용 해석:
//   ① 레거시 상호 변환(shot_N ↔ sh_XX_NN — 구 프로젝트 혼재 체계), ② 위치형("scene2 shot3",
//   "씬2 샷3"). 해석 실패는 null — 호출자가 skipped 로 표면화한다(#p4-understand B).

export interface ResolvableShot {
  shotId: string
  sceneId: string
}

export function resolveChatShotId(shots: ResolvableShot[], raw: string): string | null {
  const id = raw.trim()
  if (!id) return null
  if (shots.some((s) => s.shotId === id)) return id

  // 레거시 → 메인: shot_7 → sh_XX_07 (전역 번호 일치하는 메인 id)
  const legacy = /^shot[_-]?(\d{1,3})$/i.exec(id)
  if (legacy) {
    const n = String(parseInt(legacy[1], 10)).padStart(2, '0')
    const hit = shots.find((s) => new RegExp(`^sh_\\d{2}_${n}$`).test(s.shotId))
    if (hit) return hit.shotId
  }
  // 메인 → 레거시: sh_02_07 → shot_7 (구 프로젝트 행)
  const main = /^sh_\d{2}_(\d{1,3})$/i.exec(id)
  if (main) {
    const hit = shots.find((s) => s.shotId === `shot_${parseInt(main[1], 10)}`)
    if (hit) return hit.shotId
  }
  // 위치형: "scene2 shot3" / "씬2 샷3" / "sc_02 3번째" — 씬 등장 순서 × 씬 내 순서
  const pos = /(?:scene|씬|sc)\s*[_-]?0*(\d+)\D+?(?:shot|샷)?\s*[_-]?0*(\d+)/i.exec(id)
  if (pos) {
    const sceneIdx = parseInt(pos[1], 10) - 1
    const shotIdx = parseInt(pos[2], 10) - 1
    const sceneOrder: string[] = []
    for (const s of shots) if (!sceneOrder.includes(s.sceneId)) sceneOrder.push(s.sceneId)
    const sceneId = sceneOrder[sceneIdx]
    if (sceneId) {
      const inScene = shots.filter((s) => s.sceneId === sceneId)
      if (inScene[shotIdx]) return inScene[shotIdx].shotId
    }
  }
  return null
}
