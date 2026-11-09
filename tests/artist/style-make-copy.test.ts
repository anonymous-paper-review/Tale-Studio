// 처음 그림을 만들 때 뜨는 스타일 고르기 창의 제목과 단추 줄 안내(11/5 시안 AS)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'

const DIALOG = 'src/features/artist-room/style-make-dialog.tsx'
const read = (file: string) => readFileSync(file, 'utf8')

describe('스타일 고르기 창 문구', () => {
  it('스타일 고르기 창 제목은 "어떤 스타일로 그릴까요?"이고 영어 화면도 같은 뜻으로 묻는다', () => {
    // 왜: 11/5 시안 AS — 이 창에서 고른 스타일로 인물 · 배경 그림을 그린다. "만들까요"보다 하는 일이 바로 읽힌다.
    expect(read(DIALOG)).toContain("t('Which style should we draw it in?')")
    expect(translate('ko', 'Which style should we draw it in?')).toBe('어떤 스타일로 그릴까요?')
  })

  it('스타일 고르기 창은 단추 줄 왼쪽에 그릴 인물 · 배경 수를 한 줄로 보이고, 걸리는 시간은 어림하지 않는다', () => {
    // 왜: 11/5 시안 AS 는 "인물 3 · 배경 1 · 약 2분"을 단추 왼쪽에 둔다. 시간은 계산할 근거가 없어 빼기로 했다(리드 2026-11-09).
    const footer = read(DIALOG).match(/<DialogFooter[\s\S]*?<\/DialogFooter>/)?.[0] ?? ''
    expect(footer).toContain('data-testid="artist-make-new"')
    expect(footer).not.toMatch(/minute|분/)
  })

  it('스타일 고르기 창은 그림에 Take가 들지 않는다는 안내를 남긴다', () => {
    // 왜: 결제 안내 — 표를 한 줄로 줄여도 그림을 만들 때 Take가 드는지는 누르기 전에 알아야 한다(리드 2026-11-09 "크레딧 안내 줄은 남기기").
    expect(read(DIALOG)).toContain("t('Images do not use Takes.')")
  })
})
