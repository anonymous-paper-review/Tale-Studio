export type ArtistSourceSnapshot = {
  table: 'character_appearances' | 'props' | 'locations'
  values: Record<string, string | boolean | null>
}

const FIELDS: Record<ArtistSourceSnapshot['table'], readonly string[]> = {
  character_appearances: ['appearance_key', 'is_default', 'appearance', 'appearance_native', 'updated_at'],
  props: ['appearance', 'appearance_native', 'updated_at'],
  locations: ['visual_description', 'visual_description_native', 'updated_at'],
}

export function parseArtistSourceSnapshot(
  value: unknown,
  allowedTables: readonly ArtistSourceSnapshot['table'][],
): { ok: true; snapshot: ArtistSourceSnapshot | undefined } | { ok: false; error: string } {
  const invalid = { ok: false as const, error: 'Invalid source snapshot' }
  if (value === undefined) return { ok: true, snapshot: undefined }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid
  const input = value as Record<string, unknown>
  if (Object.keys(input).length !== 2 || typeof input.table !== 'string') return invalid
  const table = input.table as ArtistSourceSnapshot['table']
  if (!allowedTables.includes(table) || !Object.hasOwn(FIELDS, table)) return invalid
  if (!input.values || typeof input.values !== 'object' || Array.isArray(input.values)) return invalid
  const values = input.values as Record<string, unknown>
  const fields = FIELDS[table]
  if (Object.keys(values).length !== fields.length || fields.some(field => !Object.hasOwn(values, field))) return invalid
  for (const field of fields) {
    const item = values[field]
    if (field === 'is_default') {
      if (typeof item !== 'boolean') return invalid
    } else if (field === 'appearance_key') {
      if (typeof item !== 'string' || !item.trim()) return invalid
    } else if (item !== null && typeof item !== 'string') return invalid
  }
  return { ok: true, snapshot: { table, values: values as ArtistSourceSnapshot['values'] } }
}
