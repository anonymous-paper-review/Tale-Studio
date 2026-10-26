// 그림을 올릴 때 묻는 이미지 사용 권리 동의 문구는 화면 언어로 보인다 (2026-10-27 디자이너 QA #10 · 오너 "남기고 한국어로")
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'

const CONSENT = 'I have the right to use this image, and if it shows an identifiable person, I have their consent to use it here.'

describe('이미지 사용 권리 동의', () => {
  it('한국어 화면에서는 동의 문구도 한국어로 보인다', () => {
    // 왜: 사이트 언어가 한국어인데 체크 문구만 영어였다(QA #10). 동의 창은 그대로 두고 문구만 화면 언어로.
    const dialog = readFileSync(path.join(process.cwd(), 'src/components/upload/image-upload-consent.tsx'), 'utf8')
    expect(dialog).toContain(`{t('${CONSENT}')}`)
    expect(dialog).not.toContain('lang="en"')
    expect(translate('ko', CONSENT)).toBe('이 이미지를 쓸 권리가 있고, 알아볼 수 있는 사람이 나오면 그 사람에게 여기서 써도 된다는 동의를 받았어요.')
  })
})
