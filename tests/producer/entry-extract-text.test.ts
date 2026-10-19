// Producer 시작 화면에 올린 글 파일(txt · md · docx · pdf · hwp · hwpx)에서 글을 꺼낸다 (리뉴얼 1차 2026-10-19)
import { deflateRawSync } from 'node:zlib'
import CFB from 'cfb'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  decodePlainText,
  extractEntryText,
  parseHwpParagraphText,
  parseHwpSection,
} from '@/lib/entry/extract-text'

// ── 시험용 파일 만들기 (이 시험을 위해 새로 지은 글 — 실제 작품이 아니다) ──

/** 글자가 든 한 쪽짜리 PDF. lines 가 비면 글 없는 PDF. */
function makePdf(lines: string[]): Uint8Array {
  const content = lines.length
    ? 'BT /F1 18 Tf 72 720 Td ' + lines.map((l, i) => `${i ? '0 -24 Td ' : ''}(${l}) Tj`).join(' ') + ' ET'
    : ''
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

/** HWP 기록 하나: 머리(태그 10비트 · 크기 12비트, 크기가 4095 이상이면 다음 4바이트가 크기) + 본문. */
function hwpRecord(tag: number, payload: Buffer): Buffer {
  if (payload.length >= 0xfff) {
    const head = Buffer.alloc(8)
    head.writeUInt32LE(((tag & 0x3ff) | (0xfff << 20)) >>> 0, 0)
    head.writeUInt32LE(payload.length, 4)
    return Buffer.concat([head, payload])
  }
  const head = Buffer.alloc(4)
  head.writeUInt32LE(((tag & 0x3ff) | (payload.length << 20)) >>> 0, 0)
  return Buffer.concat([head, payload])
}

const utf16 = (s: string) => Buffer.from(s, 'utf16le')
const unit = (code: number) => {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(code, 0)
  return b
}
/** 8칸(16바이트)짜리 확장 · 인라인 조종 문자: 앞뒤가 같은 코드, 가운데 6칸은 덧붙은 정보. */
const control8 = (code: number) => Buffer.concat([unit(code), Buffer.alloc(12, 0x41), unit(code)])

const PARA_HEADER = 66
const PARA_TEXT = 67

function hwpSection(paragraphs: Buffer[]): Buffer {
  return Buffer.concat(paragraphs.flatMap((text) => [hwpRecord(PARA_HEADER, Buffer.alloc(22)), hwpRecord(PARA_TEXT, text)]))
}

function makeHwp(sections: Buffer[], flags = 1): Uint8Array {
  const cfb = CFB.utils.cfb_new()
  const header = Buffer.alloc(256)
  header.write('HWP Document File', 0, 'ascii')
  header.writeUInt32LE(0x05000300, 32)
  header.writeUInt32LE(flags, 36)
  CFB.utils.cfb_add(cfb, '/FileHeader', header)
  sections.forEach((section, i) => {
    CFB.utils.cfb_add(cfb, `/BodyText/Section${i}`, flags & 1 ? deflateRawSync(section) : section)
  })
  return new Uint8Array(CFB.write(cfb, { type: 'buffer' }) as Buffer)
}

async function makeHwpx(sectionXml: string[]): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/hwp+zip')
  sectionXml.forEach((xml, i) => zip.file(`Contents/section${i}.xml`, xml))
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
}

