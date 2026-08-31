// producer 핸드오프 CastContract → writer 내부 Characters 매핑 (producer-story-gate §3).
//   createRun 이 initial state.characters 로 seed 하는 데 쓴다 → s2(characters) step 이 생략된다.
//   person/object 모두 StoryCharacter 로 싣되 entity_type 을 보존한다(#g4 2026-08-27).
//   예전엔 이 구분을 버려서 하류(v4_shots)가 사물을 알 수 없었고, 사물이
//   character_blocking 에 섞여도 코드가 막을 근거가 없었다 — 프롬프트 지시에만 의존했다.
import type {
  CastContract,
  Characters,
  StoryCharacter,
} from '@/lib/writer/types/pipeline'

export function castContractToCharacters(cast: CastContract): Characters {
  return {
    characters: cast.characters.map(
      (c): StoryCharacter => ({
        id: c.character_id,
        name: c.name,
        entity_type: c.entity_type === 'object' ? 'object' : 'person',
        role: c.role ?? 'supporting',
        personality: [],
        arc: c.arc ?? { start_state: '', end_state: '', arc_type: '' },
        appearance_description: c.appearance,
        motivation: {
          want: c.motivation?.want ?? '',
          need: c.motivation?.need ?? '',
          wound: c.motivation?.wound,
        },
      }),
    ),
    relationships: cast.relationships ?? [],
    subtext_notes: cast.subtext_notes ?? [],
  }
}
