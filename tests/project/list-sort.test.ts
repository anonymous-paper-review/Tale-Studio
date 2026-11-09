// 프로젝트 목록의 이름으로 찾기와 정렬(최신순 · 오래된순 · 이름순 · 단계순) — 11/5 시안 R2 (리드 2026-11-09)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT_SORT, PROJECT_SORTS, visibleProjects, type ProjectSort } from '@/features/projects/project-list'
import { ProjectListTools } from '@/features/projects/project-list-tools'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'

const ko = (text: string) => translate('ko', text)
const en = (text: string) => translate('en', text)
const page = () => readFileSync('src/app/projects/page.tsx', 'utf8')

// 이 시험을 위해 지은 프로젝트들 — 고친 때 · 단계 · 이름이 서로 엇갈리게 놓았다.
const PROJECTS = [
  { id: 'rain', title: '비 오는 날 만난 두 사람', current_stage: 'producer', updated_at: '2026-10-30T00:00:00.000Z' },
  { id: 'hk', title: 'Hong Kong Love Story', current_stage: 'editor', updated_at: '2026-11-05T00:00:00.000Z' },
  { id: 'vend', title: '자판기의 반란', current_stage: 'writer', updated_at: '2026-10-28T00:00:00.000Z' },
  { id: 'none', title: 'apple pie', current_stage: 'entry', updated_at: null },
  { id: 'rename', title: '이름 변경 테스트', current_stage: 'entry', updated_at: '2026-11-02T00:00:00.000Z' },
  { id: 'way', title: "The Wayfarer's Return", current_stage: 'artist', updated_at: '2026-11-01T00:00:00.000Z' },
]
const ids = (sort: ProjectSort, locale: 'ko' | 'en' = 'ko', query = '') =>
  visibleProjects(PROJECTS, { query, sort, locale }).map((p) => p.id)

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
})

describe('프로젝트 목록 정렬', () => {
  // 왜: 정상 경로 고정 — 지금 목록 순서(최근에 고친 것 먼저)가 기본이다. 이어 만들 화 고르기(R4)와 같은 뜻이다.
  it('정렬을 고르지 않으면 최근에 고친 프로젝트가 먼저 오고 고친 때를 모르는 프로젝트는 맨 뒤다', () => {
    expect(DEFAULT_PROJECT_SORT).toBe('recent')
    expect(ids('recent')).toEqual(['hk', 'rename', 'way', 'rain', 'vend', 'none'])
  })

  // 왜: 오래 손대지 않은 프로젝트를 정리하거나 처음 만든 작품을 찾을 때.
  it('오래된순이면 가장 오래전에 고친 프로젝트가 먼저 오고 고친 때를 모르는 프로젝트는 맨 뒤다', () => {
    expect(ids('oldest')).toEqual(['vend', 'rain', 'way', 'rename', 'hk', 'none'])
  })

  // 왜: 이름이 기억나는 프로젝트를 차례로 찾을 때. 화면 언어의 글자부터 놓는다(한국어 화면은 한글 먼저).
  it('이름순이면 한국어 화면은 한글 이름을 ㄱ부터 ㅎ 순서로 먼저, 영어 화면은 영어 이름을 A부터 Z 순서로 먼저 놓고 대소문자는 가리지 않는다', () => {
    expect(ids('name', 'ko')).toEqual(['rain', 'rename', 'vend', 'none', 'hk', 'way'])
    expect(ids('name', 'en')).toEqual(['none', 'hk', 'way', 'rain', 'rename', 'vend'])
  })

  // 왜: 어느 단계까지 왔는지로 모아 볼 때. 같은 단계 안에서는 방금 손댄 것이 위에 있어야 찾기 쉽다.
  it('단계순이면 Producer 부터 Editor 까지 단계 순서로 놓고 같은 단계 안에서는 최근에 고친 것이 먼저다', () => {
    expect(ids('stage')).toEqual(['rename', 'none', 'rain', 'way', 'vend', 'hk'])
  })

  // 왜: 고른 정렬이 다음 방문까지 남으면 "왜 순서가 바뀌었지?"가 된다(리드 결정 — 들어올 때마다 최신순).
  it('정렬은 기억하지 않아 목록을 열 때마다 최신순으로 시작한다', () => {
    expect(page()).toContain('useState<ProjectSort>(DEFAULT_PROJECT_SORT)')
    expect(page()).not.toMatch(/localStorage[^\n]*[Ss]ort|[Ss]ort[^\n]*localStorage/)
  })

  // 왜: 정렬 단추를 누르면 네 가지가 시안 이름 그대로 보여야 한다. 영어 화면의 이름순은 A → Z 다.
  it('정렬 메뉴는 최신순 · 오래된순 · 이름순 (ㄱ → ㅎ) · 단계순 (Producer → Editor) 네 가지이고 영어 화면에서는 이름순이 A → Z 로 보인다', () => {
    expect(PROJECT_SORTS.map((s) => s.key)).toEqual(['recent', 'oldest', 'name', 'stage'])
    expect(PROJECT_SORTS.map((s) => ko(s.label))).toEqual(['최신순', '오래된순', '이름순 (ㄱ → ㅎ)', '단계순 (Producer → Editor)'])
    expect(en(PROJECT_SORTS.find((s) => s.key === 'name')!.label)).toBe('Name (A → Z)')
  })
})

