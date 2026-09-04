// 샷 타입(=카메라 프레이밍/초점) 목록 + 설명. board 배지·추가/상세 콤보박스 hover 에서 공유.
//   (이전엔 rough-storyboard-view / add-item-dialog / shot-detail-dialog 에 3중 중복이었음.)
// 설명 문자열은 영어가 base — 렌더 지점에서 t() 로 감싼다(#i18n-s5-batch3).
//   (asset-shot-board 도 참조했으나 2026-08-24 보드 폐기로 소비처에서 빠짐.)

import type { ShotType } from '@/types'

export const SHOT_TYPES: ShotType[] = [
  'ECU', 'CU', 'MCU', 'MS', 'MFS', 'FS', 'WS', 'EWS', 'OTS', 'POV', 'TRACK', '2S',
]

export const SHOT_TYPE_DESCRIPTIONS: Record<string, string> = {
  ECU: 'Extreme close-up: an extremely narrow area, like an eye or hand',
  CU: 'Close-up: mostly the face',
  MCU: 'Medium close-up: chest and up',
  MS: 'Medium shot: waist and up',
  MFS: 'Medium full shot: knees and up',
  FS: 'Full shot: full body',
  WS: 'Wide shot: the subject and surrounding space',
  EWS: 'Extreme wide shot: vast background, subject small',
  OTS: 'Over-the-shoulder: the other person, over the shoulder',
  POV: "Point of view: through the character's eyes",
  TRACK: 'Tracking shot: moves along with the subject',
  '2S': 'Two shot: two characters in one frame',
}
