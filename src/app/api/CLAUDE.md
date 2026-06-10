# src/app/api — Server-side Next.js API Routes

이 디렉토리의 룰은 `.claude/rules/api-routes.md`에도 paths-scoped로 적용됩니다.

## 디렉토리 구조 (`ls src/app/api/`가 진실 — 여기는 역할만)

```
artist/           — 캐릭터/월드 (chat, character, generate-sheet, generate-world)
director/         — Director Canvas (chat, generate-video, generate-storyboard 등)
editor/           — Editor
writer/           — writer 파이프라인 (start/status 등 — 백그라운드 체이닝, decision #38)
produce/          — Producer (chat)
generate/         — 레거시 생성 + health (image, health, video-health)
generation-jobs/  — 비동기 잡 조회 (src/lib/generation-jobs.ts 연동)
fal/              — fal webhook 수신
feedback/         — 피드백
inventory/        — 인벤토리
knowledge/        — Knowledge DB RAG (cameras, movements)
assets/           — Asset Storage
project/          — 프로젝트 메타
```

## 컨벤션
- Next.js Route Handler 패턴 (`export async function POST(req: Request): Promise<Response>`)
- 입력 검증: **zod**
- 응답: `{ ok: true, data }` / `{ ok: false, error: { code, message } }`
- Supabase: `src/lib/supabase/*` 통해서만
- 외부 AI 호출: 정의된 wrapper만 — `src/lib/claude.ts`, `src/lib/writer/llm/*` (fal/gemini/dispatch)
- 생성(generate-*) 라우트는 `.claude/rules/async-generation.md`의 표준 순서 (maxDuration→zod→쿼터→submit→generation_jobs→즉시 응답)
- `console.log` 금지 (logger 도입 전이면 사용자 문의)

## 보안
- service-key는 server only (`SUPABASE_SERVICE_ROLE_KEY`)
- 사용자 인증: middleware.ts에서 처리
- 비밀 누설 금지 (response에 토큰/키 포함 절대 금지)
