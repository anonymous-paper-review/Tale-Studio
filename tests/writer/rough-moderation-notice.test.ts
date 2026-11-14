// 러프 스토리보드가 내용 검사(moderation)로 실패하면 채팅이 샷 이름과 함께 한 줄로 알리고, 한 묶음에서 여러 샷이 걸리면 한 줄로 모은다
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { announceRoughModerationFailures, isModerationFailureText, roughModerationLine } from '@/lib/writer/rough-moderation-notice'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

const lines = () => useGlobalChatStore.getState().messages.map((m) => ({ stage: m.stage, content: m.content }))

/** 씬 둘 · 샷 다섯 — 보드 전체 번호는 sh_01_01=1, sh_01_02=2, sh_02_01=3, sh_02_02=4, sh_02_03=5. */
function seedBoard() {
  useWriterStore.setState({
    sceneManifest: { characters: [], locations: [], scenes: [{ sceneId: 'sc_01' }, { sceneId: 'sc_02' }] } as never,
    shots: ['sh_01_01', 'sh_01_02', 'sh_02_01', 'sh_02_02', 'sh_02_03'].map((shotId) => ({ shotId, sceneId: shotId.slice(3, 5) === '01' ? 'sc_01' : 'sc_02' })) as never,
  })
}

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'p-rough', currentStage: 'writer', reachedStage: 'writer', projectLocale: 'ko', projectLocaleLocked: true })
  seedBoard()
})
afterEach(() => {
  useGlobalChatStore.getState().reset()
  useWriterStore.setState({ sceneManifest: null, shots: [] })
})

describe('러프가 내용 검사로 실패했는지 가린다', () => {
  it('내용 검사로 실패했다는 글만 내용 검사 실패로 본다', () => {
    // 왜: 시간 초과 · 일반 실패까지 "내용 검사에 걸렸다"고 하면 사용자가 엉뚱하게 설명을 고친다 — 서버가 안전 모드 재시도를 가르는 글 규칙과 같아야 한다.
    expect(isModerationFailureText('[moderation] {"detail":[{"type":"content_policy_violation"}]}')).toBe(true)
    expect(isModerationFailureText('The content_policy_violation filter rejected the prompt')).toBe(true)
    expect(isModerationFailureText('Generation is taking longer than expected. It may still finish in the background.')).toBe(false)
    expect(isModerationFailureText('Generation failed')).toBe(false)
    expect(isModerationFailureText('fal 잔액 소진 (balance exhausted)')).toBe(false)
    expect(isModerationFailureText(null)).toBe(false)
    expect(isModerationFailureText(undefined)).toBe(false)
    // 빈 그림으로 나온 "soft" 실패는 내용 검사로 단정하지 않는다(다시 해 볼 만한 비결정적 실패).
    expect(isModerationFailureText('image too small — blank/moderated')).toBe(false)
  })
})

describe('채팅 한 줄', () => {
  it('샷 하나가 걸리면 그 샷의 보드 이름으로 한 줄 알린다(한국어 채팅은 한국어, 영어 채팅은 영어)', () => {
    // 왜: 사용자는 샷 번호(보드 이름)로 샷을 부른다 — sh_02_01 같은 내부 번호가 나오면 어느 컷인지 알 수 없다.
    expect(roughModerationLine('ko', { shotNos: [3], total: 1 })).toBe('⚠ 샷 3 러프는 내용 검사에 걸려 그리지 못했어요.')
    expect(roughModerationLine('en', { shotNos: [3], total: 1 })).toBe('⚠ The rough for Shot 3 was not drawn because it did not pass the content check.')
  })

  it('여러 샷이 걸리면 번호 순서로 한 줄에 모아 부른다', () => {
    // 왜: 한 번에 여러 장이 걸릴 때 샷마다 줄을 만들면 채팅이 같은 말로 도배된다.
    expect(roughModerationLine('ko', { shotNos: [5, 3], total: 2 })).toBe('⚠ 샷 3·5 러프는 내용 검사에 걸려 그리지 못했어요.')
    expect(roughModerationLine('en', { shotNos: [5, 3], total: 2 })).toBe('⚠ The roughs for Shots 3 · 5 were not drawn because they did not pass the content check.')
  })

  it('샷 번호를 모르면 이름 없이 장수만 말한다', () => {
    // 왜: 화면이 보드를 아직 못 읽었을 때도 "그렸다/못 그렸다"는 알려야 한다 — 틀린 번호를 지어내지 않는다.
    expect(roughModerationLine('ko', { shotNos: [], total: 2 })).toBe('⚠ 러프 2장은 내용 검사에 걸려 그리지 못했어요.')
    expect(roughModerationLine('en', { shotNos: [], total: 1 })).toBe('⚠ A rough was not drawn because it did not pass the content check.')
    expect(roughModerationLine('en', { shotNos: [], total: 3 })).toBe('⚠ 3 roughs were not drawn because they did not pass the content check.')
    // 일부만 알 때도 틀린 이름을 대신 장수로 말한다.
    expect(roughModerationLine('ko', { shotNos: [3], total: 2 })).toBe('⚠ 러프 2장은 내용 검사에 걸려 그리지 못했어요.')
  })
})

