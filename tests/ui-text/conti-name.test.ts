// 한국어 화면에서 씬 · 샷 보드의 연필 그림(러프 스토리보드)을 "콘티"라고 부르는지 검사한다 — 영어 화면은 Rough storyboard 그대로 (오너 2026-11-26 W2 "러프 스토리보드 > 콘티", O1)
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'

// 보드 · 보드 채팅 · 진행 알림에서 쓰는 글(콘티 화면과 Storyboard 가 같은 보드를 쓴다).
const BOARD_TEXTS = [
  'Rough storyboard',
  'The rough storyboard is all ready. Ready to move to Artist and work out character and background concepts?',
  'Rough storyboard generation request failed',
  'Rough storyboard: click a card to review, edit, or regenerate; click a scene name to collapse it',
  'Rough storyboard board',
  'Generating rough storyboard',
  'Rough storyboard progress',
  'the rough storyboard of {shot}',
  'rough storyboards for {count} shots',
  '{agent} is drawing the rough storyboard',
  'Scene and shot work is done.\n\n· Split into {sceneCount} scenes, {shotCount} shots\n· Each shot is pre-drawn as a rough storyboard (pencil sketch)\n\nTell me which scene or shot you want to revise or add.\nPress "@" to pick a scene or shot.',
]

describe('콘티 이름', () => {
  // 왜: W2 — 오너가 "러프 스토리보드"를 "콘티"로 바꿔 달라고 했다. 같은 그림을 화면마다 다른 이름으로 부르면 다른 것으로 읽힌다.
  it('한국어 화면의 보드 · 채팅 · 진행 알림은 러프 스토리보드를 "콘티"라고 부른다', () => {
    for (const text of BOARD_TEXTS) {
      const ko = translate('ko', text)
      expect(ko, text).toContain('콘티')
      expect(ko, text).not.toContain('러프 스토리보드')
    }
    expect(translate('ko', 'The rough storyboard is all ready. Ready to move to Artist and work out character and background concepts?')).toBe('콘티가 모두 준비됐어요. Artist로 넘어가 캐릭터·배경 컨셉을 잡아볼까요?')
    expect(translate('ko', 'the rough storyboard of {shot}', { shot: '샷 2' })).toBe('샷 2의 콘티')
  })

  // 왜: W2 · 리드 결정(2026-11-26) — Director 의 실사 만들기 안내도 같은 그림을 말한다. 화면마다 다른 이름이면 다른 그림으로 읽힌다.
  it('한국어 Director 화면의 실사 만들기 안내도 러프 스토리보드를 "콘티"라고 부른다', () => {
    expect(translate('ko', 'Start shooting real images/videos based on the rough storyboard, characters, and world.')).toBe('콘티와 등장인물, 월드를 바탕으로 실제 이미지/영상으로 촬영을 시작하세요.')
    expect(translate('ko', 'Generate the rough storyboard into a real shooting-image storyboard in one go')).toBe('콘티를 실제 촬영 이미지 스토리보드로 한번에 생성할 수 있어요')
  })

  // 왜: 정상 경로 고정 — 영어 화면은 지금 이름 그대로다(영어에는 실사 단계 이름 Storyboard 가 따로 있다).
  it('영어 화면은 지금처럼 Rough storyboard 라고 부른다', () => {
    expect(translate('en', 'Rough storyboard')).toBe('Rough storyboard')
    expect(translate('en', '{agent} is drawing the rough storyboard', { agent: 'Writer' })).toBe('Writer is drawing the rough storyboard')
  })
})
