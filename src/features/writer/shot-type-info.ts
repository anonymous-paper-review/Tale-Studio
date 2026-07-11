// 샷 타입(=카메라 프레이밍/초점) 목록 + 설명. board 배지·추가/상세 콤보박스 hover 에서 공유.
//   (이전엔 rough-storyboard-view / add-item-dialog / shot-detail-dialog 에 3중 중복이었음.)

import type { ShotType } from '@/types'

export const SHOT_TYPES: ShotType[] = [
  'ECU', 'CU', 'MCU', 'MS', 'MFS', 'FS', 'WS', 'EWS', 'OTS', 'POV', 'TRACK', '2S',
]

export const SHOT_TYPE_DESCRIPTIONS: Record<string, string> = {
  ECU: 'Extreme close-up — 눈·손처럼 아주 좁은 부분만',
  CU: 'Close-up — 얼굴 위주',
  MCU: 'Medium close-up — 가슴 위',
  MS: 'Medium shot — 허리 위',
  MFS: 'Medium full shot — 무릎 위',
  FS: 'Full shot — 전신',
  WS: 'Wide shot — 인물과 주변 공간',
  EWS: 'Extreme wide shot — 광활한 배경, 인물은 작게',
  OTS: 'Over-the-shoulder — 어깨 너머로 상대를',
  POV: 'Point of view — 인물의 시점',
  TRACK: 'Tracking shot — 피사체를 따라 이동',
  '2S': 'Two shot — 인물 둘을 한 프레임에',
}
