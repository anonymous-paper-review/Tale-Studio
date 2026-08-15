```yaml
id: t0-dramaturgy-36flash-outage
source: research/experiments/t1-dramaturgy-procedural-probe/result.md §모델 전환 발견 (2026-08-11 밤 러너 부수 발견)
종류: 조사
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: 완료  # 8/11 낮 감사: 전면 불능 참(기본 3.6-flash 정상 산출 0/7, 기각 불성립) — 단 f6d8e58~수리 12.5h 창에 실런 0건(DB 0행·로컬 풀런 0)이라 실피해 0. 증거: research/experiments/t0-dramaturgy-36flash-outage/result.md. 남은 실행: gemini.ts 핀 커밋
priority: high  # 프로덕션 스테이지 무신호 사망 의심
```

- **가설**: f6d8e58(기본 모델 3.6-flash 전환) 이후 프로덕션 s0.5 드라마투르그가 전 런에서 무신호로 죽어 있다 — runDramaturgySafe가 흡수해("재료 없이 진행") 표면화 안 됨.
- **전제**: 밤 러너 실측 — 3.6-flash + webSearch:true + JSON 조합이 결정론적 빈 candidates(4시도 전부, gemini.ts:95). preview 핀은 정상. flash-ab는 shotDesign(webSearch 없음)만 측정해 이 조합 미검증. repairJson 무신호 손실(Q6)과 같은 과의 "조용히 죽는" 패턴.
- **원인 확정 (8/11 오전, 오너 요청 프로브)**: REST 직행 4조합×2모델 분리 — `googleSearch 툴 + responseMimeType JSON` **조합 그 자체**가 3.6-flash에서만 200+빈 candidates(에러·promptFeedback 없음). 각각 단독은 정상. **영향 반경 확대**: webSearch:true는 s0.5 외 s1_structure:80·s3_scenes:282·s1s3_merged:166도 사용(전부 JSON 강제) — 이들은 Safe 없음이라 **다음 writer 풀런은 s1에서 하드 실패** 예상. 증거: `research/experiments/t0-dramaturgy-36flash-outage/probe-result.md` (수리 선택지 3안 포함). 남은 측정은 "f6d8e58 이후 실런 존재 여부" 감사뿐.
- **예측**: 참이면 f6d8e58 이후 런의 로그/state에서 dramaturgy 스테이지 failed(absorbed) 마커 또는 산출 부재. 거짓이면 정상 산출 실존(밤 실측이 실험 환경 특이).
- **측정**: ① f6d8e58 이후 완료 런의 `_progress.jsonl`/state에서 dramaturgy 상태 전수 확인(read-only) ② webSearch를 쓰는 다른 스테이지(s1/s3 — #p4-websearch)도 같은 조합인지 코드 확인 + 동일 감사. 코드 판정만.
- **기각 조건**: f6d8e58 이후 런에서 dramaturgy 정상 산출 ≥1건 → "전면 불능" 기각(간헐 이슈로 강등). 후속 수리(T-fix: webSearch 시 JSON mime 분리 또는 모델 예외 핀)는 이 감사 결과로 아침 결정.

## 좌표 (동결)

- 실측 원본: `research/experiments/t1-dramaturgy-procedural-probe/{results.json, result.md}`
- 코드: `src/lib/writer/llm/gemini.ts:57,70,95` (기본 모델·webSearch tools·empty throw) · `src/lib/writer/pipeline/stages/s0_dramaturgy.ts:107-110`(webSearch:true 호출) · `:168-182`(Safe 흡수)
- webSearch 사용처 수색: `grep -rn "webSearch: true" src/lib/writer/`

## 산출 계약

- `research/experiments/t0-dramaturgy-36flash-outage/result.md` — 런별 dramaturgy 상태표 + webSearch 스테이지 목록.
- status 갱신 + reports 1줄 + 참이면 T-fix 티켓 제안.
