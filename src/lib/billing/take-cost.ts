// Take 소모량 계산기 (#payments-phase-2, #gen-quota-atomic-gate) — v4 2_Take경제 계수.
//
// v4 확정(Take는 **영상 전용** — 이미지는 무과금): shot_video/shot_previz_video 잡만 이 계수를
//   소모한다. 클라(생성 전 표시, v4 #2)와 서버(hold 금액)가 반드시 같은 계산기를 쓴다 — 표시가
//   실제 차감과 다르면 "종량제 신뢰"가 깨진다(기획 근거: v4 시트 2_Take경제).
//
// ⚠ 계수 확정 상태: seedance(Seedance 2.0)=5 만 v4 확정값. kling-o3/veo=5 는 **잠정**(기획 확정
//   대상) — 오너가 v4 시트에 최종 숫자를 박으면 이 표만 갱신하면 된다(호출부 변경 불필요).
//   happy-horse=1 은 저해상도 드래프트 모델 기준.
//
// server-only 의존성 금지 — 클라(Director 배지 등)에서도 그대로 import 하는 순수 함수·상수만 둔다.
import type { VideoModelKey } from '@/lib/video-models'

export const TAKE_COST_BY_MODEL: Record<VideoModelKey, number> = {
  'happy-horse': 1,
  seedance: 5, // v4 확정
  'kling-o3': 5, // 잠정 — 기획 확정 대상
  veo: 5, // 잠정 — 기획 확정 대상
}

/** 영상 모델의 Take 소모량. 미지/null 모델은 드래프트 기준(1)으로 폴백 — 과소청구보다 안전한 방향. */
export function takeCostForVideo(modelKey: VideoModelKey | null | undefined): number {
  if (!modelKey || !(modelKey in TAKE_COST_BY_MODEL)) return 1
  return TAKE_COST_BY_MODEL[modelKey]
}

/** 러프 previz 영상(#previz-video)은 항상 드래프트 단가 — happy-horse 고정 모델의 계수와 동일. */
export function takeCostForPreviz(): number {
  return 1
}

/**
 * 실패 후 대체 모델이 만든 영상의 Take 값 — 처음 고른 모델 값과의 차액은 우리가 감당한다(오너 결정 2026-10-12).
 * 미니맥스는 판매하는 모델이 아니라 자기 값이 없다. 생성 원가가 해피홀스보다 낮아서 드래프트 값(1)을 따른다
 * (fal 단가 2026-10-12: 미니맥스 H3 Max $0.03~0.05/초, 해피홀스 $0.14/초).
 */
export function takeCostForVideoFallback(model: 'minimax' | 'happy-horse'): number {
  return model === 'happy-horse' ? TAKE_COST_BY_MODEL['happy-horse'] : 1
}
