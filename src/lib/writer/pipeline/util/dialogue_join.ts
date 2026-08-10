// 샷 ↔ 대사 조인 (#dialogue-join 2026-08-10) — persist 와 duration 재배분의 공용 진실.
//
// 문제(f32b3f50 실측): 대사 트랙은 **데쿠파주 id 공간**에 키가 잡힌다(dialogue 스테이지 입력이
//   decoupage 이므로). 그런데 shotCheck Step 3 가 분할을 적용한 뒤 시퀀스를 *위치 기준*으로
//   shot_1..N 으로 리넘버한다 — 분할이 하나라도 있으면 그 지점 이후 모든 id 가 한 칸씩 밀린다.
//   최종 shot_id 로 조인하면 137 조인가능 샷 중 98샷이 다른 씬의 대사를 물었고 68라인 중 48라인이
//   엉뚱한 샷에 붙었다.
// 해법: 리넘버 전 id(source_shot_id)로 조인한다. 같은 부모에서 갈라진 형제는 **첫 자식만** 대사를
//   상속한다 — design_ref/static_spec 의 첫-자식-만 상속과 같은 이디엄(F2 형제 중복 방지).
//   부모의 대사를 두 자식에 복제하면 같은 말을 두 번 하게 된다.
import type { DialogueTrack, ShotDialogue, ShotSequenceItem } from '@/lib/writer/types/pipeline'

/**
 * 최종 shot_id → 그 샷이 말할 대사. 반환 맵의 키는 **최종 시퀀스의 shot_id** 라
 * 소비자는 종전처럼 `map.get(shot.shot_id)` 로 쓰면 된다.
 *
 * 하위호환: source_shot_id 가 없는 시퀀스(이 필드 도입 전 state 의 resume)는 샷별로
 * 자기 shot_id 를 조인 키로 쓴다 = 종전 동작(직접 id 조인)과 완전히 동일하다.
 */
export function buildShotDialogueMap(
  shots: ShotSequenceItem[],
  dialogue: DialogueTrack | null | undefined,
): Map<string, ShotDialogue> {
  const bySourceId = new Map<string, ShotDialogue>()
  for (const sc of dialogue?.scenes ?? []) {
    for (const sh of sc.shots) bySourceId.set(sh.shot_id, sh)
  }
  const out = new Map<string, ShotDialogue>()
  if (bySourceId.size === 0) return out

  const claimed = new Set<string>()
  for (const shot of shots) {
    const sourceId = shot.source_shot_id ?? shot.shot_id
    if (claimed.has(sourceId)) continue // 형제 중복 방지 — 위치상 첫 자식만 상속
    const found = bySourceId.get(sourceId)
    if (!found) continue
    claimed.add(sourceId)
    out.set(shot.shot_id, found)
  }
  return out
}
