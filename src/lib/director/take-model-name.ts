// Take 판에 보일 모델 이름(리드 2026-11-22 결정 ① · fb-camera 발견) — 그 영상을 실제로 낸 작업의 모델(Take 목록 made_model → 영상 노드
//   madeModel, fb-video)을 먼저 쓰고, 없으면(다시 만드는 중 · 다시 만들기 실패 · MiniMax 대체 · 작업 기록 없는 옛 Take) 지금처럼
//   Take 설정 → 샷 기본 모델. Cinema 이력 판과 Director 샷 상세의 Take 목록이 같이 쓴다.
//   다음 Take 의 모델(takeSettings — [영상 만들기] · [다시 만들기] · 일괄)은 바꾸지 않는다(보이는 이름만 맞춘다).
//   약속: tests/camera/take-model-name.test.ts
import { takeSettings } from '@/lib/director/remake-take'
import { isVideoModelKey, type VideoModelKey } from '@/lib/video-models'
import type { ShotNodeData, VideoNodeData } from '@/types/director'

export function takeShownModel(
  shot: Pick<ShotNodeData, 'provider'>,
  take: Pick<VideoNodeData, 'override' | 'madeModel'> | null,
): VideoModelKey {
  return isVideoModelKey(take?.madeModel) ? take.madeModel : takeSettings(shot, take).model
}
