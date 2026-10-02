// 새 프로젝트에서 무엇을 만들지 고르면 포맷 초안이 정해지고, 아이디어나 자료가 있어야 시작한다 (2026-10-02 오너 · 시안 v04 0.1)
import { describe, expect, it } from 'vitest'
import { PROJECT_PURPOSES, purposeSettings, purposeSummary } from '@/lib/project/purpose'
import { newProjectInputError, newProjectTitle } from '@/lib/project/new-project-input'

describe('무엇을 만들까요', () => {
  it('새 프로젝트는 여섯 가지 만들 것 중에서 고른다', () => {
    expect(PROJECT_PURPOSES.map((p) => p.id)).toEqual(['short_film', 'drama_pilot', 'ad', 'adaptation', 'music_video', 'custom'])
  })

  it('만들 것을 고르면 화면 비율과 러닝타임과 장르 초안이 정해진다', () => {
    const draft = Object.fromEntries(PROJECT_PURPOSES.map((p) => {
      const s = purposeSettings(p.id, 'ko')
      return [p.id, [s.format, s.playtime, s.genre]]
    }))
    expect(draft).toEqual({
      short_film: ['horizontal_16:9', 300, '드라마'],
      drama_pilot: ['horizontal_16:9', 720, '드라마'],
      ad: ['vertical_9:16', 30, '광고'],
      adaptation: ['cinema_2.39:1', 300, '판타지'],
      music_video: ['horizontal_16:9', 180, '뮤직비디오'],
      custom: ['horizontal_16:9', 60, '드라마'],
    })
  })

  it('대사 언어는 프로젝트 언어로 미리 채운다', () => {
    expect(purposeSettings('short_film', 'ko').dialogueLanguage).toBe('ko')
    expect(purposeSettings('short_film', 'en')).toMatchObject({ dialogueLanguage: 'en', genre: 'Drama' })
  })

  it('고른 것은 두 번째 화면 위에 이름과 비율과 러닝타임으로 보인다', () => {
    expect(purposeSummary('short_film', 'ko')).toBe('단편 영화 · 16:9 · 5분')
    expect(purposeSummary('ad', 'ko')).toBe('광고 · 브랜드 · 9:16 · 30초')
  })
})

describe('자료와 아이디어', () => {
  it('아이디어나 자료 중 하나만 있어도 시작할 수 있다', () => {
    expect(newProjectInputError({ idea: '두 아이가 다투고 화해하는 이야기', fileCount: 0 })).toBeNull()
    expect(newProjectInputError({ idea: '  ', fileCount: 1 })).toBeNull()
  })

  it('아이디어도 자료도 없으면 시작하지 않는다', () => {
    expect(newProjectInputError({ idea: ' \n ', fileCount: 0 })).toBe('empty')
  })

  it('제목은 아이디어 첫 줄을 서른 자까지 쓰고 아이디어가 없으면 첫 파일 이름을 쓴다', () => {
    expect(newProjectTitle('비 오는 밤의 편의점\n둘째 줄', [])).toBe('비 오는 밤의 편의점')
    expect(newProjectTitle('초등학교 운동장에서 사방치기를 하던 두 아이가 다투고 친구의 도움으로 화해하는 이야기', [])).toBe('초등학교 운동장에서 사방치기를 하던 두 아이가 다투고…')
    expect(newProjectTitle('', ['시나리오_초안.pdf', '메모.txt'])).toBe('시나리오_초안')
    expect(newProjectTitle('', [])).toBe('Untitled')
  })
})
