// 채팅이 "씬2 샷5"처럼 씬과 샷을 함께 말할 때 보드 번호와 씬 안 자리가 서로 다른 샷이면 고치지 않고 묻는지, 그냥 "샷 8"은 보드 전체 번호인지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveChatShotId, resolveChatShotRef } from '@/lib/writer/chat-id-resolve'
import { translate } from '@/lib/i18n/translate'

// 씬 1 에 샷 하나, 씬 2 에 샷 넷. 보드 번호: sh_01_01=1, sh_02_02=2, sh_02_03=3, sh_02_09=4(나중에 끼워 넣음), sh_02_04=5.
const SHOTS = [
  { shotId: 'sh_01_01', sceneId: 'sc_01' },
  { shotId: 'sh_02_02', sceneId: 'sc_02' },
  { shotId: 'sh_02_03', sceneId: 'sc_02' },
  { shotId: 'sh_02_09', sceneId: 'sc_02' },
  { shotId: 'sh_02_04', sceneId: 'sc_02' },
]

describe('씬과 샷을 함께 말한 샷 찾기', () => {
  // 왜: 2026-11-02 리뷰 M3 — "씬2 샷3"은 보드 Shot 3(sh_02_03, 씬 2 에 있다)으로도, 씬 2 의 세 번째 샷(sh_02_09)으로도 읽힌다.
  //   둘 중 하나를 골라 고치면 엉뚱한 샷이 소리 없이 바뀐다 — 어느 쪽인지 묻는다.
  it('"씬2 샷3"이 보드 Shot 3과 씬 2의 세 번째 샷 둘 다로 읽히고 서로 다르면 고치지 않고 어느 샷인지 묻는다', () => {
    expect(resolveChatShotRef(SHOTS, '씬2 샷3')).toEqual({ kind: 'ambiguous', shotIds: ['sh_02_03', 'sh_02_09'] })
    expect(resolveChatShotRef(SHOTS, 'scene 2 shot 3')).toEqual({ kind: 'ambiguous', shotIds: ['sh_02_03', 'sh_02_09'] })
    expect(resolveChatShotId(SHOTS, '씬2 샷3')).toBeNull()
    const store = readFileSync('src/stores/writer-store.ts', 'utf8')
    expect(store).toContain('resolveChatShotRef(')
    expect(store).toContain("'Which shot do you mean: {first} or {second}?'")
    expect(translate('ko', 'Which shot do you mean: {first} or {second}?', { first: 'Scene 2 · Shot 3', second: 'Scene 2 · Shot 4' })).toContain('Scene 2 · Shot 3')
  })

  // 왜: 한쪽으로만 읽히면 묻지 않는다(정상 경로 고정) — "씬2 샷5"는 씬 2 에 다섯 번째 샷이 없어 보드 Shot 5 뿐이고,
  //   "씬2 샷1"은 보드 Shot 1 이 씬 1 에 있어 씬 2 의 첫 샷뿐이다.
  it('씬과 샷을 함께 말해도 한쪽으로만 읽히면 그 샷을 찾는다', () => {
    expect(resolveChatShotRef(SHOTS, '씬2 샷5')).toEqual({ kind: 'shot', shotId: 'sh_02_04' })
    expect(resolveChatShotRef(SHOTS, '씬2 샷1')).toEqual({ kind: 'shot', shotId: 'sh_02_02' })
  })

  // 왜: 오너 2026-11-02 전체 번호로 통일 — 그냥 "샷 4"는 보드 전체 번호다(id 숫자 04 인 sh_02_04 가 아니라 네 번째인 sh_02_09).
  it('그냥 "샷 4"·"Shot 4"는 보드 전체 번호 4번 샷이다', () => {
    expect(resolveChatShotRef(SHOTS, '샷 4')).toEqual({ kind: 'shot', shotId: 'sh_02_09' })
    expect(resolveChatShotRef(SHOTS, 'Shot 4')).toEqual({ kind: 'shot', shotId: 'sh_02_09' })
  })

  // 왜: 화면에 보이는 보드 이름 그대로("Scene 2 · Shot 3")는 그 보드 샷이다 — 씬 안 자리로 다시 읽지 않는다.
  //   "sc_02 3번째"처럼 씬 안 자리를 분명히 말하면 그 자리다(채팅은 "2씬 두 번째 샷" 같은 말도 알아듣는다 — 리드 결정).
  it('보드 이름 그대로 쓰면 그 보드 샷이고, "3번째"처럼 씬 안 자리를 말하면 그 자리의 샷이다', () => {
    expect(resolveChatShotRef(SHOTS, 'Scene 2 · Shot 3')).toEqual({ kind: 'shot', shotId: 'sh_02_03' })
    expect(resolveChatShotRef(SHOTS, 'sc_02 3번째')).toEqual({ kind: 'shot', shotId: 'sh_02_09' })
  })

  // 왜: 도구로 고치는 길은 모델이 정확한 id 를 고른다 — 모델에게도 둘 다로 읽히면 묻고, 씬 안 자리를 분명히 말하면 그 자리라고 알린다.
  it('채팅 모델에게도 씬과 샷을 함께 말한 것이 서로 다른 샷으로 읽히면 고치지 말고 물으라고 알린다', () => {
    const route = readFileSync('src/app/api/writer/chat/route.ts', 'utf8')
    expect(route).toContain('If both exist and point to different shots, do not edit; ask which one they mean')
    const context = readFileSync('src/lib/script-lines.ts', 'utf8')
    expect(context).toContain('둘 다 되고 서로 다르면 고치지 말고')
  })
})