describe('프로젝트 목록 이름으로 찾기', () => {
  // 왜: 프로젝트가 많으면 목록에서 찾기 어렵다. 이어 만들 화 찾기(R4)와 같은 규칙이라 "다음화"로 쳐도 "다음 화"가 찾아진다.
  it('이름으로 찾으면 이름에 그 글이 든 프로젝트만 남기고 영어 대소문자와 띄어쓰기는 가리지 않는다', () => {
    expect(ids('recent', 'ko', '자판기')).toEqual(['vend'])
    expect(ids('recent', 'ko', 'hongkong')).toEqual(['hk'])
    expect(ids('recent', 'ko', 'LOVE story')).toEqual(['hk'])
    expect(ids('recent', 'ko', '없는 이름')).toEqual([])
  })

  // 왜: 정상 경로 고정 — 찾는 칸을 비우면 원래 목록으로 돌아간다.
  it('찾는 글이 비어 있으면 모든 프로젝트를 보인다', () => {
    expect(ids('recent', 'ko', '   ')).toHaveLength(PROJECTS.length)
  })

  // 왜: 찾은 결과가 비면 빈 화면 대신 이유를 알려 줘야 한다(첫 프로젝트 만들기 안내와 다르다).
  it('찾는 이름에 맞는 프로젝트가 없으면 목록 자리에 "이름이 맞는 프로젝트가 없어요."를 보인다', () => {
    expect(page()).toContain("t('No project matches that name.')")
    expect(ko('No project matches that name.')).toBe('이름이 맞는 프로젝트가 없어요.')
  })

  // 왜: 화면 읽기로 쓰는 사람은 단추 글("최신순")만으로는 무엇을 고르는 단추인지 모른다(검토 B 5b).
  it('정렬 단추는 화면 읽기에 "정렬: 최신순"처럼 무엇을 고르는 단추인지와 지금 정렬을 함께 알린다', () => {
    const out = renderToStaticMarkup(
      createElement(ProjectListTools, { query: '', onQueryChange: () => {}, sort: 'name', onSortChange: () => {} }),
    )
    expect(out).toContain('aria-label="정렬: 이름순 (ㄱ → ㅎ)"')
    expect(en('Sort: {sort}').replace('{sort}', en('Latest'))).toBe('Sort: Latest')
  })

  // 왜: 고른 줄의 ✓ 는 눈으로만 보인다 — 메뉴를 열면 화면 읽기도 어느 줄이 골라져 있는지 알려야 한다(검토 B 5b).
  it('정렬 메뉴는 네 줄을 하나만 고르는 묶음으로 두어 화면 읽기에 고른 줄을 알린다', () => {
    const source = readFileSync('src/features/projects/project-list-tools.tsx', 'utf8')
    expect(source).toContain('<DropdownMenuRadioGroup value={sort}')
    expect(source).toContain('<DropdownMenuRadioItem')
    expect(source).not.toContain('<DropdownMenuItem')
  })

  // 왜: 찾기 칸과 정렬 단추는 목록 머리에 같이 있다(시안 R2) — 지금 고른 정렬 이름이 단추에 보인다.
  it('목록 머리에 "프로젝트 이름으로 찾기" 칸과 지금 정렬 이름이 적힌 정렬 단추를 둔다', () => {
    const out = renderToStaticMarkup(
      createElement(ProjectListTools, { query: '', onQueryChange: () => {}, sort: 'recent', onSortChange: () => {} }),
    )
    expect(out).toContain('placeholder="프로젝트 이름으로 찾기"')
    expect(out).toContain('최신순')
    expect(page()).toContain('<ProjectListTools')
  })
})
