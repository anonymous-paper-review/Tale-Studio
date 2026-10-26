// 프로젝트 목록의 시리즈 — 카드의 앞 화 줄, [새 프로젝트]에서 앞 화를 골라 이어 만들기, 지우기 전 경고, 목록이 함께 주는 칸.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  NEXT_EPISODE_NOT_READY,
  canContinueLastScene,
  continuableEpisodes,
  continueEntry,
  continuingEpisodes,
  newProjectEntry,
  nextEpisodeFailure,
  prevEpisodeLink,
  seriesListFields,
} from '@/features/projects/series-list'
import { translate } from '@/lib/i18n'
import { relativeTime } from '@/lib/i18n/relative-time'
import { SERIES_VERSION } from '@/lib/series/snapshot'

const page = () => readFileSync('src/app/projects/page.tsx', 'utf8')
const dialogs = () => readFileSync('src/features/projects/next-episode-dialog.tsx', 'utf8')
const chooser = () => readFileSync('src/features/projects/new-project-dialog.tsx', 'utf8')
const userMenu = () => readFileSync('src/components/layout/user-menu.tsx', 'utf8')
const route = () => readFileSync('src/app/api/project/list/route.ts', 'utf8')
const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)

/** 앞 화에서 복사해 온 시리즈 정보(projects.series) — 제목만 쓰는 자리라 목록은 비워 둔다. */
const seriesOf = (prevTitle: string) => ({
  version: SERIES_VERSION,
  prevProjectId: 'p1',
  prevTitle,
  copiedAt: '2026-10-26T00:00:00.000Z',
  characters: [],
  locations: [],
  voices: [],
  styleId: null,
  format: null,
  dialogueLanguage: null,
  continuesLastScene: false,
  copyFailures: [],
})

