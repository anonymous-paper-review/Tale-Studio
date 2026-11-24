'use client'

// 사업자 정보 바닥글. 영어 화면은 고정 원문(footer.md, sha 고정), 한국어 화면은 같은 번호를 한국어로 보인다(오너 2026-11-24 ④).
//   번호가 영문 원문과 같은지는 tests/ui-text/footer-korean.test.ts 가 지킨다.
import Link from 'next/link'
import { footerMarkdown } from '@/content/legal/footer'
import { LegalMarkdown } from '@/components/legal/legal-markdown'
import { useLocaleStore } from '@/stores/locale-store'

// 사업자등록증·통신판매업 신고증의 한국어 표기 그대로(번역 대상 아님).
export const BUSINESS_INFO_KO = {
  name: '테일스튜디오', // i18n-ok
  owner: '대표 윤대원', // i18n-ok
  registration: '333-27-02069',
  mailOrder: '제2026-성남수정-0914호', // i18n-ok
  address: '경기도 성남시 수정구 위례서일로 46, 1동 20층 2010호', // i18n-ok
  phone: '010-6766-3007',
  phoneIntl: '+82-10-6766-3007',
  email: 'support@talestudio.art',
} as const

const LEGAL_LINKS_KO = [
  ['/terms', '이용약관'], // i18n-ok
  ['/refund', '환불·해지 정책'], // i18n-ok
  ['/privacy', '개인정보처리방침'], // i18n-ok
  ['/acceptable-use', '이용 정책'], // i18n-ok
] as const
const LABEL_KO = { registration: '사업자등록번호', mailOrder: '통신판매업 신고', phone: '전화' } as const // i18n-ok

export function BusinessInfoKo() {
  const b = BUSINESS_INFO_KO
  return (
    <div className="flex flex-col gap-3 text-xs leading-relaxed">
      <p>
        <strong className="font-semibold text-foreground">{b.name}</strong> · {b.owner} · {LABEL_KO.registration} {b.registration} · {LABEL_KO.mailOrder} {b.mailOrder}
        <br />
        {b.address} · {LABEL_KO.phone} {b.phone} · {b.email}
      </p>
      <p>
        {LEGAL_LINKS_KO.map(([href, label], i) => (
          <span key={href}>
            {i > 0 && ' · '}
            <Link href={href} className="underline underline-offset-4 transition-colors hover:text-primary">
              {label}
            </Link>
          </span>
        ))}
      </p>
    </div>
  )
}

export function LegalFooter() {
  // 테스트들이 '@/lib/i18n' 을 갈아끼우므로 언어는 store 에서 직접 읽는다.
  const locale = useLocaleStore((s) => s.locale)
  return (
    <nav aria-label="Legal and business information" lang={locale} className="text-muted-foreground">
      {locale === 'ko' ? <BusinessInfoKo /> : <LegalMarkdown markdown={footerMarkdown} compact />}
    </nav>
  )
}
