// 한국어 화면에서 옛 Storyboard 화면 · 러프 스토리보드를 "콘티" · "러프 콘티"로 부르는지 검사한다 (D1 오너 2026-11-22 "storyboard란 명칭은 콘티로")
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { KO } from '@/lib/i18n/messages-ko'
import { translate } from '@/lib/i18n/translate'

/** 콘티(옛 Storyboard 화면 · 그 안의 러프)를 말하는 문구 — Writer 콘티 · Artist [완료하기] · 넘김 · 잠금 안내 · 진행 알림. */
const CONTI_KEYS = [
  'Storyboard',
  'Hand over to Storyboard',
  'Please hand over to Storyboard',
  'Complete · to Storyboard',
  'Complete and move on to Storyboard?',
  'Check what moves on to Storyboard.',
  'Storyboard opens. Scenes, shots and roughs that are still being made continue there.',
  'Getting Storyboard ready · splitting scenes and shots',
  'Getting Storyboard ready · drawing the roughs',
  'Storyboard is ready',
  'Go to Storyboard',
  'It shows once Storyboard splits the shots',
  'Looks that change by scene (clothes, age) can be added after the images are made, from the card details or in Storyboard.',
  'You can still fix looks and images in Storyboard, or come back to Artist.',
  'Moving to Storyboard',
  'The style cannot be changed after Storyboard opens.',
  'Rough storyboard',
  'Rough storyboard: click a card to review, edit, or regenerate; click a scene name to collapse it',
  'Rough storyboard board',
  'Rough storyboard progress',
  'Generating rough storyboard',
  'Rough storyboard generation request failed',
  '{agent} is drawing the rough storyboard',
  'the rough storyboard of {shot}',
  'rough storyboards for {count} shots',
  'This is a shared preview. In the real project, you review and edit the scene structure and rough storyboard here.',
] as const

describe('한국어 화면의 콘티 이름', () => {
  it('한국어 화면에서 화면 이름 Storyboard는 콘티로 보인다 — [완료하기 · 콘티로] · 완료 창 · 넘김 말 · 잠금 안내', () => {
    // 왜: D1 — 오너가 옛 Storyboard 화면을 Writer 의 콘티로 부르라고 했다. Artist 에서 넘어가는 단추 · 창 · 채팅 넘김 말이 같은 이름을 써야 어디로 가는지 헷갈리지 않는다.
    expect(translate('ko', 'Storyboard')).toBe('콘티')
    expect(translate('ko', 'Complete · to Storyboard')).toBe('완료하기 · 콘티로')
    expect(translate('ko', 'Go to Storyboard')).toBe('콘티로 가기')
    expect(translate('ko', 'Complete and move on to Storyboard?')).toBe('완료하고 콘티로 넘길까요?')
    expect(translate('ko', 'Hand over to Storyboard')).toBe('콘티로 넘기기')
    expect(translate('ko', 'Please hand over to Storyboard')).toBe('콘티로 넘겨주세요')
    expect(translate('ko', 'Moving to Storyboard')).toBe('콘티로 넘어가는 중이에요')
    expect(translate('ko', 'The style cannot be changed after Storyboard opens.')).toBe('콘티를 연 뒤에는 스타일을 바꿀 수 없어요.')
    expect(translate('ko', 'Storyboard is ready')).toBe('콘티 준비됨')
  })

  it('한국어 화면에서 러프 스토리보드는 러프 콘티로 보인다 — 탭 · 진행 · 실패 · 기다림 안내', () => {
    // 왜(혼자 정한 것 i): 한 화면에 "콘티"와 "스토리보드" 두 이름이 섞이면 다른 것으로 읽힌다. 목각인형 러프는 콘티의 러프다.
    expect(translate('ko', 'Rough storyboard')).toBe('러프 콘티')
    expect(translate('ko', 'Generating rough storyboard')).toBe('러프 콘티 생성 중')
    expect(translate('ko', 'Rough storyboard generation request failed')).toBe('러프 콘티 생성 요청 실패')
    expect(translate('ko', 'the rough storyboard of {shot}', { shot: '샷 2' })).toBe('샷 2의 러프 콘티')
    expect(translate('ko', '{agent} is drawing the rough storyboard', { agent: 'Writer' })).toBe('Writer가 러프 콘티를 그리고 있습니다')
  })

  it('콘티를 말하는 한국어 문구에는 "Storyboard" · "스토리보드"가 남지 않는다', () => {
    // 왜: D1 — 이름을 하나라도 빠뜨리면 한국어 화면 한쪽에 옛 이름이 남는다. 실사 쪽(Director → Camera) 문구는 여기 없다(자기 이름을 쓴다).
    for (const key of CONTI_KEYS) {
      expect(KO[key], key).toBeTruthy()
      expect(KO[key], key).not.toMatch(/Storyboard|스토리보드/)
    }
    for (const key of Object.keys(KO).filter((k) => k.startsWith('Scene and shot work is done.'))) {
      expect(KO[key], key).toContain('러프 콘티(연필 스케치)')
    }
  })

  it('영어 화면은 콘티를 지금처럼 Storyboard 로 부른다', () => {
    // 왜(혼자 정한 것 h): 영어 사용자에게 conti 는 낯선 말이다 — 영어 원문(사전 키)은 그대로 둔다.
    expect(translate('en', 'Complete · to Storyboard')).toBe('Complete · to Storyboard')
    expect(translate('en', 'Rough storyboard')).toBe('Rough storyboard')
  })
})

describe('콘티 넘김 안내', () => {
  it('콘티 러프가 다 그려져도 옛 순서 말("Artist로 넘어가 캐릭터 · 배경 컨셉을…")은 채팅에 뜨지 않는다', () => {
    // 왜(혼자 정한 것 q): 리뉴얼 전 순서(Storyboard → Artist)의 안내가 코드에 남아 있었다 — 넘김 표(HANDOFFS)에 콘티 → Camera 가 들어오는 순간
    //   "Artist로 넘어가자"는 틀린 말로 살아난다. 콘티의 앞으로 넘김은 머리의 [다음: Camera로]와 채팅 말이 맡는다.
    const board = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')
    expect(board).not.toContain('Ready to move to Artist')
    expect(board).not.toMatch(/handoffFrom\('writer'\)/)
  })
})
