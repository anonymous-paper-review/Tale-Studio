// 약속 I — 러프 3장은 따로 다시 만들 수 있고 서로 자동으로 바뀌지 않는다 (_tdd.md I, 2026-09-04)
//
//   오너 결정: I5 = 러프가 바뀌어도 Director 실사는 자동으로 다시 만들지 않는다(표시만). 그리드 클릭 = 연출 편집 팝업,
//   3장 정지 보기는 Writer 팝업을 고쳐 Director 도 같이 쓴다. 문장 하나 = 테스트 하나.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { mergeRoughFrame } from '@/lib/writer/directing-edit'
import { classifyRoughChanged } from '@/lib/image-provenance'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const rough = {
  status: 'completed',
  generatedAt: 1000,
  frames: { start: 'https://m/s.png', direction: 'https://m/d.png', end: 'https://m/e.png' },
  cleanDirection: { url: 'https://m/d-clean.png', for: 1000 },
}

describe('약속 I — 러프 3장 개별 재생성', () => {
  it('시작·연출·끝 중 하나만 다시 만들면 나머지 두 장은 그대로다', () => {
    const next = mergeRoughFrame(rough, 'direction', 'https://m/d2.png?v=2', 2000)
    expect(next.frames).toEqual({ start: 'https://m/s.png', direction: 'https://m/d2.png?v=2', end: 'https://m/e.png' })
    expect(next.generatedAt).toBe(2000)
    // 연출 장이 바뀌면 화살표 클린 플레이트 캐시는 낡은 것이라 버린다.
    expect(next.cleanDirection).toBeUndefined()
    // 서버 함수는 고른 장 하나만 바꾼 JSON 을 저장한다.
    const lib = read('src/lib/writer/directing-edit.ts')
    expect(lib).toMatch(/\.update\(\{ rough_storyboard: mergeRoughFrame\(latest, frame, newUrl, now\) \}\)/)
  })

  it('끝 장면을 다시 만들면 시작·연출은 바뀌지 않는다', () => {
    const next = mergeRoughFrame(rough, 'end', 'https://m/e2.png', 3000)
    expect(next.frames?.start).toBe('https://m/s.png')
    expect(next.frames?.direction).toBe('https://m/d.png')
    expect(next.frames?.end).toBe('https://m/e2.png')
    // 연출 장은 그대로라 클린 플레이트 캐시는 유효 — for 만 올린다(재과금 방지).
    expect(next.cleanDirection).toEqual({ url: 'https://m/d-clean.png', for: 3000 })
  })

  it('시작 장면만 따로 다시 만들 수 있다', () => {
    const next = mergeRoughFrame(rough, 'start', 'https://m/s2.png', 4000)
    expect(next.frames).toEqual({ start: 'https://m/s2.png', direction: 'https://m/d.png', end: 'https://m/e.png' })
    const route = read('src/app/api/writer/rough-directing-edit/route.ts')
    expect(route).toMatch(/action: z\.literal\('regenerate-frame'\)/)
    expect(route).toMatch(/frame: z\.enum\(\['start', 'direction', 'end'\]\)/)
    const lib = read('src/lib/writer/directing-edit.ts')
    expect(lib).toMatch(/const START_FROM_DIRECTION_PROMPT/)
    expect(lib).toMatch(/export async function regenerateRoughFrame\(/)
    // 팝업의 각 장 아래 "이 장만 다시 만들기".
    const still = read('src/features/writer/rough-frames-still.tsx')
    expect(still).toMatch(/action: 'regenerate-frame', projectId, shotId, frame/)
    expect(still).toMatch(/t\('Regenerate this frame only'\)/)
    expect(read('src/lib/i18n/messages-ko.ts')).toMatch(/'Regenerate this frame only': '이 장만 다시 만들기'/)
  })

  it('러프 3장 중 하나라도 바뀌면 Director의 그 샷 실사 카드에 "러프 바뀜" 표시가 뜬다', () => {
    const image = { status: 'completed', roughGeneratedAt: 1000 }
    expect(classifyRoughChanged({ status: 'completed', generatedAt: 1000 }, image)).toBe(false)
    expect(classifyRoughChanged({ status: 'completed', generatedAt: 2000 }, image)).toBe(true)
    // 기록이 없는 옛 실사·미완성 러프는 판정하지 않는다.
    expect(classifyRoughChanged({ status: 'completed', generatedAt: 2000 }, { status: 'completed' })).toBe(false)
    expect(classifyRoughChanged({ status: 'generating', generatedAt: 2000 }, image)).toBe(false)
    // 실사는 참조한 러프의 시각을 기록한다(단건·스트립·배치 모두).
    const finalize = read('src/lib/fal/finalize.ts')
    expect(finalize.match(/roughGeneratedAt: job\.target\.roughGeneratedAt \?\? null/g)?.length).toBe(2)
    expect(finalize).toMatch(/roughGeneratedAt: job\.target\.roughGeneratedAtByShot\?\.\[shotId\] \?\? null/)
    expect(read('src/app/api/director/generate-storyboard/route.ts')).toMatch(/typeof roughGeneratedAt === 'number' \? \{ roughGeneratedAt \} : \{\}/)
    expect(read('src/app/api/director/generate-storyboard-batch/route.ts')).toMatch(/roughGeneratedAtByShot: Object\.fromEntries/)
    // 카드와 그리드가 표시한다.
    expect(read('src/features/director/canvas-nodes/ShotNode.tsx')).toMatch(/classifyRoughChanged\(rough, data\.storyboardImage\)/)
    expect(read('src/features/director/canvas-views/StoryboardGridView.tsx')).toMatch(/const roughChanged = mediaMode === 'real' && classifyRoughChanged\(rough, img\)/)
    expect(read('src/lib/i18n/messages-ko.ts')).toMatch(/'Rough changed': '러프 바뀜'/)
  })

  it('러프가 바뀌어도 Director 실사는 자동으로 다시 만들지 않는다', () => {
    // 판정은 표시에만 쓰인다 — 판정 결과로 생성을 부르는 코드가 없다.
    for (const rel of ['src/features/director/canvas-nodes/ShotNode.tsx', 'src/features/director/canvas-views/StoryboardGridView.tsx']) {
      const src = read(rel)
      const idx = src.indexOf('classifyRoughChanged(')
      expect(idx).toBeGreaterThan(0)
      const around = src.slice(idx, idx + 400)
      expect(around).not.toMatch(/generateStoryboardImage|runRealBatch|regenerate/)
    }
    // 러프 한 장 재생성 서버 경로도 실사 생성을 부르지 않는다.
    const lib = read('src/lib/writer/directing-edit.ts')
    expect(lib).not.toMatch(/generate-storyboard|runRealBatch|reserveDirectorStoryboard/)
  })

  it('그리드에서 이미지를 눌러도 글자를 눌러도 같은 연출 편집 팝업이 열리고, 그 팝업에 3장이 나란히 멈춰 보인다', () => {
    const grid = read('src/features/director/canvas-views/StoryboardGridView.tsx')
    expect(grid.match(/openDetail\(\)/g)?.length).toBe(2)
    expect(grid).toMatch(/if \(writerShotId\) setPrevizOpen\(true\)/)
    expect(grid).toMatch(/<ShotDetailDialog\s+shotId=\{previzOpen \? writerShotId : null\}/)
    const dialog = read('src/features/writer/shot-detail-dialog.tsx')
    expect(dialog).toMatch(/<RoughFramesStill/)
    // 정지 그림 3장 — 순환 컴포넌트를 그리지 않는다(캐시버스트 헬퍼만 빌려 쓴다).
    const still = read('src/features/writer/rough-frames-still.tsx')
    expect(still).not.toMatch(/<RoughFrameCycle/)
    expect(still).toMatch(/ROUGH_FRAME_ORDER\.map\(/)
  })
})
