// 디자이너 랜딩(첫 화면)이 사이트의 실제 요금·로그인·약관으로 이어지고, 최신 사업자 정보를 보이는지 검사한다 (오너 2026-11-24).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { pickLandingLang, appLocaleRecord } from '../../landing/src/lang.js'

const html = readFileSync(path.join(process.cwd(), 'landing', 'index.html'), 'utf8')
const en = readFileSync(path.join(process.cwd(), 'landing', 'src', 'i18n', 'en.js'), 'utf8')
const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])

describe('첫 화면(랜딩)', () => {
  // 왜: 카드사 심사·전자상거래법 표시 의무. 디자이너 시안에는 옛 주소(돌마로)만 있었다.
  it('첫 화면 바닥글에 사업자등록증 주소·전화·통신판매업 번호가 보인다', () => {
    for (const part of ['위례서일로 46', '010-6766-3007', '제2026-성남수정-0914호', '333-27-02069']) expect(html).toContain(part)
    expect(html).not.toContain('돌마로')
    for (const part of ['Wiryeseoil-ro', '+82-10-6766-3007', '2026-성남수정-0914']) expect(en).toContain(part)
  })

  // 왜: 국내 카드 결제가 열렸는데 시안 세 곳에 "결제는 준비 중"이 남아 있었다.
  it('첫 화면 어디에도 "결제는 준비 중" 안내가 없다', () => {
    expect(html).not.toContain('준비 중')
  })

  // 왜: 시안의 요금 화면은 달러 가격만 있는 그림이라, 실제 요금 화면(원화·국내 카드)으로 보내야 한다.
  it('첫 화면의 요금 링크는 사이트 요금 화면(/pricing)으로 간다', () => {
    expect(hrefs).not.toContain('#pricing')
    expect(hrefs).toContain('/pricing')
  })

  // 왜: 시안의 시작하기 단추는 같은 화면 위로만 올라갔다. 실제로 시작하려면 로그인해야 한다.
  it('첫 화면의 시작하기 단추는 로그인 화면으로 간다', () => {
    expect(hrefs).not.toContain('#start')
    expect(hrefs).toContain('/login')
  })

  // 왜: 시안의 입력창 단추는 아무 동작이 없었다. 프로젝트는 로그인해야 만들 수 있다.
  it('첫 화면 입력창의 새 프로젝트 만들기 단추는 로그인 화면으로 간다', () => {
    expect(html).toContain(`onsubmit="location.href='/login';return false"`)
  })

  // 왜: 시안의 한국어 약관은 법무 검토 전 번역이다. 게시된 원문 약관 페이지로 보낸다.
  it('첫 화면의 약관 링크는 사이트의 약관 페이지로 간다', () => {
    for (const id of ['terms', 'refund', 'privacy', 'acceptable-use']) {
      expect(hrefs).not.toContain(`#${id}`)
      expect(hrefs).toContain(`/${id}`)
    }
  })

  // 왜: 앱 화면은 어두운 테마만 있다. 첫 화면만 밝아지면 어색하다 (오너 2026-11-24 ④).
  it('첫 화면에는 밝게·어둡게 단추가 없다', () => {
    expect(html).not.toContain('theme-toggle')
  })
})

describe('첫 화면 언어', () => {
  // 왜: 요금 화면과 같은 규칙(③A). 처음 온 한국 방문자는 한국어로 본다.
  it('처음 온 방문자의 브라우저가 한국어면 첫 화면을 한국어로, 아니면 영어로 보인다', () => {
    expect(pickLandingLang({ query: null, saved: null, app: null, languages: ['ko-KR'] })).toBe('ko')
    expect(pickLandingLang({ query: null, saved: null, app: null, languages: ['en-US'] })).toBe('en')
  })

  // 왜: 정상 경로 고정. 주소의 ?lang= 이 가장 먼저, 그다음 고른 언어가 이긴다.
  it('주소에 언어를 붙였거나 전에 고른 언어가 있으면 그 언어로 보인다', () => {
    expect(pickLandingLang({ query: 'en', saved: 'ko', app: null, languages: ['ko-KR'] })).toBe('en')
    expect(pickLandingLang({ query: null, saved: 'en', app: null, languages: ['ko-KR'] })).toBe('en')
    expect(pickLandingLang({ query: null, saved: null, app: 'ko', languages: ['en-US'] })).toBe('ko')
  })

  // 왜: 첫 화면에서 한국어를 고르고 요금으로 가면 요금 화면도 한국어(원화)여야 한다.
  it('첫 화면에서 고른 언어는 요금 화면도 같은 언어로 열리게 저장한다', () => {
    expect(JSON.parse(appLocaleRecord('ko'))).toEqual({ state: { locale: 'ko' }, version: 0 })
  })
})
