import { createClient } from '@/lib/supabase/client'

import { bulletList, h1, h2, isRecord, pickNative, table } from './md'
import { PathAllocator } from './sanitize'
import type { ArtifactFile } from './types'

export type CharacterRow = Record<string, unknown> & {
  character_id?: string | null
  name?: string | null
  entity_type?: string | null
  view_main?: string | null
  view_back?: string | null
  view_side_left?: string | null
  view_side_right?: string | null
  description?: string | null
  appearance?: string | null
  appearanceNative?: string | null
  appearance_native?: string | null
}

export type LocationRow = Record<string, unknown> & {
  location_id?: string | null
  name?: string | null
  scene_id?: string | null
  wide_shot?: string | null
  establishing_shot?: string | null
  visual_description?: string | null
  visualDescription?: string | null
  visual_description_native?: string | null
  visualDescriptionNative?: string | null
}

export interface ArtistData {
  characters: CharacterRow[]
  locations: LocationRow[]
}

const CHARACTER_SELECT =
  'character_id,name,entity_type,view_main,view_back,view_side_left,view_side_right,description,appearance,appearance_native'
const LOCATION_SELECT =
  'location_id,name,scene_id,wide_shot,establishing_shot,visual_description,visual_description_native'

const CHARACTER_VIEW_FILES = [
  ['view_main', 'front.png'],
  ['view_back', 'back.png'],
  ['view_side_left', 'side-left.png'],
  ['view_side_right', 'side-right.png'],
] as const

const LOCATION_VIEW_FILES = [
  ['wide_shot', 'wide.png'],
  ['establishing_shot', 'establishing.png'],
] as const

export async function loadArtistData(projectId: string): Promise<ArtistData> {
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) throw new Error('projectId is required')

  const supabase = createClient()
  const [charactersRes, locationsRes] = await Promise.all([
    supabase.from('characters').select(CHARACTER_SELECT).eq('project_id', normalizedProjectId),
    supabase.from('locations').select(LOCATION_SELECT).eq('project_id', normalizedProjectId),
  ])

  if (charactersRes.error) throw new Error(`artist characters load failed: ${charactersRes.error.message}`)
  if (locationsRes.error) throw new Error(`artist locations load failed: ${locationsRes.error.message}`)

  return {
    characters: ((charactersRes.data ?? []) as unknown[]).filter(isRecord) as CharacterRow[],
    locations: ((locationsRes.data ?? []) as unknown[]).filter(isRecord) as LocationRow[],
  }
}

export function collectArtistArtifacts(data: ArtistData): ArtifactFile[] {
  const allocator = new PathAllocator()
  const mediaFiles: ArtifactFile[] = []
  const indexEntries: AssetIndexEntry[] = []
  const characters = Array.isArray(data.characters)
    ? (data.characters.filter(isRecord) as CharacterRow[])
    : []
  const locations = Array.isArray(data.locations)
    ? (data.locations.filter(isRecord) as LocationRow[])
    : []

  characters.forEach((character, index) => {
    const name = assetName(character.name, `이름 미정 캐릭터 ${index + 1}`)
    const folder = allocator.child('artist/characters', name)
    const paths: string[] = []

    for (const [column, fileName] of CHARACTER_VIEW_FILES) {
      const url = mediaUrl(character[column])
      if (!url) continue

      const path = `${folder}/${fileName}`
      mediaFiles.push({ path, kind: 'media', url })
      paths.push(path)
    }

    indexEntries.push({
      name,
      type: 'character',
      description: characterDescription(character),
      paths,
    })
  })

  locations.forEach((location, index) => {
    const name = assetName(location.name, `이름 미정 월드 ${index + 1}`)
    const folder = allocator.child('artist/worlds', name)
    const paths: string[] = []

    for (const [column, fileName] of LOCATION_VIEW_FILES) {
      const url = mediaUrl(location[column])
      if (!url) continue

      const path = `${folder}/${fileName}`
      mediaFiles.push({ path, kind: 'media', url })
      paths.push(path)
    }

    indexEntries.push({
      name,
      type: 'world',
      description: locationDescription(location),
      paths,
    })
  })

  return [{ path: 'artist/assets.md', kind: 'text', content: renderAssetsIndex(indexEntries) }, ...mediaFiles]
}

interface AssetIndexEntry {
  name: string
  type: 'character' | 'world'
  description: string
  paths: string[]
}

function renderAssetsIndex(entries: AssetIndexEntry[]): string {
  let body = h1('아티스트 에셋')

  if (entries.length === 0) {
    body += '에셋 없음\n\n'
  } else {
    body += table(
      ['이름', '타입', '설명', '파일'],
      entries.map((entry) => [
        entry.name,
        entry.type,
        entry.description || '미설정',
        entry.paths.length ? entry.paths.join('<br>') : '미생성',
      ]),
    )
  }

  body += h2('파일명 매핑 안내')
  body += 'DB view key는 수신자가 바로 이해할 수 있는 파일명으로 remap됩니다 (view_main→front.png 등).\n\n'
  body += bulletList([
    'characters: view_main→front.png, view_back→back.png, view_side_left→side-left.png, view_side_right→side-right.png',
    'worlds: wide_shot→wide.png, establishing_shot→establishing.png',
  ])

  return body
}

function characterDescription(character: CharacterRow): string {
  const description =
    pickNative(
      firstPresentString(character.appearanceNative, character.appearance_native),
      firstPresentString(character.appearance),
    ) ||
    stringValue(character.description)?.trim() ||
    ''

  return readableText(description)
}

function locationDescription(location: LocationRow): string {
  return readableText(
    pickNative(
      firstPresentString(location.visualDescriptionNative, location.visual_description_native),
      firstPresentString(location.visualDescription, location.visual_description),
    ),
  )
}

function readableText(value: string): string {
  const parsed = parseJsonText(value)
  if (parsed === undefined) return value

  return humanValue(parsed) || value.replace(/[{}]/g, '')
}

function humanValue(value: unknown): string {
  const text = stringValue(value)?.trim()
  if (text) return readableText(text)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(humanValue).filter(Boolean).join(', ')

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, child]) => {
        const rendered = humanValue(child)
        return rendered ? `${key}=${rendered}` : ''
      })
      .filter(Boolean)
      .join(', ')
  }

  return ''
}

function parseJsonText(value: string): unknown | undefined {
  const text = value.trim()
  const isJsonBody =
    (text.startsWith('{') && text.endsWith('}')) ||
    (text.startsWith('[') && text.endsWith(']'))
  if (!isJsonBody) return undefined

  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function assetName(value: unknown, fallback: string): string {
  return stringValue(value)?.trim() || fallback
}

function mediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

function firstPresentString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = stringValue(value)?.trim()
    if (text) return text
  }

  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
