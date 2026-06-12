// producer 핸드오프 CastContract → writer 내부 Characters 매핑 (producer-story-gate §3).
//   createRun 이 initial state.characters 로 seed 하는 데 쓴다 → s2(characters) step 이 생략된다.
//   person/object 구분 없이 모두 StoryCharacter 로 싣는다(s3 오픈 캐스트 프롬프트가 slug 로 참조).
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
        role: c.role ?? 'supporting',
        personality: [],
        arc: c.arc ?? { start_state: '', end_state: '', arc_type: '' },
        voice: c.voice ?? '',
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
