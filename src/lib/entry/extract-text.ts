// Producer 시작 화면에 올린 글 파일에서 글을 꺼낸다 (리뉴얼 1차 2026-10-19) — 서버 전용(cfb · zlib · mammoth · unpdf).
//   txt · md: UTF-8(BOM · UTF-16 BOM · 옛 EUC-KR 도 읽는다) / docx: 예전 첨부와 같은 추출기(mammoth) /
//   pdf: 글이 든 PDF 만(스캔한 그림 PDF 는 "글 없음") / hwp: HWP 5.0 OLE 컨테이너의 BodyText 섹션 /
//   hwpx: zip 안 Contents/section*.xml 의 <hp:t>.
//   꺼낸 글은 예전 첨부와 같이 정돈(normalizeExtractedText)하고 100KB 에서 자른다(clampTextBytes).
//   약속: tests/producer/entry-extract-text.test.ts
import { inflateRawSync, inflateSync } from 'node:zlib'
import CFB from 'cfb'
import JSZip from 'jszip'
import { clampTextBytes } from '@/lib/upload/limits'
import { extractDocxText, normalizeExtractedText } from '@/lib/upload/docx'
import { fileExtension } from '@/features/entry/options'
import { ENTRY_TEXT_MAX_BYTES } from '@/lib/entry/draft'

export type ExtractResult =
  | { status: 'ok'; text: string; truncated: boolean }
  | { status: 'no_text' }
  | { status: 'unreadable'; reason: string }

/** 읽을 수 없는 파일(암호 · 배포용 · 깨짐 · 모르는 형식). reason 은 진단용 영어 코드다. */
export class EntryFileUnreadableError extends Error {
  constructor(public readonly reason: string) {
    super(`unreadable entry file: ${reason}`)
    this.name = 'EntryFileUnreadableError'
  }
}

export async function extractEntryText(name: string, data: Uint8Array): Promise<ExtractResult> {
  const ext = fileExtension(name)
  let raw: string
  try {
    switch (ext) {
      case 'txt':
      case 'md':
      case 'markdown':
        raw = decodePlainText(data)
        break
      case 'docx':
        raw = await extractDocxText(Buffer.from(data))
        break
      case 'pdf':
        raw = await extractPdfText(data)
        break
      case 'hwp':
        raw = extractHwpText(data)
        break
      case 'hwpx':
        raw = await extractHwpxText(data)
        break
      default:
        return { status: 'unreadable', reason: 'unsupported' }
    }
  } catch (error) {
    return { status: 'unreadable', reason: error instanceof EntryFileUnreadableError ? error.reason : 'corrupt' }
  }
  const normalized = normalizeExtractedText(raw)
  if (!normalized) return { status: 'no_text' }
  const { text, truncated } = clampTextBytes(normalized, ENTRY_TEXT_MAX_BYTES)
  return { status: 'ok', text, truncated }
}

// ── txt · md ──────────────────────────────────────────────────────────────────

/** 글 파일 바이트 → 글. BOM 이 있으면 그 인코딩, 없으면 UTF-8, UTF-8 이 아니면 옛 한글 윈도우(EUC-KR · CP949). */
export function decodePlainText(data: Uint8Array): string {
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) return new TextDecoder('utf-8').decode(data.subarray(3))
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le').decode(data.subarray(2))
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder('utf-16be').decode(data.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    // UTF-8 이 아니다 — 아래로.
  }
  try {
    return new TextDecoder('euc-kr', { fatal: true }).decode(data)
  } catch {
    return new TextDecoder('utf-8').decode(data)
  }
}

// ── pdf ───────────────────────────────────────────────────────────────────────

/** 글이 든 PDF 의 글(쪽은 줄바꿈으로 잇는다). 그림만 있는 쪽은 빈 글이 된다. */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  // pdf.js 가 받은 버퍼를 옮겨 가므로 복사본을 넘긴다.
  const pdf = await getDocumentProxy(new Uint8Array(data))
  try {
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  } finally {
    // 문서 자원을 놓는다(실패해도 글은 이미 꺼냈다).
    await Promise.resolve()
      .then(() => pdf.loadingTask?.destroy())
      .catch(() => undefined)
  }
}

// ── hwp (HWP 5.0) ─────────────────────────────────────────────────────────────

const HWP_SIGNATURE = 'HWP Document File'
const HWP_FLAG_COMPRESSED = 0x1
const HWP_FLAG_PASSWORD = 0x2
const HWP_FLAG_DISTRIBUTION = 0x4
/** HWPTAG_BEGIN(0x10) + 51 — 문단의 글자. */
export const HWPTAG_PARA_TEXT = 67

export interface HwpRecord {
  tag: number
  level: number
  payload: Uint8Array
}

/** 섹션 스트림의 기록들: 머리 4바이트(태그 10비트 · 단계 10비트 · 크기 12비트), 크기가 0xFFF 면 다음 4바이트가 크기. */
export function readHwpRecords(data: Uint8Array): HwpRecord[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const out: HwpRecord[] = []
  let offset = 0
  while (offset + 4 <= data.length) {
    const header = view.getUint32(offset, true)
    offset += 4
    const tag = header & 0x3ff
    const level = (header >>> 10) & 0x3ff
    let size = (header >>> 20) & 0xfff
    if (size === 0xfff) {
      if (offset + 4 > data.length) break
      size = view.getUint32(offset, true)
      offset += 4
    }
    if (offset + size > data.length) break // 잘린 스트림 — 읽은 데까지만
    out.push({ tag, level, payload: data.subarray(offset, offset + size) })
    offset += size
  }
  return out
}

