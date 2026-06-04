# src/features/writer — The Script Room

## Status
- Spec: `@../../../specs/ux_pages.md` P2 + `@../../../specs/layers/L1_scene_architect.md`

## Stack
- Zustand — `@../../../stores/writer-store.ts`
- AI — Gemini LLM (Pumpup + Scene Architect chain)
- shadcn/ui — Scene 카드, Scene Detail Editor

## 자주 하는 작업
| 무엇 | 어디 |
|---|---|
| 새 Scene 필드 추가 | `../../../types/index.ts` `Scene` + writer-store + Detail Editor |
| Pumpup 프롬프트 수정 | `../../../app/api/write/generate-scenes/route.ts` |
| AI Writer 채팅 | `../../../app/api/write/chat/route.ts` |
| Handoff → artist | sceneManifest 전달, project-store stage 변경 |

## 컨벤션
- Auto-Save 디바운스: 필드 수정 → store 즉시 반영
- D-4 (Director Canvas 양방향 sync): Writer Scene/Shot 추가 → Director 노드 자동 생성 예정