describe('채팅에 남기기', () => {
  it('러프가 내용 검사로 실패하면 채팅에 그 샷의 이름으로 한 줄 남긴다', () => {
    // 왜: 실패가 카드의 작은 빨간 글씨와 토스트로만 보여, 채팅으로 상태를 묻는 사용자는 실패를 알 수 없었다.
    announceRoughModerationFailures('writer', ['sh_02_01'])

    expect(lines()).toEqual([{ stage: 'writer', content: '⚠ 샷 3 러프는 내용 검사에 걸려 그리지 못했어요.' }])
  })

  it('한 묶음에서 여러 샷이 걸려도 채팅에는 한 줄만 남기고, 같은 샷이 겹쳐도 한 번만 센다', () => {
    // 왜: 러프는 한 번에 여러 샷(그리드 한 장 = 최대 4샷)씩 돈다 — 한 묶음의 실패는 한 줄이어야 한다.
    announceRoughModerationFailures('writer', ['sh_02_03', 'sh_02_01', 'sh_02_01', 'sh_01_02'])

    expect(lines()).toEqual([{ stage: 'writer', content: '⚠ 샷 2·3·5 러프는 내용 검사에 걸려 그리지 못했어요.' }])
  })

  it('보드에 없는 샷이면 장수만 말한다', () => {
    // 왜: 보드를 못 읽었거나 그사이 지운 샷이어도 알림이 틀린 이름을 대지 않는다.
    announceRoughModerationFailures('artist', ['sh_09_09', 'sh_09_10'])

    expect(lines()).toEqual([{ stage: 'artist', content: '⚠ 러프 2장은 내용 검사에 걸려 그리지 못했어요.' }])
  })

  it('걸린 샷이 없으면 채팅에 아무것도 남기지 않는다', () => {
    // 왜: 정상 경로 고정 — 러프가 잘 그려졌는데 안내가 뜨면 안 된다.
    announceRoughModerationFailures('writer', [])

    expect(lines()).toEqual([])
  })

  it('채팅 언어가 영어이면 영어 이름과 영어 문장으로 남긴다', () => {
    // 왜: 채팅 줄의 말은 채팅 언어를 따른다(오너 2026-11-14 답 7) — 화면 언어와 달라도 같은 줄 안에서 말이 섞이지 않는다.
    useProjectStore.setState({ projectLocale: 'en', projectLocaleLocked: true })

    announceRoughModerationFailures('writer', ['sh_02_01', 'sh_02_03'])

    expect(lines()).toEqual([{ stage: 'writer', content: '⚠ The roughs for Shots 3 · 5 were not drawn because they did not pass the content check.' }])
  })
})

describe('화면 배선', () => {
  const read = (file: string) => readFileSync(file, 'utf8')

  it('Storyboard 화면은 한 묶음의 내용 검사 실패를 모아 채팅에 한 번 알린다', () => {
    // 왜: 알림이 호출되지 않으면 위 규칙이 있어도 사용자는 못 본다 — 화면이 끝난 묶음마다 한 번 부른다.
    const view = read('src/features/writer/rough-storyboard-view.tsx')
    expect(view).toMatch(/announceRoughModerationFailures\('writer', /)
    expect(view).toMatch(/isModerationFailureText\(/)
  })

  it('옛 러프가 남은 샷을 다시 그리다 내용 검사에 걸려도 그 샷을 알림에 모은다', () => {
    // 왜: 다시 그리기는 옛 그림이 남아 "이미 그려진 샷"으로 보인다 — 완료된 샷을 걸러 내면 새 그림이 걸린 이 경우만 알림이 빠졌다.
    const view = read('src/features/writer/rough-storyboard-view.tsx')
    expect(view).toMatch(/if \(jobFailed && isModerationFailureText\(checked\.error\)\) moderationShots\.push\(\.\.\.jobShotIds\)/)
    expect(view).not.toMatch(/moderationShots\.push\(\.\.\.jobShotIds\.filter/)
  })

  it('Artist 에서 뒤로 그리는 러프도 걸린 샷을 Artist 채팅에 알린다', () => {
    // 왜: Artist 에서 미리 그리다 걸리면 Artist 머리 표시가 사라질 뿐 어디에도 말이 없었다.
    expect(read('src/features/artist-room/use-background-roughs.ts')).toMatch(/announceRoughModerationFailures\('artist', /)
  })
})
