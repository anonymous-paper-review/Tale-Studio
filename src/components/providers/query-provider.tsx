'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query-client'

/** 루트 레이아웃(서버 컴포넌트)이 쓸 클라이언트 경계 — QueryClientProvider 는
 *  컨텍스트를 만들므로 'use client' 파일에서만 렌더할 수 있다. */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
}
