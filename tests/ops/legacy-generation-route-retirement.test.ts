// 오래된 Writer 무예약 생성 우회는 제거하고 현재 예약 생성 경로만 남아 있는지 확인한다
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const sourcePath = (relativePath: string) => path.join(ROOT, relativePath)
const readSource = (relativePath: string) => readFileSync(sourcePath(relativePath), 'utf8')

const RETIRED_PATHS = [
  'src/app/api/writer/generate/images/route.ts',
  'src/app/api/writer/generate/videos/route.ts',
  'src/lib/writer/pipeline/stages/v6_images.ts',
  'src/lib/writer/pipeline/stages/v7_videos.ts',
]

const ACTIVE_PATHS = [
  'src/app/api/writer/rough-storyboard/route.ts',
  'src/app/api/director/generate-video/route.ts',
]

describe('Writer legacy generation retirement', () => {
  it('오래된 무예약 이미지·영상 API와 stage 네 경로가 제거되어 있다', () => {
    for (const relativePath of RETIRED_PATHS) {
      expect(existsSync(sourcePath(relativePath)), relativePath).toBe(false)
    }
  })

  it('현재 Writer 러프와 Director 영상 실제 경로가 유지되어 있다', () => {
    for (const relativePath of ACTIVE_PATHS) {
      expect(existsSync(sourcePath(relativePath)), relativePath).toBe(true)
    }
  })

  it('Writer 러프 생성은 예약 제출 경로를 유지한다', () => {
    const route = readSource('src/app/api/writer/rough-storyboard/route.ts')
    expect(route).toContain("import { submitRoughStoryboardGrid } from '@/lib/writer/rough-submit'")
    expect(route).toContain("import { requireProjectAccess } from '@/lib/api/guard'")
  })

  it('Director 영상 생성은 예약 제출 경로를 유지한다', () => {
    const route = readSource('src/app/api/director/generate-video/route.ts')
    const submit = readSource('src/lib/director/video-submit.ts')
    expect(route).toContain("import { submitDirectorVideoRequest } from '@/lib/director/video-submit'")
    expect(submit).toMatch(/reserveDirectorVideo(?:Take|Regeneration)/)
  })
})
