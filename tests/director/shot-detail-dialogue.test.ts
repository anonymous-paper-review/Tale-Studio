// Director 샷 상세(스토리보드형 팝업 · 노드형 왼쪽 패널)에 그 샷의 대사가 늘 보이는지 — 영상이 쓰는 그 Writer 샷의 대사와 같고, 말하는 사람은 보드 카드와 같은 이름, 대사 없음 · 고칠 곳 안내 — 를 검사한다 (오너 2026-11-27 P1)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ui = vi.hoisted(() => ({ locale: 'ko' as 'ko' | 'en' }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => ui.locale, useT: () => (text: string, params?: Record<string, string | number>) => translate(ui.locale, text, params) }
})

import { ShotDialogue } from '@/components/shot-dialogue'
import { shotDetailDialogue } from '@/lib/director/shot-detail'
import { dialogueLinesView } from '@/lib/writer/board-card'
import { translate } from '@/lib/i18n/translate'
import type { Shot } from '@/types'

// 이 시험을 위해 지은 Writer 샷 둘 — sh_01_02 는 대사 두 줄, sh_01_03 은 대사가 없다.
const writerShots = [
  { shotId: 'sh_01_02', dialogueLines: [{ characterId: 'mina', text: '가자.' }, { characterId: null, text: '그날 밤.' }] },
  { shotId: 'sh_01_03', dialogueLines: [] },
] as unknown as Shot[]
const names = new Map([['mina', '미나']])
const HINT = 'Edit the dialogue in the rough storyboard on the Writer screen or in the Dialogue tab on Storyboard. New videos use the edited dialogue.'
const render = (props: Parameters<typeof ShotDialogue>[0]) => renderToStaticMarkup(createElement(ShotDialogue, props))

beforeEach(() => {
  ui.locale = 'ko'
})

describe('Director 샷 상세의 대사', () => {
  // 왜(오너 P1 — 대사는 Director 까지 고칠 수 있게 할 것): 영상은 낼 때 그 샷의 Writer 대사(shots.dialogue_lines, writerShotId)를 지시문에 싣는다 —
  //   상세가 보이는 대사가 영상이 쓰는 대사와 다르면 무엇이 영상에 들어가는지 알 수 없다.
  it('Director 샷 상세의 대사는 영상이 쓰는 그 Writer 샷(writerShotId)의 대사다', () => {
    expect(shotDetailDialogue(writerShots, 'sh_01_02')).toEqual({ lines: writerShots[0].dialogueLines, editable: true })
    expect(shotDetailDialogue(writerShots, 'sh_01_03')).toEqual({ lines: [], editable: true })
  })

  // 왜(정상 경로 고정): Director 에서 손으로 더한 샷은 Writer 샷이 없어 영상에도 대사가 실리지 않는다 — "대사 없음"이고 고칠 곳도 없다.
  it('Director 에서 더한 샷(Writer 샷 없음)은 대사가 없고 고칠 곳 안내도 없다', () => {
    expect(shotDetailDialogue(writerShots, null)).toEqual({ lines: [], editable: false })
    expect(shotDetailDialogue(writerShots, 'gone')).toEqual({ lines: [], editable: false })
  })

  // 왜(오너 P1 · 보드 카드와 같은 규칙): 같은 대사가 카드 · 대사 탭 · 팝업에서 다른 이름으로 보이면 누가 하는 말인지 헷갈린다.
  it('대사 줄의 말하는 사람은 보드 카드와 같은 규칙이다 — 인물 id 는 이름, 내레이션은 V.O., 모르는 id 는 그대로, 빈 줄은 뺀다', () => {
    expect(dialogueLinesView([
      { characterId: 'mina', text: ' 가자. ' },
      { characterId: null, text: '그날 밤.' },
      { characterId: 'ghost', text: '누구?' },
      { characterId: 'mina', text: '   ' },
    ] as never, names)).toEqual([
      { speaker: '미나', text: '가자.' },
      { speaker: 'V.O.', text: '그날 밤.' },
      { speaker: 'ghost', text: '누구?' },
    ])
  })

  // 왜(오너 P1): 대사가 없을 때 자리째 사라지면 대사가 없는 것인지 안 보이는 것인지 모른다. 고친 대사는 새로 만드는 영상부터 들어간다(이미 만든 Take 는 그대로).
  it('대사 칸은 대사가 없어도 "대사 없음"을 보이고, 고칠 곳과 새 영상부터 들어간다는 안내를 단다', () => {
    const html = render({ lines: [], characterNames: names, entityNames: [], hint: translate('ko', HINT) })
    expect(html).toContain('data-testid="shot-dialogue"')
    expect(html).toContain(translate('ko', 'Dialogue'))
    expect(html).toContain(translate('ko', 'No dialogue'))
    expect(html).toContain(translate('ko', HINT))
    expect(translate('ko', HINT)).not.toBe(HINT)
  })

  // 왜(화면 문구 두 말 규칙): 영어 화면의 대사 칸에 한국어가 섞이면 안 된다(대사 글 자체는 그 프로젝트 말 그대로).
  it('영어 화면이면 대사 칸의 머리 · 대사 없음이 영어다', () => {
    ui.locale = 'en'
    const html = render({ lines: [], characterNames: names, entityNames: [], hint: HINT })
    expect(html).toContain('Dialogue')
    expect(html).toContain('No dialogue')
    expect(html).not.toMatch(/[가-힣]/)
  })

  // 왜(오너 P1 — 카드 클릭 시 나타나는 팝업): 스토리보드형 팝업과 노드형 왼쪽 패널이 같은 부품이다 — 두 탭(이미지 · 영상) 어디서나 보이게 탭 내용 위에 둔다.
  it('Director 샷 상세는 이미지 · 영상 탭 내용 위에 그 Writer 샷의 대사 칸을 둔다', () => {
    const source = readFileSync('src/features/director/shot-detail/director-shot-detail.tsx', 'utf8')
    expect(source).toMatch(/shotDetailDialogue\([^)]*data\.writerShotId\)/)
    const block = source.indexOf('<ShotDialogue')
    expect(block).toBeGreaterThan(-1)
    expect(block).toBeLessThan(source.indexOf("{tab === 'image'"))
  })
})
