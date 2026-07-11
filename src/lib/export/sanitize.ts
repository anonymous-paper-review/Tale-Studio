const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const RESERVED_SEGMENT_CHARS = /[<>:"\/\\|?*\u0000-\u001F]/g

export function sanitizeSegment(name: string): string {
  let safe = name
    .normalize('NFC')
    .replace(RESERVED_SEGMENT_CHARS, '-')
    .replace(/\s+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-. ]+|[-. ]+$/g, '')

  if (WINDOWS_RESERVED_NAMES.test(safe.split('.')[0] ?? safe)) safe = `_${safe}`

  safe = Array.from(safe).slice(0, 80).join('').replace(/^[-. ]+|[-. ]+$/g, '')

  return safe || 'untitled'
}

export class PathAllocator {
  private readonly usedByDir = new Map<string, Set<string>>()

  file(dir: string, base: string, ext: string): string {
    const safeBase = sanitizeSegment(base)
    const suffix = normalizeExt(ext)
    const segment = this.allocate(dir, (dedupe) => `${safeBase}${dedupe}${suffix}`)

    return joinPath(dir, segment)
  }

  child(dir: string, name: string): string {
    const safeName = sanitizeSegment(name)
    const segment = this.allocate(dir, (dedupe) => `${safeName}${dedupe}`)

    return joinPath(dir, segment)
  }

  private allocate(dir: string, buildSegment: (dedupe: string) => string): string {
    const used = this.usedFor(dir)
    let index = 1

    while (true) {
      const dedupe = index === 1 ? '' : `-${index}`
      const candidate = buildSegment(dedupe)
      const key = candidate.toLowerCase()

      if (!used.has(key)) {
        used.add(key)
        return candidate
      }

      index += 1
    }
  }

  private usedFor(dir: string): Set<string> {
    const key = dir.toLowerCase()
    const existing = this.usedByDir.get(key)
    if (existing) return existing

    const used = new Set<string>()
    this.usedByDir.set(key, used)
    return used
  }
}

function normalizeExt(ext: string): string {
  const clean = ext.trim().replace(/^\.+/, '')
  return clean ? `.${clean}` : ''
}

function joinPath(dir: string, segment: string): string {
  return dir ? `${dir}/${segment}` : segment
}
