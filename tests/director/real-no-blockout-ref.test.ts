// 실사(Director) 스트립·그리드 요청의 참조 이미지에는 배치도가 들어가지 않는다 (#derived-end 2026-09-08, 오너 결정)
//   왜: 배치도(특히 추정한 END)는 previz 보조다 — 실사는 러프 스트립·캐릭터 시트·배경·스타일 앵커만 참조한다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('실사는 배치도를 참조하지 않는다', () => {
  it('실사 스트립·그리드 라우트의 참조 이미지 조립에는 배치도(rough-blockouts)가 없고, 배치도는 러프 라우트만 올린다', () => {
    // 왜: 정상 경로 고정 — 배치도 참조가 실사로 새어 들어가면 추정 END 가 최종 그림의 계약이 된다.
    const strip = read('src/app/api/director/generate-storyboard/route.ts')
    const grid = read('src/app/api/director/generate-storyboard-batch/route.ts')
    for (const src of [strip, grid]) {
      expect(src).not.toMatch(/rough-blockouts/)
      expect(src).not.toMatch(/blockout/i)
      expect(src).not.toMatch(/end_derived/)
    }
    const rough = read('src/app/api/writer/rough-storyboard/route.ts')
    expect(rough).toMatch(/rough-blockouts\//)
    expect(rough).toMatch(/reference_image_urls: blockoutUrl \? \[templateUrl, blockoutUrl\] : \[templateUrl\]/)
  })
})
