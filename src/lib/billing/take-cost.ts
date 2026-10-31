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
// 해상도(오너 2026-10-31): 위 계수는 720p 값이다. 1080p 는 두 배. 배수는 모델이 실제로 낼 해상도
//   (effectiveVideoResolution)로 정한다 — 해상도 칸이 없는 모델(Kling O3 Pro)은 1080p 를 골라 두어도 한 배다.
//
// server-only 의존성 금지 — 클라(Director 배지 등)에서도 그대로 import 하는 순수 함수·상수만 둔다.
import { effectiveVideoResolution, type VideoModelKey, type VideoResolution } from '@/lib/video-models'

export const TAKE_COST_BY_MODEL: Record<VideoModelKey, number> = {
  'happy-horse': 1,
  seedance: 5, // v4 확정
  'kling-o3': 5, // 잠정 — 기획 확정 대상
  veo: 5, // 잠정 — 기획 확정 대상
}

/** 해상도별 Take 배수 — 720p 가 기준(1), 1080p 는 두 배(오너 2026-10-31). */
export const TAKE_COST_MULTIPLIER_BY_RESOLUTION: Record<VideoResolution, number> = {
  '720p': 1,
  '1080p': 2,
}

/**
 * 영상 모델의 Take 소모량. 미지/null 모델은 드래프트 기준(1)으로 폴백 — 과소청구보다 안전한 방향.
 * resolution 은 사용자가 고른 값 그대로 넘긴다(없으면 720p) — 모델이 못 내는 값은 여기서 모델 기본값으로 센다.
 */
export function takeCostForVideo(
  modelKey: VideoModelKey | null | undefined,
  resolution?: string | null,
): number {
  if (!modelKey || !(modelKey in TAKE_COST_BY_MODEL)) return 1
  return TAKE_COST_BY_MODEL[modelKey] * TAKE_COST_MULTIPLIER_BY_RESOLUTION[effectiveVideoResolution(modelKey, resolution)]
}

/** 러프 previz 영상(#previz-video)은 항상 드래프트 단가 — happy-horse 고정 모델의 계수와 동일. */
export function takeCostForPreviz(): number {
  return 1
}
