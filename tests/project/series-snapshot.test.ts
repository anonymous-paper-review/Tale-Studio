// 시리즈 다음 화가 앞 화에서 받은 기록을 읽고, 앞 화 산문을 Writer에 넣을 글로 만든다
import { describe, expect, it } from 'vitest'
import { parseSeries, seriesImageUse, styleIdOf, trimSeriesProse } from '@/lib/series/snapshot'
import { proseTextOf, seriesPipelineInput } from '@/lib/series/seed'

const snapshot = {
  version: 1,
  prevProjectId: 'p1',
  prevTitle: '자판기의 반란',
  copiedAt: '2026-10-26T00:00:00.000Z',
  characters: [
    { characterId: 'minho', name: '민호', role: 'protagonist', appearance: '20대 회사원', personality: ['소심함'], sheetUrl: 'https://x/sheet.png', portraitUrl: null, styleId: 'anime' },
    { characterId: '', name: '번호 없음' },
  ],
  locations: [{ locationId: 'hall', name: '회사 복도 자판기 앞', description: '형광등', wideShotUrl: null, styleId: 'anime' }],
  voices: [{ character_id: 'minho', name: '민호', speech_style: '존댓말', verbal_tics: ['저기'], example_lines: [] }],
  styleId: 'anime',
  format: 'vertical_9:16',
  dialogueLanguage: 'ko',
  continuesLastScene: true,
  copyFailures: ['팀장'],
}

describe('시리즈 기록 읽기와 앞 화 산문', () => {
  it('시리즈 기록 모양이 틀리면 시리즈가 아닌 프로젝트로 읽는다', () => {
    expect(parseSeries(null)).toBeNull()
    expect(parseSeries({ ...snapshot, version: 2 })).toBeNull()
    expect(parseSeries({ ...snapshot, prevTitle: '  ' })).toBeNull()
  })

  it('시리즈 기록에서 번호나 이름이 빠진 인물은 버리고 나머지를 읽는다', () => {
    const series = parseSeries(snapshot)
    expect(series?.characters.map((c) => c.characterId)).toEqual(['minho'])
    expect(series?.voices[0]).toMatchObject({ character_id: 'minho', speech_style: '존댓말', verbal_tics: ['저기'] })
    expect(series?.continuesLastScene).toBe(true)
    expect(series?.format).toBe('vertical_9:16')
    expect(parseSeries({ ...snapshot, format: 'landscape' })?.format).toBeNull()
    expect(series?.copyFailures).toEqual(['팀장'])
  })

  it('사용자가 올린 그림체도 프로젝트에 적힌 그림체 키로 같은 그림체인지 가린다', () => {
    expect(styleIdOf({ style_anchor_key: 'custom_abc', custom_style_anchor: { url: 'https://x/a.png' } })).toBe('custom_abc')
    expect(styleIdOf({ style_anchor_key: null, custom_style_anchor: null })).toBeNull()
  })

  it('이어받은 그림이 없으면 다시 쓸 그림도 다시 그릴 참고 그림도 없다', () => {
    expect(seriesImageUse({ styleId: 'anime', image: null }, { currentStyleId: 'real', appears: true })).toBe('none')
  })

  it('앞 화 산문이 8000자를 넘으면 앞부분을 줄이고 끝부분을 더 남긴다', () => {
    const text = `${'가'.repeat(5000)}${'나'.repeat(5000)}`
    const trimmed = trimSeriesProse(text)
    expect(trimmed.length).toBeLessThanOrEqual(8000)
    expect(trimmed.startsWith('가')).toBe(true)
    expect(trimmed.endsWith('나'.repeat(5000))).toBe(true)
    expect(trimSeriesProse('짧은 산문')).toBe('짧은 산문')
  })

  it('앞 화 산문의 인물 · 장소 번호는 이름으로 바꿔 씬마다 문단으로 잇는다', () => {
    const prose = proseTextOf({
      scenes: { scenes: [{ scene_actions: ['minho가 hall에서 동전을 넣는다.', ' '] }, { scene_actions: ['자판기가 말을 건다.'] }] },
      characters: { characters: [{ id: 'minho', name: '민호' }] },
      world: { locations: [{ id: 'hall', name: '복도' }] },
    })
    expect(prose).toBe('민호가 복도에서 동전을 넣는다.\n\n자판기가 말을 건다.')
  })

  it('앞 화를 읽지 못했으면 Writer에 앞 화 산문 없이 제목과 이어받은 이름만 넘긴다', () => {
    const series = parseSeries(snapshot)!
    expect(seriesPipelineInput(series, null)).toEqual({ prevTitle: '자판기의 반란', prevProse: null, characters: ['민호'], locations: ['회사 복도 자판기 앞'] })
  })
})
