// Storyboard 실사 카드가 지금 카드 모양(이름 · 길이 · 그림 · 샷 글 · 대사 · 칩) 그대로 실사 · 콘티 · 없음 그림과 카드 위 기다림, 멘션 테두리를 보이는지 검사한다
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => 'ko', useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
// Lumi 는 그림 한 장(still) — 시험에서는 그리지 않는다.
vi.mock('@/components/lumi/lumi', () => ({ Lumi: () => null }))

import { RealShotCard, type RealShotCardProps } from '@/features/storyboard/real-shot-card'
import { storyboardCardPicture } from '@/lib/storyboard/real-board'
import type { RoughStoryboardImage, Shot } from '@/types'

// 이 시험을 위해 지은 샷과 그림.
const rough: RoughStoryboardImage = {
  url: 'https://x/rough-start.png',
  status: 'completed',
  errorMessage: null,
  generatedAt: 1,
  frames: { start: 'https://x/rough-start.png', direction: 'https://x/rough-dir.png', end: 'https://x/rough-end.png' },
}
const real = { url: 'https://x/real-start.png', status: 'completed', generatedAt: 2, frames: { start: 'https://x/real-start.png', direction: 'https://x/real-dir.png', end: 'https://x/real-end.png' } }
const shot = {
  shotId: 'sh_01_02',
  sceneId: 'sc_01',
  shotType: 'MS',
  actionDescription: '미나가 정류장에서 돌아본다',
  characters: ['mina'],
  durationSeconds: 5,
  dialogueLines: [{ characterId: 'mina', text: '거기 누구야?', emotion: '', delivery: '', durationHint: 2 }],
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
  lighting: { position: 'front', brightness: 50, colorTemp: 5600 },
  generationMethod: 'I2V',
  roughStoryboard: rough,
} as unknown as Shot

function card(patch: Partial<RealShotCardProps> = {}): string {
  const props: RealShotCardProps = {
    shot,
    label: '씬 1 · 샷 2',
    picture: storyboardCardPicture(rough, null),
    wait: 'none',
    compact: false,
    announceWait: false,
    storyFontSize: '13.5px',
    locale: 'ko',
    entityNames: [],
    characterNames: new Map([['mina', '미나']]),
    mentionNames: ['미나'],
    mentionLabel: '샷 2',
    mentioned: false,
    armed: false,
    onOpen: () => {},
    ...patch,
  }
  return renderToStaticMarkup(createElement(RealShotCard, props))
}

describe('Storyboard 실사 카드', () => {
  // 왜(오너 S1 "현재 UI 그대로"): 카드는 지금 Storyboard 카드처럼 보드 전체 번호 이름 · 길이 · 샷 글 · 대사 한 줄 · 샷 크기 칩을 보인다.
  it('카드는 지금 Storyboard 카드처럼 이름 · 길이 · 샷 글 · 대사 한 줄 · 샷 크기 칩을 보인다', () => {
    const html = card()
    expect(html).toContain('씬 1 · 샷 2')
    expect(html).toContain('5초')
    expect(html).toContain('정류장에서 돌아본다')
    expect(html).toContain('미나 “거기 누구야?”')
    expect(html).toContain('>MS<')
  })

  // 왜(오너 S2 "콘티인 상태로 시작"): 실사가 없을 때는 Writer 콘티 그림을 보이되, 실사가 아니라는 것을 꼬리표로 알린다(혼자 정한 것 m).
  it('실사가 없는 카드는 콘티 그림에 "콘티" 꼬리표를 붙여 보인다', () => {
    const html = card({ picture: storyboardCardPicture(rough, null) })
    expect(html).toContain('https://x/rough-start.png')
    expect(html).toContain('>콘티<')
    expect(html).toContain('data-picture="conti"')
  })

  // 왜(오너 S2 "(현재)디렉터의 스토리보드 상태"): 실사가 생기면 콘티 대신 실사 시작 · 연출 · 끝을 보이고 꼬리표는 없다.
  it('실사가 있는 카드는 실사 그림을 보이고 "콘티" 꼬리표가 없다', () => {
    const html = card({ picture: storyboardCardPicture(rough, real) })
    expect(html).toContain('https://x/real-start.png')
    expect(html).not.toContain('https://x/rough-start.png')
    expect(html).not.toContain('>콘티<')
  })

  // 왜(혼자 정한 것 f): 콘티 그림이 없으면 실사도 못 만든다 — 빈 칸이 고장처럼 보이지 않게 어디서 그리는지 알린다.
  it('콘티 그림도 없는 카드는 "콘티 그림이 없어요"와 Writer 에서 그린 뒤 [시작]을 누르라는 안내를 보인다', () => {
    const html = card({ picture: storyboardCardPicture(null, null) })
    expect(html).toContain('콘티 그림이 없어요')
    expect(html).toContain('Writer 콘티에서 그린 뒤 [시작]을 눌러 주세요.')
  })

  // 왜(오너 S5 · O7 "카드에 로딩창"): 실사를 그리는 동안 화면을 막지 않고 그 카드만 덮는다.
  it('실사를 그리는 카드는 카드 전체를 덮는 기다림 카드로 "이미지를 그리고 있어요"와 샷 이름을 보인다', () => {
    const html = card({ wait: 'drawing', announceWait: true })
    expect(html).toContain('이미지를 그리고 있어요')
    expect(html).toContain('씬 1 · 샷 2 · 5초')
    expect(html).toContain('role="status"')
  })

  // 왜(혼자 정한 것 — Director 카드와 같은 말): [시작]이 맡았지만 아직 보내지 않은 샷은 "곧 그린다"를 보여야 다시 누르지 않는다.
  it('[시작] 차례를 기다리는 카드는 "이미지 생성 대기 중" 기다림 카드를 보인다', () => {
    expect(card({ wait: 'queued' })).toContain('이미지 생성 대기 중')
  })

  // 왜(11/9 실측): 축척 5 · 6열 카드에는 설명까지 들어가지 않는다 — 제목만 남긴다(지금 보드와 같은 규칙).
  it('좁은 카드의 기다림에는 설명 없이 제목만 보인다', () => {
    const html = card({ wait: 'drawing', compact: true })
    expect(html).toContain('이미지를 그리고 있어요')
    expect(html).not.toContain('씬 1 · 샷 2 · 5초')
  })

  // 왜(정상 경로 고정): 기다림이 없으면 카드를 덮지 않는다.
  it('기다림이 없는 카드는 기다림 카드를 덮지 않는다', () => {
    const html = card()
    expect(html).not.toContain('이미지를 그리고 있어요')
    expect(html).not.toContain('이미지 생성 대기 중')
  })

  // 왜(G3 · Producer · Artist 카드와 같은 모양): 입력에 "@샷 N"이 붙은 카드는 하늘색 테두리로 어느 카드가 붙었는지 보인다.
  it('채팅 입력에 "@샷 N"이 붙은 카드는 하늘색 테두리로 보인다', () => {
    expect(card({ mentioned: true })).toContain('ring-sky-400/70')
    expect(card({ mentioned: false })).not.toContain('ring-sky-400/70')
  })
})
