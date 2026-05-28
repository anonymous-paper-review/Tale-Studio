---
paths:
  - "src/app/api/**/*.ts"
---

# API routes (Next.js Route Handler)

## 컨벤션
- 핸들러 시그니처: `export async function POST(req: Request): Promise<Response>` 패턴 (Next.js Route Handler)
- **입력 검증**: zod schema 필수. 모든 body / query 파라미터에 적용
- **응답 형식**:
  - 성공: `{ ok: true, data: T }`
  - 실패: `{ ok: false, error: { code: string, message: string } }`
- Supabase 호출: `src/lib/supabase/*` 모듈 통해서만. 라우트 안에서 직접 createClient 금지
- 외부 AI 호출: `src/lib/ai/*` 또는 `src/lib/claude.ts`/`gemini.ts` 등 정의된 wrapper
- `console.log` 금지 (logger 도입 전이면 사용자 문의)

## 보안
- service-key는 server only (`SUPABASE_SERVICE_ROLE_KEY`). anon vs service 구분
- 비밀 누설 금지 — 응답에 토큰/키 포함 절대 금지
- 사용자 인증은 `middleware.ts` (있을 경우)에서 선처리

## 진행 중 영향 범위
- L0 Canvas: `/api/artist/chat`, `/api/generate/image`
- Director Canvas: `/api/director/chat`, `/api/director/generate-video` (D-5)