describe('프로젝트 목록의 시리즈', () => {
  // 왜: 정상 경로 고정 — 카드만 보고 어느 화의 다음 화인지 알 수 있어야 한다(시리즈 묶음도 화 번호도 없다).
  it('다음 화 카드에는 앞 화 제목을 보여 준다', () => {
    expect(prevEpisodeLink({ id: 'p2', referenceProjectId: 'p1', seriesPrevTitle: '점심 메뉴 룰렛', canContinue: true })).toEqual({
      title: '점심 메뉴 룰렛',
      deleted: false,
    })
    // 시리즈가 아닌 화(1화)에는 줄이 없다.
    expect(prevEpisodeLink({ id: 'p1', referenceProjectId: null, seriesPrevTitle: null, canContinue: true })).toBeNull()
    expect(page()).toContain('prevEpisodeLink(')
  })

  // 왜: 앞 화를 지우면 연결(reference_project_id)이 끊긴다 — 제목만 남은 카드가 아무 설명 없이 보이면 사람이 고장으로 읽는다.
  it('앞 화를 지운 다음 화 카드에는 앞 화가 지워졌다고 보여 준다', () => {
    expect(prevEpisodeLink({ id: 'p2', referenceProjectId: null, seriesPrevTitle: '점심 메뉴 룰렛', canContinue: true })).toEqual({
      title: '점심 메뉴 룰렛',
      deleted: true,
    })
    expect(translate('ko', 'The previous episode was deleted')).toBe('앞 화가 지워졌어요')
    expect(page()).toContain("t('The previous episode was deleted')")
  })

  // 왜: 카드 99장 중 74장에 버튼이 붙어 목록이 어수선했다(오너 2026-10-26) — 다음 화는 [새 프로젝트]에서 만든다.
  it('프로젝트 카드에는 다음 화 만들기와 산문 보기 버튼이 없다', () => {
    const source = page()
    expect(source).not.toContain('project-next-episode')
    expect(source).not.toContain('project-prev-prose')
    expect(source).not.toContain("t('Create next episode')")
    expect(source).not.toContain("t('View prose')")
    // 다음 화 카드의 "← 앞 화 제목" 줄은 남는다.
    expect(source).toContain('prevEpisodeLink(')
  })

  // 왜: 정상 경로 고정 — 이어 만들 화가 있는 사람은 [새 프로젝트]에서 처음부터 만들지, 앞 화에서 이어 만들지 고른다.
  it('이어 만들 수 있는 화가 하나라도 있으면 새 프로젝트를 누를 때 처음부터 만들기와 앞 화에서 이어 만들기를 고르는 창을 연다', () => {
    expect(newProjectEntry([{ id: 'p1', canContinue: false }, { id: 'p2', canContinue: true }])).toBe('choose')
    expect(ko('How do you want to start?')).toBe('어떻게 시작할까요?')
    expect(ko('Start from scratch')).toBe('처음부터 만들기')
    expect(ko('Continue from a previous episode')).toBe('앞 화에서 이어 만들기')
    expect(page()).toContain('newProjectEntry(')
    expect(page()).toContain('<NewProjectDialog')
    expect(chooser()).toContain("t('Start from scratch')")
    expect(chooser()).toContain("t('Continue from a previous episode')")
  })

  // 왜: 처음 쓰는 사람이나 아직 그림을 만든 화가 없는 사람에게 고를 것 없는 창을 보이면 클릭만 는다(오너 추천안 ② 채택).
  it('이어 만들 수 있는 화가 없으면 새 프로젝트를 누를 때 바로 새 프로젝트를 만든다', () => {
    expect(newProjectEntry([])).toBe('direct')
    expect(newProjectEntry([{ id: 'p1', canContinue: false }])).toBe('direct')
    expect(page()).toContain("router.push('/projects/new')")
  })

  // 왜: 그림 만들기 전인 화에는 이어받을 인물 · 배경 그림이 없다 — 골라도 만들 수 없는 화는 목록에 넣지 않는다.
  it('앞 화에서 이어 만들기 목록에는 다음 화를 만들 수 있는 화만 나온다', () => {
    const projects = [
      { id: 'p1', title: '점심 메뉴 룰렛', canContinue: true, updated_at: '2026-10-20T00:00:00.000Z' },
      { id: 'p2', title: '퇴근길 우산', canContinue: false, updated_at: '2026-10-25T00:00:00.000Z' },
    ]
    expect(continuableEpisodes(projects, '').map((p) => p.id)).toEqual(['p1'])
  })

  // 왜: 프로젝트가 많으면 목록에서 찾기 어렵다(오너 2026-10-26 "프로젝트 많으면 찾기 힘드니까").
  it('검색 칸에 이름 일부를 치면 그 글자가 이름에 든 화만 남는다', () => {
    const projects = [
      { id: 'p1', title: '프리렌 — 남겨진 마법', canContinue: true, updated_at: '2026-10-20T00:00:00.000Z' },
      { id: 'p2', title: '점심 메뉴 룰렛', canContinue: true, updated_at: '2026-10-25T00:00:00.000Z' },
    ]
    expect(continuableEpisodes(projects, '프리렌').map((p) => p.id)).toEqual(['p1'])
    expect(continuableEpisodes(projects, '없는 이름')).toEqual([])
    expect(continuableEpisodes(projects, '   ').map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(ko('Find by project name')).toBe('프로젝트 이름으로 찾기')
    expect(ko('No episode matches that name.')).toBe('이름이 맞는 화가 없어요.')
    expect(chooser()).toContain("t('Find by project name')")
  })

  // 왜: 정상 경로 고정 — 고른 뒤에는 카드에서 쓰던 만들기 창(이어받는 것 · 마지막 장면 잇기)을 그대로 쓴다.
  it('목록에서 화를 고르면 다음 화 만들기 창을 연다', () => {
    expect(chooser()).toContain('<NextEpisodeDialog')
    expect(chooser()).toMatch(/onClick=\{\(\) => pick\(project\)\}/)
    // 만들기 창은 이 창 하나에서만 연다 — 목록 화면이 따로 열지 않는다.
    expect(page()).not.toContain('<NextEpisodeDialog')
    expect(ko('Which episode do you want to continue?')).toBe('어느 화에서 이어 만들까요?')
  })

  // 왜: 이어 만들 화는 대개 방금 작업한 화다.
  it('앞 화에서 이어 만들기 목록은 최근에 고친 화가 먼저 나온다', () => {
    const projects = [
      { id: 'old', title: 'A', canContinue: true, updated_at: '2026-10-01T00:00:00.000Z' },
      { id: 'none', title: 'B', canContinue: true, updated_at: null },
      { id: 'new', title: 'C', canContinue: true, updated_at: '2026-10-26T00:00:00.000Z' },
    ]
    expect(continuableEpisodes(projects, '').map((p) => p.id)).toEqual(['new', 'old', 'none'])
  })

  // 왜: "다음화"로 쳐도 "다음 화 테스트"가 찾아져야 한다. 영어 이름은 대소문자를 섞어 쓴다.
  it('검색은 영어 대소문자와 띄어쓰기를 무시한다', () => {
    const projects = [
      { id: 'p1', title: '다음 화 테스트', canContinue: true, updated_at: '2026-10-20T00:00:00.000Z' },
      { id: 'p2', title: 'The Great Immigrant Miracle', canContinue: true, updated_at: '2026-10-25T00:00:00.000Z' },
    ]
    expect(continuableEpisodes(projects, '다음화').map((p) => p.id)).toEqual(['p1'])
    expect(continuableEpisodes(projects, 'great IMMIGRANT').map((p) => p.id)).toEqual(['p2'])
    expect(continuableEpisodes(projects, 'greatimmigrant').map((p) => p.id)).toEqual(['p2'])
  })

  // 왜: 앞 화와 다음 화는 프로젝트 칸 2개를 쓴다 — 무료 · Starter에서 눌러 보면 왜 안 되는지 알려 주고 요금제로 보낸다.
  it('요금제가 안 되면 앞 화에서 이어 만들기에 자물쇠가 보이고 누르면 요금제 안내 창을 연다', () => {
    expect(continueEntry({ canUseReference: false, slotLimit: 1, used: 1 })).toBe('plan')
    // 칸이 남아 있어도 요금제 안내가 먼저다 — 칸이 1개면 어느 화로도 다음 화를 만들 수 없다.
    expect(continueEntry({ canUseReference: false, slotLimit: 1, used: 0 })).toBe('plan')
    // 서버가 막아도 같은 창을 연다.
    expect(nextEpisodeFailure('reference_unavailable')).toBe('plan')
    expect(chooser()).toContain('<Lock')
    expect(chooser()).toContain('<SeriesPlanDialog')

    expect(ko('Creating a next episode needs Producer10 or above')).toBe('다음 화 만들기는 Producer10 이상에서 쓸 수 있어요')
    expect(dialogs()).toContain("t('Creating a next episode needs Producer10 or above')")
  })

  // 왜: 다음 화도 프로젝트 하나다 — 칸이 없으면 고르기 · 만들기 창까지 갔다가 막히지 않게 먼저 알린다.
  it('프로젝트 칸을 다 썼으면 앞 화에서 이어 만들기를 누를 때 칸이 찼다는 창을 연다', () => {
    expect(continueEntry({ canUseReference: true, slotLimit: 2, used: 2 })).toBe('slots')
    expect(continueEntry({ canUseReference: true, slotLimit: 3, used: 2 })).toBe('pick')
    // 칸 제한이 없는 계정(관리자)은 막지 않는다.
    expect(continueEntry({ canUseReference: true, slotLimit: null, used: 9 })).toBe('pick')
    expect(nextEpisodeFailure('slot_limit')).toBe('slots')
    expect(chooser()).toContain('<SeriesSlotLimitDialog')

    expect(translate('ko', 'You have used all {count} project slots', { count: 2 })).toBe('프로젝트 칸 2개를 다 썼어요')
    expect(translate('ko', 'Deleting an old episode keeps the character and background images copied into the next episode.')).toBe(
      '옛 화를 지워도 다음 화에 복사된 인물·배경 그림은 남아요.',
    )
    expect(dialogs()).toContain("t('You have used all {count} project slots'")
  })

  // 왜: 카드에 있던 "Artist에서 [만들기]를 누른 화부터…" 안내를 없앴다 — 왜 어떤 화가 목록에 없는지는 고르는 곳에서 알린다.
  it('고르기 창 위에 어떤 화가 목록에 나오는지 한 줄로 알린다', () => {
    // 목록에 나오는 기준은 "씬이 1개 이상"이다(10-04 결정 0-5). 씬은 인물·배경 그림 만들기가 시작될 때 처음 저장된다
    //   (리뉴얼 뒤에는 Artist [만들기], 그 전 프로젝트는 Writer 씬 확정). 두 경우에 다 맞는 말로 쓴다.
    expect(ko('Only episodes where you started making the character and background images appear. Most recently edited first.')).toBe(
      '인물·배경 그림을 만들기 시작한 화만 보여요. 최근에 고친 순서예요.',
    )
    expect(chooser()).toContain(
      "t('Only episodes where you started making the character and background images appear. Most recently edited first.')",
    )
  })

  // 왜: 예전 안내 "Artist에서 [만들기]를 누른 화부터"는 리뉴얼 전 프로젝트와 어긋났다 — Writer 단계 화도 씬이 있으면 다음 화를 만들 수 있다.
  it('씬이 없는 화로 다음 화를 만들려 하면 인물·배경 그림을 만들기 시작한 화부터 된다고 알린다', () => {
    expect(ko(NEXT_EPISODE_NOT_READY)).toBe('인물·배경 그림을 만들기 시작한 화부터 다음 화를 만들 수 있어요.')
    expect(dialogs()).toContain('t(NEXT_EPISODE_NOT_READY)')
  })

  // 왜: 들어가는 곳마다 동작이 다르면 헷갈린다 — Studio 사이드바에서 새 프로젝트를 열어도 같은 창이다.
  it('사이드바 사용자 메뉴의 새 프로젝트도 같은 고르기 창을 연다', () => {
    const source = userMenu()
    expect(source).toContain('newProjectEntry(')
    expect(source).toContain('<NewProjectDialog')
  })

  // 왜: 한국어 화면에서 카드 날짜만 "3h ago"처럼 영어로 보였다(2026-10-26 운영 화면).
  it('프로젝트 카드의 날짜는 화면 언어로 보인다', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000 - 60 * 1000).toISOString()
    expect(relativeTime(threeHoursAgo, ko)).toBe('3시간 전')
    expect(page()).toContain('relativeTime(')
    expect(page()).not.toMatch(/h ago`/)
  })

  // 왜: 앞 화를 지우면 다음 화 Writer가 읽던 줄거리가 사라진다 — 되돌릴 수 없으니 지우기 전에 무엇이 남고 무엇이 사라지는지 보여 준다.
  it('다음 화가 있는 화를 지우려 하면 먼저 경고한다', () => {
    const projects = [
      { id: 'p1', title: '점심 메뉴 룰렛', referenceProjectId: null, seriesPrevTitle: null, canContinue: true },
      { id: 'p2', title: '퇴근길 우산', referenceProjectId: 'p1', seriesPrevTitle: '점심 메뉴 룰렛', canContinue: false },
    ]
    expect(continuingEpisodes(projects, 'p1').map((p) => p.title)).toEqual(['퇴근길 우산'])
    expect(continuingEpisodes(projects, 'p2')).toEqual([])

    expect(translate('ko', 'This episode has a next episode')).toBe('이 화를 이어받은 다음 화가 있어요')
    expect(translate('ko', 'Character and background images copied into the next episode, the art style, the voices')).toBe(
      '다음 화에 복사된 인물·배경 그림 · 그림체 · 말투',
    )
    expect(translate('ko', 'Every video and image file in this episode, and the story of this episode that the next episode reads')).toBe(
      '이 화의 영상·그림 파일 전부 · 다음 화 Writer가 읽던 이 화 줄거리',
    )
    expect(translate('ko', 'After deleting, the next episode card shows "The previous episode was deleted". This cannot be undone.')).toBe(
      '지우면 다음 화 카드에 "앞 화가 지워졌어요"가 보여요. 되돌릴 수 없어요.',
    )
    expect(page()).toContain('continuingEpisodes(')
  })

  // 왜: 앞 화 마지막 샷의 완성된 스토리보드 끝 장면만 쓴다(러프 · 썸네일로 대체하지 않는다) — 없는데 고르게 하면 빈 그림으로 시작한다.
  it('마지막 장면 잇기는 앞 화 마지막 끝 장면이 있을 때만 고를 수 있다', () => {
    expect(canContinueLastScene({ lastSceneAvailable: true })).toBe(true)
    expect(canContinueLastScene({ lastSceneAvailable: false })).toBe(false)
    expect(canContinueLastScene(null)).toBe(false)

    expect(translate('ko', 'Start from the last scene of the previous episode')).toBe('앞 화 마지막 장면에서 이어 시작하기')
    expect(dialogs()).toContain('canContinueLastScene(')
  })

  // 왜: 카드마다 앞 화를 따로 물으면 프로젝트 수만큼 조회가 늘어난다 — 목록 한 번에 앞 화 연결과 만들 수 있는지를 함께 싣는다.
  it('목록은 프로젝트마다 앞 화 연결과 다음 화를 만들 수 있는지를 함께 준다', () => {
    const withScenes = new Set(['p1'])
    expect(seriesListFields({ id: 'p1', reference_project_id: null, series: null }, withScenes)).toEqual({
      referenceProjectId: null,
      seriesPrevTitle: null,
      canContinue: true,
    })
    expect(seriesListFields({ id: 'p2', reference_project_id: 'p1', series: seriesOf('점심 메뉴 룰렛') }, withScenes)).toEqual({
      referenceProjectId: 'p1',
      seriesPrevTitle: '점심 메뉴 룰렛',
      canContinue: false,
    })
    // 앞 화를 지우면 연결만 끊기고 제목은 남는다.
    expect(seriesListFields({ id: 'p2', reference_project_id: null, series: seriesOf('점심 메뉴 룰렛') }, withScenes)).toEqual({
      referenceProjectId: null,
      seriesPrevTitle: '점심 메뉴 룰렛',
      canContinue: false,
    })

    const source = route()
    expect(source).toContain('reference_project_id, series')
    expect(source).toContain('seriesListFields(')
    // 씬은 한 번의 묶음 조회로 센다 — 프로젝트마다 따로 부르지 않는다.
    expect(source).toMatch(/from\('scenes'\)[\s\S]{0,200}\.in\('project_id', ids\)/)
  })
})
