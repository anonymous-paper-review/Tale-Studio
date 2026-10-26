// 프로젝트 목록의 시리즈 판정 — 카드에 보이는 앞 화 줄, [다음 화 만들기] 버튼 상태, 지우기 전 경고, 목록이 함께 주는 칸.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  NEXT_EPISODE_NOT_READY,
  canContinueLastScene,
  continuingEpisodes,
  nextEpisodeButton,
  nextEpisodeFailure,
  prevEpisodeLink,
  seriesListFields,
} from '@/features/projects/series-list'
import { translate } from '@/lib/i18n'
import { SERIES_VERSION } from '@/lib/series/snapshot'

const page = () => readFileSync('src/app/projects/page.tsx', 'utf8')
const dialogs = () => readFileSync('src/features/projects/next-episode-dialog.tsx', 'utf8')
const route = () => readFileSync('src/app/api/project/list/route.ts', 'utf8')

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

const PLAN = { canUseReference: true, slotLimit: 3, used: 1 }

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

  // 왜: Artist [만들기] 전인 화에는 이어받을 인물 · 배경 그림과 씬이 없다 — 버튼만 꺼 두면 왜 못 누르는지 알 수 없다.
  it('Artist에서 [만들기]를 누르기 전인 화는 다음 화를 만들 수 없고 까닭을 한 줄로 보여 준다', () => {
    const before = nextEpisodeButton({ id: 'p1', canContinue: false }, PLAN)
    expect(before.action).toBe('blocked')
    expect(before.enabled).toBe(false)
    expect(before.reason).toBe(NEXT_EPISODE_NOT_READY)
    expect(translate('ko', NEXT_EPISODE_NOT_READY)).toBe('Artist에서 [만들기]를 누른 화부터 다음 화를 만들 수 있어요.')

    const after = nextEpisodeButton({ id: 'p1', canContinue: true }, PLAN)
    expect(after.action).toBe('create')
    expect(after.enabled).toBe(true)
    expect(after.reason).toBeNull()
  })

  // 왜: 앞 화와 다음 화는 프로젝트 칸 2개를 쓴다 — 무료 · Starter에서 눌러 보면 왜 안 되는지 알려 주고 요금제로 보낸다.
  it('프로젝트 칸이 2개보다 적은 요금제에서 다음 화를 만들려 하면 요금제 안내 창을 연다', () => {
    const locked = nextEpisodeButton({ id: 'p1', canContinue: true }, { canUseReference: false, slotLimit: 1, used: 1 })
    expect(locked.action).toBe('plan')
    expect(locked.enabled).toBe(true) // 눌러서 안내를 읽을 수 있다
    expect(locked.locked).toBe(true)
    expect(locked.reason).toBeNull()
    // 아직 Artist 전인 화도 요금제 안내가 먼저다 — 칸이 1개면 어느 화로도 다음 화를 만들 수 없다.
    expect(nextEpisodeButton({ id: 'p1', canContinue: false }, { canUseReference: false, slotLimit: 1, used: 0 }).action).toBe('plan')
    // 서버가 막아도 같은 창을 연다.
    expect(nextEpisodeFailure('reference_unavailable')).toBe('plan')

    expect(translate('ko', 'Creating a next episode needs Producer10 or above')).toBe('다음 화 만들기는 Producer10 이상에서 쓸 수 있어요')
    expect(dialogs()).toContain("t('Creating a next episode needs Producer10 or above')")
  })

  // 왜: 다음 화도 프로젝트 하나다 — 칸이 없으면 만들기 창까지 갔다가 막히지 않게 버튼 단계에서 알린다.
  it('프로젝트 칸을 다 썼으면 다음 화를 만들려 할 때 칸이 찼다는 창을 연다', () => {
    const full = nextEpisodeButton({ id: 'p1', canContinue: true }, { canUseReference: true, slotLimit: 2, used: 2 })
    expect(full.action).toBe('slots')
    expect(full.enabled).toBe(true)
    // 칸 제한이 없는 계정(관리자)은 막지 않는다.
    expect(nextEpisodeButton({ id: 'p1', canContinue: true }, { canUseReference: true, slotLimit: null, used: 9 }).action).toBe('create')
    expect(nextEpisodeFailure('slot_limit')).toBe('slots')

    expect(translate('ko', 'You have used all {count} project slots', { count: 2 })).toBe('프로젝트 칸 2개를 다 썼어요')
    expect(translate('ko', 'Deleting an old episode keeps the character and background images copied into the next episode.')).toBe(
      '옛 화를 지워도 다음 화에 복사된 인물·배경 그림은 남아요.',
    )
    expect(dialogs()).toContain("t('You have used all {count} project slots'")
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
