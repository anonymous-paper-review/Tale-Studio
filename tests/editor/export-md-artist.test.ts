// 아티스트 자료를 내보내면 이미지와 설명이 읽기 쉬운 목록으로 정리된다
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
        sheet_url: '  https://cdn.test/yun/sheet.png  ',
        portrait_url: 'https://cdn.test/yun/portrait.png',
        description: 'English character card description',
        appearance: 'English trench coat',
        appearance_native: '젖은 트렌치코트',
      },
      {
        character_id: 'char-2',
        name: '윤서',
        sheet_url: 'https://cdn.test/yun-duplicate/sheet.png',
        portrait_url: 'https://cdn.test/yun-duplicate/portrait.png',
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
  it('있는 아티스트 자료는 안전한 파일 이름으로 정리하고 같은 이름도 각각 보존한다', () => {
    const files = collectArtistArtifacts(fixtureData(), 'ko')

    expect(mediaPaths(files)).toEqual([
      'artist/characters/윤서/sheet.png',
      'artist/characters/윤서/portrait.png',
      'artist/characters/윤서-2/sheet.png',
      'artist/characters/윤서-2/portrait.png',
      'artist/worlds/네온-골목/establishing.png',
    ])

    expect(mediaFile(files, 'artist/characters/윤서/sheet.png')?.url).toBe(
      'https://cdn.test/yun/sheet.png',
    )
    expect(mediaFile(files, 'artist/characters/윤서-2/sheet.png')?.url).toBe(
      'https://cdn.test/yun-duplicate/sheet.png',
    )
    expect(mediaPaths(files)).not.toContain('artist/worlds/네온-골목/wide.png')
  })

  it('아티스트 자료 목록은 한국어 설명을 우선 보여 주고 이름이 바뀐 이유도 알린다', () => {
    const files = collectArtistArtifacts(fixtureData(), 'ko')
    const markdown = textFile(files, 'artist/assets.md')

    expect(markdown).toContain('# 아티스트 에셋')
    expect(markdown).toContain('| 이름 | 유형 | 설명 | 파일 |')
    expect(markdown).not.toContain('{')
    expect(markdown).not.toContain('}')

    expect(markdown).toContain('젖은 트렌치코트')
    expect(markdown).toContain('은색 코트')
    expect(markdown).toContain('젖은 골목')
    expect(markdown).not.toContain('English trench coat')
    expect(markdown).not.toContain('English silver coat')
    expect(markdown).not.toContain('English wet alley')

    expect(markdown).toContain('artist/characters/윤서/sheet.png')
    expect(markdown).toContain('artist/characters/윤서/portrait.png')
    expect(markdown).not.toContain('view_main')
    expect(markdown).not.toContain('view_back')

    for (const path of mediaPaths(files)) {
      expect(markdown).toContain(path)
    }
  })

  it('아티스트 자료가 없으면 한국어로 비어 있음을 알린다', () => {
    const files = collectArtistArtifacts({ characters: [], locations: [] }, 'ko')

    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ path: 'artist/assets.md', kind: 'text' })
    expect(textFile(files, 'artist/assets.md')).toContain('에셋 없음')
  })

  it('자료를 모아도 원본을 바꾸지 않고 다른 저장 화면 없이 같은 결과를 만든다', () => {
    const data = fixtureData()
    const before = JSON.parse(JSON.stringify(data))

    const first = collectArtistArtifacts(data, 'ko')
    const second = collectArtistArtifacts(data, 'ko')

    expect(second).toEqual(first)
    expect(data).toEqual(before)

    const source = readFileSync(
      fileURLToPath(new URL('../../src/lib/export/artist.ts', import.meta.url)),
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
