// 오너가 지우라고 한 옛 부품(옛 샷 편집 패널 · 샷 편집 팝업 · 영상 팝업 · 스토리보드 카드의 [영상 만들기] 길)을 Director 화면 어디에서도 쓰지 않는지 검사한다 (오너 답 11/14 "지워줘")
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** 리드가 지울 옛 부품 파일 — 이 파일들 밖에서는 아무도 부르지 않아야 지운 뒤에도 빌드가 깨지지 않는다. */
const OLD_FILES = new Set([
  'src/features/director/canvas-panels/ShotDetailPanel.tsx',
  'src/features/director/canvas-popups/ShotNodePopup.tsx',
  'src/features/director/canvas-popups/VideoNodePopup.tsx',
])

/** src 아래 모든 .ts · .tsx 파일. */
function sourceFiles(dir = 'src'): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.posix.join(dir, name)
    if (statSync(file).isDirectory()) return sourceFiles(file)
    return /\.tsx?$/.test(name) ? [file] : []
  })
}

describe('같이 정한 것', () => {
  it('샷 · 샷의 Take 상세는 새 샷 상세만 연다 — 옛 샷 편집 패널 · 샷 편집 팝업 · 영상 팝업은 어느 화면에서도 부르지 않는다', () => {
    // 왜: 오너 답(11/14) "지워줘" — 새 샷 상세(시안 D6 · D7)가 그 자리를 먼저 잡아 화면에서 닿지 않는 옛 부품이다. 리드가 파일을 지운 뒤에도
    //   빌드가 깨지지 않게 다른 파일은 이름조차 부르지 않는다(영상 팝업은 마더 샷이 없으면 아무것도 그리지 않았다).
    const users = sourceFiles().filter((file) => !OLD_FILES.has(file) && /\b(ShotDetailPanel|ShotNodePopup|VideoNodePopup)\b/.test(readFileSync(file, 'utf8')))
    expect(users).toEqual([])
  })

  it('스토리보드 카드에는 [영상 만들기] · [다시 만들기] 길이 없다 — 카드의 영상은 툴바 · 샷 상세에서 만든다', () => {
    // 왜: 오너 답(11/14) "지워줘" — 실사 카드 위 숨은 단추를 없앤 뒤(시안 R) 카드의 영상 만들기 길은 화면에서 닿지 않았다.
    const grid = readFileSync('src/features/director/canvas-views/StoryboardGridView.tsx', 'utf8')
    expect(grid).not.toMatch(/runVideo|generateVideoForShot|setVideoBusy|confirm === 'video'|setConfirm\('video'\)/)
    expect(grid).not.toContain("t('Generate video')")
    expect(grid).not.toContain("t('Regenerate video')")
  })
})
