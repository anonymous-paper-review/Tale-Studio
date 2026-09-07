// 여러 그림의 내용이 다르면 인물과 장소 그림을 우선하고, 연필 그림은 구도만 따른다
import { describe, expect, it } from 'vitest'
import { assetAuthorityClause, buildRealStripPrompt } from '@/lib/director/storyboard-strip'

// #asset-authority(2026-09-02 오너 실측 bd5da55f): 연필 previz 의 디테일(갑옷·왕관·지형)이 artist 시트를
//   이기며 샷마다 달라지던 것 — 레퍼런스 권위 서열(시트 > 배경 > 연필=구도만)을 프롬프트에 못박는다.
describe('assetAuthorityClause', () => {
  it('인물과 장소 그림이 맡은 내용을 구분하고 연필 그림은 구도만 따른다', () => {
    const c = assetAuthorityClause(2, 1, true, false)
    expect(c).toContain('reference images 2 to 3 are the CHARACTER sheets')
    expect(c).toContain('reference image 4 is the LOCATION reference')
    expect(c).toContain('costume, armor and every worn or carried prop')
    expect(c).toContain('terrain layout, structures, landmark positions')
    expect(c).toContain('A pencil-drawn detail never overrides a sheet')
  })

  it('장소 그림이 없어도 지형과 구조물을 합치거나 옮기거나 새로 만들지 않는다', () => {
    const c = assetAuthorityClause(1, 0, false, false)
    expect(c).toContain('reference image 2 is the CHARACTER sheet')
    expect(c).toContain('never merge, move or invent terrain and structures')
  })

  it('장면 묶음에서 인물과 장소 그림의 역할과 우선순위를 지킨다', () => {
    const p = buildRealStripPrompt('A dim room.', { characterRefCount: 2, worldRefCount: 1, hasStyleRef: true })
    expect(p).toContain('AUTHORITY when references disagree')
    expect(p).toContain('reference image 4 is the LOCATION reference')
  })
})
