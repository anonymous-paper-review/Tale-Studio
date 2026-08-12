// 핸드오프 넛지 재노출 게이트 (#handoff-once 2026-08-12).
//
// "한 번 수락하면 다시는 안 뜨게 (DB에 기록)" — 새 플래그를 만들지 않는다. 수락의 진실은
//   이미 DB 에 있다: projects.current_stage 에서 복원되는 reachedStage 가 다음 스테이지를
//   지났다는 것이 곧 "그 핸드오프는 수락됐다"이다 (architecture §0: 파생 가능한 값은 저장하지
//   않는다). 탭을 오가도, 새로고침해도, 기기가 바뀌어도 같은 답이 나온다.
//
// 사용: 각 스테이지의 핸드오프 제안 effect 가 발화 전에 이 판별을 통과해야 한다.
//   채팅에 직접 "Writer로 넘겨줘"라고 쓰는 경로는 영향 없음 — 넛지(제안 버튼)만 조용해진다.

import { STAGES } from '@/lib/constants'
import type { StageId } from '@/types'

const ORDER = STAGES.map((s) => s.id as StageId)

/**
 * from 스테이지의 핸드오프 넛지를 띄워도 되는가.
 * reachedStage(DB projects.current_stage 복원값)가 from 의 다음 스테이지 이상이면
 * 이미 수락된 핸드오프다 — 다시 권하지 않는다.
 */
export function shouldOfferHandoffNudge(from: StageId, reachedStage: StageId): boolean {
  const fromIdx = ORDER.indexOf(from)
  const reachedIdx = ORDER.indexOf(reachedStage)
  if (fromIdx === -1 || reachedIdx === -1) return true // 모르는 값이면 막지 않는다
  return reachedIdx <= fromIdx
}
