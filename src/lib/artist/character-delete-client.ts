// 화면에서 채팅으로 만들어진 인물 카드를 지운다(2026-10-27 디자이너 QA 1차 #04 · 오너 "채팅 추가 막고 안내").
//   판정은 서버(DELETE /api/artist/character)가 한다 — 화면은 이미 아는 것(산문 인물 · 그리는 중)만 먼저 막고,
//   지웠으면 Artist 카드와 산문 목록(Producer 캐스트 = 브레이크다운 목록)에서 함께 뺀다. 문장은 화면 언어로.
//   artist-store 가 producer-store 를 부르면 import 고리가 생겨(producer → global-chat → artist) 여기서 둘을 잇는다.
import { translate } from '@/lib/i18n/translate'
import { isChatMadeCharacter, removeCharacterFromCast, type CharacterUsage } from '@/lib/artist/character-delete'
import { useArtistStore } from '@/stores/artist-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

export type CharacterDeleteResult = { ok: boolean; message: string }

function refusalMessage(code: unknown, name: string, usage?: Partial<CharacterUsage>): string {
  const locale = useLocaleStore.getState().locale
  const scenes = usage?.scenes ?? 0
  const shots = usage?.shots ?? 0
  switch (code) {
    case 'from_prose':
      return translate(locale, 'The {name} card comes from the prose, so it cannot be deleted here. Fix it in the prose.', { name })
    case 'drawing':
      return translate(locale, 'The {name} card is still being drawn. Delete it after the drawing is done.', { name })
    case 'in_use':
      if (scenes > 0 && shots > 0) return translate(locale, 'The {name} card is used in scenes ({scenes}) and shots ({shots}), so it was not deleted.', { name, scenes, shots })
      if (scenes > 0) return translate(locale, 'The {name} card is used in scenes ({scenes}), so it was not deleted.', { name, scenes })
      if (shots > 0) return translate(locale, 'The {name} card is used in shots ({shots}), so it was not deleted.', { name, shots })
      return translate(locale, 'The {name} card is used in a scene or shot, so it was not deleted.', { name })
    default:
      return translate(locale, 'Could not delete the {name} card. Please try again.', { name })
  }
}

/** 지운 카드를 Artist 카드 · 산문 목록에서 뺀다(서버는 이미 지웠다). */
function forgetCharacter(characterId: string, name: string): void {
  useArtistStore.setState((state) => {
    const characterAssets = state.characterAssets.filter((c) => c.characterId !== characterId)
    const viewFailures = { ...state.viewFailures }
    delete viewFailures[characterId]
    return {
      characterAssets,
      viewFailures,
      sceneManifest: state.sceneManifest
        ? { ...state.sceneManifest, characters: state.sceneManifest.characters.filter((c) => c.characterId !== characterId) }
        : state.sceneManifest,
      selectedCharacterId: state.selectedCharacterId === characterId ? (characterAssets[0]?.characterId ?? null) : state.selectedCharacterId,
      chatSelection: state.chatSelection?.target === 'character' && state.chatSelection.id === characterId ? null : state.chatSelection,
    }
  })
  useProducerStore.setState((state) => ({ cast: removeCharacterFromCast(state.cast, { characterId, name }) }))
}

/** 채팅으로 만들어진 인물 카드 하나를 지운다. 지우지 않았으면 그 까닭을 문장으로 돌려준다. */
export async function deleteChatMadeCharacter(characterId: string): Promise<CharacterDeleteResult> {
  const projectId = useProjectStore.getState().projectId
  const artist = useArtistStore.getState()
  const card = artist.characterAssets.find((c) => c.characterId === characterId)
  const name = card?.name || characterId
  if (!projectId || !card) return { ok: false, message: refusalMessage(null, name) }
  if (!isChatMadeCharacter(card)) return { ok: false, message: refusalMessage('from_prose', name) }
  if (artist.generatingViews.some((slot) => slot.characterId === characterId)) return { ok: false, message: refusalMessage('drawing', name) }

  let response: Response
  try {
    response = await fetch('/api/artist/character', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, characterId }),
    })
  } catch {
    return { ok: false, message: refusalMessage(null, name) }
  }
  const body = (await response.json().catch(() => ({}))) as { code?: string; usage?: Partial<CharacterUsage> }
  // 서버에 이미 없는 카드(다른 창에서 지움)는 화면에서만 남은 것이라 지운 것으로 본다.
  const alreadyGone = response.status === 404 && body.code === 'not_found'
  if (!response.ok && !alreadyGone) return { ok: false, message: refusalMessage(body.code ?? null, name, body.usage) }
  // 그사이 다른 프로젝트로 옮겼으면 지금 화면의 카드는 건드리지 않는다(다시 열면 지운 상태로 읽힌다).
  if (useProjectStore.getState().projectId === projectId) forgetCharacter(characterId, card.name)
  return { ok: true, message: translate(useLocaleStore.getState().locale, 'Deleted the {name} card.', { name }) }
}
