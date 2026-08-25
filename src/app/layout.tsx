import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { QueryProvider } from '@/components/providers/query-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
  display: 'swap',
  weight: '45 920',
})

export const metadata: Metadata = {
  title: 'Tale Studio',
  description: 'AI Video Generation Pipeline',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className="dark">
      {/* suppressHydrationWarning: 비밀번호 관리자 등 브라우저 확장이 React 하이드레이션 전
          body 태그에 속성(__processed_*__ 등)을 주입해 서버/클라이언트 불일치 경고가 뜬다.
          우리 코드가 아닌 외부 주입이므로 body 속성 한 겹에 한해 경고만 억제한다(자식은 그대로 검사). */}
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${pretendard.variable} antialiased`}
      >
        <QueryProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryProvider>
        <Toaster />
        {/* Vercel Web Analytics — 페이지뷰만. Hobby 플랜은 커스텀 이벤트 미지원이라
            "뭘 눌렀나"는 여기서 안 나온다(Pro 승급 또는 별도 도구 필요).
            대시보드에서 Analytics 를 Enable 해야 수집이 시작된다. */}
        <Analytics />
      </body>
    </html>
  )
}
