// 리뉴얼 1차: 새 프로젝트를 만들지 못하면 까닭을 알아듣는 말로 알리고, 프로젝트 칸이 다 찼으면 요금제로 갈 길을 둔다 (2026-10-19)
import { describe, expect, it } from 'vitest'
import { newProjectError } from '@/lib/project/new-project-error'
import { translate } from '@/lib/i18n'

describe('새 프로젝트 만들기 실패 안내', () => {
  // 왜: 칸이 다 찼을 때 화면에 "slot_limit" 코드만 보였다(e2e 2026-10-19 실측).
  it('프로젝트 칸이 다 찼으면 코드 대신 알아듣는 말과 요금제 보기를 보여 준다', () => {
    const error = newProjectError('slot_limit')
    expect(error.showPricing).toBe(true)
    expect(translate('ko', error.message)).toMatch(/프로젝트 칸/)
    expect(translate('ko', error.message)).not.toContain('slot_limit')
  })

  // 왜: 모르는 실패도 코드를 그대로 보이지 않는다.
  it('모르는 실패는 다시 시도하라고 알린다', () => {
    const error = newProjectError('weird_code')
    expect(error.showPricing).toBe(false)
    expect(translate('ko', error.message)).toMatch(/다시 시도/)
  })
})
