export function h1(s: string): string {
  return `# ${escapeMd(s)}\n\n`
}

export function h2(s: string): string {
  return `## ${escapeMd(s)}\n\n`
}

export function kvSection(
  title: string,
  pairs: Array<[string, string | undefined | null]>,
): string {
  const rows = pairs
    .filter(([, value]) => value != null && value.trim() !== '')
    .map(([key, value]) => `- **${escapeMd(key)}:** ${escapeMd(value ?? '')}`)

  return `${h2(title)}${rows.join('\n')}${rows.length ? '\n\n' : ''}`
}

export function table(headers: string[], rows: string[][]): string {
  const header = `| ${headers.map(escapeTableCell).join(' | ')} |`
  const separator = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((row) =>
    `| ${headers.map((_, index) => escapeTableCell(row[index] ?? '')).join(' | ')} |`,
  )

  return [header, separator, ...body].join('\n') + '\n\n'
}

export function bulletList(items: string[]): string {
  return items.map((item) => `- ${escapeMd(item)}`).join('\n') + (items.length ? '\n\n' : '')
}

export function escapeMd(s: string): string {
  return escapeInlineMd(s.replace(/\r?\n/g, ' '))
}

function escapeInlineMd(s: string): string {
  return s.replace(/([\\|`*_\[\]])/g, '\\$1').replace(/^([#>])/, '\\$1')
}

export function pickNative(
  native: string | null | undefined,
  en: string | null | undefined,
): string {
  const nativeText = native?.trim()
  if (nativeText) return nativeText

  return en?.trim() ?? ''
}

export function nativeText(source: Record<string, unknown>, field: string): string {
  const snake = camelToSnake(field)
  const camel = snakeToCamel(field)

  return pickNative(
    firstString(source, [`${field}_native`, `${camel}Native`, `${field}Native`, `${snake}_native`]),
    firstString(source, [field, camel, snake]),
  )
}

export function textOrUnset(value: unknown): string {
  const text = stringValue(value)?.trim()
  return text || '미설정'
}

export function labelPart(label: string, value: unknown): string {
  const text = stringValue(value)?.trim()
  return text ? `${label}: ${text}` : ''
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function firstString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of unique(keys)) {
    const value = stringValue(source[key])
    if (value) return value
  }
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function escapeTableCell(s: string): string {
  return escapeInlineMd(s.replace(/\r?\n/g, '<br>'))
}
