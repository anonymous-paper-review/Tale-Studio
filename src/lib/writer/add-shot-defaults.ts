// [+ 샷 추가] 창이 처음 보여 주는 값 — 창(add-item-dialog)과 더한 샷 채우기(stage/added_shot)가 같이 쓴다.
//   창은 이 값을 그대로 저장하므로, 저장된 값이 이것과 같으면 사람이 고른 값이 아니다(채우기가 앞뒤 샷의 빛을 잇는다 — 오너 2026-11-27 N2).
//   약속: tests/writer/added-shot-fill.test.ts
import type { LightingConfig } from '@/types/shot'

export const ADD_SHOT_START_LIGHTING: Readonly<LightingConfig> = { position: 'front', brightness: 50, colorTemp: 5600 }
