import { createClient } from '@/lib/supabase/client'
import { translate } from '@/lib/i18n'
import { DEFAULT_LOCALE, type AppLocale } from '@/lib/locale'

import { h1, isRecord, pickNative, table } from './md'
import { PathAllocator } from './sanitize'
import type { ArtifactFile } from './types'

export type CharacterRow = Record<string, unknown> & {
  character_id?: string | null
  name?: string | null
  description?: string | null
  appearance?: string | null
  appearanceNative?: string | null
  appearance_native?: string | null
  sheet_url?: string | null
  portrait_url?: string | null
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

const CHARACTER_SELECT = 'character_id,name,description'
const CHARACTER_APPEARANCE_SELECT =
  'character_id,appearance,appearance_native,sheet_url,portrait_url'
const LOCATION_SELECT =
  'location_id,name,scene_id,wide_shot,establishing_shot,visual_description,visual_description_native'

const LOCATION_VIEW_FILES = [
  ['wide_shot', 'wide.png'],
  ['establishing_shot', 'establishing.png'],
] as const

export async function loadArtistData(projectId: string): Promise<ArtistData> {
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) throw new Error('projectId is required')

  const supabase = createClient()
  const [charactersRes, appearancesRes, locationsRes] = await Promise.all([
    supabase.from('characters').select(CHARACTER_SELECT).eq('project_id', normalizedProjectId),
    supabase
      .from('character_appearances')
      .select(CHARACTER_APPEARANCE_SELECT)
      .eq('project_id', normalizedProjectId)
      .eq('is_default', true),
    supabase.from('locations').select(LOCATION_SELECT).eq('project_id', normalizedProjectId),
  ])

  if (charactersRes.error) throw new Error(`artist characters load failed: ${charactersRes.error.message}`)
  if (appearancesRes.error) throw new Error(`artist appearances load failed: ${appearancesRes.error.message}`)
  if (locationsRes.error) throw new Error(`artist locations load failed: ${locationsRes.error.message}`)

  return {
    characters: mergeDefaultAppearances(
      ((charactersRes.data ?? []) as unknown[]).filter(isRecord),
      ((appearancesRes.data ?? []) as unknown[]).filter(isRecord),
    ),
    locations: ((locationsRes.data ?? []) as unknown[]).filter(isRecord) as LocationRow[],
  }
}

export function collectArtistArtifacts(
  data: ArtistData,
  locale: AppLocale = DEFAULT_LOCALE,
): ArtifactFile[] {
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
    const name = assetName(character.name, translate(locale, 'Unnamed character {index}', { index: index + 1 }))
    const folder = allocator.child('artist/characters', name)
    const paths: string[] = []

    for (const [column, fileName] of [
      ['sheet_url', 'sheet.png'],
      ['portrait_url', 'portrait.png'],
    ] as const) {
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
    const name = assetName(location.name, translate(locale, 'Unnamed world {index}', { index: index + 1 }))
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

  return [{ path: 'artist/assets.md', kind: 'text', content: renderAssetsIndex(indexEntries, locale) }, ...mediaFiles]
}

interface AssetIndexEntry {
  name: string
  type: 'character' | 'world'
  description: string
  paths: string[]
}

function renderAssetsIndex(entries: AssetIndexEntry[], locale: AppLocale): string {
  let body = h1(translate(locale, 'Artist Assets'))

  if (entries.length === 0) {
    body += `${translate(locale, 'No assets')}\n\n`
  } else {
    body += table(
      [translate(locale, 'Name'), translate(locale, 'Type'), translate(locale, 'Asset description'), translate(locale, 'Files')],
      entries.map((entry) => [
        entry.name,
        entry.type,
        entry.description || translate(locale, 'Not set'),
        entry.paths.length ? entry.paths.join('<br>') : translate(locale, 'Not generated'),
      ]),
    )
  }

  return body
}

function mergeDefaultAppearances(
  characterRows: Record<string, unknown>[],
  appearanceRows: Record<string, unknown>[],
): CharacterRow[] {
  const appearancesByCharacterId = new Map<string, Record<string, unknown>[]>()
  for (const appearance of appearanceRows) {
    const characterId = stringValue(appearance.character_id)
    if (!characterId) continue
    const appearances = appearancesByCharacterId.get(characterId) ?? []
    appearances.push(appearance)
    appearancesByCharacterId.set(characterId, appearances)
  }

  return characterRows.map((character) => {
    const characterId = stringValue(character.character_id)
    if (!characterId) throw new Error('artist character is missing character_id')
    const appearances = appearancesByCharacterId.get(characterId) ?? []
    if (appearances.length !== 1) {
      throw new Error(`artist export requires exactly one default appearance for character ${characterId}; found ${appearances.length}`)
    }
    return { ...character, ...appearances[0] } as CharacterRow
  })
}

function characterDescription(character: CharacterRow): string {
  const description = pickNative(
    firstPresentString(character.appearanceNative, character.appearance_native),
    firstPresentString(character.appearance),
  )

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
