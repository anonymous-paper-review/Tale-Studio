// 브레이크다운에서 올린 인물 그림을 그대로 쓴 카드는 그 그림을 흰 캐릭터 시트 틀 안에 담아 보인다 — 빈 칸은 그대로(오너 2026-11-10)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CHARACTER_SHEET_SPEC, turnaroundSlots } from '@/lib/artist/sheet-template'
import { uploadedSheetBox, uploadedSheetTile } from '@/lib/artist/uploaded-sheet'
import { UploadedSheet } from '@/features/artist/uploaded-sheet'
import { translate } from '@/lib/i18n/translate'

const UPLOAD = 'https://example.supabase.co/storage/v1/object/public/media/ws/p1/breakdown/soonja.png'
const PANEL = 'src/features/artist/character-panel.tsx'
const DIALOG = 'src/features/artist/character-view-dialog.tsx'
const UPLOADED_CAPTION = 'Picture uploaded as a reference · used as is'
const pct = (value: number, of: number) => Number(((value / of) * 100).toFixed(3))

describe('올린 인물 그림을 담은 캐릭터 시트', () => {
  it('브레이크다운에서 올린 그림을 그대로 쓴 인물 카드는 올린 그림을 흰 캐릭터 시트 틀 안에 담아 보인다', () => {
    // 왜: 오너 2026-11-10 "인물 이미지 입력하면 Artist에서 보이는 카드에서 캐릭터 시트에 담아서 제공해줘" — 올린 그림이 시트 자리에 늘어나 잘려 보였다.
    const out = renderToStaticMarkup(createElement(UploadedSheet, { url: UPLOAD, alt: '순자' }))
    expect(out).toContain('data-testid="artist-uploaded-sheet"')
    expect(out).toContain('src="/character-template.png"')
    expect(out).toContain(`src="${UPLOAD}"`)
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toMatch(/isBreakdownUpload\(appearance\.sheetUrl, projectId\)\s*\?\s*\(?\s*<UploadedSheet/)
  })

  it('올린 그림은 잘리지 않게 시트의 칸 하나에 통째로 들어가고, 나머지 칸은 비워 둔다', () => {
    // 왜: 오너 "빈 곳은 그대로 놔둠" — 표정 · 턴어라운드 · 디테일 칸을 AI 로 채우지 않는다. 시트는 카드에 보이는 모습일 뿐 새 그림 파일이 아니다.
    const out = renderToStaticMarkup(createElement(UploadedSheet, { url: UPLOAD, alt: '순자' }))
    const images = out.match(/<img[^>]*>/g) ?? []
    expect(images).toHaveLength(2)
    expect(images.find((tag) => tag.includes(UPLOAD))).toContain('object-contain')
  })

  it('세로로 긴 그림은 턴어라운드 앞(FRONT) 칸에, 그 밖의 그림은 대표(PORTRAIT) 칸에 담는다', () => {
    // 왜: 시트에서 전신은 턴어라운드 앞 칸, 얼굴 · 상반신은 대표 칸 자리다 — 전신 그림을 대표 칸에 넣으면 너무 작게 보인다(혼자 정한 것).
    expect(uploadedSheetTile(600, 1200)).toBe('front')
    expect(uploadedSheetTile(800, 800)).toBe('portrait')
    expect(uploadedSheetTile(1200, 800)).toBe('portrait')
  })

  it('담는 칸의 자리는 캐릭터 시트 양식 v4 좌표(칸 테두리 · 이름 띠 안쪽)에서 나온다', () => {
    // 왜: 양식 좌표의 정본은 sheet-template 하나다 — 양식이 바뀌면 그림 자리도 같이 따라간다.
    const { width: W, height: H } = CHARACTER_SHEET_SPEC.canvas
    const p = CHARACTER_SHEET_SPEC.portrait
    expect(uploadedSheetBox('portrait')).toEqual({ left: pct(p.x + 4, W), top: pct(p.y + 26, H), width: pct(p.w - 8, W), height: pct(p.h - 30, H) })
    const front = turnaroundSlots()[0]
    expect(uploadedSheetBox('front')).toEqual({ left: pct(front.x, W), top: pct(front.y, H), width: pct(front.w, W), height: pct(front.h - 28, H) })
  })

  it('그림을 다 읽기 전에는 올린 그림 자리를 비워 둔다', () => {
    // 왜: 칸은 그림 비율을 읽어야 정해진다 — 먼저 보였다가 칸이 바뀌며 튀지 않게, 정해진 뒤에 보인다(혼자 정한 것).
    //   브레이크다운에서 그림을 바꿔 올려도 같다 — 새 그림은 새로 읽고 칸을 다시 정한다.
    const out = renderToStaticMarkup(createElement(UploadedSheet, { url: UPLOAD, alt: '순자' }))
    expect(out).toContain('data-tile="loading"')
    expect(out.match(/<img[^>]*>/g)?.find((tag) => tag.includes(UPLOAD))).toContain('opacity-0')
    expect(readFileSync(PANEL, 'utf8')).toMatch(/<UploadedSheet\s+key=\{appearance\.sheetUrl\}/)
  })

  it('AI가 그린 시트는 지금처럼 시트 그대로(확대경으로) 보인다', () => {
    // 왜: 정상 경로 고정 — 올린 그림을 그대로 쓴 카드만 틀에 담는다. 뒤 단계(Storyboard · Director)도 올린 원본을 그대로 쓴다.
    expect(readFileSync(PANEL, 'utf8')).toMatch(/<TurnaroundRegionCycle\s+url=\{appearance\.sheetUrl\}/)
  })

  it('인물 상세 창에서도 올린 그림을 그대로 쓴 모습은 올린 그림을 흰 캐릭터 시트 틀 안에 담아 보인다', () => {
    // 왜: 리드 2026-11-10 — 카드는 시트인데 카드를 눌러 연 상세 창은 올린 원본이 16:9 칸에 잘려 머리가 잘려 보였다.
    //   다시 만드는 중에는 다른 그림처럼 그리는 중 표시를 보인다(카드와 같다).
    const dialog = readFileSync(DIALOG, 'utf8')
    expect(dialog).toMatch(/const uploaded = isSheet && !!imageUrl && isBreakdownUpload\(imageUrl, projectId\)/)
    expect(dialog).toMatch(/uploaded && !isGenerating \?\s*\(?\s*<UploadedSheet key=\{imageUrl\} url=\{imageUrl\}/)
  })

  it('상세 창에서 올린 그림을 담은 시트의 밑 글은 시트 · 스타일 대신 레퍼런스로 올린 그림을 그대로 쓴다고 알린다', () => {
    // 왜: "Turnaround sheet · style 실사"는 AI가 그 스타일로 그린 시트라는 뜻이라 올린 그림에는 맞지 않는다.
    //   낱말은 브레이크다운 레퍼런스 안내("레퍼런스로 올린 그림은 … 그대로 써요")와 같은 말을 쓴다(혼자 정한 것).
    expect(translate('en', UPLOADED_CAPTION)).toBe('Picture uploaded as a reference · used as is')
    expect(translate('ko', UPLOADED_CAPTION)).toBe('레퍼런스로 올린 그림 · 그대로 써요')
    expect(readFileSync(DIALOG, 'utf8')).toMatch(/uploaded\s*\?\s*t\('Picture uploaded as a reference · used as is'\)\s*:\s*styleLabel/)
  })
})
