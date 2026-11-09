// 다음 화 만들기 창의 이어받는 것 줄 — 그림체 이름 · 장르 · 말투(11/5 시안 R6, 오너 2026-11-09 추천대로)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { nextEpisodeRows, type NextEpisodePreviewView } from '@/features/projects/series-list'
import { translate } from '@/lib/i18n'

const tKo = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const tEn = (text: string, params?: Record<string, string | number>) => translate('en', text, params)
const PREVIEW: NextEpisodePreviewView = {
  prevTitle: 'The Wayfarer’s Return',
  characters: ['Grandfather', 'Okhwa'],
  locations: ['Hwagae 삼거리'],
  hasVoices: false,
  lastSceneAvailable: false,
  style: { kind: 'preset', key: 'ink_sketch', label: '수묵 스케치', subtitle: 'Ink sketch' },
  genre: 'comedy',
}
const row = (rows: { key: string; label: string; value: string }[], key: string) => rows.find((r) => r.key === key)

describe('다음 화 만들기 창의 이어받는 것', () => {
  // 왜: "앞 화와 같아요"만으로는 어떤 그림체가 넘어오는지 모른다 — 이름을 붙인다(영어 화면은 영어 이름).
  it('그림체는 "앞 화와 같아요 (수묵 스케치)"처럼 앞 화 그림체 이름과 함께 보인다', () => {
    expect(row(nextEpisodeRows(PREVIEW, tKo, 'ko'), 'style')).toEqual({ key: 'style', label: '그림체', value: '앞 화와 같아요 (수묵 스케치)' })
    expect(row(nextEpisodeRows(PREVIEW, tEn, 'en'), 'style')?.value).toBe('Same as the previous episode (Ink sketch)')
  })

  // 왜: 사용자가 올린 그림체는 그 이름(없으면 "내 레퍼런스"), 그림체를 모르면 지금처럼 이름 없이 둔다.
  it('사용자가 올린 그림체면 그 이름을, 이름이 없으면 "내 레퍼런스"를 붙이고 그림체를 모르면 "앞 화와 같아요"만 보인다', () => {
    expect(row(nextEpisodeRows({ ...PREVIEW, style: { kind: 'custom', label: 'Watercolor' } }, tKo, 'ko'), 'style')?.value).toBe('앞 화와 같아요 (Watercolor)')
    expect(row(nextEpisodeRows({ ...PREVIEW, style: { kind: 'custom', label: null } }, tKo, 'ko'), 'style')?.value).toBe('앞 화와 같아요 (내 레퍼런스)')
    expect(row(nextEpisodeRows({ ...PREVIEW, style: null }, tKo, 'ko'), 'style')?.value).toBe('앞 화와 같아요')
  })

  // 왜: 다음 화는 앞 화 장르로 시작한다 — 창에서 미리 알려 준다. 앞 화 장르를 모르면 줄을 두지 않는다.
  it('앞 화 장르가 있으면 "장르 · 앞 화에서 이어받아요" 줄을 보이고 없으면 보이지 않는다', () => {
    expect(row(nextEpisodeRows(PREVIEW, tKo, 'ko'), 'genre')).toEqual({ key: 'genre', label: '장르', value: '앞 화에서 이어받아요' })
    expect(row(nextEpisodeRows({ ...PREVIEW, genre: null }, tKo, 'ko'), 'genre')).toBeUndefined()
  })

  // 왜: 정상 경로 고정 — 인물 · 배경 이름은 그대로, 말투는 앞 화가 대사까지 끝났을 때만 넘어온다(시안에는 없지만 제품대로 남김).
  it('등장인물 · 배경은 이름을 잇고, 말투는 앞 화가 대사까지 끝났을 때만 줄로 보인다', () => {
    const rows = nextEpisodeRows(PREVIEW, tKo, 'ko')
    expect(rows.map((r) => r.key)).toEqual(['characters', 'backgrounds', 'style', 'genre'])
    expect(row(rows, 'characters')?.value).toBe('Grandfather · Okhwa')
    expect(row(nextEpisodeRows({ ...PREVIEW, hasVoices: true }, tKo, 'ko'), 'voices')).toEqual({ key: 'voices', label: '말투', value: '앞 화에서 이어받아요' })
    expect(readFileSync('src/features/projects/next-episode-dialog.tsx', 'utf8')).toContain('nextEpisodeRows(preview, t, locale)')
  })
})
