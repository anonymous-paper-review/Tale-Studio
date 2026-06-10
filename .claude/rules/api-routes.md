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
- 외부 AI 호출: 정의된 wrapper만 — `src/lib/claude.ts`, `src/lib/writer/llm/*` (fal/gemini/dispatch). 라우트에서 SDK 직접 호출 금지
- 생성(generate-*) 라우트: `.claude/rules/async-generation.md` 표준 순서 준수
- `console.log` 금지 (logger 도입 전이면 사용자 문의)

## 보안
- service-key는 server only (`SUPABASE_SERVICE_ROLE_KEY`). anon vs service 구분
- 비밀 누설 금지 — 응답에 토큰/키 포함 절대 금지
- 사용자 인증은 `middleware.ts` (있을 경우)에서 선처리

엔드포인트 인벤토리는 `src/app/api/CLAUDE.md` + `ls src/app/api/`가 진실 (rule에 목록 복제 금지).
