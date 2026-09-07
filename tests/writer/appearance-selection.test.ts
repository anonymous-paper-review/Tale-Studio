// 이야기 속 시간과 선택 조건에 맞는 인물 모습을 하나로 정한다
import { describe, expect, it } from 'vitest'
import {
  AppearanceSelectionError,
  resolveCharacterAppearance,
  type AppearanceSelectionErrorCode,
  type CharacterAppearanceCandidate,
} from '@/lib/writer/appearance-selection'

const appearance = (
  appearanceKey: string,
  narrativeTime: CharacterAppearanceCandidate['narrativeTime'],
  isDefault = false,
): CharacterAppearanceCandidate => ({ appearanceKey, narrativeTime, isDefault })

function expectSelectionError(
  code: AppearanceSelectionErrorCode,
  select: () => string,
): void {
  try {
    select()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(AppearanceSelectionError)
    expect((error as AppearanceSelectionError).code).toBe(code)
  }
}

describe('resolveCharacterAppearance', () => {
  it('장면의 이야기 시간에 맞는 인물 모습을 하나 고른다', () => {
    expect(resolveCharacterAppearance('past', [
      appearance('present-okhwa', 'present', true),
      appearance('young-okhwa', 'past'),
    ])).toBe('young-okhwa')
  })

  it('시간이 맞는 모습이 없으면 기본 모습 하나를 대신 선택한다', () => {
    expect(resolveCharacterAppearance('future', [
      appearance('present-okhwa', 'present', true),
      appearance('young-okhwa', 'past'),
      appearance('unplaced-reference', null),
    ])).toBe('present-okhwa')
  })

  it('맞는 모습이 없고 기본 모습도 하나로 정할 수 없으면 선택을 거절한다', () => {
    expectSelectionError('MISSING_DEFAULT_APPEARANCE', () =>
      resolveCharacterAppearance('future', [
        appearance('young-okhwa', 'past'),
        appearance('reference-only-look', null, true),
      ]),
    )
  })

  it('맞는 모습이 여러 개이고 그중 기본 모습이 하나가 아니면 선택을 거절한다', () => {
    expectSelectionError('AMBIGUOUS_APPEARANCE', () =>
      resolveCharacterAppearance('past', [
        appearance('young-okhwa-a', 'past'),
        appearance('young-okhwa-b', 'past'),
        appearance('present-okhwa', 'present', true),
      ]),
    )
  })

  it('맞는 모습이 여러 개여도 기본으로 정한 하나를 선택한다', () => {
    expect(resolveCharacterAppearance('past', [
      appearance('young-okhwa-a', 'past'),
      appearance('young-okhwa-b', 'past', true),
      appearance('present-okhwa', 'present'),
    ])).toBe('young-okhwa-b')
  })

  it('사용자가 지정한 유효한 모습이 있으면 이야기 시간에 맞는 모습보다 우선한다', () => {
    expect(resolveCharacterAppearance('past', [
      appearance('present-okhwa', 'present', true),
      appearance('young-okhwa', 'past'),
      appearance('reference-only-look', null),
    ], 'reference-only-look')).toBe('reference-only-look')
  })

  it('인물에게 없는 모습을 지정하면 선택을 거절한다', () => {
    expectSelectionError('INVALID_APPEARANCE_OVERRIDE', () =>
      resolveCharacterAppearance(
        'past',
        [appearance('young-okhwa', 'past')],
        'invented-look',
      ),
    )
  })

  it('이야기 속 현재를 기준으로 과거 장면의 모습을 선택한다', () => {
    expect(resolveCharacterAppearance('past', [
      appearance('present-okhwa', 'present', true),
      appearance('young-okhwa', 'past'),
      appearance('future-okhwa', 'future'),
    ])).toBe('young-okhwa')
  })

  it('낮과 밤 정보는 인물 모습 선택에 영향을 주지 않는다', () => {
    const appearances = [
      appearance('present-okhwa', 'present', true),
      appearance('young-okhwa', 'past'),
    ]

    expect(resolveCharacterAppearance('past', appearances)).toBe('young-okhwa')
  })
})
