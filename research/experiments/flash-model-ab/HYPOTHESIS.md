# Flash 모델 A/B — 가설 (사전 등록 2026-08-10, 실행 전 확정)

- **가설**: S/V축 기본 모델 `gemini-3-flash-preview`를 신형 flash(`gemini-3.6-flash`/`gemini-3.5-flash`/`gemini-3.5-flash-lite`)로 교체해도, 대표 스테이지(shotDesign) 호출에서 출력 품질이 유지되면서 지연이 같거나 짧다.
- **전제**: (a) 4개 모델 ID 모두 ListModels 실측 존재(2026-08-10 확인 — "3.6-flash"는 `gemini-3.6-flash`로 실존). (b) 제품 호출 경로 `geminiGenerate`(gemini.ts)가 `opts.modelName` 오버라이드 지원. (c) vault(2026-08-10-llm-quota-capacity) 실측: 1런 71콜 중 shotDesign이 시간(22s×29콜)·비용(출력 106K tok) 지배 → 대표 스테이지 자격. (d) 제품 파라미터: temperature 0.6(v4_shots.ts:501), responseMimeType application/json, safety BLOCK_NONE, withLlmRetry 4회.
- **예측**: 참이면 — 각 후보 모델의 median wall-clock이 preview 대비 동급 이하이고, 3회 전부 JSON 파싱(strict 또는 repair) 통과하며, 육안 비교에서 샷 설계 품질이 동급. 거짓이면 — 파싱 최종 실패 발생, 또는 육안 명백 열세, 또는 median이 preview보다 크게 느림.
- **측정**: 같은 fixture(런 5260d92d… seq36 프롬프트+system, 입력 4,260tok) × 4모델 × 3회 순차(라운드로빈). 제품 계기 `recordRawCall`의 duration_ms + probe wall-clock ms + 토큰 실측 + JSON 파싱 결과(strict/repaired/failed) 자동 기록. **품질 오라클은 자동 채점 없음 — HTML 나란히 렌더 → 사용자 육안 판정.** 429는 제품 retry가 흡수하되 rateLimitHits 델타로 기록.
- **기각 조건** (사전 확정, 결과 본 후 수정 금지): ① 모델별 3회 중 1회라도 JSON 파싱 최종 실패(strict+repair 모두) → 해당 모델 기각. ② median wall-clock이 preview median의 1.5배 초과 → 해당 모델의 "지연 동급 이하" 기각. ③ 사용자 육안 판정에서 preview 대비 명백 열세 → 해당 모델의 "품질 유지" 기각. (①②는 기계 판정, ③은 사용자 판정 대기.)

---

**판정**: 3.6-flash 채택(오너 행동, 커밋 f6d8e58로 닫힘). lite 기각의 진짜 사유는 속도·품질이 아니라 repairJson 무신호 샷 소실(rep1 2/8·rep3 3/8) — 상세는 `.claude/vault/2026-08-10-flash-ab-fanout-review.md`.
