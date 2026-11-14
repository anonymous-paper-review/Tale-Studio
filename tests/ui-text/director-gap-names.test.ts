// Director 가 채팅에 남기는 "채워 두면 좋은 것" 줄은 샷을 내부 번호(sh_01_01)가 아니라 보드 이름으로, 채팅 언어로 부른다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { getDirectorGaps, summarizeGaps } from '@/lib/completeness'
import { boardNodeNames } from '@/features/director/node-label'
import type { DirectorNode } from '@/types/director'

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/
const source = (file: string) => readFileSync(file, 'utf8')

/** Writer 에서 온 샷 노드(라벨 = Writer 샷 id)와 Director 에서 만든 노드. */
const shotNode = (label: string, extra: Record<string, unknown> = {}) =>
  ({ id: `n-${label}`, data: { kind: 'shot', label, writerShotId: label.startsWith('sh_') ? label : undefined, characterAssetIds: ['c1'], worldAssetIds: ['w1'], storyboardImage: null, ...extra } }) as unknown as DirectorNode

/** 씬 둘 · 샷 다섯 — 보드 전체 번호는 sh_01_01=1, sh_01_02=2, sh_02_01=3, sh_02_02=4, sh_02_03=5. */
const manifest = { scenes: [{ sceneId: 'sc_01' }, { sceneId: 'sc_02' }] }
const shots = ['sh_01_01', 'sh_01_02', 'sh_02_01', 'sh_02_02', 'sh_02_03'].map((shotId) => ({ shotId, sceneId: shotId.slice(3, 5) === '01' ? 'sc_01' : 'sc_02' }))
const assets = { hasCharacterImage: () => true, characterName: (id: string) => id }

describe('Director 완성도 줄의 샷 이름', () => {
  it('한국어 채팅이면 샷을 내부 번호가 아니라 "샷 3" 같은 보드 이름으로 부른다', () => {
    // 왜: 채팅에 "sh_02_01: 스토리보드 미생성"처럼 내부 번호가 그대로 나왔다 — 오너 전역 규칙(씬 · 샷 이름, 답 7)과 어긋난다.
    const nodes = [shotNode('sh_01_01'), shotNode('sh_02_01'), shotNode('sh_02_03')]
    const gaps = getDirectorGaps(nodes, assets, 'ko', boardNodeNames(manifest, shots, 'ko'))

    expect(gaps.map((gap) => gap.label)).toEqual(['샷 1: 스토리보드 미생성', '샷 3: 스토리보드 미생성', '샷 5: 스토리보드 미생성'])
    expect(summarizeGaps(gaps, 3, 'ko')).not.toMatch(/sh_/)
  })

  it('영어 채팅이면 "Shot 3: no storyboard yet" 처럼 영어 이름과 영어 문장으로 부른다', () => {
    // 왜: 이름의 말은 그 이름이 들어간 글의 언어다 — 줄 안 글과 이름이 같은 말이어야 한 줄에서 섞이지 않는다.
    const gaps = getDirectorGaps([shotNode('sh_02_01'), shotNode('sh_02_02')], assets, 'en', boardNodeNames(manifest, shots, 'en'))

    expect(gaps.map((gap) => gap.label)).toEqual(['Shot 3: no storyboard yet', 'Shot 4: no storyboard yet'])
    expect(summarizeGaps(gaps, 3, 'en')).not.toMatch(HANGUL)
  })

  it('Director 에서 직접 만든 샷과 사람이 이름을 지은 샷은 보이는 이름 그대로 부른다', () => {
    // 왜: 보드에 없는 샷은 번호를 지어내지 않는다 — 기본 이름("New Shot")은 화면 언어로, 사람이 지은 이름은 그대로.
    const nodes = [shotNode('New Shot'), shotNode('Hero entrance')]
    const ko = getDirectorGaps(nodes, assets, 'ko', boardNodeNames(manifest, shots, 'ko'))
    const en = getDirectorGaps(nodes, assets, 'en', boardNodeNames(manifest, shots, 'en'))

    expect(ko.map((gap) => gap.label)).toEqual(['새 샷: 스토리보드 미생성', 'Hero entrance: 스토리보드 미생성'])
    expect(en.map((gap) => gap.label)).toEqual(['New Shot: no storyboard yet', 'Hero entrance: no storyboard yet'])
  })

  it('이름표를 주지 않는 옛 호출은 지금처럼 샷 라벨 그대로 부른다', () => {
    // 왜: 정상 경로 고정 — 이름표가 없는 호출부(시험 · 옛 코드)가 조용히 달라지지 않는다.
    const gaps = getDirectorGaps([shotNode('Shot 1')], assets, 'en')

    expect(gaps.map((gap) => gap.label)).toEqual(['Shot 1: no storyboard yet'])
  })
})

describe('Director 화면 배선', () => {
  it('Director 화면은 완성도 줄과 감싸는 문장을 채팅 언어와 보드 이름으로 짓는다', () => {
    // 왜: 이 줄은 채팅에 남는 글이다 — 화면 언어가 아니라 채팅 언어(1.1 규칙: 채팅 줄 = 채팅 언어)여야 하고, 이름도 같은 말이어야 한다.
    const page = source('src/app/studio/director/page.tsx')
    expect(page).toMatch(/const chatLocale = useContentLocale\(\)/)
    expect(page).toMatch(/useBoardNodeNames\(chatLocale\)/)
    expect(page).toMatch(/getDirectorGaps\(nodes, \{ \.\.\.gapAssets, ledgerGaps \}, chatLocale, chatBoardNames\)/)
    expect(page).toMatch(/summarizeGaps\(gaps, \d+, chatLocale\)/)
    expect(page).toMatch(/gapNudgeText\(chatLocale, gaps\.length, summarizeGaps\(gaps, 3, chatLocale\)\)/)
  })
})
