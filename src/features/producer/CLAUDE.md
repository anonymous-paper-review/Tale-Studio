# src/features/producer — The Meeting Room

## Status
- Spec: `@../../../specs/ux_pages.md` P1

## Stack
- Zustand — `@../../../stores/producer-store.ts`
- AI — Producer Agent 대화 수집 (Gemini LLM)
- shadcn/ui — 대화 UI, summary 카드

## 자주 하는 작업
| 무엇 | 어디 |
|---|---|
| Producer 대화 채팅 | `../../../app/api/produce/chat/route.ts` |
| 대화 요약 → Writer 핸드오프 | sceneManifest seed로 producer-store → writer-store 전달 |

## MVP 범위 (decisions #28)
P1 The Meeting Room 포함. Producer Agent가 사용자 대화로 스토리 seed 수집 → Writer로 핸드오프.
