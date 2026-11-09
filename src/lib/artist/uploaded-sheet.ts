// 브레이크다운에서 올린 인물 그림을 캐릭터 시트 틀에 담는 자리(오너 2026-11-10 "인물 이미지 입력하면 … 캐릭터 시트에 담아서 제공해줘.
//   (빈 곳은 그대로 놔둠)"). 시트는 카드에 보이는 모습일 뿐 새 그림 파일이 아니다 — 뒤 단계는 올린 원본을 그대로 쓴다.
//   칸 좌표는 시트 양식 v4(sheet-template)가 정본이다. 약속: tests/artist/uploaded-sheet.test.ts
import { CHARACTER_SHEET_SPEC, turnaroundSlots } from '@/lib/artist/sheet-template'

export type UploadedSheetTile = 'portrait' | 'front'

/** 세로가 가로의 이만큼 이상이면 전신 그림으로 보고 턴어라운드 앞 칸에 담는다. */
const FULL_BODY_RATIO = 1.4

/** 올린 그림을 담을 칸 — 세로로 긴(전신) 그림은 턴어라운드 앞(FRONT), 그 밖(얼굴 · 상반신 · 가로 그림)은 대표(PORTRAIT). */
export function uploadedSheetTile(width: number, height: number): UploadedSheetTile {
  return width > 0 && height / width >= FULL_BODY_RATIO ? 'front' : 'portrait'
}

const pct = (value: number, of: number) => Number(((value / of) * 100).toFixed(3))

/** 그 칸 안쪽 자리(시트 대비 %) — 칸 테두리 · 이름 띠(대표 칸 위 · 턴어라운드 아래 FRONT 글자)를 피한다. */
export function uploadedSheetBox(tile: UploadedSheetTile): { left: number; top: number; width: number; height: number } {
  const { width: W, height: H } = CHARACTER_SHEET_SPEC.canvas
  if (tile === 'front') {
    const slot = turnaroundSlots()[0]
    return { left: pct(slot.x, W), top: pct(slot.y, H), width: pct(slot.w, W), height: pct(slot.h - 28, H) }
  }
  const p = CHARACTER_SHEET_SPEC.portrait
  return { left: pct(p.x + 4, W), top: pct(p.y + 26, H), width: pct(p.w - 8, W), height: pct(p.h - 30, H) }
}
