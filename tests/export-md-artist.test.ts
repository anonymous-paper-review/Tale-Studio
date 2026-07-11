import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { collectArtistArtifacts, type ArtistData } from '@/lib/export/artist'
import type { ArtifactFile } from '@/lib/export/types'

function fixtureData(): ArtistData {
  return {
    characters: [
      {
        character_id: 'char-1',
        name: '윤서',
        entity_type: 'person',
        view_main: '  https://cdn.test/yun/front.png  ',
        view_back: 'https://cdn.test/yun/back.png',
        view_side_left: 'https://cdn.test/yun/side-left.png',
        view_side_right: null,
        description: 'English character card description',
        appearance: 'English trench coat',
        appearance_native: '젖은 트렌치코트',
      },
      {
        character_id: 'char-2',
        name: '윤서',
        entity_type: 'person',
        view_main: 'https://cdn.test/yun-duplicate/front.png',
        view_back: '',
        view_side_left: null,
        view_side_right: 'https://cdn.test/yun-duplicate/side-right.png',
        description: 'English duplicate description',
        appearance: 'English silver coat',
        appearanceNative: '은색 코트',
      },
    ],
    locations: [
      {
        location_id: 'loc-1',
        name: '네온 골목',
        scene_id: 'scene-1',
        wide_shot: null,
        establishing_shot: 'https://cdn.test/world/establishing.png',
        visual_description: 'English wet alley',
        visual_description_native: '젖은 골목',
      },
    ],
  }
}

describe('collectArtistArtifacts', () => {
  it('emits present artist media with remapped filenames and deduped folders', () => {
    const files = collectArtistArtifacts(fixtureData())

    expect(mediaPaths(files)).toEqual([
      'artist/characters/윤서/front.png',
      'artist/characters/윤서/back.png',
      'artist/characters/윤서/side-left.png',
      'artist/characters/윤서-2/front.png',
      'artist/characters/윤서-2/side-right.png',
      'artist/worlds/네온-골목/establishing.png',
    ])

    expect(mediaFile(files, 'artist/characters/윤서/front.png')?.url).toBe(
      'https://cdn.test/yun/front.png',
    )
    expect(mediaFile(files, 'artist/characters/윤서-2/front.png')?.url).toBe(
      'https://cdn.test/yun-duplicate/front.png',
    )
    expect(mediaPaths(files)).not.toContain('artist/characters/윤서/side-right.png')
    expect(mediaPaths(files)).not.toContain('artist/worlds/네온-골목/wide.png')
  })

  it('renders a readable assets.md index with native-first descriptions and remap notes', () => {
    const files = collectArtistArtifacts(fixtureData())
    const markdown = textFile(files, 'artist/assets.md')

    expect(markdown).toContain('# 아티스트 에셋')
    expect(markdown).toContain('| 이름 | 타입 | 설명 | 파일 |')
    expect(markdown).not.toContain('{')
    expect(markdown).not.toContain('}')

    expect(markdown).toContain('젖은 트렌치코트')
    expect(markdown).toContain('은색 코트')
    expect(markdown).toContain('젖은 골목')
    expect(markdown).not.toContain('English trench coat')
    expect(markdown).not.toContain('English silver coat')
    expect(markdown).not.toContain('English wet alley')

    expect(markdown).toContain('view_main→front.png')
    expect(markdown).toContain('view\\_back→back.png')
    expect(markdown).toContain('view\\_side\\_left→side-left.png')
    expect(markdown).toContain('wide\\_shot→wide.png')
    expect(markdown).toContain('establishing\\_shot→establishing.png')

    for (const path of mediaPaths(files)) {
      expect(markdown).toContain(path)
    }
  })

  it('renders an explicit Korean empty note when there are no artist assets', () => {
    const files = collectArtistArtifacts({ characters: [], locations: [] })

    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ path: 'artist/assets.md', kind: 'text' })
    expect(textFile(files, 'artist/assets.md')).toContain('에셋 없음')
  })

  it('stays pure and does not import the asset-storage store', () => {
    const data = fixtureData()
    const before = JSON.parse(JSON.stringify(data))

    const first = collectArtistArtifacts(data)
    const second = collectArtistArtifacts(data)

    expect(second).toEqual(first)
    expect(data).toEqual(before)

    const source = readFileSync(
      fileURLToPath(new URL('../src/lib/export/artist.ts', import.meta.url)),
      'utf8',
    )
    expect(source).not.toContain('asset-storage-store')
    expect(source).not.toContain('useAssetStorageStore')
    expect(source).not.toContain('registerCharacter')
  })
})

function textFile(files: ArtifactFile[], path: string): string {
  const file = files.find((candidate) => candidate.path === path)
  expect(file).toMatchObject({ kind: 'text' })
  return file?.content ?? ''
}

function mediaFile(files: ArtifactFile[], path: string): ArtifactFile | undefined {
  const file = files.find((candidate) => candidate.path === path)
  expect(file).toMatchObject({ kind: 'media' })
  return file
}

function mediaPaths(files: ArtifactFile[]): string[] {
  return files.filter((file) => file.kind === 'media').map((file) => file.path)
}
