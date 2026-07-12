// 턴어라운드 시트 → 대표 포트레이트 크롭 (server-only, sharp).
//
// 사람 캐릭터의 view_main 은 캐릭터 템플릿(public/character-template.png) 레이아웃을 채운
// 와이드 모델시트다. 좌상단 CHARACTER CONCEPT 박스 내부를 크롭해 카드/칩용 대표 포트레이트로 쓴다.
// 시트가 템플릿 레이아웃을 유지하므로(I2I 프롬프트가 박스 고정 지시) 상대 좌표는 안정적이다.
//
// ⚠️ 템플릿을 교체하면 이 비율도 재실측할 것 — 좌표는 템플릿 v2(스타일 중립 마네킹판,
//   2026-07-12) 원본 3840×2160 실측: 박스 테두리 x 41..1199 / y 41..896, 제목 텍스트 y 74..102
//   → 내부(제목 아래) x 52..1188, y 132..886.
import sharp from 'sharp'

/** CHARACTER CONCEPT 박스 내부의 상대 좌표 (시트 W/H 에 대한 비율). */
export const TURNAROUND_PORTRAIT_REGION = {
  x0: 0.0135,
  y0: 0.0611,
  x1: 0.3094,
  y1: 0.4102,
} as const

/**
 * 시트 버퍼에서 컨셉 포트레이트를 크롭해 PNG 버퍼로.
 *   가드: 시트가 아니면(landscape 가 아니면 — 옛 1:1 정면 포트레이트 등) null 을 반환해
 *   호출자가 원본을 그대로 대표 이미지로 쓰게 한다(엉뚱한 부분 크롭 방지).
 */
export async function cropTurnaroundPortrait(sheet: Buffer): Promise<Buffer | null> {
  const img = sharp(sheet)
  const { width, height } = await img.metadata()
  if (!width || !height) throw new Error('portrait crop: sheet metadata missing')
  if (width / height < 1.4) return null // 시트(≈16:9)가 아님 → 크롭 skip

  const r = TURNAROUND_PORTRAIT_REGION
  const left = Math.round(width * r.x0)
  const top = Math.round(height * r.y0)
  return img
    .extract({
      left,
      top,
      width: Math.round(width * (r.x1 - r.x0)),
      height: Math.round(height * (r.y1 - r.y0)),
    })
    .png()
    .toBuffer()
}
