// 스튜디오 안에서 다음 화를 만들면 새 화로 바뀌고 기다리는 카드가 닫히며, 같은 창에서 다시 만들 수 없다(검토 B 높음 1, 리드 2026-11-09)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canCreateNextEpisode, nextEpisodeSwitch, nextEpisodeWaitDone } from '@/features/projects/series-list'

const dialogs = () => readFileSync('src/features/projects/next-episode-dialog.tsx', 'utf8')
const createBody = () => {
  const source = dialogs()
  return source.slice(source.indexOf('const create = useCallback'), source.indexOf('const error = failureText'))
}
const PREVIEW = { prevTitle: '자판기의 반란', characters: [], locations: [], hasVoices: false, lastSceneAvailable: false }

describe('스튜디오 안에서 다음 화 만들기', () => {
  // 왜: 레일 프로필 메뉴(스튜디오 틀)에서 연 창은 주소가 바뀌어도 내려가지 않고, 스튜디오는 주소만 바꿔서는 다른 프로젝트를 열지 않는다
  //   (유저 메뉴의 프로젝트 바꾸기와 같은 길로 먼저 바꾼다).
  it('다음 화가 만들어지면 그 화로 프로젝트를 바꾸고 시작 화면으로 간다', () => {
    expect(nextEpisodeSwitch({ projectId: 'p2', project: { title: '다음 화 제목' } })).toEqual({ id: 'p2', title: '다음 화 제목', stage: 'entry' })
    expect(nextEpisodeSwitch({ projectId: 'p2' })).toEqual({ id: 'p2', title: 'Untitled', stage: 'entry' })
    const create = createBody()
    expect(create).toContain('switchProject(next.id, next.title, next.stage)')
    expect(create.indexOf('switchProject(next.id')).toBeLessThan(create.indexOf('router.push('))
  })

  // 왜: main 에서는 만든 뒤 잠금이 풀린 창이 옛 프로젝트 위에 다시 떴고, 이 브랜치에서는 카드가 닫히지 않아 화면이 잠겼다.
  it('스튜디오 안에서 다음 화를 만들면 새 화로 바뀐 뒤 기다리는 카드와 창이 닫힌다', () => {
    expect(nextEpisodeWaitDone({ createdId: 'p2', projectId: 'p2', pathname: '/studio/start' })).toBe(true)
    expect(nextEpisodeWaitDone({ createdId: 'p2', projectId: 'p2', pathname: '/studio/artist' })).toBe(true)
    // 바꾸는 중(비운 사이)이거나 아직 옛 프로젝트면 기다린다.
    expect(nextEpisodeWaitDone({ createdId: 'p2', projectId: null, pathname: '/studio/artist' })).toBe(false)
    expect(nextEpisodeWaitDone({ createdId: 'p2', projectId: 'p1', pathname: '/studio/artist' })).toBe(false)
    expect(nextEpisodeWaitDone({ createdId: null, projectId: 'p2', pathname: '/studio/start' })).toBe(false)
    expect(dialogs()).toContain('nextEpisodeWaitDone({ createdId, projectId: openProjectId, pathname })')
  })

  // 왜: 목록 화면은 새 화로 옮겨 가면 화면째 사라진다 — 먼저 닫으면 목록이 한 번 깜박인다.
  it('프로젝트 목록 화면에서는 새 화로 옮겨 갈 때까지 기다리는 카드를 그대로 둔다', () => {
    expect(nextEpisodeWaitDone({ createdId: 'p2', projectId: 'p2', pathname: '/projects' })).toBe(false)
  })

  // 왜: main 에서는 만든 뒤 다시 뜬 창에서 한 번 더 누르면 다음 화가 또 만들어져 프로젝트 칸을 하나 더 썼다.
  it('다음 화가 만들어진 뒤에는 같은 창에서 다시 만들 수 없다', () => {
    expect(canCreateNextEpisode({ preview: PREVIEW, creating: false, createdId: null })).toBe(true)
    expect(canCreateNextEpisode({ preview: PREVIEW, creating: true, createdId: null })).toBe(false)
    expect(canCreateNextEpisode({ preview: PREVIEW, creating: false, createdId: 'p2' })).toBe(false)
    expect(canCreateNextEpisode({ preview: null, creating: false, createdId: null })).toBe(false)
    expect(dialogs()).toContain('disabled={!canCreateNextEpisode({ preview, creating, createdId })}')
    expect(createBody()).toContain('if (!projectId || !canCreateNextEpisode({ preview, creating, createdId })) return')
  })
})
