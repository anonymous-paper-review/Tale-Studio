// Director → Editor 넘기기 창(D8)의 영상 없는 샷 줄이 Editor 가 실제로 하는 일(나중에 영상이 생기면 저절로 들어옴)대로 알리는지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'

const dialog = readFileSync('src/components/handoff/editor-handover-dialog.tsx', 'utf8')
// 만들다 실패한 샷 · 아직 안 만든 샷의 두 줄.
const keys = [...dialog.matchAll(/t\('((?:Failed|Not made yet)\. [^']+)'\)/g)].map((m) => m[1])

describe('Editor 넘기기 창의 영상 없는 샷 줄', () => {
  // 왜: Editor 는 영상 있는 샷만 컷으로 만들고, 빼고 넘긴 샷은 나중에 영상이 생기면 다음에 Editor 를 열 때 이야기 순서 자리에 저절로 들어간다
  //   (export 갈래 확인 2026-11-14). 예전 줄 "빼고 넘기면 Editor에서 이어 붙일 수 있어요"는 손으로 붙여야 하는 것처럼 읽혔다.
  it('영상이 실패했거나 아직 없는 샷 줄은, 빼고 넘겨도 나중에 영상이 생기면 Editor에 저절로 들어온다고 알린다', () => {
    expect(keys).toHaveLength(2)
    for (const key of keys) {
      expect(translate('ko', key)).toContain('빼고 넘겨도 나중에 영상이 생기면 Editor에 저절로 들어와요')
      // 영어는 좁은 화면에서도 짧게(리드 2026-11-14) — 뜻은 같다.
      expect(translate('en', key)).toContain('Leave it out and it joins Editor once its video is ready')
    }
  })
})
