// 채팅은 자동 첫 카드가 아니라 사용자가 명시적으로 고른 프로젝트와 모습을 참조한다
import { beforeEach, expect, it } from 'vitest'
import { useArtistStore as artist } from '@/stores/artist-store'
import { useProjectStore as project } from '@/stores/project-store'
import type { CharacterAsset } from '@/types/asset'
beforeEach(() => {
  artist.getState().reset();project.setState({ projectId: 'p' })
  artist.setState({ selectedCharacterId: 'other', characterAssets: [{ characterId: 'c', appearances: [{ appearanceKey: 'current' }, { appearanceKey: 'young' }] } as CharacterAsset] })
})
it('다른 카드가 선택돼 있어도 클릭한 인물과 젊은 모습을 채팅 대상으로 기록한다', () => {
  // 왜: 모습 탭의 클릭은 카드 선택과 별개이므로 기존 선택 카드로 추측하면 안 된다.
  expect(artist.getState().chatSelection).toBeNull()
  artist.getState().setChatSelection({ projectId: 'p', target: 'character', id: 'c', appearanceKey: 'young', source: 'appearance' })
  expect(artist.getState().chatSelection).toMatchObject({ id: 'c', appearanceKey: 'young' })
  expect(artist.getState().selectedCharacterId).toBe('other')
})
it('프로젝트를 바꾸면 이전 프로젝트의 늦은 선택과 존재하지 않는 모습을 기록하지 않는다', () => {
  // 왜: 프로젝트에 같은 인물 키가 있어도 이전 화면 클릭이 다음 프로젝트로 새면 안 된다.
  artist.getState().setChatSelection({ projectId: 'old', target: 'character', id: 'c', appearanceKey: 'young', source: 'image' })
  expect(artist.getState().chatSelection).toBeNull()
  artist.getState().setChatSelection({ projectId: 'p', target: 'character', id: 'c', appearanceKey: 'missing', source: 'image' })
  expect(artist.getState().chatSelection).toBeNull()
  artist.getState().setChatSelection({ projectId: 'p', target: 'character', id: 'c', appearanceKey: 'young', source: 'image' })
  artist.getState().reset();expect(artist.getState().chatSelection).toBeNull()
})

it('명시적으로 고른 모습의 이미지 표식을 선택 시점에 기록한다', () => {
  // 왜: 이후 후보 변경이 사용자가 지칭한 그림을 조용히 바꾸지 않는다.
  artist.setState({ characterAssets: [{ characterId: 'c', appearances: [{ appearanceKey: 'young', sheetUrl: 'https://owned/old.png' }] } as CharacterAsset] })
  artist.getState().setChatSelection({ projectId: 'p', target: 'character', id: 'c', appearanceKey: 'young', source: 'image' })
  const old = artist.getState().chatSelection
  expect(old?.imageRevision).toBeTruthy()
  artist.setState({ characterAssets: [{ characterId: 'c', appearances: [{ appearanceKey: 'young', sheetUrl: 'https://owned/new.png' }] } as CharacterAsset] })
  expect(artist.getState().chatSelection).toEqual(old)
})
