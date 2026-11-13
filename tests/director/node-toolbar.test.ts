// 노드형 툴바의 에셋 단추는 시안처럼 "안 쓴 에셋" 한 이름이고 켜짐은 눌린 모양으로 보인다 (시안 D1 노드형 406:4051)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
const ko = readFileSync('src/lib/i18n/messages-ko.ts', 'utf8')

describe('노드형 툴바', () => {
  it('노드형 툴바의 에셋 단추는 "안 쓴 에셋"이라 쓰고, 켜면 눌린 모양(aria-pressed)으로 보인다', () => {
    // 왜: 시안 D1 노드형은 "안 쓴 에셋". 옛 이름 "미사용 에셋 불러오기 / 숨기기"는 길어서 1440 폭 영어 화면에서 1줄이 두 줄로 넘쳤다.
    expect(page).toContain("<span>{t('Unused assets')}</span>")
    expect(page).toContain('aria-pressed={showUnusedAssets}')
    expect(page).not.toContain("t('Load unused assets')")
    expect(ko).toContain("'Unused assets': '안 쓴 에셋'")
  })
})
