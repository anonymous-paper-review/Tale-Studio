// 실사는 시작 · 가운데 · 끝을 만들지만 새 Take 는 시작 그림만 쓰므로, 샷 상세 · Cinema 의 "시작 · 끝 이미지" 문구가 "이미지" · "시작 이미지"인지 검사한다 (오너 "시작+끝 폐기" · 리드 2026-11-23)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'

const files = [
  'src/features/director/shot-detail/shot-video-tab.tsx',
  'src/features/director/shot-detail/shot-image-tab.tsx',
  'src/features/camera/fix-panel.tsx',
  'src/features/camera/new-take.ts',
  'src/features/camera/video-mode.ts',
]

describe('이미지 문구', () => {
  it('실사는 시작 · 가운데 · 끝을 만들지만 새 Take 는 시작 그림(방식에 따라 실사 가운데 장 · 앞 영상 마지막 장면)만 쓰므로, 샷 상세 · Cinema 의 "시작 · 끝 이미지" 문구를 "이미지" · "시작 이미지"로 고친다', () => {
    // 왜: 영상이 끝 그림을 안 쓰게 되면서 "시작 · 끝 이미지가 바뀌었어요 · 새 Take 는 그것을 써요" 같은 말이 틀린 말이 됐다(fb-director 찾음).
    for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toMatch(/start and end images/)
    const words: Array<[string, string]> = [
      ['Remake images · Takes 0', '이미지 다시 만들기 · Takes 0'],
      ['Make images · Takes 0', '이미지 만들기 · Takes 0'],
      ['Write only what you want to change in the images (e.g. show the umbrella handle)', '이미지에서 바꾸고 싶은 것만 적어요 (예: 우산 손잡이가 보이게)'],
      ['The images changed · A new Take will use the new ones', '이미지가 바뀌었어요 · 새 Take를 만들면 새 이미지를 써요'],
      ['Make the start image first.', '시작 이미지를 먼저 만들어요.'],
      ['The images are being remade. Make the Take when they are done.', '이미지를 다시 만드는 중이에요. 다 되면 Take 를 만들어요.'],
    ]
    for (const [en, ko] of words) expect(translate('ko', en), en).toBe(ko)
    expect(readFileSync('src/features/director/shot-detail/shot-image-tab.tsx', 'utf8')).toContain("'Remake images · Takes 0'")
  })
})
