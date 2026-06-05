# src/app/api — Server-side Next.js API Routes

이 디렉토리의 룰은 `.claude/rules/api-routes.md`에도 paths-scoped로 적용됩니다.

## 디렉토리 구조
```
src/app/api/
├── artist/        — Artist 관련 endpoints (L0 Canvas chat 등)
├── director/      — Director Canvas 관련 (chat, generate-video 예정)
├── editor/        — Editor 관련
├── writer/        — Writer 파이프라인 엔진 (svc→writer 리네임, decision #38). start/status/resume/generate.
│                    핸드오프(/api/writer/start)에서 백그라운드 실행 → DB 채움. 옛 `write/`(generate-scenes/chat) 폐기.
├── produce/       — Producer 관련
├── generate/      — AI 생성 (Gemini, Imagen, Kling, Veo)
├── knowledge/     — Knowledge DB RAG
├── assets/        — Asset Storage
└── project/       — 프로젝트 메타
```

## 컨벤션
- Next.js Route Handler 패턴 (`export async function POST(req: Request): Promise<Response>`)
- 입력 검증: **zod**
- 응답: `{ ok: true, data }` / `{ ok: false, error: { code, message } }`
- Supabase: `src/lib/supabase/*` 통해서만
- 외부 AI 호출: `src/lib/ai/*` (또는 `src/lib/claude.ts`, `gemini.ts` wrapper)
- `console.log` 금지 (logger 도입 전이면 사용자 문의)

## 보안
- service-key는 server only (`SUPABASE_SERVICE_ROLE_KEY`)
- 사용자 인증: middleware.ts에서 처리
- 비밀 누설 금지 (response에 토큰/키 포함 절대 금지)

## 진행 중
- L0 Canvas: `/api/artist/chat` (CanvasUpdate JSON validator), `/api/generate/image` (Nano Banana 임시, decisions #34)
- Director Canvas: `/api/director/chat` (DirectorCanvasUpdate validator), `/api/director/generate-video` (D-5 예정)
