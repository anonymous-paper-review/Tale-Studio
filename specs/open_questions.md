# Open Questions

> **열린 질문만 유지** (게이트 원칙: 닫힌 질문 장부는 두지 않는다 — 결정의 정본은
> `specs/decisions.md`, 과거 Q&A 이력은 git history / `specs/archive/`).
> 질문이 닫히면: 결정을 decisions.md(cross-cutting) 또는 해당 spec에 반영하고 **여기서 삭제**.
>
> 최종 수정: 2026-06-11 (다이어트 — 닫힌 질문 27건 삭제, 폐기된 V2/reference_v2 서술 제거)

| ID | 질문 | 현재 상태 / 결정 조건 |
|----|------|------|
| Q-SYS-2 | 사용자-facing **에러 알림/복구 UX 정책** (API 실패·타임아웃 시 무엇을 어떻게 보여줄 것인가) | 배관은 구현됨 — LLM transient 재시도(`src/lib/writer/llm/retry.ts`), 쿼터 fail-open(`src/lib/generation-quota.ts`), 잡 failed 상태(`src/lib/generation-jobs.ts`). **열린 건 UX 레이어만** |
| Q-L2-1 | 대사(Dialogue) 용도: 프롬프트 반영 / TTS / 자막 / 하이브리드? | 영상 모델 립싱크 품질 테스트 후 결정. (대사 *자동생성*은 폐기 — `shots.dialogue_lines`는 원작 대사 수동 입력용) |