async function makeDocx(paragraphs: string[]): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`)
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
}

describe('글 파일에서 글 꺼내기', () => {
  it('txt 와 md 파일은 UTF-8 글을 그대로 꺼내고 맨 앞 BOM 은 뗀다', async () => {
    // 왜: 메모장 · 맥에서 저장한 글 파일이 가장 흔하다. BOM 이 남으면 첫 글자가 깨져 보인다.
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('민호: 또 안 나와?\r\n팀장: 고마워.')])
    expect(await extractEntryText('대본.txt', bom)).toEqual({ status: 'ok', text: '민호: 또 안 나와?\n팀장: 고마워.', truncated: false })
    expect(await extractEntryText('memo.md', new TextEncoder().encode('# 자판기\n\n캔이 쏟아진다'))).toMatchObject({ status: 'ok', text: '# 자판기\n\n캔이 쏟아진다' })
  })

  it('EUC-KR 로 저장한 옛 txt 도 한국어로 읽는다', () => {
    // 왜: 오래된 한글 윈도우 메모장 파일은 EUC-KR 이다. UTF-8 로만 읽으면 글자가 전부 깨진다.
    const euckr = new Uint8Array([0xbe, 0xc8, 0xb3, 0xe7, 0xc7, 0xcf, 0xbc, 0xbc, 0xbf, 0xe4, 0x20, 0xb4, 0xeb, 0xba, 0xbb])
    expect(decodePlainText(euckr)).toBe('안녕하세요 대본')
  })

  it('hwp 문단 기록에서 글자를 꺼내고 조종 문자는 건너뛰며 탭은 탭으로 남긴다', () => {
    // 왜: 한글 문서의 글자 사이에는 표 · 그림 · 쪽 번호 같은 조종 문자가 8칸씩 끼어 있다. 그대로 두면 글이 깨진다.
    const payload = Buffer.concat([utf16('민호'), control8(11), utf16(': 또'), control8(9), utf16('안 나와?'), unit(13)])
    expect(parseHwpParagraphText(payload)).toBe('민호: 또\t안 나와?')
    // 1칸짜리 줄바꿈(10)은 줄바꿈으로, 묶음 빈칸(30)은 빈칸으로.
    expect(parseHwpParagraphText(Buffer.concat([utf16('첫 줄'), unit(10), utf16('둘째'), unit(30), utf16('줄'), unit(13)]))).toBe('첫 줄\n둘째 줄')
  })

  it('hwp 본문의 문단 기록을 순서대로 읽고 큰 기록(크기 4095 이상)도 읽는다', () => {
    // 왜: 긴 문단은 기록 머리의 크기 칸이 모자라 다음 4바이트에 크기를 적는다. 그걸 놓치면 그 뒤 문단이 다 사라진다.
    const long = '가'.repeat(3000)
    const section = hwpSection([utf16('씬 1. 회사 복도'), utf16(long), utf16('끝')])
    expect(parseHwpSection(section)).toEqual(['씬 1. 회사 복도', long, '끝'])
  })

  it('hwp 파일은 압축된 본문(BodyText)을 풀어 섹션 순서대로 문단을 줄바꿈으로 잇는다', async () => {
    // 왜: 한글로 쓴 연극 대본(1-2)이 흔하다. 대부분 압축 저장이고 섹션이 여러 개다.
    const hwp = makeHwp([hwpSection([utf16('민호: 또 안 나와?'), utf16('팀장: 고마워.')]), hwpSection([utf16('막이 내린다.')])])
    expect(await extractEntryText('연극대본.hwp', hwp)).toEqual({ status: 'ok', text: '민호: 또 안 나와?\n팀장: 고마워.\n막이 내린다.', truncated: false })
    const plain = makeHwp([hwpSection([utf16('압축 안 한 문서')])], 0)
    expect(await extractEntryText('plain.hwp', plain)).toMatchObject({ status: 'ok', text: '압축 안 한 문서' })
  })

  it('암호가 걸렸거나 배포용인 hwp 는 읽을 수 없다고 알린다', async () => {
    // 왜: 암호 · 배포용 문서는 본문이 암호화돼 있다. 깨진 글을 AI에 보내지 않고 사용자에게 알린다.
    const section = hwpSection([utf16('비밀')])
    expect((await extractEntryText('lock.hwp', makeHwp([section], 1 | 2))).status).toBe('unreadable')
    expect((await extractEntryText('dist.hwp', makeHwp([section], 1 | 4))).status).toBe('unreadable')
    expect((await extractEntryText('broken.hwp', new Uint8Array([1, 2, 3, 4]))).status).toBe('unreadable')
  })

  it('hwpx 는 섹션 XML 의 글자를 문단마다 꺼낸다', async () => {
    // 왜: 새 한글 형식(hwpx)은 zip 안의 XML 이다. 표 안의 문단도 문단으로 읽는다.
    const xml = '<?xml version="1.0"?><hs:sec xmlns:hs="s" xmlns:hp="p"><hp:p><hp:run><hp:t>민호: 또 안 나와?</hp:t></hp:run></hp:p>'
      + '<hp:p><hp:run><hp:t>팀장: 고마워</hp:t><hp:t>.</hp:t></hp:run></hp:p><hp:p><hp:run><hp:t>A &amp; B&#44; 끝</hp:t></hp:run></hp:p></hs:sec>'
    const hwpx = await makeHwpx([xml, '<hs:sec xmlns:hp="p"><hp:p><hp:run><hp:t>둘째 섹션</hp:t></hp:run></hp:p></hs:sec>'])
    expect(await extractEntryText('대본.hwpx', hwpx)).toEqual({ status: 'ok', text: '민호: 또 안 나와?\n팀장: 고마워.\nA & B, 끝\n둘째 섹션', truncated: false })
  })

  it('pdf 는 글이 든 쪽의 글을 꺼내고 글이 없는 pdf 는 글 없음으로 알린다', async () => {
    // 왜: 글로 저장한 PDF 대본은 읽고, 스캔한 PDF(그림만 있는 쪽)는 이미지로 올려 달라고 해야 한다.
    expect(await extractEntryText('script.pdf', makePdf(['Hello entry screen', 'Second line here']))).toEqual({
      status: 'ok',
      text: 'Hello entry screen\nSecond line here',
      truncated: false,
    })
    expect(await extractEntryText('scan.pdf', makePdf([]))).toEqual({ status: 'no_text' })
    expect((await extractEntryText('broken.pdf', new TextEncoder().encode('%PDF-1.4 broken'))).status).toBe('unreadable')
  })

  it('docx 는 본문 글을 꺼낸다', async () => {
    // 왜: 워드로 쓴 촬영 대본(1-1)이 흔하다. 예전 Producer 첨부와 같은 추출기를 쓴다.
    expect(await extractEntryText('촬영대본.docx', await makeDocx(['민호: 또 안 나와?', '팀장: 고마워.']))).toEqual({
      status: 'ok',
      text: '민호: 또 안 나와?\n\n팀장: 고마워.',
      truncated: false,
    })
  })

  it('글이 비어 있으면 글 없음으로 알리고, 100KB 가 넘는 글은 잘라 잘렸다고 표시한다', async () => {
    // 왜: 빈 파일은 읽을 것이 없다. 너무 긴 글은 매 턴 AI에 다시 실리므로 상한에서 자른다(예전 첨부와 같은 상한).
    expect(await extractEntryText('blank.txt', new TextEncoder().encode('  \n\n  '))).toEqual({ status: 'no_text' })
    const big = await extractEntryText('big.txt', new TextEncoder().encode('가'.repeat(40_000)))
    expect(big.status).toBe('ok')
    if (big.status !== 'ok') throw new Error('unreachable')
    expect(big.truncated).toBe(true)
    expect(new TextEncoder().encode(big.text).length).toBeLessThanOrEqual(100 * 1024)
  })

  it('글 파일이 아닌 확장자는 읽지 않는다', async () => {
    // 왜: 이미지는 글자 읽기(OCR)를 따로 한다. 여기서 바이너리를 글로 읽으면 깨진 글이 AI로 간다.
    expect((await extractEntryText('photo.png', new Uint8Array([137, 80, 78, 71]))).status).toBe('unreadable')
  })
})
