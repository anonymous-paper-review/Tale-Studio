// Lumi 를 SYS 크기 이름(XL · L · M · S · XS · 옆 채팅)으로 그리면 정해진 너비와 1:0.77 상자로 그려지는지 검사한다 (11/5 Figma SYS 규칙)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LUMI_SIZE, lumiBox } from '@/lib/lumi'
import { Lumi, LumiAvatar } from '@/components/lumi/lumi'
import { ConfirmLumi } from '@/components/handoff/confirm-lumi'

describe('Lumi 크기', () => {
  // 왜: 11/5 시안 SYS — 모든 화면이 같은 크기 이름을 쓴다(첫 인사 XL · 기다리는 팝업 · 페이지 머리 L · 팝업 제목 위 M ·
  //   노드 · 카드 위 기다림 S · 채팅 아바타 XS · 옆 채팅 30). 화면마다 숫자를 따로 적으면 같은 자리의 Lumi 크기가 갈린다.
  it('Lumi 크기 이름은 SYS 규칙의 너비이고, 전신 상자는 높이가 너비의 0.77이다', () => {
    expect(LUMI_SIZE).toEqual({ xl: 150, l: 100, m: 78, s: 56, xs: 36, chat: 30 })
    expect(lumiBox('xl')).toEqual({ width: 150, height: 116 })
    expect(lumiBox('l')).toEqual({ width: 100, height: 77 })
    expect(lumiBox('m')).toEqual({ width: 78, height: 60 })
    expect(lumiBox('s')).toEqual({ width: 56, height: 43 })
    expect(lumiBox('xs', 'avatar')).toEqual({ width: 36, height: 36 })
  })

  // 왜: 정상 경로 고정 — 크기를 숫자로 주던 예전 자리는 그 너비 그대로 그린다(높이만 SYS 비율).
  it('크기를 숫자로 주면 그 너비 그대로 그린다', () => {
    expect(lumiBox(320)).toEqual({ width: 320, height: 246 })
    expect(lumiBox(28, 'avatar')).toEqual({ width: 28, height: 28 })
  })

  // 왜: 크기 이름이 그리는 자리까지 그대로 간다 — 이름만 맞고 그림은 예전 비율이면 시안과 다른 상자가 된다.
  it('크기 이름으로 그린 Lumi 는 그 상자 크기로 그려진다', () => {
    const html = renderToStaticMarkup(createElement(Lumi, { persona: 'writer', state: 'loading', size: 'l' }))
    expect(html).toMatch(/width="100" height="77"/)
    expect(renderToStaticMarkup(createElement(LumiAvatar, { persona: 'writer', size: 'chat' }))).toMatch(/width="30" height="30"/)
  })

  // 왜: 시안의 Lumi 그림은 몸에 맞춰 자른 그림(몸이 그림 폭의 98%)이고, 우리 그림 · 움직이는 Lumi 는 둘레에 소품 자리가 있어 몸이 폭의 약 68%다.
  //   같은 너비로 그리면 시안보다 Lumi 가 작아 보인다 — 크기 이름으로 그리면 몸이 상자 너비를 채우게 1.45배로 그리고 상자는 그대로 둔다.
  //   숫자 크기(예전 자리)는 키우지 않는다(화면을 옮기기 전까지 커지지 않게). 상자 높이는 숫자 크기도 SYS 비율(0.77)이다.
  it('크기 이름으로 그린 Lumi 는 몸이 상자 너비를 채우게 키워 그리고, 숫자 크기는 키우지 않는다', () => {
    expect(renderToStaticMarkup(createElement(Lumi, { persona: 'pearl', state: 'idle', size: 'm' }))).toMatch(/style="width:78px;height:60px;transform:scale\(1\.45\)"/)
    expect(renderToStaticMarkup(createElement(Lumi, { persona: 'pearl', state: 'idle', size: 320 }))).not.toContain('transform')
  })

  // 왜: SYS "팝업 제목 위 = M" — 확인 창마다 Lumi 크기가 같다. 단계 밖 팝업(새 프로젝트 등)은 화이트 펄을 바로 준다.
  it('확인 창 맨 위의 Lumi 는 팝업 제목 위 크기(M)로 그려지고, 단계 밖 팝업은 옷을 바로 줄 수 있다', () => {
    expect(renderToStaticMarkup(createElement(ConfirmLumi, { stage: 'artist' }))).toMatch(/width="78" height="60"/)
    expect(renderToStaticMarkup(createElement(ConfirmLumi, { persona: 'pearl' }))).toContain('/lumi/full/pearl-idle.webp')
  })
})