/**
 * 문단 글자(UTF-16LE). 32 미만은 조종 문자:
 *   1칸짜리 글자 조종 = 0 · 10(줄바꿈) · 13(문단 끝) · 24~31(하이픈 · 빈칸 등),
 *   8칸짜리 확장 · 인라인 조종 = 1~9 · 11~12 · 14~23(표 · 그림 · 각주 · 탭 …). 탭(9)만 탭으로 남긴다.
 */
export function parseHwpParagraphText(payload: Uint8Array): string {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const units = Math.floor(payload.length / 2)
  let out = ''
  for (let i = 0; i < units; ) {
    const code = view.getUint16(i * 2, true)
    if (code >= 32) {
      out += String.fromCharCode(code)
      i += 1
    } else if (code === 9) {
      out += '\t'
      i += 8
    } else if (code === 10) {
      out += '\n'
      i += 1
    } else if (code === 24) {
      out += '-'
      i += 1
    } else if (code === 30 || code === 31) {
      out += ' '
      i += 1
    } else if (code === 0 || code === 13 || code >= 25) {
      i += 1
    } else {
      i += 8
    }
  }
  return out
}

/** 섹션 하나(압축을 푼 스트림)의 문단 글들. */
export function parseHwpSection(data: Uint8Array): string[] {
  return readHwpRecords(data)
    .filter((record) => record.tag === HWPTAG_PARA_TEXT)
    .map((record) => parseHwpParagraphText(record.payload))
}

function toBytes(content: unknown): Uint8Array {
  if (content instanceof Uint8Array) return content
  if (Array.isArray(content)) return Uint8Array.from(content as number[])
  return new Uint8Array(0)
}

function inflateSection(data: Uint8Array): Uint8Array {
  try {
    return inflateRawSync(data)
  } catch {
    // 일부 저장기는 zlib 머리를 붙인다.
    try {
      return inflateSync(data)
    } catch {
      throw new EntryFileUnreadableError('corrupt')
    }
  }
}

/** HWP 5.0 문서의 본문 글. 암호 · 배포용 문서는 본문이 암호화돼 있어 읽지 않는다. */
export function extractHwpText(data: Uint8Array): string {
  let container: ReturnType<typeof CFB.read>
  try {
    container = CFB.read(Buffer.from(data), { type: 'buffer' })
  } catch {
    throw new EntryFileUnreadableError('corrupt')
  }
  const streams = new Map<string, Uint8Array>()
  container.FullPaths.forEach((fullPath, i) => {
    const entry = container.FileIndex[i]
    if (!entry || entry.type !== 2) return
    // 맨 앞 칸은 뿌리 이름("Root Entry")이다.
    streams.set(fullPath.replace(/^[^/]*\//, ''), toBytes(entry.content))
  })
  const header = streams.get('FileHeader')
  if (!header || header.length < 40 || new TextDecoder('latin1').decode(header.subarray(0, HWP_SIGNATURE.length)) !== HWP_SIGNATURE) {
    throw new EntryFileUnreadableError('not_hwp')
  }
  const flags = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(36, true)
  if (flags & HWP_FLAG_PASSWORD) throw new EntryFileUnreadableError('encrypted')
  if (flags & HWP_FLAG_DISTRIBUTION) throw new EntryFileUnreadableError('distribution')
  const sections = [...streams.keys()]
    .map((path) => ({ path, n: Number(path.match(/^BodyText\/Section(\d+)$/)?.[1] ?? NaN) }))
    .filter((s) => Number.isFinite(s.n))
    .sort((a, b) => a.n - b.n)
  if (!sections.length) throw new EntryFileUnreadableError('no_body')
  const paragraphs: string[] = []
  for (const { path } of sections) {
    const body = streams.get(path)!
    paragraphs.push(...parseHwpSection(flags & HWP_FLAG_COMPRESSED ? inflateSection(body) : body))
  }
  return paragraphs.join('\n')
}

// ── hwpx ──────────────────────────────────────────────────────────────────────

const XML_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, ref: string) => {
    if (ref.startsWith('#x')) return String.fromCodePoint(parseInt(ref.slice(2), 16))
    if (ref.startsWith('#')) return String.fromCodePoint(parseInt(ref.slice(1), 10))
    return XML_ENTITIES[ref] ?? ''
  })
}

/** 섹션 XML 의 문단 글 — <hp:t> 를 이어 붙이고 </hp:p> 마다 문단을 끊는다(표 안 문단도 문단). */
export function hwpxParagraphs(xml: string): string[] {
  const out: string[] = []
  let current = ''
  for (const match of xml.matchAll(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>|<\/hp:p>/g)) {
    if (match[0] === '</hp:p>') {
      out.push(current)
      current = ''
      continue
    }
    const inner = match[1]
      .replace(/<hp:tab\b[^>]*\/?>/g, '\t')
      .replace(/<hp:lineBreak\b[^>]*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
    current += decodeXmlEntities(inner)
  }
  if (current) out.push(current)
  return out
}

export async function extractHwpxText(data: Uint8Array): Promise<string> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    throw new EntryFileUnreadableError('corrupt')
  }
  const sections = Object.keys(zip.files)
    .map((path) => ({ path, n: Number(path.match(/^Contents\/section(\d+)\.xml$/i)?.[1] ?? NaN) }))
    .filter((s) => Number.isFinite(s.n))
    .sort((a, b) => a.n - b.n)
  if (!sections.length) throw new EntryFileUnreadableError('no_body')
  const paragraphs: string[] = []
  for (const { path } of sections) {
    paragraphs.push(...hwpxParagraphs(await zip.file(path)!.async('string')))
  }
  return paragraphs.join('\n')
}
