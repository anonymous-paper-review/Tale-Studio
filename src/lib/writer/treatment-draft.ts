// 트리트먼트 초안(2026-10-02 오너 — 시안 v04 "트리트먼트가 바로 생성", "writer 파이프라인 앞단이 바로 돈다").
//   새 프로젝트를 만들면 Writer 앞단(이야기 엔진 · 구조 · 씬)만 돌아 확정 단계에서 기다린다. 그동안 Producer 는 잠기지 않고,
//   Writer 로 넘길 때 그때까지 Producer 에서 고친 설정 · 캐스팅 · 배경 · 스타일을 이 실행에 실어 확정하고 나머지를 이어 간다.
//   여기는 그 합치기 규칙(순수)만 둔다 — 저장 · 실행은 writer/start 라우트가 한다.
import { castContractToCharacters } from '@/lib/writer/cast-contract'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'
import type { BackgroundContract, CastContract, Characters, PipelineInput } from '@/lib/writer/types/pipeline'
import { fnv1a } from '@/lib/stable-hash'

/** Producer 캐스트가 같은 인물(id) 위에 덮는다. 트리트먼트가 만든 인물은 그대로 남긴다 — 씬이 그 인물을 부른다. */
export function mergeProducerCharacters(existing: Characters | undefined, cast: CastContract | undefined): Characters {
  const base: Characters = existing ?? { characters: [], relationships: [], subtext_notes: [] }
  if (!cast?.characters.length) return base
  const producer = castContractToCharacters(cast)
  const byId = new Map(producer.characters.map((character) => [character.id, character]))
  const kept = base.characters.map((character) => {
    const edited = character.id ? byId.get(character.id) : undefined
    if (!edited) return character
    byId.delete(character.id!)
    // Producer 가 비운 칸은 트리트먼트 값을 지킨다(성격 · 속마음 · 상처는 Producer 카드에 없다) — 칸마다 비교한다.
    const keep = (next: string | undefined, prev: string | undefined) => (next?.trim() ? next : prev ?? next ?? '')
    return {
      ...character,
      ...edited,
      personality: character.personality?.length ? character.personality : edited.personality,
      appearance_description: keep(edited.appearance_description, character.appearance_description),
      arc: {
        start_state: keep(edited.arc?.start_state, character.arc?.start_state),
        end_state: keep(edited.arc?.end_state, character.arc?.end_state),
        arc_type: keep(edited.arc?.arc_type, character.arc?.arc_type),
      },
      motivation: {
        want: keep(edited.motivation?.want, character.motivation?.want),
        need: keep(edited.motivation?.need, character.motivation?.need),
        ...(edited.motivation?.wound?.trim() || character.motivation?.wound ? { wound: keep(edited.motivation?.wound, character.motivation?.wound) } : {}),
      },
    }
  })
  return {
    characters: [...kept, ...byId.values()],
    relationships: [...(base.relationships ?? []), ...(cast.relationships ?? [])],
    subtext_notes: [...(base.subtext_notes ?? []), ...(cast.subtext_notes ?? [])],
  }
}

/** Producer 배경이 같은 장소(id) 위에 덮는다. 트리트먼트에만 있는 장소는 남긴다. */
export function mergeProducerWorld(existing: BackgroundContract | undefined, background: BackgroundContract | undefined): BackgroundContract | undefined {
  if (!background?.locations.length) return existing
  const byId = new Map(background.locations.map((location) => [location.id, location]))
  const kept = (existing?.locations ?? []).map((location) => {
    const edited = byId.get(location.id)
    if (!edited) return location
    byId.delete(location.id)
    return { ...location, ...edited, description: edited.description?.trim() ? edited.description : location.description }
  })
  return { ...(existing ?? {}), ...background, locations: [...kept, ...byId.values()] }
}

/** 넘길 때의 실행 상태 — 새 입력으로 바꾸고 확정 단계를 넘긴다. 트리트먼트(씬 · 구조 · 이야기 엔진)는 그대로다. */
export function continueDraftState(state: WriterRunState, input: PipelineInput): WriterRunState {
  const nextInput: PipelineInput = { ...input, sceneGate: true }
  delete nextInput.treatmentDraft
  const next: WriterRunState = {
    ...state,
    input: nextInput,
    characters: mergeProducerCharacters(state.characters, input.cast),
    world: mergeProducerWorld(state.world, input.background),
    _gateConfirmed: true,
  }
  if (input.genre) next.genre = input.genre
  delete next._sceneStoryUndo
  return next
}

/** 이어 가기를 막는 까닭 — 없으면 이어 간다. 확정을 기다리는 트리트먼트 초안이어야 하고, 정하지 않은 수정안이 없어야 한다. */
export function draftContinueBlock(
  run: { status: string; state: unknown } | null | undefined,
): 'writer_draft_missing' | 'writer_gate_pending' | 'scene_story_proposal_pending' | null {
  if (!run || run.status !== 'awaiting_confirmation') return 'writer_draft_missing'
  const state = run.state as WriterRunState
  if (state?.input?.treatmentDraft !== true) return 'writer_gate_pending'
  if (state._sceneStoryProposal) return 'scene_story_proposal_pending'
  return null
}

export type DraftBasisField = 'story' | 'runtime' | 'preserveScript'

/** 트리트먼트를 쓴 바탕(이야기 · 러닝타임 · 대본 보존)이 지금 Producer 값과 다른가 — 다르면 그 트리트먼트로 넘기지 않는다. */
export function draftBasisChanges(draft: PipelineInput, current: PipelineInput): DraftBasisField[] {
  const changed: DraftBasisField[] = []
  if ((draft.story ?? '').trim() !== (current.story ?? '').trim()) changed.push('story')
  if ((draft.runtimeSeconds ?? null) !== (current.runtimeSeconds ?? null)) changed.push('runtime')
  if ((draft.preserveScript === true) !== (current.preserveScript === true)) changed.push('preserveScript')
  return changed
}

/** 트리트먼트를 쓴 바탕 — 미리보기가 화면에 알려 주고(이야기는 지문만), 화면이 지금 Producer 값과 견준다. */
export interface DraftBasis {
  storyHash: string
  runtimeSeconds: number | null
  preserveScript: boolean
}

export function draftBasisOf(input: Pick<PipelineInput, 'story' | 'runtimeSeconds' | 'preserveScript'>): DraftBasis {
  return { storyHash: fnv1a((input.story ?? '').trim()), runtimeSeconds: input.runtimeSeconds ?? null, preserveScript: input.preserveScript === true }
}

/** 화면 쪽 비교 — 넘길 때 서버가 하는 비교(draftBasisChanges)와 같은 규칙이다. */
export function staleDraftFields(
  basis: DraftBasis,
  producer: { storyText: string; playtime: number; preserveScript: boolean | null },
): DraftBasisField[] {
  const changed: DraftBasisField[] = []
  if (basis.storyHash !== fnv1a(producer.storyText.trim())) changed.push('story')
  if (basis.runtimeSeconds !== (producer.playtime > 0 ? producer.playtime : null)) changed.push('runtime')
  if (basis.preserveScript !== (producer.preserveScript === true)) changed.push('preserveScript')
  return changed
}
