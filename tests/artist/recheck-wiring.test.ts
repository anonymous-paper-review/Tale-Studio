// 브레이크다운 화면이 재점검 창에 보관 줄을 넘기고, 그림을 올리는 동안 재점검을 막고, 목록을 다시 읽었으면 창을 닫는다 (2026-10-27 검토 지적)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const list = readFileSync('src/features/artist-room/breakdown-list.tsx', 'utf8')
const dialog = readFileSync('src/features/artist-room/prose-recheck-dialog.tsx', 'utf8')

describe('재점검 창 잇기', () => {
  it('재점검 창은 이번 화 줄로 열고 보관 줄 번호는 반영할 때 함께 보낸다', () => {
    // 왜: 보관 줄은 창에 없지만 서버는 그 줄을 알아야 창과 같은 목록으로 고친 것을 맞춰 보고, 보관 인물을 넣으면 그 인물을 이번 화로 올린다.
    expect(list).toMatch(/<ProseRecheckDialog[^>]*rows=\{rows\}[^>]*keptIds=\{kept\.map\(\(row\) => row\.id\)\}/)
    expect(dialog).toMatch(/applyRecheck\(session\.ops, keptIds\)/)
  })

  it('레퍼런스 그림을 올리는 동안에는 재점검 단추를 누를 수 없다', () => {
    // 왜: 올리는 중에 재점검을 반영하면 서버가 돌려준 목록이 화면 목록을 바꾸면서, 다 올라온 그림이 붙을 줄이 합쳐져 사라지거나
    //   그림 없는 목록이 저장된다 — [만들기]처럼 올리는 동안은 기다리게 한다(2026-10-27 검토 지적).
    expect(list).toMatch(/data-testid="breakdown-recheck-open"/)
    expect(list).toMatch(/onClick=\{\(\) => setRecheckOpen\(true\)\} disabled=\{!listReady \|\| uploading > 0\}/)
  })

  it('반영 뒤 답을 못 받아 목록을 다시 읽었으면 재점검 창을 닫는다', () => {
    // 왜: 창이 옛 목록으로 고친 것을 들고 있으면 다시 눌러 같은 인물을 또 넣는다 — 다시 읽은 목록을 보고 빠진 것만 다시 열어 고친다.
    expect(dialog).toMatch(/if \(!result\.ok\) \{\s+toast\.error\(result\.error\)\s+if \('reloaded' in result && result\.reloaded\) onOpenChange\(false\)\s+return/)
  })
})
