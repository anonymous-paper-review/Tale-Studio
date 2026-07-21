// 러프 스토리보드 그리드 → 샷별 3프레임 크롭 (server-only, sharp) — #rough-grid 2026-07-22.
//
// gpt-image-2/edit 가 채운 그리드/스트립 이미지에서 셀을 잘라 (샷 × [start, direction, end]) 버퍼로.
// 좌표는 템플릿 실측 비례(rough-storyboard-grid.ts) — 출력이 리샘플돼도 종횡비 유지 시 유효.
// 패턴 선례: src/lib/artist/portrait.ts (턴어라운드 시트 비례 크롭).
import sharp from 'sharp'
import { gridGeometry, type RoughGridVariant } from '@/lib/writer/rough-storyboard-grid'

export interface RoughGridFrames {
  start: Buffer
  direction: Buffer
  end: Buffer
}

/**
 * 그리드 버퍼에서 shotCount 개 열의 3프레임을 크롭.
 *   반환 배열 길이 = shotCount (열 순서 = 제출 시 writerShotIds 순서).
 *   shotCount 가 variant 열 수를 넘으면 throw (호출부 버그).
 */
export async function cropRoughGridFrames(
  grid: Buffer,
  variant: RoughGridVariant,
  shotCount: number,
): Promise<RoughGridFrames[]> {
  const { cols, rows } = gridGeometry(variant)
  if (shotCount < 1 || shotCount > cols.length) {
    throw new Error(`rough grid crop: shotCount ${shotCount} out of range for ${variant}`)
  }
  const img = sharp(grid)
  const { width, height } = await img.metadata()
  if (!width || !height) throw new Error('rough grid crop: metadata missing')

  const out: RoughGridFrames[] = []
  for (let c = 0; c < shotCount; c++) {
    const [x0, x1] = cols[c]
    const frames: Buffer[] = []
    for (let r = 0; r < rows.length; r++) {
      const [y0, y1] = rows[r]
      const left = Math.round(width * x0)
      const top = Math.round(height * y0)
      const w = Math.round(width * (x1 - x0))
      const h = Math.round(height * (y1 - y0))
      // sharp 인스턴스는 extract 후 재사용 불가 → 셀마다 새로 연다(버퍼 소스라 비용 미미).
      frames.push(await sharp(grid).extract({ left, top, width: w, height: h }).png().toBuffer())
    }
    out.push({ start: frames[0], direction: frames[1], end: frames[2] })
  }
  return out
}
