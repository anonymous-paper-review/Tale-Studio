```yaml
id: tfix-fal-wiring-repairs
source: .claude/vault/2026-08-10-previz-motion-channel.md §3 "실험 불요 확정 수리 안건 4" 중 ①② (부수 발견 — 프로덕션 버그 2)
종류: 수리
budget: { usd: 0, runs: 1, wall_min: 60 }
blockers: []
status: 완료  # 2026-08-11 밤 러너 — 브랜치 fix/fal-wiring 준비 완료(커밋 없음 — 워크트리 .worktrees/fix-fal-wiring/, 로컬 exclude 처리). ① FalImageOptions.image_size 타입 추가+명시 우선 전송 ② happy-horse negative_prompt 게이트. pnpm test 973 통과(실패 1건은 gitignored seed 스크립트 부재 — 수리 무관, 복사 후 전체 통과). payload 전/후 실캡처: image_size "auto"→"1024x1536" (fal.queue.submit 모킹, 발주 0). 상세는 reports/2026-08-11.md
priority: normal
```

수리 티켓 — **브랜치 + 테스트 통과까지만. 머지·커밋·push 금지** (아침 오너 리뷰).
**메인 워크트리 브랜치 전환 금지** — 별도 git worktree(`git worktree add ~/projects/tale-studio-night fix/fal-wiring`)에서 작업 (_NIGHT.md 규칙 4).

- **작업 ①**: 리페인트 image_size 필드가 타입에 없어 **조용히 'auto' 전송**(실요청으로 확증됨) → 타입 추가 + 명시 전송.
- **작업 ②**: happy-horse에 **미지원 negative_prompt 송신** 제거 (모델이 받지 않는 파라미터를 보내는 헛송신).
- **완료 조건**: 브랜치 `fix/fal-wiring`에 두 수리 + `pnpm test` 통과 + 변경 전/후 실제 요청 payload 예시를 리포트에 첨부(수리 확인은 payload로 — 생성 발주는 하지 않는다).

## 좌표 (동결)

- 리페인트 배선: `src/lib/writer/llm/fal.ts` (falImageSubmit :200, ref 자동 라우팅 :150-159, 모델 `openai/gpt-image-2/edit` :105).
- 영상 input 조립: `src/app/api/director/generate-video/route.ts:145-183` + `src/lib/video-models.ts` (refParam :36, happy-horse :55).
- Phase 0: negative_prompt가 조립되는 정확한 지점 확정(고정 negative_prompt는 카탈로그 B12❌ — 제거 범위는 happy-horse 송신만, B12 계약 자체의 존폐는 건드리지 않는다).

## 산출 계약

- 브랜치 diff 요약 + payload 전/후 대조를 reports에. status 갱신.
