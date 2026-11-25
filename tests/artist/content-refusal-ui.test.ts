// 내용 검사에 걸린 그림은 카드에 "내용 검사에 걸림" 배지가 붙고, 상세 창은 제출 전·제출 뒤 거절을 다른 안내로 가른다 (2026-11-25 오너)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { characterRefusalKey, failureBadge, failureNotice, hasCharacterContentRefusal } from '@/lib/artist/failure-badge'
import { KO } from '@/lib/i18n/messages-ko'

const CONTENT_CHECK_SOFTER =
  'This description did not pass the content check, so it was not drawn. Press "Retry with a softer prompt" below, or edit the description and draw again.'
const CONTENT_CHECK_EDIT =
  'This description did not pass the content check, so it was not drawn. Edit the description and draw again.'

const read = (file: string) => readFileSync(file, 'utf8')
const moderationFailure = { error: 'blocked', moderation: true, failCount: 1, safeFailCount: 0 }
const plainFailure = { error: 'boom', moderation: false, failCount: 1, safeFailCount: 0 }

describe('카드의 실패 배지', () => {
  it('내용 검사에 걸린 인물 카드에는 "내용 검사에 걸림" 배지가 보인다', () => {
    // 왜: 제출 전 검사에 걸린 그림은 작업 기록이 없어 카드가 아무 말도 하지 않았다 — 학생은 그림이 왜 없는지 알 수 없었다(2026-11-25 오너).
    expect(failureBadge({ contentRefused: true, failed: false })).toBe('content-check')
    // 내용 검사가 일반 실패를 이긴다 — 학생이 고칠 것이 있는 쪽을 먼저 보인다.
    expect(failureBadge({ contentRefused: true, failed: true })).toBe('content-check')
    expect(hasCharacterContentRefusal({ [characterRefusalKey('mara', 'current', 'main')]: { name: '마라' } }, 'mara')).toBe(true)
    expect(hasCharacterContentRefusal({ [characterRefusalKey('mara', 'current', 'main')]: { name: '마라' } }, 'roy')).toBe(false)
    expect(KO['Content check']).toBe('내용 검사에 걸림')

    for (const file of ['src/features/artist/character-panel.tsx', 'src/features/artist/world-panel.tsx']) {
      const source = read(file)
      expect(source).toContain("t('Content check')")
      expect(source).toContain('failureBadge(')
    }
  })

  it('일반 실패 카드는 "이미지 실패" 배지 그대로다', () => {
    // 왜: 정상 경로 고정 — 자리 없음·그리기 실패는 설명 탓이 아니라서 설명을 고치라고 말하면 안 된다.
    expect(failureBadge({ contentRefused: false, failed: true })).toBe('image-failed')
    expect(failureBadge({ contentRefused: false, failed: false })).toBe(null)
    expect(KO['Image failed']).toBe('이미지 실패')

    for (const file of ['src/features/artist/character-panel.tsx', 'src/features/artist/world-panel.tsx']) {
      expect(read(file)).toContain("t('Image failed')")
    }
  })
})

describe('상세 창의 실패 안내', () => {
  it('제출 뒤 거절된 그림의 상세 창에는 순화 단추와 새 안내가 보인다', () => {
    // 왜: fal 이 걸러 낸 그림은 서버가 순화 재시도 자격을 준다 — 한 번 더 눌러 볼 수 있다는 것을 알려야 한다.
    expect(failureNotice({ failure: moderationFailure })).toBe('content-check-softer')
    // 두 거절이 겹치면 순화 단추가 있는 쪽을 보인다(할 수 있는 일이 하나 더 많다).
    expect(failureNotice({ failure: moderationFailure, contentRefused: true })).toBe('content-check-softer')
    expect(KO[CONTENT_CHECK_SOFTER]).toBe('이 설명은 내용 검사에 걸려 그리지 못했어요. 아래 "문구를 완화해 다시 만들기"를 누르거나, 설명을 고쳐 다시 그려 주세요.')

    for (const file of ['src/features/artist/character-view-dialog.tsx', 'src/features/artist/world-view-dialog.tsx']) {
      const source = read(file)
      expect(source).toContain(`t('${CONTENT_CHECK_SOFTER}')`)
      expect(source).toContain("t('Retry with a softer prompt')")
      // 순화 단추는 제출 뒤 거절에만 — 제출 전 거절에는 서버가 자격을 주지 않는다.
      expect(source).toContain("notice === 'content-check-softer' ?")
    }
  })

  it('제출 전 거절된 그림의 상세 창에는 순화 단추 없이 안내만 보인다', () => {
    // 왜: 제출 전 거절은 작업이 만들어지지 않아 순화 재시도 자격이 없다 — 단추를 보여 주면 눌러도 같은 거절만 돌아온다.
    expect(failureNotice({ contentRefused: true })).toBe('content-check-edit')
    expect(failureNotice({ failure: plainFailure, contentRefused: true })).toBe('content-check-edit')
    expect(failureNotice({ failure: plainFailure })).toBe('failed')
    expect(failureNotice({})).toBe(null)
    expect(KO[CONTENT_CHECK_EDIT]).toBe('이 설명은 내용 검사에 걸려 그리지 못했어요. 설명을 고쳐 다시 그려 주세요.')

    for (const file of ['src/features/artist/character-view-dialog.tsx', 'src/features/artist/world-view-dialog.tsx']) {
      const source = read(file)
      expect(source).toContain(`t('${CONTENT_CHECK_EDIT}')`)
      expect(source).toContain('failureNotice(')
      // 예전 한 문장짜리 안내는 이 두 창에서 더 쓰지 않는다(두 거절이 같은 말로 보였다).
      expect(source).not.toContain('Generation was declined by content policy')
    }
  })

  it('걸린 그림이 어느 인물·배경인지 토스트도 이름으로 말한다', () => {
    // 왜: 카드 배지는 스크롤하면 사라진다 — 거절된 그 순간의 안내에도 이름이 있어야 어느 카드를 고칠지 안다(2026-11-25 오너).
    expect(KO['The description for "{name}" did not pass the content check, so it was not drawn. Edit the description and try again.'])
      .toBe('"{name}" 설명이 내용 검사에 걸려 그리지 못했어요. 설명을 고쳐 다시 시도해 주세요.')
  })
})
