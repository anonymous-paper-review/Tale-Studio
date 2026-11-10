// 이름에 id 낱말이 든 인물(The Keeper · keeper)의 이름이 산문을 저장하고 보일 때 겹치지 않는지 검사한다
import { describe, expect, it } from 'vitest'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { replaceSlugs } from '@/lib/script-lines'
import { cleanSceneProse } from '@/lib/writer/pipeline/util/prose_names'
import { createSceneStoryDraft, sceneStoryEdits } from '@/lib/producer/scene-story-edit'

// qa1110 C12(303dd6d5) 실행의 이름표 — 표시 이름 안에 id 낱말이 들어 있다.
const CAST = [
  { id: 'keeper', name: 'The Keeper' },
  { id: 'teenager', name: 'The Teenager' },
]
const ROSTER = CAST.map((c) => ({ slug: c.id, name: c.name }))
/** Writer 산문 화면이 거치는 길 — 미리 보기 응답이 이름을 바꾸고(resolveEntityNames), 화면이 한 번 더 바꾼다(replaceSlugs). */
const onScreen = (stored: string) => replaceSlugs(resolveEntityNames(stored, CAST), ROSTER, '')

describe('이름이 겹치지 않는다', () => {
  // 왜: qa1110 C12 — 모델이 이미 "The Keeper"라고 쓴 문장의 Keeper 를 id(keeper)로 보고 또 바꿔
  //   실행 기록에 "The The Keeper"로 저장됐다(25곳). 이름을 바꿀 때마다 The 가 하나씩 늘었다.
  it('이미 이름으로 쓴 문장은 저장할 때 이름을 다시 바꾸지 않는다', () => {
    const scenes = cleanSceneProse(
      {
        scenes: [{
          scene_id: 'sc_01',
          characters_in_scene: ['keeper', 'teenager'],
          scene_actions: ['The Keeper sits motionless in a wooden chair.', 'Light crosses The Teenager\'s face.'],
        }],
      } as unknown as Parameters<typeof cleanSceneProse>[0],
      { characters: CAST } as unknown as Parameters<typeof cleanSceneProse>[1],
    )
    expect(scenes.scenes[0].scene_actions).toEqual(['The Keeper sits motionless in a wooden chair.', 'Light crosses The Teenager\'s face.'])
    // 몇 번을 거쳐도 같다 — 저장 단계(씬 스토리 · 데쿠파주 · V4)와 화면이 같은 바꾸기를 여러 번 쓴다.
    const once = resolveEntityNames('The Keeper sits motionless in a wooden chair.', CAST)
    expect(resolveEntityNames(once, CAST)).toBe('The Keeper sits motionless in a wooden chair.')
    // 이름 가운데에 id 낱말이 든 경우(Elias Grey · elias)도 다시 바꾸지 않는다.
    expect(resolveEntityNames('Elias Grey tunes the radio.', [{ id: 'elias', name: 'Elias Grey' }])).toBe('Elias Grey tunes the radio.')
  })

  // 왜: 모델이 id 를 관사와 함께 쓰면("the keeper") 이름 머리의 The 와 겹쳐 "the The Keeper"가 된다.
  it('id 를 관사와 함께 쓴 문장은 이름 머리의 관사와 겹치지 않게 관사를 하나만 남긴다', () => {
    expect(resolveEntityNames('A storm rolls in as the keeper lights the lamp.', CAST)).toBe('A storm rolls in as The Keeper lights the lamp.')
    expect(replaceSlugs('Rain hits the teenager hard.', ROSTER, '')).toBe('Rain hits The Teenager hard.')
  })

  // 왜: 이름이 부정관사로 시작해도("A Stranger" · "An Officer") 같은 겹침("a A Stranger")이 생긴다.
  it('이름이 A · An 으로 시작해도 관사가 하나만 남는다', () => {
    expect(resolveEntityNames('a stranger knocks twice.', [{ id: 'stranger', name: 'A Stranger' }])).toBe('A Stranger knocks twice.')
    expect(resolveEntityNames('Rain falls as an officer waves.', [{ id: 'officer', name: 'An Officer' }])).toBe('Rain falls as An Officer waves.')
  })

  // 왜: 검토 B — A · An 으로 시작하는 이름 앞의 꼬리표 글자 A(Cell A · Block A · Plan A)까지 관사로 보고 지워, 낱말이 빠진 채
  //   저장될 수 있었다. 이런 이름은 소문자 a · an 만 걷고, 대문자 A · An 은 줄 처음 · 문장 처음일 때만 걷는다.
  it('이름이 A · An 으로 시작하면 꼬리표 글자 A 는 그대로 두고 소문자 관사와 문장 처음의 겹친 관사만 걷는다', () => {
    const STRANGER = [{ id: 'stranger', name: 'A Stranger' }]
    const OFFICER = [{ id: 'officer', name: 'An Officer' }]
    expect(resolveEntityNames('Inside Cell A a stranger sleeps.', STRANGER)).toBe('Inside Cell A A Stranger sleeps.')
    expect(resolveEntityNames('Block A an officer waits.', OFFICER)).toBe('Block A An Officer waits.')
    expect(resolveEntityNames('Plan A stranger nods.', STRANGER)).toBe('Plan A A Stranger nods.')
    expect(replaceSlugs('Plan A stranger nods.', [{ slug: 'stranger', name: 'A Stranger' }])).toBe('Plan A @A Stranger nods.')
    // 예전에 겹쳐 저장된 이름은 문장 처음 · 줄 처음이면 걷는다.
    expect(resolveEntityNames('A A Stranger knocks. Rain. A A Stranger waits.\nAn An Officer nods.', [...STRANGER, ...OFFICER]))
      .toBe('A Stranger knocks. Rain. A Stranger waits.\nAn Officer nods.')
  })

  // 왜: 검토 A — 관사를 아무거나 걷으면 앞 낱말 "A"(Room A · side A · Plan A)와 줄 바꿈까지 지워 낱말이 빠진 채 저장됐다.
  //   이름 머리와 같은 관사만(the↔The, a/an↔A/An), 같은 줄 안에서만 걷는다.
  it('이름 앞 겹친 관사는 이름 머리와 같은 관사일 때만 같은 줄 안에서 걷는다 — 앞 낱말 "A"와 줄 바꿈은 그대로', () => {
    expect(resolveEntityNames('In Room A the keeper waits.', CAST)).toBe('In Room A The Keeper waits.')
    expect(resolveEntityNames('On side A The Keeper hums along.', CAST)).toBe('On side A The Keeper hums along.')
    expect(resolveEntityNames('They choose Plan A keeper nods.', CAST)).toBe('They choose Plan A The Keeper nods.')
    expect(resolveEntityNames('He opens locker A\nTHE KEEPER steps in.', CAST)).toBe('He opens locker A\nThe Keeper steps in.')
  })

  // 왜: 검토 A — 산문 직접 고치기 창은 문단을 줄 바꿈으로 이어 보여 준다. 줄이 붙으면 저장할 때 문단이 3 → 2 로 줄었다.
  it('산문 직접 고치기 창에서 이름을 바꿔 보여도 줄이 붙지 않아 고친 뒤 문단 수가 그대로다', () => {
    const [draft] = createSceneStoryDraft(
      [{ sceneId: 'sc_01', index: 0, beats: ['He opens locker A', 'THE KEEPER steps in.', 'Rain falls.'], shotStories: [] }],
      ROSTER,
    )
    expect(draft.text).toBe('He opens locker A\nThe Keeper steps in.\nRain falls.')
    const [edited] = sceneStoryEdits([{ ...draft, text: draft.text.replace('Rain falls.', 'Rain falls hard.') }])
    expect(edited.beats).toEqual(['He opens locker A', 'The Keeper steps in.', 'Rain falls hard.'])
  })

  // 왜: 검토 A — 이름 앞에 @ 를 붙여 보이는 곳(Director 격자 샷 설명 · treatment.md 내보내기)에서는 예전 겹침이 걷히지 않았다.
  it('이름 앞에 @ 를 붙여 보이는 곳에서도 예전에 겹쳐 저장된 이름이 한 번만 보인다', () => {
    expect(replaceSlugs('The The Keeper waits by the radio.', ROSTER)).toBe('The Keeper waits by the radio.')
    expect(replaceSlugs('Then the keeper waits.', ROSTER)).toBe('Then @The Keeper waits.')
  })

  // 왜: 검토 B — 이미 이름으로 쓴 자리를 통째로 건너뛰어, id 와 이름이 같은 인물(Kai · kai)의 @ 표시가 사라졌다
  //   (Director 격자 대체 설명 · treatment.md 내보내기). id 가 이름의 일부일 때(The Keeper 안의 Keeper)만 그대로 둔다.
  it('@ 를 붙여 보이는 곳에서 이름 그대로 쓴 자리에도 @ 가 붙고, 이름의 일부인 id 낱말만 그대로 둔다', () => {
    const KAI = [{ slug: 'kai', name: 'Kai' }]
    expect(replaceSlugs('Kai waits.', KAI)).toBe('@Kai waits.')
    expect(replaceSlugs('kai and Kai', KAI)).toBe('@Kai and @Kai')
    expect(replaceSlugs('The Keeper waits.', ROSTER)).toBe('The Keeper waits.')
  })

  // 왜: 이미 "The The Keeper"로 저장된 산문(303dd6d5 등)도 화면에서는 이름이 한 번만 보여야 한다 — 지금은 화면이 두 번 더 붙여
  //   "The The The The Keeper"(22곳)로 보였다.
  it('예전에 이름이 겹쳐 저장된 산문도 Writer 산문 화면에는 이름이 한 번만 보인다', () => {
    expect(onScreen('The The Keeper sits motionless in a wooden chair.')).toBe('The Keeper sits motionless in a wooden chair.')
    expect(onScreen('Lightning flashes across the The The Teenager\'s face.')).toBe('Lightning flashes across The Teenager\'s face.')
    expect(onScreen('The Keeper and the keeper\'s lamp.')).toBe('The Keeper and The Keeper\'s lamp.')
  })

  // 왜: 한국어 화면 · 한국어 산문에서도 같은 길을 쓴다(C12 는 한국어 화면에서도 겹쳤다).
  it('한국어 산문에서도 이미 쓴 이름은 다시 바꾸지 않고 id 만 이름으로 바꾼다', () => {
    expect(onScreen('The Keeper가 의자에 앉아 있다.')).toBe('The Keeper가 의자에 앉아 있다.')
    expect(onScreen('keeper가 라디오를 고친다.')).toBe('The Keeper가 라디오를 고친다.')
  })
})
